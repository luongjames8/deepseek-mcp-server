/**
 * Web fetch and HTML→text extraction.
 *
 * Pure I/O + HTML parsing. No model calls. The CLI composes this with
 * streamChat to deliver the "summarize a URL" subcommand.
 */
import type { WebFetchConfig } from "./types.js";
export type WebFetchOptions = Partial<WebFetchConfig>;
export interface ExtractedPage {
    url: string;
    content: string;
    charsExtracted: number;
    fetchMs: number;
    parseMs: number;
}
/**
 * Fetch a URL and return cleaned text content. Throws on failure.
 */
export declare function fetchAndExtract(url: string, options?: WebFetchOptions): Promise<ExtractedPage>;
