#!/usr/bin/env node
/**
 * DeepSeek Agent MCP Server
 *
 * Tools:
 * - deepseek_agent: Agentic tool-calling loop with file/bash/web access
 * - deepseek_chat: Single-turn chat completion (no tools)
 * - web_fetch: Fetch URL and extract info with DeepSeek
 * - web_fetch_raw: Fetch URL and return raw text (no AI processing)
 * - web_search: Search web with Brave and synthesize with DeepSeek
 *
 * All model-using tools accept caller-overridable params:
 *   model, max_tokens, thinking, reasoning_effort
 * Defaults are set per-tool in config.yaml (Pro for agent/chat, Flash for web_*).
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import OpenAI from "openai";
import { loadConfig, getApiKey, getBaseUrl } from "./config.js";
import { DeepSeekAgent, formatResult } from "./agent.js";
import { fetchAndProcess, fetchRaw } from "./web-fetch.js";
import { searchAndSynthesize } from "./web-search.js";
import { buildExtraParams, validateModel, validateReasoningEffort } from "./api-params.js";
const config = loadConfig();
const server = new Server({
    name: "deepseek-agent",
    version: "1.1.0",
}, {
    capabilities: {
        tools: {},
    },
});
// Shared schema fragment for caller-overridable model params
const MODEL_PARAM_SCHEMA = {
    model: {
        type: "string",
        description: "DeepSeek model to use. Tool-specific defaults apply when omitted.",
        enum: config.model.allowed,
    },
    max_tokens: {
        type: "integer",
        description: "Max output tokens. Omit to let the API decide (v4 supports up to 384K).",
    },
    thinking: {
        type: "boolean",
        description: "Enable/disable thinking mode. Omit to use API default (on for v4 models). " +
            "Set false for faster/cheaper responses on simple tasks.",
    },
    reasoning_effort: {
        type: "string",
        description: "How hard the model should think (only meaningful when thinking is on).",
        enum: ["low", "medium", "high"],
    },
};
/**
 * Extract caller-supplied model params from a tool args object.
 */
function extractModelParams(args) {
    if (!args)
        return {};
    const params = {};
    if (typeof args.model === "string")
        params.model = args.model;
    if (typeof args.max_tokens === "number")
        params.maxTokens = args.max_tokens;
    if (typeof args.thinking === "boolean")
        params.thinking = args.thinking;
    if (typeof args.reasoning_effort === "string" && validateReasoningEffort(args.reasoning_effort)) {
        params.reasoningEffort = args.reasoning_effort;
    }
    return params;
}
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "deepseek_agent",
                description: "SLOW: Agentic loop. Use when task requires file system, bash, or web access. " +
                    "Has tools: read_file, write_file, edit_file, run_bash, glob, grep, list_dir, web_search. " +
                    `Default model: ${config.agent.defaultModel}. ` +
                    "For analysis or questions without file/bash needs, use deepseek_chat (faster).",
                inputSchema: {
                    type: "object",
                    properties: {
                        prompt: {
                            type: "string",
                            description: "The task to execute",
                        },
                        working_dir: {
                            type: "string",
                            description: "Base directory for file operations (default: cwd)",
                            default: ".",
                        },
                        ...MODEL_PARAM_SCHEMA,
                        max_iterations: {
                            type: "integer",
                            description: `Maximum tool call loops (default: ${config.agent.maxIterations})`,
                        },
                        timeout_seconds: {
                            type: "integer",
                            description: `Overall timeout in seconds (default: ${config.agent.timeoutSeconds})`,
                        },
                        strict_tools: {
                            type: "boolean",
                            description: "Enable DeepSeek strict tool-calling mode (Beta). " +
                                "Routes to api.deepseek.com/beta and enforces JSON schema compliance " +
                                "on tool arguments. Default: false.",
                        },
                    },
                    required: ["prompt"],
                },
            },
            {
                name: "deepseek_chat",
                description: "PREFERRED: Single-turn chat completion. Use for analysis, summarization, " +
                    "writing, code review, or any task without file/bash needs. " +
                    `Default model: ${config.chat.defaultModel}.`,
                inputSchema: {
                    type: "object",
                    properties: {
                        prompt: {
                            type: "string",
                            description: "The prompt to send",
                        },
                        system_prompt: {
                            type: "string",
                            description: "Optional system prompt to set context",
                        },
                        temperature: {
                            type: "number",
                            description: "Sampling temperature (default: 0.7)",
                        },
                        ...MODEL_PARAM_SCHEMA,
                    },
                    required: ["prompt"],
                },
            },
            {
                name: "web_fetch",
                description: "PREFERRED: Fetch a web page and extract information. " +
                    "Cheaper than the built-in WebFetch tool (uses DeepSeek). " +
                    `Default model: ${config.webFetch.defaultModel}.`,
                inputSchema: {
                    type: "object",
                    properties: {
                        url: { type: "string", description: "The URL to fetch" },
                        prompt: {
                            type: "string",
                            description: "What to extract or answer about the page content",
                        },
                        ...MODEL_PARAM_SCHEMA,
                    },
                    required: ["url", "prompt"],
                },
            },
            {
                name: "web_fetch_raw",
                description: "Fetch a web page and return raw extracted text. No AI processing. " +
                    "HTML noise (scripts/nav/ads) is stripped, but no summarization happens.",
                inputSchema: {
                    type: "object",
                    properties: {
                        url: { type: "string", description: "The URL to fetch" },
                    },
                    required: ["url"],
                },
            },
            {
                name: "web_search",
                description: "Search the web (Brave) and synthesize results with DeepSeek. " +
                    "HIGH LATENCY (10-30s). Requires BRAVE_API_KEY. " +
                    `Default model: ${config.webSearch.defaultModel}.`,
                inputSchema: {
                    type: "object",
                    properties: {
                        query: { type: "string", description: "Search query" },
                        ...MODEL_PARAM_SCHEMA,
                    },
                    required: ["query"],
                },
            },
        ],
    };
});
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
        if (name === "deepseek_agent") {
            const prompt = args?.prompt;
            if (!prompt || prompt.trim().length === 0) {
                return {
                    content: [{ type: "text", text: "Error: prompt cannot be empty" }],
                    isError: true,
                };
            }
            const workingDir = args?.working_dir ?? ".";
            const modelParams = extractModelParams(args);
            const agentParams = {
                ...modelParams,
                maxIterations: typeof args?.max_iterations === "number" ? args.max_iterations : undefined,
                timeoutSeconds: typeof args?.timeout_seconds === "number" ? args.timeout_seconds : undefined,
                strictTools: typeof args?.strict_tools === "boolean" ? args.strict_tools : undefined,
            };
            const agent = new DeepSeekAgent(config);
            const result = await agent.run(prompt, workingDir, agentParams);
            return {
                content: [{ type: "text", text: formatResult(result) }],
            };
        }
        if (name === "deepseek_chat") {
            const prompt = args?.prompt;
            if (!prompt || prompt.trim().length === 0) {
                return {
                    content: [{ type: "text", text: "Error: prompt cannot be empty" }],
                    isError: true,
                };
            }
            const modelParams = extractModelParams(args);
            const model = modelParams.model ?? config.chat.defaultModel;
            const validationError = validateModel(model, config.model.allowed);
            if (validationError) {
                return {
                    content: [{ type: "text", text: `Error: ${validationError}` }],
                    isError: true,
                };
            }
            const systemPrompt = args?.system_prompt;
            const temperature = typeof args?.temperature === "number" ? args.temperature : 0.7;
            const client = new OpenAI({
                apiKey: getApiKey(),
                baseURL: getBaseUrl(),
            });
            const messages = [];
            if (systemPrompt) {
                messages.push({ role: "system", content: systemPrompt });
            }
            messages.push({ role: "user", content: prompt });
            const extra = buildExtraParams(modelParams);
            const body = {
                model,
                messages,
                temperature,
                ...extra,
            };
            const response = await client.chat.completions.create(body);
            const text = ("choices" in response ? response.choices[0]?.message?.content : "") ?? "";
            return {
                content: [{ type: "text", text }],
            };
        }
        if (name === "web_fetch") {
            const url = args?.url;
            const prompt = args?.prompt;
            const modelParams = extractModelParams(args);
            const result = await fetchAndProcess(url, prompt, config.webFetch, modelParams);
            return {
                content: [{ type: "text", text: result }],
            };
        }
        if (name === "web_fetch_raw") {
            const url = args?.url;
            const result = await fetchRaw(url, config.webFetch);
            return {
                content: [{ type: "text", text: result }],
            };
        }
        if (name === "web_search") {
            const query = args?.query;
            const modelParams = extractModelParams(args);
            const result = await searchAndSynthesize(query, config.webSearch, modelParams);
            return {
                content: [{ type: "text", text: result }],
            };
        }
        return {
            content: [{ type: "text", text: `Unknown tool: ${name}` }],
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
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("DeepSeek Agent MCP server v1.1.0 started");
}
main().catch((e) => {
    console.error("Server error:", e);
    process.exit(1);
});
//# sourceMappingURL=index.js.map