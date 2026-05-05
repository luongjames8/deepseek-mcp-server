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
import { Command } from "commander";
import { loadConfig } from "./config.js";
import { streamChat } from "./chat.js";
import { fetchAndExtract } from "./web-fetch.js";
import { braveSearch, buildSynthesisPrompt } from "./web-search.js";
import { validateReasoningEffort } from "./api-params.js";
const config = loadConfig();
function parseModelOpts(opts) {
    const out = {};
    if (opts.model)
        out.model = opts.model;
    if (opts.thinking !== undefined) {
        if (opts.thinking === "true")
            out.thinking = true;
        else if (opts.thinking === "false")
            out.thinking = false;
        else {
            throw new Error(`--thinking must be true or false, got: ${opts.thinking}`);
        }
    }
    if (opts.reasoningEffort) {
        if (!validateReasoningEffort(opts.reasoningEffort)) {
            throw new Error(`--reasoning-effort must be low/medium/high, got: ${opts.reasoningEffort}`);
        }
        out.reasoningEffort = opts.reasoningEffort;
    }
    if (opts.maxTokens) {
        const n = parseInt(opts.maxTokens, 10);
        if (Number.isNaN(n) || n <= 0) {
            throw new Error(`--max-tokens must be a positive integer, got: ${opts.maxTokens}`);
        }
        out.maxTokens = n;
    }
    if (opts.showThinking)
        out.showThinking = true;
    if (opts.system)
        out.systemPrompt = opts.system;
    if (opts.temperature) {
        const t = parseFloat(opts.temperature);
        if (Number.isNaN(t)) {
            throw new Error(`--temperature must be a number, got: ${opts.temperature}`);
        }
        out.temperature = t;
    }
    return out;
}
async function readStdin() {
    if (process.stdin.isTTY)
        return "";
    const chunks = [];
    for await (const chunk of process.stdin) {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    return Buffer.concat(chunks).toString("utf-8").trim();
}
async function resolvePrompt(positional) {
    // Read stdin first if it's not a TTY, so arg + pipe can be combined.
    // The natural shape is: arg = instruction, stdin = data.
    //   echo "$data" | deepseek chat "Extract TODOs from this:"
    // resolves to: "Extract TODOs from this:\n\n<data>"
    const piped = await readStdin();
    const arg = positional?.trim() ?? "";
    if (arg && piped)
        return `${arg}\n\n${piped}`;
    if (arg)
        return arg;
    if (piped)
        return piped;
    throw new Error("No prompt provided. Pass as argument or pipe via stdin.");
}
function addModelOpts(cmd) {
    return cmd
        .option("-m, --model <name>", "DeepSeek model (overrides per-subcommand default)")
        .option("--thinking <bool>", "Enable/disable thinking mode (true/false)")
        .option("--reasoning-effort <level>", "Reasoning effort when thinking is on (low/medium/high)")
        .option("--max-tokens <n>", "Cap output tokens")
        .option("--show-thinking", "Stream reasoning_content to stderr", false);
}
const program = new Command();
program
    .name("deepseek")
    .description("Streaming DeepSeek CLI — single-call primitives Claude can orchestrate")
    .version("2.0.1");
// chat
addModelOpts(program
    .command("chat [prompt]")
    .description("Single-turn chat completion (streams to stdout)")
    .option("--system <text>", "Optional system prompt")
    .option("--temperature <n>", "Sampling temperature (default: 0.7)")).action(async (prompt, opts) => {
    const promptText = await resolvePrompt(prompt);
    const modelOpts = parseModelOpts(opts);
    await streamChat(promptText, config.chat.defaultModel, modelOpts);
});
// fetch
addModelOpts(program
    .command("fetch <url> [prompt]")
    .description("Fetch a URL and summarize/extract with deepseek (streams)")).action(async (url, prompt, opts) => {
    const promptText = await resolvePrompt(prompt);
    const modelOpts = parseModelOpts(opts);
    const page = await fetchAndExtract(url, config.webFetch);
    process.stderr.write(`[fetched ${page.charsExtracted} chars in ${page.fetchMs + page.parseMs}ms]\n`);
    const fullPrompt = `Given this web page content:\n\n${page.content}\n\n---\n\n${promptText}`;
    const effective = {
        ...modelOpts,
        maxTokens: modelOpts.maxTokens ?? config.webFetch.maxResponseTokens,
        temperature: modelOpts.temperature ?? 0.1,
    };
    await streamChat(fullPrompt, config.webFetch.defaultModel, effective);
});
// fetch-raw
program
    .command("fetch-raw <url>")
    .description("Fetch a URL and print cleaned text (no model call)")
    .action(async (url) => {
    const page = await fetchAndExtract(url, config.webFetch);
    process.stderr.write(`[fetched ${page.charsExtracted} chars in ${page.fetchMs + page.parseMs}ms]\n`);
    process.stdout.write(page.content);
    if (!page.content.endsWith("\n"))
        process.stdout.write("\n");
});
// search
addModelOpts(program
    .command("search <query>")
    .description("Brave search + deepseek synthesis (streams)")
    .option("-n, --max-results <n>", "Max search results to synthesize", "10")).action(async (query, opts) => {
    const modelOpts = parseModelOpts(opts);
    const maxResults = opts.maxResults ? parseInt(opts.maxResults, 10) : 10;
    const results = await braveSearch(query, { maxResults });
    if (results.length === 0) {
        process.stderr.write(`[search: no results]\n`);
        return;
    }
    process.stderr.write(`[search: ${results.length} results]\n`);
    const prompt = buildSynthesisPrompt(query, results);
    const effective = {
        ...modelOpts,
        maxTokens: modelOpts.maxTokens ?? config.webSearch.maxResponseTokens,
        temperature: modelOpts.temperature ?? 0.1,
    };
    await streamChat(prompt, config.webSearch.defaultModel, effective);
    // Source list to stderr so it doesn't pollute model output
    process.stderr.write("\n[sources]\n" + results.map((r) => `- ${r.title}: ${r.url}`).join("\n") + "\n");
});
program.parseAsync(process.argv).catch((e) => {
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(`error: ${msg}\n`);
    process.exit(1);
});
//# sourceMappingURL=cli.js.map