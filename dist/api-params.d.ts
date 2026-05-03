/**
 * Helper for building DeepSeek-specific API request parameters
 * from caller-supplied ModelCallParams.
 */
import type { ModelCallParams } from "./types.js";
/**
 * Build extra request body fields for DeepSeek API based on caller params.
 * Returns only the fields the caller explicitly set — never inserts defaults
 * for fields the API has its own default for (e.g. thinking is on by default
 * for v4 models when the param is omitted).
 */
export declare function buildExtraParams(params: ModelCallParams): Record<string, unknown>;
/**
 * Validate a model name against the configured allowlist.
 * Returns null if valid, or an error message if not.
 */
export declare function validateModel(model: string, allowed: string[]): string | null;
/**
 * Validate reasoning_effort value.
 */
export declare function validateReasoningEffort(effort: string): effort is "low" | "medium" | "high";
