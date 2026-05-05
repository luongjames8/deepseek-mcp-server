/**
 * Configuration loading for the DeepSeek CLI.
 */
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";
import { config as dotenvConfig } from "dotenv";
const __dirname = dirname(fileURLToPath(import.meta.url));
// Lookup chain for the secrets .env, in priority order.
// XDG-canonical location wins so the CLI works in any shell session
// without needing per-session sourcing or env-var inlining.
const xdgConfigHome = process.env.XDG_CONFIG_HOME || join(process.env.HOME || "", ".config");
const envPaths = [
    join(xdgConfigHome, "deepseek", "config.env"),
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
    chat: {
        defaultModel: "deepseek-v4-pro",
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
export function loadConfig(configPath) {
    const config = structuredClone(DEFAULT_CONFIG);
    if (!configPath) {
        const searchPaths = [
            join(process.cwd(), "config.yaml"),
            join(__dirname, "..", "config.yaml"),
            join(process.env.HOME || "", ".config", "deepseek-cli", "config.yaml"),
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
            if (!data)
                return config;
            if (data.model && typeof data.model === "object") {
                const m = data.model;
                config.model = {
                    default: m.default ?? config.model.default,
                    allowed: m.allowed ?? config.model.allowed,
                };
            }
            if (data.chat && typeof data.chat === "object") {
                const c = data.chat;
                config.chat = {
                    defaultModel: c.default_model ?? config.chat.defaultModel,
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
        catch (e) {
            console.error(`Error loading config from ${configPath}:`, e);
        }
    }
    return config;
}
export function getApiKey() {
    const key = process.env.DEEPSEEK_API_KEY;
    if (!key) {
        throw new Error("DEEPSEEK_API_KEY not set. Either export it in your shell, or write it to " +
            "~/.config/deepseek/config.env (mode 600). The CLI auto-loads from there.");
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