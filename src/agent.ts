/**
 * Agentic loop implementation for DeepSeek Agent
 */

import { randomUUID } from "crypto";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import type { AgentResult, Config, ErrorType, AgentCallParams } from "./types.js";
import { getApiKey, getBaseUrl, loadConfig } from "./config.js";
import { TOOL_DEFINITIONS, ToolExecutor } from "./tools.js";
import { buildExtraParams, validateModel } from "./api-params.js";

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

function generateTaskId(): string {
  return randomUUID().slice(0, 8);
}

function detectGsdProject(workingDir: string): boolean {
  const planningDir = join(workingDir, ".planning");
  return existsSync(planningDir);
}

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
  return progressParts.slice(-5).join("\n");
}

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

export class DeepSeekAgent {
  private config: Config;

  constructor(config?: Config) {
    this.config = config ?? loadConfig();
  }

  /**
   * Execute a task using the agentic loop.
   * `params` is caller-supplied; anything omitted falls back to config defaults.
   */
  async run(
    prompt: string,
    workingDir: string,
    params: AgentCallParams = {},
  ): Promise<AgentResult> {
    const model = params.model ?? this.config.agent.defaultModel;
    const maxIterations = params.maxIterations ?? this.config.agent.maxIterations;
    const timeoutSeconds = params.timeoutSeconds ?? this.config.agent.timeoutSeconds;

    const validationError = validateModel(model, this.config.model.allowed);
    if (validationError) {
      return {
        success: false,
        content: validationError,
        iterationsUsed: 0,
        errorType: "unknown" as ErrorType,
      };
    }

    // Strict tools mode → use beta endpoint (per DeepSeek docs)
    const client = new OpenAI({
      apiKey: getApiKey(),
      baseURL: getBaseUrl(params.strictTools ?? false),
    });

    const _taskId = generateTaskId();
    const startTime = Date.now();
    const toolsCalled: string[] = [];

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

    const tools: ChatCompletionTool[] = TOOL_DEFINITIONS.map((t) => {
      const fn: ChatCompletionTool["function"] = {
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
      };
      // Strict mode requires `strict: true` on each tool
      if (params.strictTools) {
        (fn as unknown as Record<string, unknown>).strict = true;
      }
      return { type: "function" as const, function: fn };
    });

    for (let iteration = 0; iteration < maxIterations; iteration++) {
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

      let response;
      try {
        response = await this.callApiWithRetry(client, model, messages, tools, params);
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

      if (!message.tool_calls || message.tool_calls.length === 0) {
        return {
          success: true,
          content: message.content ?? "",
          iterationsUsed: iteration + 1,
          toolsCalled,
        };
      }

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
    client: OpenAI,
    model: string,
    messages: ChatCompletionMessageParam[],
    tools: ChatCompletionTool[],
    params: AgentCallParams,
    maxRetries: number = 3
  ): Promise<OpenAI.Chat.Completions.ChatCompletion> {
    let lastError: Error | null = null;

    const extra = buildExtraParams(params);

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const body = {
          model,
          messages,
          tools,
          tool_choice: "auto" as const,
          ...extra,
        };
        return await client.chat.completions.create(
          body as unknown as Parameters<typeof client.chat.completions.create>[0],
        ) as OpenAI.Chat.Completions.ChatCompletion;
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
            const delay = Math.pow(2, attempt) * 1000;
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

export async function runAgent(
  prompt: string,
  workingDir: string,
  params: AgentCallParams = {},
): Promise<AgentResult> {
  const agent = new DeepSeekAgent();
  return agent.run(prompt, workingDir, params);
}

export { formatResult };
