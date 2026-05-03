import { describe, it, expect } from "vitest";
import {
  buildExtraParams,
  validateModel,
  validateReasoningEffort,
} from "../src/api-params.js";

describe("buildExtraParams", () => {
  it("returns empty object when no params set", () => {
    expect(buildExtraParams({})).toEqual({});
  });

  it("includes max_tokens when set", () => {
    expect(buildExtraParams({ maxTokens: 1024 })).toEqual({
      max_tokens: 1024,
    });
  });

  it("emits thinking enabled when true", () => {
    expect(buildExtraParams({ thinking: true })).toEqual({
      thinking: { type: "enabled" },
    });
  });

  it("emits thinking disabled when false", () => {
    expect(buildExtraParams({ thinking: false })).toEqual({
      thinking: { type: "disabled" },
    });
  });

  it("omits thinking when undefined (lets API default win)", () => {
    expect(buildExtraParams({ maxTokens: 100 })).toEqual({ max_tokens: 100 });
  });

  it("includes reasoning_effort only when set", () => {
    expect(buildExtraParams({ reasoningEffort: "high" })).toEqual({
      reasoning_effort: "high",
    });
    expect(buildExtraParams({})).not.toHaveProperty("reasoning_effort");
  });

  it("combines all params", () => {
    expect(
      buildExtraParams({
        maxTokens: 500,
        thinking: true,
        reasoningEffort: "medium",
      }),
    ).toEqual({
      max_tokens: 500,
      thinking: { type: "enabled" },
      reasoning_effort: "medium",
    });
  });
});

describe("validateModel", () => {
  const allowed = ["deepseek-v4-pro", "deepseek-v4-flash"];

  it("returns null for allowed model", () => {
    expect(validateModel("deepseek-v4-pro", allowed)).toBeNull();
  });

  it("returns error for disallowed model", () => {
    const err = validateModel("gpt-5", allowed);
    expect(err).toMatch(/not in allowed list/);
    expect(err).toContain("deepseek-v4-pro");
  });
});

describe("validateReasoningEffort", () => {
  it("accepts low/medium/high", () => {
    expect(validateReasoningEffort("low")).toBe(true);
    expect(validateReasoningEffort("medium")).toBe(true);
    expect(validateReasoningEffort("high")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(validateReasoningEffort("ultra")).toBe(false);
    expect(validateReasoningEffort("")).toBe(false);
    expect(validateReasoningEffort("HIGH")).toBe(false);
  });
});
