/**
 * Configuration loading for DeepSeek Agent MCP Server
 */
import type { Config } from "./types.js";
/**
 * Load configuration from YAML file or use defaults
 */
export declare function loadConfig(configPath?: string): Config;
export declare function getApiKey(): string;
export declare function getBaseUrl(strict?: boolean): string;
export declare function getBraveApiKey(): string | undefined;
