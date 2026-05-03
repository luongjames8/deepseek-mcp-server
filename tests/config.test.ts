import { describe, it, expect } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  const config = loadConfig();

  it("loads default model allowlist including v4 models", () => {
    expect(config.model.allowed).toContain("deepseek-v4-pro");
    expect(config.model.allowed).toContain("deepseek-v4-flash");
  });

  it("agent defaults to v4-pro", () => {
    expect(config.agent.defaultModel).toBe("deepseek-v4-pro");
  });

  it("chat defaults to v4-pro", () => {
    expect(config.chat.defaultModel).toBe("deepseek-v4-pro");
  });

  it("web_search defaults to v4-flash", () => {
    expect(config.webSearch.defaultModel).toBe("deepseek-v4-flash");
  });

  it("web_fetch defaults to v4-flash", () => {
    expect(config.webFetch.defaultModel).toBe("deepseek-v4-flash");
  });

  it("preserves agent runtime limits", () => {
    expect(config.agent.maxIterations).toBeGreaterThan(0);
    expect(config.agent.timeoutSeconds).toBeGreaterThan(0);
  });
});
