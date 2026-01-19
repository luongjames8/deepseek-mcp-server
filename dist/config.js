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
        default: "deepseek-chat",
        allowed: ["deepseek-chat", "deepseek-reasoner"],
    },
    agent: {
        maxIterations: 50,
        timeoutSeconds: 300,
        outputTruncateChars: 50000,
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
        timeoutSeconds: 15,
        maxContentChars: 50000,
        minContentChars: 500,
        maxResponseTokens: 8192,
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    webSearch: {
        maxResults: 10,
        maxResponseTokens: 8192,
    },
};
/**
 * Load configuration from YAML file or use defaults
 */
export function loadConfig(configPath) {
    let config = structuredClone(DEFAULT_CONFIG);
    // Search for config file
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
                // Load model config
                if (data.model && typeof data.model === "object") {
                    const m = data.model;
                    config.model = {
                        default: m.default ?? config.model.default,
                        allowed: m.allowed ?? config.model.allowed,
                    };
                }
                // Load agent config
                if (data.agent && typeof data.agent === "object") {
                    const a = data.agent;
                    config.agent = {
                        maxIterations: a.max_iterations ?? config.agent.maxIterations,
                        timeoutSeconds: a.timeout_seconds ?? config.agent.timeoutSeconds,
                        outputTruncateChars: a.output_truncate_chars ??
                            config.agent.outputTruncateChars,
                    };
                }
                // Load tools config
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
                // Load security config
                if (data.security && typeof data.security === "object") {
                    const s = data.security;
                    config.security = {
                        workingDir: s.working_dir ?? null,
                        allowSymlinks: s.allow_symlinks ?? config.security.allowSymlinks,
                    };
                }
                // Load logging config
                if (data.logging && typeof data.logging === "object") {
                    const l = data.logging;
                    config.logging = {
                        level: l.level ?? config.logging.level,
                        file: l.file ?? null,
                        includeToolOutputs: l.include_tool_outputs ??
                            config.logging.includeToolOutputs,
                    };
                }
                // Load web_fetch config
                if (data.web_fetch && typeof data.web_fetch === "object") {
                    const wf = data.web_fetch;
                    config.webFetch = {
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
                // Load web_search config
                if (data.web_search && typeof data.web_search === "object") {
                    const ws = data.web_search;
                    config.webSearch = {
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
/**
 * Get DeepSeek API key from environment
 */
export function getApiKey() {
    const key = process.env.DEEPSEEK_API_KEY;
    if (!key) {
        throw new Error("DEEPSEEK_API_KEY environment variable is required");
    }
    return key;
}
/**
 * Get DeepSeek API base URL from environment
 */
export function getBaseUrl() {
    return process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
}
/**
 * Get Brave Search API key from environment
 */
export function getBraveApiKey() {
    return process.env.BRAVE_API_KEY;
}
//# sourceMappingURL=config.js.map