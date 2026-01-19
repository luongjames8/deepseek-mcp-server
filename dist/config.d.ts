/**
 * Configuration loading for DeepSeek Agent MCP Server
 */
import type { Config } from "./types.js";
/**
 * Load configuration from YAML file or use defaults
 */
export declare function loadConfig(configPath?: string): Config;
/**
 * Get DeepSeek API key from environment
 */
export declare function getApiKey(): string;
/**
 * Get DeepSeek API base URL from environment
 */
export declare function getBaseUrl(): string;
/**
 * Get Brave Search API key from environment
 */
export declare function getBraveApiKey(): string | undefined;
