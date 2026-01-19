/**
 * Web search implementation for DeepSeek Agent MCP
 *
 * Searches the web using Brave Search API and synthesizes results from
 * search snippets using DeepSeek. Fast and lightweight - use web_fetch
 * for deep dives on specific URLs.
 */

import OpenAI from "openai";
import type { SearchResult, WebSearchConfig } from "./types.js";
import { getApiKey, getBaseUrl, getBraveApiKey } from "./config.js";

/**
 * Search using Brave Search API
 */
async function braveSearch(
  query: string,
  maxResults: number = 10
): Promise<SearchResult[]> {
  const apiKey = getBraveApiKey();
  if (!apiKey) {
    throw new Error(
      "BRAVE_API_KEY environment variable is required for web_search. " +
        "Get a free API key at https://brave.com/search/api/"
    );
  }

  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(maxResults));

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`Brave Search API error: ${response.status}`);
  }

  const data = (await response.json()) as {
    web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
  };

  const results: SearchResult[] = [];
  const webResults = data.web?.results ?? [];

  for (const item of webResults.slice(0, maxResults)) {
    results.push({
      title: item.title ?? "",
      url: item.url ?? "",
      snippet: item.description ?? "",
    });
  }

  return results;
}

/**
 * Synthesize search results using DeepSeek
 */
async function synthesizeSnippets(
  query: string,
  searchResults: SearchResult[],
  config: WebSearchConfig
): Promise<string> {
  // Build context from snippets
  const contextParts = searchResults.map(
    (sr) => `## Source: ${sr.title}\nURL: ${sr.url}\n\n${sr.snippet}\n`
  );
  const context = contextParts.join("\n---\n");

  const prompt = `I searched the web for: "${query}"

Here are the search result snippets:

${context}

---

Based on these snippets, provide a comprehensive answer to the search query "${query}".

Requirements:
1. Synthesize information from multiple sources
2. Include specific facts and details found in the snippets
3. Note if information seems incomplete or uncertain
4. Be concise but thorough

End your response with a "Sources:" section listing the relevant URLs.`;

  const client = new OpenAI({
    apiKey: getApiKey(),
    baseURL: getBaseUrl(),
  });

  try {
    const response = await client.chat.completions.create({
      model: "deepseek-chat",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: config.maxResponseTokens,
    });

    return response.choices[0]?.message?.content ?? "";
  } catch (e) {
    const errorMsg = String(e);

    if (
      errorMsg.toLowerCase().includes("context") ||
      errorMsg.toLowerCase().includes("token")
    ) {
      return (
        "[Synthesis failed: context too large]\n" +
        "The combined search results exceeded the model's capacity.\n" +
        "Try a more specific query or fewer results."
      );
    } else if (errorMsg.toLowerCase().includes("rate")) {
      return (
        "[Synthesis failed: rate limit]\n" +
        "DeepSeek API rate limit hit. Please wait and retry."
      );
    } else {
      return `[Synthesis failed: API error]\n${errorMsg}`;
    }
  }
}

/**
 * Main entry point: search and synthesize from snippets
 */
export async function searchAndSynthesize(
  query: string,
  config?: Partial<WebSearchConfig>
): Promise<string> {
  const effectiveConfig: WebSearchConfig = {
    maxResults: config?.maxResults ?? 10,
    maxResponseTokens: config?.maxResponseTokens ?? 8192,
  };

  const totalStart = Date.now();

  // Check for API key first
  if (!getBraveApiKey()) {
    return (
      "[web_search error]\n" +
      "BRAVE_API_KEY environment variable is not set.\n" +
      "Get a free API key at https://brave.com/search/api/\n\n" +
      "This tool cannot search the web without an API key. " +
      "Please ask the user to provide web search results or use Claude's WebSearch instead."
    );
  }

  try {
    // Step 1: Search
    const searchStart = Date.now();
    const searchResults = await braveSearch(query, effectiveConfig.maxResults);
    const searchMs = Date.now() - searchStart;

    if (searchResults.length === 0) {
      return `[web_search: ${query}]\nNo results found.`;
    }

    // Step 2: Synthesize from snippets (no page fetching)
    const synthStart = Date.now();
    const synthesis = await synthesizeSnippets(query, searchResults, effectiveConfig);
    const synthMs = Date.now() - synthStart;

    const totalMs = Date.now() - totalStart;

    // Format response
    const urlsList = searchResults
      .map((sr) => `- ${sr.title}: ${sr.url}`)
      .join("\n");

    return `[web_search: ${query}]
Results: ${searchResults.length} found
Timing: search=${searchMs}ms, synthesize=${synthMs}ms, total=${totalMs}ms

${synthesis}

---
Search results:
${urlsList}`;
  } catch (e) {
    if (e instanceof Error && e.message.includes("BRAVE_API_KEY")) {
      return `[web_search error]\n${e.message}`;
    }
    return `[web_search error]\nUnexpected error: ${e}`;
  }
}
