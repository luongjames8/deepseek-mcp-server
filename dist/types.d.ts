/**
 * Type definitions for the DeepSeek CLI.
 */
export interface ModelConfig {
    default: string;
    allowed: string[];
}
export interface ChatConfig {
    defaultModel: string;
}
export interface WebFetchConfig {
    defaultModel: string;
    timeoutSeconds: number;
    maxContentChars: number;
    minContentChars: number;
    maxResponseTokens: number;
    userAgent: string;
}
export interface WebSearchConfig {
    defaultModel: string;
    maxResults: number;
    maxResponseTokens: number;
}
export interface Config {
    model: ModelConfig;
    chat: ChatConfig;
    webFetch: WebFetchConfig;
    webSearch: WebSearchConfig;
}
/** Per-call model parameters that callers can override. */
export interface ModelCallParams {
    model?: string;
    maxTokens?: number;
    thinking?: boolean;
    reasoningEffort?: "low" | "medium" | "high";
}
export interface SearchResult {
    title: string;
    url: string;
    snippet: string;
}
export interface FetchResult {
    success: boolean;
    content: string;
    charsExtracted: number;
    error?: string;
}
