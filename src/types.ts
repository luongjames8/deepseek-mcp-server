/**
 * Type definitions for DeepSeek Agent MCP Server
 */

// Configuration types
export interface ModelConfig {
  default: string;
  allowed: string[];
}

export interface AgentConfig {
  defaultModel: string;
  maxIterations: number;
  timeoutSeconds: number;
  outputTruncateChars: number;
}

export interface ChatConfig {
  defaultModel: string;
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
  agent: AgentConfig;
  chat: ChatConfig;
  tools: ToolsConfig;
  security: SecurityConfig;
  logging: LoggingConfig;
  webFetch: WebFetchConfig;
  webSearch: WebSearchConfig;
}

// Per-call model parameters that callers can override
export interface ModelCallParams {
  model?: string;
  maxTokens?: number;
  thinking?: boolean;
  reasoningEffort?: "low" | "medium" | "high";
}

// Agent-specific call params (extends ModelCallParams)
export interface AgentCallParams extends ModelCallParams {
  maxIterations?: number;
  timeoutSeconds?: number;
  strictTools?: boolean;
}

// Agent result types
export interface AgentResult {
  success: boolean;
  content: string;
  iterationsUsed: number;
  toolsCalled?: string[];
  errorType?: string;
  partialProgress?: string;
}

// Tool types
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

// Search result types
export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

// Fetch result types
export interface FetchResult {
  success: boolean;
  content: string;
  charsExtracted: number;
  error?: string;
}

// Error types
export enum ErrorType {
  TASK_TIMEOUT = "task_timeout",
  MAX_ITERATIONS = "max_iterations",
  RATE_LIMIT = "rate_limit",
  API_TIMEOUT = "api_timeout",
  NETWORK_ERROR = "network_error",
  UNKNOWN = "unknown",
}
