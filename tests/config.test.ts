import { describe, it, expect } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  const config = loadConfig();

  it("model allowlist includes both v4 models and legacy aliases", () => {
    expect(config.model.allowed).toContain("deepseek-v4-pro");
    expect(config.model.allowed).toContain("deepseek-v4-flash");
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
});
