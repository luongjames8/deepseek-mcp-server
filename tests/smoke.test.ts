/**
 * Smoke tests — hit the real DeepSeek API.
 *
 * Why not mocked: the whole point of this MCP is to call DeepSeek correctly.
 * Mocked tests pass even if our request body becomes invalid upstream.
 *
 * Cost per run: ~$0.005 (a handful of tiny requests).
 *
 * Skipped automatically if DEEPSEEK_API_KEY is not set, so unit tests still
 * run cleanly on machines without credentials.
 */

import { describe, it, expect } from "vitest";
import OpenAI from "openai";
import { buildExtraParams } from "../src/api-params.js";
import { loadConfig, getApiKey, getBaseUrl } from "../src/config.js";

const HAS_KEY = !!process.env.DEEPSEEK_API_KEY;
const describeIfKey = HAS_KEY ? describe : describe.skip;

describeIfKey("smoke: real DeepSeek API", () => {
  const config = loadConfig();
  const client = new OpenAI({
    apiKey: HAS_KEY ? getApiKey() : "skip",
    baseURL: getBaseUrl(),
  });

  // Tiny prompt to keep cost low
  const PROMPT = "Reply with only the literal word: ok";

  async function callWith(model: string, params = {}) {
    const extra = buildExtraParams(params);
    const body = {
      model,
      messages: [{ role: "user" as const, content: PROMPT }],
      max_tokens: 50,
      ...extra,
    };
    return client.chat.completions.create(
      body as unknown as Parameters<typeof client.chat.completions.create>[0],
    );
  }

  it("v4-pro responds and (by default) has reasoning_content (thinking on)", async () => {
    const r = (await callWith("deepseek-v4-pro")) as OpenAI.Chat.Completions.ChatCompletion;
    expect(r.choices[0]?.message?.content).toBeTruthy();
    // V4 thinking is on by default — should populate reasoning_content
    const reasoning = (r.choices[0]?.message as unknown as { reasoning_content?: string })
      ?.reasoning_content;
    expect(typeof reasoning === "string" && reasoning.length > 0).toBe(true);
  }, 30_000);

  it("v4-pro with thinking:false has empty reasoning_content", async () => {
    const r = (await callWith("deepseek-v4-pro", {
      thinking: false,
    })) as OpenAI.Chat.Completions.ChatCompletion;
    expect(r.choices[0]?.message?.content).toBeTruthy();
    const reasoning = (r.choices[0]?.message as unknown as { reasoning_content?: string })
      ?.reasoning_content;
    expect(reasoning ?? "").toBe("");
  }, 30_000);

  it("v4-flash responds and is cheaper to call", async () => {
    const r = (await callWith("deepseek-v4-flash")) as OpenAI.Chat.Completions.ChatCompletion;
    expect(r.choices[0]?.message?.content).toBeTruthy();
    expect(r.model).toContain("flash");
  }, 30_000);

  it("config defaults match what we expect to send", () => {
    expect(config.agent.defaultModel).toBe("deepseek-v4-pro");
    expect(config.chat.defaultModel).toBe("deepseek-v4-pro");
    expect(config.webSearch.defaultModel).toBe("deepseek-v4-flash");
    expect(config.webFetch.defaultModel).toBe("deepseek-v4-flash");
  });
});

if (!HAS_KEY) {
  describe("smoke (skipped — no DEEPSEEK_API_KEY)", () => {
    it("set DEEPSEEK_API_KEY to run smoke tests", () => {
      expect(true).toBe(true);
    });
  });
}
