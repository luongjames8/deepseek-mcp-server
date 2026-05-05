/**
 * Streaming chat primitive.
 *
 * Single API call to DeepSeek. Streams content to a writable stream (stdout
 * by default). Reasoning_content (from thinking-mode models) goes to a
 * separate stream — stderr by default, off entirely unless showThinking.
 *
 * No agentic loop, no tools. Caller is responsible for orchestration.
 */
import { Writable } from "stream";
import type { ModelCallParams } from "./types.js";
export interface StreamChatOptions extends ModelCallParams {
    systemPrompt?: string;
    temperature?: number;
    /** stream response content here (default: process.stdout) */
    out?: Writable;
    /** stream reasoning_content here (default: process.stderr) */
    thinkingOut?: Writable;
    /** if false, reasoning_content is dropped entirely */
    showThinking?: boolean;
}
export interface StreamChatResult {
    content: string;
    reasoningContent: string;
    model: string;
    usage?: {
        promptTokens?: number;
        completionTokens?: number;
        cachedTokens?: number;
    };
}
/**
 * Run a single streaming chat completion.
 * Returns the accumulated content + reasoning, even though both have
 * already been written to the output streams during the call.
 */
export declare function streamChat(prompt: string, defaultModel: string, options?: StreamChatOptions): Promise<StreamChatResult>;
