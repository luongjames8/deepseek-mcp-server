#!/usr/bin/env node
/**
 * DeepSeek Agent MCP Server
 *
 * Tools:
 * - deepseek_agent: Agentic tool-calling loop with file/bash/web access
 * - deepseek_chat: Single-turn chat completion (no tools)
 * - web_fetch: Fetch URL and extract info with DeepSeek
 * - web_fetch_raw: Fetch URL and return raw text (no AI processing)
 * - web_search: Search web with Brave and synthesize with DeepSeek
 *
 * All model-using tools accept caller-overridable params:
 *   model, max_tokens, thinking, reasoning_effort
 * Defaults are set per-tool in config.yaml (Pro for agent/chat, Flash for web_*).
 */
export {};
