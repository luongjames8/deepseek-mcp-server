#!/usr/bin/env node
/**
 * deepseek — streaming DeepSeek CLI.
 *
 * Subcommands:
 *   chat       single-turn chat completion (streams)
 *   fetch      fetch a URL, summarize/extract with deepseek (streams)
 *   fetch-raw  fetch a URL, return cleaned text (no model)
 *   search     Brave search + deepseek synthesis (streams)
 *
 * All subcommands accept the same model knobs:
 *   --model               override per-subcommand default
 *   --thinking            true/false (omit → API default = on for v4)
 *   --reasoning-effort    low/medium/high
 *   --max-tokens          cap output
 *   --show-thinking       stream reasoning_content to stderr
 *
 * Prompts can be passed as a positional arg or piped via stdin (when arg omitted).
 */
export {};
