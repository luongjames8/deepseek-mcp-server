/**
 * Web fetch and content extraction for DeepSeek Agent MCP
 *
 * Fetches URLs, parses HTML to clean text, and processes with DeepSeek.
 * Drop-in replacement for Claude's WebFetch tool, but cheaper.
 */

import * as cheerio from "cheerio";
import OpenAI from "openai";
import type { FetchResult, WebFetchConfig } from "./types.js";
import { getApiKey, getBaseUrl } from "./config.js";

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * Fetch URL content using native fetch
 */
async function fetchUrl(url: string, config: WebFetchConfig): Promise<FetchResult> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      config.timeoutSeconds * 1000
    );

    const response = await fetch(url, {
      headers: {
        "User-Agent": config.userAgent || DEFAULT_USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        success: false,
        content: "",
        charsExtracted: 0,
        error: `HTTP ${response.status}`,
      };
    }

    const content = await response.text();
    return {
      success: true,
      content,
      charsExtracted: content.length,
    };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      return {
        success: false,
        content: "",
        charsExtracted: 0,
        error: `Timeout after ${config.timeoutSeconds}s`,
      };
    }
    return {
      success: false,
      content: "",
      charsExtracted: 0,
      error: String(e),
    };
  }
}

/**
 * Parse HTML and extract main content using Cheerio
 */
function parseHtml(html: string, config: WebFetchConfig): FetchResult {
  try {
    const $ = cheerio.load(html);

    // Remove noise elements
    $(
      "script, style, nav, footer, aside, header, noscript, iframe, form, button"
    ).remove();

    // Remove common noise classes
    const noiseSelectors = [
      ".sidebar",
      ".ads",
      ".comments",
      ".navigation",
      ".menu",
      ".social",
      ".share",
      ".related",
      ".advertisement",
    ];
    for (const selector of noiseSelectors) {
      $(selector).remove();
    }

    // Try to find main content using common selectors
    const contentSelectors = [
      "article",
      "main",
      ".content",
      "#content",
      ".post-content",
      ".article-body",
      ".entry-content",
      "[role='main']",
      ".mw-parser-output", // Wikipedia
    ];

    let content = "";
    for (const selector of contentSelectors) {
      const el = $(selector);
      if (el.length) {
        const text = el.text().trim();
        if (text.length > config.minContentChars) {
          content = text;
          break;
        }
      }
    }

    // Fallback to body
    if (!content || content.length < config.minContentChars) {
      const body = $("body");
      if (body.length) {
        content = body.text().trim();
      }
    }

    // Clean up whitespace
    content = content.replace(/\s+/g, " ").trim();

    // Check minimum content
    if (content.length < config.minContentChars) {
      return {
        success: false,
        content: "",
        charsExtracted: 0,
        error: `Content too short (${content.length} chars). Page may require JavaScript.`,
      };
    }

    // Truncate if too long
    if (content.length > config.maxContentChars) {
      content = content.slice(0, config.maxContentChars) + "\n\n[Content truncated...]";
    }

    return {
      success: true,
      content,
      charsExtracted: content.length,
    };
  } catch (e) {
    return {
      success: false,
      content: "",
      charsExtracted: 0,
      error: `Parse error: ${e}`,
    };
  }
}

/**
 * Send content to DeepSeek for processing
 */
async function processWithDeepseek(
  content: string,
  prompt: string,
  config: WebFetchConfig
): Promise<string> {
  const client = new OpenAI({
    apiKey: getApiKey(),
    baseURL: getBaseUrl(),
  });

  const fullPrompt = `Given this web page content:

${content}

---

${prompt}`;

  const response = await client.chat.completions.create({
    model: "deepseek-chat",
    messages: [{ role: "user", content: fullPrompt }],
    temperature: 0.1,
    max_tokens: config.maxResponseTokens,
  });

  return response.choices[0]?.message?.content ?? "";
}

/**
 * Main entry point: fetch URL, parse HTML, process with DeepSeek
 */
export async function fetchAndProcess(
  url: string,
  prompt: string,
  config?: Partial<WebFetchConfig>
): Promise<string> {
  const effectiveConfig: WebFetchConfig = {
    timeoutSeconds: config?.timeoutSeconds ?? 15,
    maxContentChars: config?.maxContentChars ?? 50000,
    minContentChars: config?.minContentChars ?? 500,
    maxResponseTokens: config?.maxResponseTokens ?? 8192,
    userAgent: config?.userAgent ?? DEFAULT_USER_AGENT,
  };

  const totalStart = Date.now();

  // Step 1: Fetch URL
  const fetchStart = Date.now();
  const fetchResult = await fetchUrl(url, effectiveConfig);
  const fetchMs = Date.now() - fetchStart;

  if (!fetchResult.success) {
    return `[web_fetch: ${url}]\nError: ${fetchResult.error}`;
  }

  // Step 2: Parse HTML
  const parseStart = Date.now();
  const parseResult = parseHtml(fetchResult.content, effectiveConfig);
  const parseMs = Date.now() - parseStart;

  if (!parseResult.success) {
    return `[web_fetch: ${url}]\nError: ${parseResult.error}`;
  }

  // Step 3: Process with DeepSeek
  try {
    const deepseekStart = Date.now();
    const response = await processWithDeepseek(
      parseResult.content,
      prompt,
      effectiveConfig
    );
    const deepseekMs = Date.now() - deepseekStart;
    const totalMs = Date.now() - totalStart;

    return `[web_fetch: ${url}]
Chars extracted: ${parseResult.charsExtracted}
Timing: fetch=${fetchMs}ms, parse=${parseMs}ms, deepseek=${deepseekMs}ms, total=${totalMs}ms

${response}`;
  } catch (e) {
    return `[web_fetch: ${url}]\nError: DeepSeek processing failed: ${e}`;
  }
}

/**
 * Fetch URL and return raw extracted text (no DeepSeek processing).
 * Used for content verification where exact text matching is needed.
 */
export async function fetchRaw(
  url: string,
  config?: Partial<WebFetchConfig>
): Promise<string> {
  const effectiveConfig: WebFetchConfig = {
    timeoutSeconds: config?.timeoutSeconds ?? 15,
    maxContentChars: config?.maxContentChars ?? 50000,
    minContentChars: config?.minContentChars ?? 500,
    maxResponseTokens: config?.maxResponseTokens ?? 8192,
    userAgent: config?.userAgent ?? DEFAULT_USER_AGENT,
  };

  const totalStart = Date.now();
  const timing = { fetch: 0, parse: 0, total: 0 };

  // Step 1: Fetch URL
  const fetchStart = Date.now();
  const fetchResult = await fetchUrl(url, effectiveConfig);
  timing.fetch = Date.now() - fetchStart;

  if (!fetchResult.success) {
    return `[web_fetch_raw: ${url}]
Status: error
Error: ${fetchResult.error}`;
  }

  // Step 2: Parse HTML (reuse existing parseHtml)
  const parseStart = Date.now();
  const parseResult = parseHtml(fetchResult.content, effectiveConfig);
  timing.parse = Date.now() - parseStart;

  if (!parseResult.success) {
    return `[web_fetch_raw: ${url}]
Status: error
Error: ${parseResult.error}`;
  }

  // Step 3: Return raw content (NO DeepSeek processing)
  timing.total = Date.now() - totalStart;

  return `[web_fetch_raw: ${url}]
Status: ok
Chars extracted: ${parseResult.charsExtracted}
Timing: fetch=${timing.fetch}ms, parse=${timing.parse}ms, total=${timing.total}ms

${parseResult.content}`;
}
