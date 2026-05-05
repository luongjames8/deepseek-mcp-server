/**
 * Brave Search API wrapper.
 *
 * Pure I/O. No model calls. The CLI composes this with streamChat to
 * deliver the "search the web and synthesize" subcommand.
 */
import type { SearchResult } from "./types.js";
export interface BraveSearchOptions {
    maxResults?: number;
}
export declare function braveSearch(query: string, options?: BraveSearchOptions): Promise<SearchResult[]>;
/**
 * Format search results into a synthesis prompt for the model.
 */
export declare function buildSynthesisPrompt(query: string, results: SearchResult[]): string;
