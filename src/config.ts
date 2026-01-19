/**
 * Configuration loading for DeepSeek Agent MCP Server
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";
import { config as dotenvConfig } from "dotenv";
import type { Config } from "./types.js";

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
const DEFAULT_CONFIG: Config = {
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
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  },
  webSearch: {
    maxResults: 10,
    maxResponseTokens: 8192,
  },
};

/**
 * Load configuration from YAML file or use defaults
 */
export function loadConfig(configPath?: string): Config {
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
      const data = yaml.load(content) as Record<string, unknown>;

      if (data) {
        // Load model config
        if (data.model && typeof data.model === "object") {
          const m = data.model as Record<string, unknown>;
          config.model = {
            default: (m.default as string) ?? config.model.default,
            allowed: (m.allowed as string[]) ?? config.model.allowed,
          };
        }

        // Load agent config
        if (data.agent && typeof data.agent === "object") {
          const a = data.agent as Record<string, unknown>;
          config.agent = {
            maxIterations:
              (a.max_iterations as number) ?? config.agent.maxIterations,
            timeoutSeconds:
              (a.timeout_seconds as number) ?? config.agent.timeoutSeconds,
            outputTruncateChars:
              (a.output_truncate_chars as number) ??
              config.agent.outputTruncateChars,
          };
        }

        // Load tools config
        if (data.tools && typeof data.tools === "object") {
          const t = data.tools as Record<string, unknown>;
          const bashData = (t.bash ?? {}) as Record<string, unknown>;
          const globData = (t.glob ?? {}) as Record<string, unknown>;
          const grepData = (t.grep ?? {}) as Record<string, unknown>;
          config.tools = {
            bash: {
              defaultTimeout:
                (bashData.default_timeout as number) ??
                config.tools.bash.defaultTimeout,
              maxTimeout:
                (bashData.max_timeout as number) ??
                config.tools.bash.maxTimeout,
            },
            globMaxResults:
              (globData.max_results as number) ?? config.tools.globMaxResults,
            grepMaxResults:
              (grepData.max_results as number) ?? config.tools.grepMaxResults,
          };
        }

        // Load security config
        if (data.security && typeof data.security === "object") {
          const s = data.security as Record<string, unknown>;
          config.security = {
            workingDir: (s.working_dir as string | null) ?? null,
            allowSymlinks:
              (s.allow_symlinks as boolean) ?? config.security.allowSymlinks,
          };
        }

        // Load logging config
        if (data.logging && typeof data.logging === "object") {
          const l = data.logging as Record<string, unknown>;
          config.logging = {
            level: (l.level as string) ?? config.logging.level,
            file: (l.file as string | null) ?? null,
            includeToolOutputs:
              (l.include_tool_outputs as boolean) ??
              config.logging.includeToolOutputs,
          };
        }

        // Load web_fetch config
        if (data.web_fetch && typeof data.web_fetch === "object") {
          const wf = data.web_fetch as Record<string, unknown>;
          config.webFetch = {
            timeoutSeconds:
              (wf.timeout_seconds as number) ?? config.webFetch.timeoutSeconds,
            maxContentChars:
              (wf.max_content_chars as number) ??
              config.webFetch.maxContentChars,
            minContentChars:
              (wf.min_content_chars as number) ??
              config.webFetch.minContentChars,
            maxResponseTokens:
              (wf.max_response_tokens as number) ??
              config.webFetch.maxResponseTokens,
            userAgent: (wf.user_agent as string) ?? config.webFetch.userAgent,
          };
        }

        // Load web_search config
        if (data.web_search && typeof data.web_search === "object") {
          const ws = data.web_search as Record<string, unknown>;
          config.webSearch = {
            maxResults:
              (ws.max_results as number) ?? config.webSearch.maxResults,
            maxResponseTokens:
              (ws.max_response_tokens as number) ??
              config.webSearch.maxResponseTokens,
          };
        }
      }
    } catch (e) {
      console.error(`Error loading config from ${configPath}:`, e);
    }
  }

  return config;
}

/**
 * Get DeepSeek API key from environment
 */
export function getApiKey(): string {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) {
    throw new Error("DEEPSEEK_API_KEY environment variable is required");
  }
  return key;
}

/**
 * Get DeepSeek API base URL from environment
 */
export function getBaseUrl(): string {
  return process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
}

/**
 * Get Brave Search API key from environment
 */
export function getBraveApiKey(): string | undefined {
  return process.env.BRAVE_API_KEY;
}
