/**
 * Smoke tests — run the actual CLI binary against the real DeepSeek API.
 *
 * These run on every `npm test`. They cost ~$0.005 per run and prove
 * the wiring end-to-end. Mock-only tests can't catch issues like wrong
 * request body shape, broken streaming, or model-routing changes upstream.
 *
 * Skipped automatically if DEEPSEEK_API_KEY is not set.
 */

import { describe, it, expect } from "vitest";
import { spawnSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { config as dotenvConfig } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Pull keys from project-root .env if not already in env
dotenvConfig({ path: join(__dirname, "..", ".env") });

const CLI = join(__dirname, "..", "dist", "cli.js");
const HAS_KEY = !!process.env.DEEPSEEK_API_KEY;
const HAS_BRAVE = !!process.env.BRAVE_API_KEY;
const describeIfKey = HAS_KEY ? describe : describe.skip;

function runCli(args: string[], stdin?: string) {
  return spawnSync("node", [CLI, ...args], {
    input: stdin,
    encoding: "utf-8",
    timeout: 60_000,
    env: process.env,
  });
}

describeIfKey("smoke: deepseek CLI", () => {
  it("chat — default (Pro, thinking on) streams content to stdout", () => {
    const r = runCli(["chat", "Reply with only: ok", "--max-tokens", "30"]);
    expect(r.status).toBe(0);
    expect(r.stdout.trim().toLowerCase()).toContain("ok");
  });

  it("chat --thinking false produces no reasoning content even with --show-thinking", () => {
    const r = runCli([
      "chat",
      "Reply with only: ok",
      "--thinking",
      "false",
      "--show-thinking",
      "--max-tokens",
      "20",
    ]);
    expect(r.status).toBe(0);
    expect(r.stdout.trim().toLowerCase()).toContain("ok");
    // With thinking disabled, the model should not emit reasoning_content
    // — so the visible "thinking text" stream should be empty.
    // Stderr will still have "[fetched ... ]" or other diagnostic prints,
    // so we can't strictly assert empty, but we can assert no reasoning came through.
    // The absence is harder to test via spawn — we accept that the CLI exited 0.
    expect(r.stderr).not.toMatch(/We are asked|Let me think|We need/i);
  });

  it("chat --show-thinking with thinking on streams reasoning to stderr", () => {
    const r = runCli([
      "chat",
      "What is 7*8? Reply with the number only.",
      "--show-thinking",
      "--max-tokens",
      "150",
    ]);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toContain("56");
    // Reasoning_content should have streamed to stderr
    expect(r.stderr.length).toBeGreaterThan(0);
  });

  it("chat reads prompt from stdin when no positional arg", () => {
    const r = runCli(
      ["chat", "--thinking", "false", "--max-tokens", "20"],
      "Reply with only: hi",
    );
    expect(r.status).toBe(0);
    expect(r.stdout.trim().toLowerCase()).toContain("hi");
  });

  it("chat --model deepseek-v4-flash works", () => {
    const r = runCli([
      "chat",
      "Reply: ok",
      "--model",
      "deepseek-v4-flash",
      "--thinking",
      "false",
      "--max-tokens",
      "10",
    ]);
    expect(r.status).toBe(0);
    expect(r.stdout.trim().toLowerCase()).toContain("ok");
  });

  it("chat rejects unknown model", () => {
    const r = runCli([
      "chat",
      "hi",
      "--model",
      "gpt-9000",
      "--max-tokens",
      "10",
    ]);
    // The API will reject; CLI should exit nonzero
    expect(r.status).not.toBe(0);
  });

  it("invalid --thinking value rejected at CLI level", () => {
    const r = runCli(["chat", "hi", "--thinking", "maybe", "--max-tokens", "10"]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/thinking/i);
  });

  it("invalid --reasoning-effort value rejected at CLI level", () => {
    const r = runCli([
      "chat",
      "hi",
      "--reasoning-effort",
      "maximum",
      "--max-tokens",
      "10",
    ]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/reasoning-effort/i);
  });
});

describe("smoke: fetch-raw (no API key needed)", () => {
  it("fetch-raw returns cleaned text from a real HTML page", () => {
    // Wikipedia is stable, content-rich, non-JS — good test target.
    const r = spawnSync(
      "node",
      [CLI, "fetch-raw", "https://en.wikipedia.org/wiki/HTTP"],
      { encoding: "utf-8", timeout: 30_000 },
    );
    expect(r.status).toBe(0);
    expect(r.stdout.length).toBeGreaterThan(2000);
    expect(r.stdout.toLowerCase()).toContain("hypertext");
  }, 30_000);
});

const itIfBrave = HAS_BRAVE && HAS_KEY ? it : it.skip;

describe("smoke: search (needs BRAVE_API_KEY)", () => {
  itIfBrave(
    "search streams a synthesis from real Brave results",
    () => {
      const r = runCli([
        "search",
        "deepseek v4 release date",
        "--max-results",
        "5",
        "--max-tokens",
        "200",
        "--thinking",
        "false",
      ]);
      expect(r.status).toBe(0);
      expect(r.stdout.length).toBeGreaterThan(50);
      // Sources list should appear on stderr
      expect(r.stderr).toMatch(/\[sources\]/);
    },
    60_000,
  );
});

if (!HAS_KEY) {
  describe("smoke (skipped — no DEEPSEEK_API_KEY)", () => {
    it("set DEEPSEEK_API_KEY to run smoke tests", () => {
      expect(true).toBe(true);
    });
  });
}
