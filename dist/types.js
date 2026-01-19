/**
 * Type definitions for DeepSeek Agent MCP Server
 */
// Error types
export var ErrorType;
(function (ErrorType) {
    ErrorType["TASK_TIMEOUT"] = "task_timeout";
    ErrorType["MAX_ITERATIONS"] = "max_iterations";
    ErrorType["RATE_LIMIT"] = "rate_limit";
    ErrorType["API_TIMEOUT"] = "api_timeout";
    ErrorType["NETWORK_ERROR"] = "network_error";
    ErrorType["UNKNOWN"] = "unknown";
})(ErrorType || (ErrorType = {}));
//# sourceMappingURL=types.js.map