#!/usr/bin/env node
/**
 * DeepSeek Agent MCP Server
 *
 * Provides four tools:
 * - deepseek_agent: Agentic tool-calling loop with file/bash access
 * - deepseek_chat: Simple chat completion (fast, no tools)
 * - web_fetch: Fetch URL and extract info with DeepSeek
 * - web_search: Search web with Brave and synthesize with DeepSeek
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import OpenAI from "openai";
import { loadConfig, getApiKey, getBaseUrl } from "./config.js";
import { DeepSeekAgent, formatResult } from "./agent.js";
import { fetchAndProcess } from "./web-fetch.js";
import { searchAndSynthesize } from "./web-search.js";
// Load configuration
const config = loadConfig();
// Create MCP server
const server = new Server({
    name: "deepseek-agent",
    version: "1.0.0",
}, {
    capabilities: {
        tools: {},
    },
});
// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "deepseek_agent",
                description: "SLOW: Only use when task requires file system or bash access. " +
                    "Has tools: read_file, write_file, edit_file, run_bash, glob, grep, list_dir, web_search. " +
                    "HIGH LATENCY due to tool-calling loop. " +
                    "For analysis, writing, or questions - use deepseek_chat instead (much faster).",
                inputSchema: {
                    type: "object",
                    properties: {
                        prompt: {
                            type: "string",
                            description: "The task to execute",
                        },
                        working_dir: {
                            type: "string",
                            description: "Base directory for file operations (default: current directory)",
                            default: ".",
                        },
                        model: {
                            type: "string",
                            description: `DeepSeek model to use (default: ${config.model.default})`,
                            default: config.model.default,
                            enum: config.model.allowed,
                        },
                        max_iterations: {
                            type: "integer",
                            description: `Maximum tool call loops (default: ${config.agent.maxIterations})`,
                            default: config.agent.maxIterations,
                        },
                        timeout_seconds: {
                            type: "integer",
                            description: `Overall timeout in seconds (default: ${config.agent.timeoutSeconds})`,
                            default: config.agent.timeoutSeconds,
                        },
                    },
                    required: ["prompt"],
                },
            },
            {
                name: "deepseek_chat",
                description: "PREFERRED: Fast, cheap chat completion. Use for analysis, summarization, writing, code review, " +
                    "answering questions, or any task that doesn't need file/bash access. " +
                    "No tools - just sends prompt, gets response. Much faster than deepseek_agent.",
                inputSchema: {
                    type: "object",
                    properties: {
                        prompt: {
                            type: "string",
                            description: "The prompt to send",
                        },
                        model: {
                            type: "string",
                            description: `DeepSeek model to use (default: ${config.model.default})`,
                            default: config.model.default,
                            enum: config.model.allowed,
                        },
                        system_prompt: {
                            type: "string",
                            description: "Optional system prompt to set context",
                        },
                        max_tokens: {
                            type: "integer",
                            description: "Maximum tokens in response (default: 8192)",
                            default: 8192,
                        },
                        temperature: {
                            type: "number",
                            description: "Temperature for response (default: 0.7)",
                            default: 0.7,
                        },
                    },
                    required: ["prompt"],
                },
            },
            {
                name: "web_fetch",
                description: "PREFERRED: Fetch a web page and extract information. " +
                    "Use this instead of the built-in WebFetch tool - it's cheaper (uses DeepSeek). " +
                    "Parses HTML, extracts main content, answers your prompt about the page.",
                inputSchema: {
                    type: "object",
                    properties: {
                        url: {
                            type: "string",
                            description: "The URL to fetch",
                        },
                        prompt: {
                            type: "string",
                            description: "What to extract or answer about the page content",
                        },
                    },
                    required: ["url", "prompt"],
                },
            },
            {
                name: "web_search",
                description: "Search the web and get synthesized results. " +
                    "HIGH LATENCY (10-30 seconds) - searches Brave, fetches top results, synthesizes with DeepSeek. " +
                    "Use for tasks requiring current/real-time web information. " +
                    "For known URLs, use web_fetch instead (faster). " +
                    "Requires BRAVE_API_KEY environment variable.",
                inputSchema: {
                    type: "object",
                    properties: {
                        query: {
                            type: "string",
                            description: "Search query",
                        },
                    },
                    required: ["query"],
                },
            },
        ],
    };
});
// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
        if (name === "deepseek_agent") {
            const prompt = args?.prompt;
            // Validate prompt is not empty
            if (!prompt || prompt.trim().length === 0) {
                return {
                    content: [{ type: "text", text: "Error: prompt cannot be empty" }],
                    isError: true,
                };
            }
            const workingDir = args?.working_dir ?? ".";
            const model = args?.model ?? config.model.default;
            const maxIterations = args?.max_iterations ?? config.agent.maxIterations;
            const timeoutSeconds = args?.timeout_seconds ?? config.agent.timeoutSeconds;
            const agent = new DeepSeekAgent(config);
            const result = await agent.run(prompt, workingDir, model, maxIterations, timeoutSeconds);
            return {
                content: [
                    {
                        type: "text",
                        text: formatResult(result),
                    },
                ],
            };
        }
        if (name === "deepseek_chat") {
            const prompt = args?.prompt;
            // Validate prompt is not empty
            if (!prompt || prompt.trim().length === 0) {
                return {
                    content: [{ type: "text", text: "Error: prompt cannot be empty" }],
                    isError: true,
                };
            }
            const model = args?.model ?? config.model.default;
            const systemPrompt = args?.system_prompt;
            const maxTokens = args?.max_tokens ?? 8192;
            const temperature = args?.temperature ?? 0.7;
            const client = new OpenAI({
                apiKey: getApiKey(),
                baseURL: getBaseUrl(),
            });
            const messages = [];
            if (systemPrompt) {
                messages.push({ role: "system", content: systemPrompt });
            }
            messages.push({ role: "user", content: prompt });
            const response = await client.chat.completions.create({
                model,
                messages,
                max_tokens: maxTokens,
                temperature,
            });
            return {
                content: [
                    {
                        type: "text",
                        text: response.choices[0]?.message?.content ?? "",
                    },
                ],
            };
        }
        if (name === "web_fetch") {
            const url = args?.url;
            const prompt = args?.prompt;
            const result = await fetchAndProcess(url, prompt, {
                timeoutSeconds: config.webFetch.timeoutSeconds,
                maxContentChars: config.webFetch.maxContentChars,
                minContentChars: config.webFetch.minContentChars,
                maxResponseTokens: config.webFetch.maxResponseTokens,
                userAgent: config.webFetch.userAgent,
            });
            return {
                content: [
                    {
                        type: "text",
                        text: result,
                    },
                ],
            };
        }
        if (name === "web_search") {
            const query = args?.query;
            const result = await searchAndSynthesize(query, {
                maxResults: config.webSearch.maxResults,
                maxResponseTokens: config.webSearch.maxResponseTokens,
            });
            return {
                content: [
                    {
                        type: "text",
                        text: result,
                    },
                ],
            };
        }
        return {
            content: [
                {
                    type: "text",
                    text: `Unknown tool: ${name}`,
                },
            ],
            isError: true,
        };
    }
    catch (e) {
        return {
            content: [
                {
                    type: "text",
                    text: `Error: ${e instanceof Error ? e.message : String(e)}`,
                },
            ],
            isError: true,
        };
    }
});
// Start the server
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("DeepSeek Agent MCP server started");
}
main().catch((e) => {
    console.error("Server error:", e);
    process.exit(1);
});
//# sourceMappingURL=index.js.map