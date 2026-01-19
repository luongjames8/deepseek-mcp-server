/**
 * Web search implementation for DeepSeek Agent MCP
 *
 * Searches the web using Brave Search API and synthesizes results from
 * search snippets using DeepSeek. Fast and lightweight - use web_fetch
 * for deep dives on specific URLs.
 */
import type { WebSearchConfig } from "./types.js";
/**
 * Main entry point: search and synthesize from snippets
 */
export declare function searchAndSynthesize(query: string, config?: Partial<WebSearchConfig>): Promise<string>;
