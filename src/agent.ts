/**
 * Agentic loop implementation for DeepSeek Agent
 */

import { randomUUID } from "crypto";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import type { AgentResult, Config, ErrorType } from "./types.js";
import { getApiKey, getBaseUrl, loadConfig } from "./config.js";
import { TOOL_DEFINITIONS, ToolExecutor } from "./tools.js";

const SYSTEM_PROMPT = `You are a coding agent with access to file, shell, and web tools. Execute the user's task precisely.

## Guidelines

1. **Be methodical**: Read files before editing. Understand before modifying.
2. **Use tools**: Don't guess file contents - read them. Don't assume command output - run them.
3. **Stay focused**: Complete the requested task. Don't add unrequested features.
4. **Report clearly**: When done, summarize what you did and any issues encountered.

## Tool Usage

- \`read_file\`: Always read a file before editing it
- \`edit_file\`: Use exact string matching. Read the file first to get exact content.
- \`write_file\`: For creating new files or complete rewrites
- \`run_bash\`: For shell commands. Check return values.
- \`glob\`: Find files by pattern before operating on them
- \`grep\`: Search content. Use to find what to edit.
- \`list_dir\`: Explore directory structure
- \`web_search\`: Search the web for current information. **HIGH LATENCY (10-30s)** - use sparingly.

## Web Search Guidelines

The \`web_search\` tool lets you search the internet, but:
- It has HIGH LATENCY (10-30 seconds per search)
- Use it ONLY when you need real-time/current information not available locally
- NEVER fabricate web data - if you need web info and web_search fails or is unavailable, say so clearly
- For faster workflows, suggest the user provide information or use Claude's WebSearch instead

## Constraints

- All file operations are sandboxed to the working directory
- Do not attempt to access files outside the working directory
- Do not run commands that require user interaction
- If stuck, explain what's blocking you rather than looping
- NEVER make up information - if you can't find data, say so

## On Completion

When the task is complete, provide a brief summary:
1. What was accomplished
2. Files created/modified
3. Any warnings or issues
`;

/**
 * Generate a unique task ID
 */
function generateTaskId(): string {
  return randomUUID().slice(0, 8);
}

/**
 * Check if working_dir is a GSD-managed project
 */
function detectGsdProject(workingDir: string): boolean {
  const planningDir = join(workingDir, ".planning");
  return existsSync(planningDir);
}

/**
 * Load GSD context for system prompt enhancement
 */
function getGsdContext(workingDir: string): string {
  if (!detectGsdProject(workingDir)) {
    return "";
  }

  const contextParts: string[] = [];
  const projectMd = join(workingDir, ".planning", "PROJECT.md");
  if (existsSync(projectMd)) {
    try {
      const content = readFileSync(projectMd, "utf-8").slice(0, 2000);
      contextParts.push(`## Project Context\n${content}`);
    } catch {
      // Ignore errors
    }
  }

  return contextParts.join("\n\n");
}

/**
 * Extract partial progress from message history
 */
function extractProgress(
  messages: ChatCompletionMessageParam[]
): string | undefined {
  const progressParts: string[] = [];

  for (const msg of messages) {
    if (msg.role === "assistant" && typeof msg.content === "string") {
      progressParts.push(msg.content);
    } else if (msg.role === "tool" && typeof msg.content === "string") {
      if (!msg.content.startsWith("ERROR")) {
        progressParts.push(`Tool result: ${msg.content.slice(0, 200)}...`);
      }
    }
  }

  if (progressParts.length === 0) {
    return undefined;
  }
  return progressParts.slice(-5).join("\n"); // Last 5 relevant messages
}

/**
 * Format agent result for MCP response
 */
function formatResult(result: AgentResult): string {
  if (result.success) {
    return result.content;
  }

  let output = result.content;
  if (result.errorType) {
    output = `[Error: ${result.errorType}] ${output}`;
  }
  if (result.partialProgress) {
    output += `\n\nPartial progress:\n${result.partialProgress}`;
  }
  return output;
}

/**
 * DeepSeek Agent class
 */
export class DeepSeekAgent {
  private config: Config;
  private client: OpenAI;

  constructor(config?: Config) {
    this.config = config ?? loadConfig();
    this.client = new OpenAI({
      apiKey: getApiKey(),
      baseURL: getBaseUrl(),
    });
  }

  /**
   * Execute a task using the agentic loop
   */
  async run(
    prompt: string,
    workingDir: string,
    model?: string,
    maxIterations?: number,
    timeoutSeconds?: number
  ): Promise<AgentResult> {
    // Apply defaults from config
    model = model ?? this.config.model.default;
    maxIterations = maxIterations ?? this.config.agent.maxIterations;
    timeoutSeconds = timeoutSeconds ?? this.config.agent.timeoutSeconds;

    // Validate model
    if (!this.config.model.allowed.includes(model)) {
      return {
        success: false,
        content: `Model '${model}' not in allowed list: ${this.config.model.allowed.join(", ")}`,
        iterationsUsed: 0,
        errorType: "unknown" as ErrorType,
      };
    }

    const taskId = generateTaskId();
    const startTime = Date.now();
    const toolsCalled: string[] = [];

    // Build system prompt with optional GSD context
    let systemPrompt = SYSTEM_PROMPT;
    const gsdContext = getGsdContext(workingDir);
    if (gsdContext) {
      systemPrompt = `${SYSTEM_PROMPT}\n\n${gsdContext}`;
    }

    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
    ];

    const toolExecutor = new ToolExecutor(
      workingDir,
      this.config.tools,
      this.config.webSearch
    );

    // Convert tool definitions to OpenAI format
    const tools: ChatCompletionTool[] = TOOL_DEFINITIONS.map((t) => ({
      type: "function" as const,
      function: {
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
      },
    }));

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      // Check timeout
      const elapsed = Date.now() - startTime;
      if (elapsed > timeoutSeconds * 1000) {
        return {
          success: false,
          content: "Task timeout reached",
          iterationsUsed: iteration,
          toolsCalled,
          errorType: "task_timeout" as ErrorType,
          partialProgress: extractProgress(messages),
        };
      }

      // Call API with retry
      let response;
      try {
        response = await this.callApiWithRetry(model, messages, tools);
      } catch (e) {
        const errorType =
          e instanceof Error && e.message.includes("rate")
            ? "rate_limit"
            : e instanceof Error && e.message.includes("timeout")
            ? "api_timeout"
            : "network_error";
        return {
          success: false,
          content: String(e),
          iterationsUsed: iteration,
          toolsCalled,
          errorType: errorType as ErrorType,
          partialProgress: extractProgress(messages),
        };
      }

      const message = response.choices[0]?.message;
      if (!message) {
        return {
          success: false,
          content: "No response from API",
          iterationsUsed: iteration,
          toolsCalled,
          errorType: "unknown" as ErrorType,
        };
      }

      // No tool calls = task complete
      if (!message.tool_calls || message.tool_calls.length === 0) {
        return {
          success: true,
          content: message.content ?? "",
          iterationsUsed: iteration + 1,
          toolsCalled,
        };
      }

      // Process tool calls
      messages.push({
        role: "assistant",
        content: message.content,
        tool_calls: message.tool_calls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments,
          },
        })),
      });

      for (const toolCall of message.tool_calls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(toolCall.function.arguments);
        } catch {
          // Invalid JSON in arguments
        }

        let result: string;
        try {
          result = await toolExecutor.execute(toolCall.function.name, args);
        } catch (e) {
          result = `ERROR: ${e}`;
        }

        toolsCalled.push(toolCall.function.name);
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: result.slice(0, this.config.agent.outputTruncateChars),
        });
      }
    }

    // Max iterations reached
    return {
      success: false,
      content: "Max iterations reached",
      iterationsUsed: maxIterations,
      toolsCalled,
      errorType: "max_iterations" as ErrorType,
      partialProgress: extractProgress(messages),
    };
  }

  /**
   * Call DeepSeek API with exponential backoff retry
   */
  private async callApiWithRetry(
    model: string,
    messages: ChatCompletionMessageParam[],
    tools: ChatCompletionTool[],
    maxRetries: number = 3
  ): Promise<OpenAI.Chat.Completions.ChatCompletion> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await this.client.chat.completions.create({
          model,
          messages,
          tools,
          tool_choice: "auto",
          max_tokens: 8192,
        });
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        const errorMsg = lastError.message.toLowerCase();

        if (
          errorMsg.includes("rate") ||
          errorMsg.includes("429") ||
          errorMsg.includes("timeout") ||
          errorMsg.includes("connection")
        ) {
          if (attempt < maxRetries - 1) {
            const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }
        }
        throw lastError;
      }
    }

    throw lastError ?? new Error("API call failed after retries");
  }
}

/**
 * Convenience function to run the agent
 */
export async function runAgent(
  prompt: string,
  workingDir: string,
  model: string = "deepseek-chat",
  maxIterations: number = 50,
  timeoutSeconds: number = 300
): Promise<AgentResult> {
  const agent = new DeepSeekAgent();
  return agent.run(prompt, workingDir, model, maxIterations, timeoutSeconds);
}

/**
 * Format result for MCP response
 */
export { formatResult };
