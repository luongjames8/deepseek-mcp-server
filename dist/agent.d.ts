/**
 * Agentic loop implementation for DeepSeek Agent
 */
import type { AgentResult, Config } from "./types.js";
/**
 * Format agent result for MCP response
 */
declare function formatResult(result: AgentResult): string;
/**
 * DeepSeek Agent class
 */
export declare class DeepSeekAgent {
    private config;
    private client;
    constructor(config?: Config);
    /**
     * Execute a task using the agentic loop
     */
    run(prompt: string, workingDir: string, model?: string, maxIterations?: number, timeoutSeconds?: number): Promise<AgentResult>;
    /**
     * Call DeepSeek API with exponential backoff retry
     */
    private callApiWithRetry;
}
/**
 * Convenience function to run the agent
 */
export declare function runAgent(prompt: string, workingDir: string, model?: string, maxIterations?: number, timeoutSeconds?: number): Promise<AgentResult>;
/**
 * Format result for MCP response
 */
export { formatResult };
