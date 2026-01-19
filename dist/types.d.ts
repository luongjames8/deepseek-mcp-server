/**
 * Type definitions for DeepSeek Agent MCP Server
 */
export interface ModelConfig {
    default: string;
    allowed: string[];
}
export interface AgentConfig {
    maxIterations: number;
    timeoutSeconds: number;
    outputTruncateChars: number;
}
export interface BashConfig {
    defaultTimeout: number;
    maxTimeout: number;
}
export interface ToolsConfig {
    bash: BashConfig;
    globMaxResults: number;
    grepMaxResults: number;
}
export interface SecurityConfig {
    workingDir: string | null;
    allowSymlinks: boolean;
}
export interface LoggingConfig {
    level: string;
    file: string | null;
    includeToolOutputs: boolean;
}
export interface WebFetchConfig {
    timeoutSeconds: number;
    maxContentChars: number;
    minContentChars: number;
    maxResponseTokens: number;
    userAgent: string;
}
export interface WebSearchConfig {
    maxResults: number;
    maxResponseTokens: number;
}
export interface Config {
    model: ModelConfig;
    agent: AgentConfig;
    tools: ToolsConfig;
    security: SecurityConfig;
    logging: LoggingConfig;
    webFetch: WebFetchConfig;
    webSearch: WebSearchConfig;
}
export interface AgentResult {
    success: boolean;
    content: string;
    iterationsUsed: number;
    toolsCalled?: string[];
    errorType?: string;
    partialProgress?: string;
}
export interface ToolDefinition {
    type: "function";
    function: {
        name: string;
        description: string;
        parameters: {
            type: "object";
            properties: Record<string, unknown>;
            required: string[];
        };
    };
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
export declare enum ErrorType {
    TASK_TIMEOUT = "task_timeout",
    MAX_ITERATIONS = "max_iterations",
    RATE_LIMIT = "rate_limit",
    API_TIMEOUT = "api_timeout",
    NETWORK_ERROR = "network_error",
    UNKNOWN = "unknown"
}
