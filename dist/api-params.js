/**
 * Helper for building DeepSeek-specific API request parameters
 * from caller-supplied ModelCallParams.
 */
/**
 * Build extra request body fields for DeepSeek API based on caller params.
 * Returns only the fields the caller explicitly set — never inserts defaults
 * for fields the API has its own default for (e.g. thinking is on by default
 * for v4 models when the param is omitted).
 */
export function buildExtraParams(params) {
    const extra = {};
    if (params.maxTokens !== undefined) {
        extra.max_tokens = params.maxTokens;
    }
    if (params.thinking !== undefined) {
        extra.thinking = { type: params.thinking ? "enabled" : "disabled" };
    }
    if (params.reasoningEffort !== undefined) {
        extra.reasoning_effort = params.reasoningEffort;
    }
    return extra;
}
/**
 * Validate a model name against the configured allowlist.
 * Returns null if valid, or an error message if not.
 */
export function validateModel(model, allowed) {
    if (allowed.includes(model))
        return null;
    return `Model '${model}' not in allowed list: ${allowed.join(", ")}`;
}
/**
 * Validate reasoning_effort value.
 */
export function validateReasoningEffort(effort) {
    return effort === "low" || effort === "medium" || effort === "high";
}
//# sourceMappingURL=api-params.js.map