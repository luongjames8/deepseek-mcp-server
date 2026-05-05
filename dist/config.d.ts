/**
 * Configuration loading for the DeepSeek CLI.
 */
import type { Config } from "./types.js";
export declare function loadConfig(configPath?: string): Config;
export declare function getApiKey(): string;
export declare function getBaseUrl(strict?: boolean): string;
export declare function getBraveApiKey(): string | undefined;
