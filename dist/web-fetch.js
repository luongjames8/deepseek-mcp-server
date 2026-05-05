/**
 * Web fetch and HTML→text extraction.
 *
 * Pure I/O + HTML parsing. No model calls. The CLI composes this with
 * streamChat to deliver the "summarize a URL" subcommand.
 */
import * as cheerio from "cheerio";
const DEFAULT_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
function effectiveConfig(options = {}) {
    return {
        defaultModel: options.defaultModel ?? "deepseek-v4-flash",
        timeoutSeconds: options.timeoutSeconds ?? 15,
        maxContentChars: options.maxContentChars ?? 50000,
        minContentChars: options.minContentChars ?? 500,
        maxResponseTokens: options.maxResponseTokens ?? 8192,
        userAgent: options.userAgent ?? DEFAULT_USER_AGENT,
    };
}
async function fetchUrl(url, config) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), config.timeoutSeconds * 1000);
        const response = await fetch(url, {
            headers: {
                "User-Agent": config.userAgent || DEFAULT_USER_AGENT,
                Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
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
        return { success: true, content, charsExtracted: content.length };
    }
    catch (e) {
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
function parseHtml(html, config) {
    try {
        const $ = cheerio.load(html);
        $("script, style, nav, footer, aside, header, noscript, iframe, form, button").remove();
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
        const contentSelectors = [
            "article",
            "main",
            ".content",
            "#content",
            ".post-content",
            ".article-body",
            ".entry-content",
            "[role='main']",
            ".mw-parser-output",
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
        if (!content || content.length < config.minContentChars) {
            const body = $("body");
            if (body.length)
                content = body.text().trim();
        }
        content = content.replace(/\s+/g, " ").trim();
        if (content.length < config.minContentChars) {
            return {
                success: false,
                content: "",
                charsExtracted: 0,
                error: `Content too short (${content.length} chars). Page may require JavaScript.`,
            };
        }
        if (content.length > config.maxContentChars) {
            content = content.slice(0, config.maxContentChars) + "\n\n[Content truncated...]";
        }
        return { success: true, content, charsExtracted: content.length };
    }
    catch (e) {
        return {
            success: false,
            content: "",
            charsExtracted: 0,
            error: `Parse error: ${e}`,
        };
    }
}
/**
 * Fetch a URL and return cleaned text content. Throws on failure.
 */
export async function fetchAndExtract(url, options = {}) {
    const config = effectiveConfig(options);
    const fetchStart = Date.now();
    const fetchResult = await fetchUrl(url, config);
    const fetchMs = Date.now() - fetchStart;
    if (!fetchResult.success) {
        throw new Error(`fetch failed: ${fetchResult.error}`);
    }
    const parseStart = Date.now();
    const parseResult = parseHtml(fetchResult.content, config);
    const parseMs = Date.now() - parseStart;
    if (!parseResult.success) {
        throw new Error(`parse failed: ${parseResult.error}`);
    }
    return {
        url,
        content: parseResult.content,
        charsExtracted: parseResult.charsExtracted,
        fetchMs,
        parseMs,
    };
}
//# sourceMappingURL=web-fetch.js.map