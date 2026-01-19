/**
 * Web fetch and content extraction for DeepSeek Agent MCP
 *
 * Fetches URLs, parses HTML to clean text, and processes with DeepSeek.
 * Drop-in replacement for Claude's WebFetch tool, but cheaper.
 */
import type { WebFetchConfig } from "./types.js";
/**
 * Main entry point: fetch URL, parse HTML, process with DeepSeek
 */
export declare function fetchAndProcess(url: string, prompt: string, config?: Partial<WebFetchConfig>): Promise<string>;
