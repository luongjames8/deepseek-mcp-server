/**
 * Agentic loop implementation for DeepSeek Agent
 */
import type { AgentResult, Config, AgentCallParams } from "./types.js";
declare function formatResult(result: AgentResult): string;
export declare class DeepSeekAgent {
    private config;
    constructor(config?: Config);
    /**
     * Execute a task using the agentic loop.
     * `params` is caller-supplied; anything omitted falls back to config defaults.
     */
    run(prompt: string, workingDir: string, params?: AgentCallParams): Promise<AgentResult>;
    /**
     * Call DeepSeek API with exponential backoff retry
     */
    private callApiWithRetry;
}
export declare function runAgent(prompt: string, workingDir: string, params?: AgentCallParams): Promise<AgentResult>;
export { formatResult };
