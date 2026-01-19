/**
 * Tool implementations for DeepSeek Agent
 */
import type { ToolDefinition, ToolsConfig, WebSearchConfig } from "./types.js";
/**
 * Tool definitions for DeepSeek API
 */
export declare const TOOL_DEFINITIONS: ToolDefinition[];
/**
 * Tool executor class
 */
export declare class ToolExecutor {
    private base;
    private config;
    private webSearchConfig;
    constructor(workingDir: string, config?: ToolsConfig, webSearchConfig?: WebSearchConfig);
    /**
     * Execute a tool by name
     */
    execute(name: string, args: Record<string, unknown>): Promise<string>;
    private readFile;
    private writeFile;
    private editFile;
    private runBash;
    private globFiles;
    private grepFiles;
    private listDir;
    private webSearch;
}
