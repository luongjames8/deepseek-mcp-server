/**
 * Configuration loading for DeepSeek Agent MCP Server
 */
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";
import { config as dotenvConfig } from "dotenv";
// Load .env file from multiple locations
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPaths = [
    join(process.cwd(), ".env"),
    join(__dirname, "..", ".env"),
    join(process.env.HOME || "", ".env"),
];
for (const envPath of envPaths) {
    if (existsSync(envPath)) {
        dotenvConfig({ path: envPath });
        break;
    }
}
// Default configuration
const DEFAULT_CONFIG = {
    model: {
        default: "deepseek-v4-pro",
        allowed: [
            "deepseek-v4-pro",
            "deepseek-v4-flash",
            "deepseek-chat",
            "deepseek-reasoner",
        ],
    },
    agent: {
        defaultModel: "deepseek-v4-pro",
        maxIterations: 50,
        timeoutSeconds: 300,
        outputTruncateChars: 50000,
    },
    chat: {
        defaultModel: "deepseek-v4-pro",
    },
    tools: {
        bash: {
            defaultTimeout: 120,
            maxTimeout: 600,
        },
        globMaxResults: 100,
        grepMaxResults: 100,
    },
    security: {
        workingDir: null,
        allowSymlinks: false,
    },
    logging: {
        level: "INFO",
        file: null,
        includeToolOutputs: true,
    },
    webFetch: {
        defaultModel: "deepseek-v4-flash",
        timeoutSeconds: 15,
        maxContentChars: 50000,
        minContentChars: 500,
        maxResponseTokens: 8192,
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    webSearch: {
        defaultModel: "deepseek-v4-flash",
        maxResults: 10,
        maxResponseTokens: 8192,
    },
};
/**
 * Load configuration from YAML file or use defaults
 */
export function loadConfig(configPath) {
    const config = structuredClone(DEFAULT_CONFIG);
    if (!configPath) {
        const searchPaths = [
            join(process.cwd(), "config.yaml"),
            join(__dirname, "..", "config.yaml"),
            join(process.env.HOME || "", ".config", "deepseek-agent", "config.yaml"),
        ];
        for (const path of searchPaths) {
            if (existsSync(path)) {
                configPath = path;
                break;
            }
        }
    }
    if (configPath && existsSync(configPath)) {
        try {
            const content = readFileSync(configPath, "utf-8");
            const data = yaml.load(content);
            if (data) {
                if (data.model && typeof data.model === "object") {
                    const m = data.model;
                    config.model = {
                        default: m.default ?? config.model.default,
                        allowed: m.allowed ?? config.model.allowed,
                    };
                }
                if (data.agent && typeof data.agent === "object") {
                    const a = data.agent;
                    config.agent = {
                        defaultModel: a.default_model ?? config.agent.defaultModel,
                        maxIterations: a.max_iterations ?? config.agent.maxIterations,
                        timeoutSeconds: a.timeout_seconds ?? config.agent.timeoutSeconds,
                        outputTruncateChars: a.output_truncate_chars ??
                            config.agent.outputTruncateChars,
                    };
                }
                if (data.chat && typeof data.chat === "object") {
                    const c = data.chat;
                    config.chat = {
                        defaultModel: c.default_model ?? config.chat.defaultModel,
                    };
                }
                if (data.tools && typeof data.tools === "object") {
                    const t = data.tools;
                    const bashData = (t.bash ?? {});
                    const globData = (t.glob ?? {});
                    const grepData = (t.grep ?? {});
                    config.tools = {
                        bash: {
                            defaultTimeout: bashData.default_timeout ??
                                config.tools.bash.defaultTimeout,
                            maxTimeout: bashData.max_timeout ??
                                config.tools.bash.maxTimeout,
                        },
                        globMaxResults: globData.max_results ?? config.tools.globMaxResults,
                        grepMaxResults: grepData.max_results ?? config.tools.grepMaxResults,
                    };
                }
                if (data.security && typeof data.security === "object") {
                    const s = data.security;
                    config.security = {
                        workingDir: s.working_dir ?? null,
                        allowSymlinks: s.allow_symlinks ?? config.security.allowSymlinks,
                    };
                }
                if (data.logging && typeof data.logging === "object") {
                    const l = data.logging;
                    config.logging = {
                        level: l.level ?? config.logging.level,
                        file: l.file ?? null,
                        includeToolOutputs: l.include_tool_outputs ??
                            config.logging.includeToolOutputs,
                    };
                }
                if (data.web_fetch && typeof data.web_fetch === "object") {
                    const wf = data.web_fetch;
                    config.webFetch = {
                        defaultModel: wf.default_model ?? config.webFetch.defaultModel,
                        timeoutSeconds: wf.timeout_seconds ?? config.webFetch.timeoutSeconds,
                        maxContentChars: wf.max_content_chars ??
                            config.webFetch.maxContentChars,
                        minContentChars: wf.min_content_chars ??
                            config.webFetch.minContentChars,
                        maxResponseTokens: wf.max_response_tokens ??
                            config.webFetch.maxResponseTokens,
                        userAgent: wf.user_agent ?? config.webFetch.userAgent,
                    };
                }
                if (data.web_search && typeof data.web_search === "object") {
                    const ws = data.web_search;
                    config.webSearch = {
                        defaultModel: ws.default_model ?? config.webSearch.defaultModel,
                        maxResults: ws.max_results ?? config.webSearch.maxResults,
                        maxResponseTokens: ws.max_response_tokens ??
                            config.webSearch.maxResponseTokens,
                    };
                }
            }
        }
        catch (e) {
            console.error(`Error loading config from ${configPath}:`, e);
        }
    }
    return config;
}
export function getApiKey() {
    const key = process.env.DEEPSEEK_API_KEY;
    if (!key) {
        throw new Error("DEEPSEEK_API_KEY environment variable is required");
    }
    return key;
}
export function getBaseUrl(strict = false) {
    if (process.env.DEEPSEEK_BASE_URL)
        return process.env.DEEPSEEK_BASE_URL;
    return strict ? "https://api.deepseek.com/beta" : "https://api.deepseek.com";
}
export function getBraveApiKey() {
    return process.env.BRAVE_API_KEY;
}
//# sourceMappingURL=config.js.map