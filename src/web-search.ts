/**
 * Brave Search API wrapper.
 *
 * Pure I/O. No model calls. The CLI composes this with streamChat to
 * deliver the "search the web and synthesize" subcommand.
 */

import type { SearchResult } from "./types.js";
import { getBraveApiKey } from "./config.js";

export interface BraveSearchOptions {
  maxResults?: number;
}

export async function braveSearch(
  query: string,
  options: BraveSearchOptions = {},
): Promise<SearchResult[]> {
  const apiKey = getBraveApiKey();
  if (!apiKey) {
    throw new Error(
      "BRAVE_API_KEY environment variable is required for web search. " +
        "Get a free API key at https://brave.com/search/api/",
    );
  }

  const maxResults = options.maxResults ?? 10;
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
    web?: {
      results?: Array<{ title?: string; url?: string; description?: string }>;
    };
  };

  return (data.web?.results ?? []).slice(0, maxResults).map((item) => ({
    title: item.title ?? "",
    url: item.url ?? "",
    snippet: item.description ?? "",
  }));
}

/**
 * Format search results into a synthesis prompt for the model.
 */
export function buildSynthesisPrompt(query: string, results: SearchResult[]): string {
  const context = results
    .map((sr) => `## Source: ${sr.title}\nURL: ${sr.url}\n\n${sr.snippet}\n`)
    .join("\n---\n");

  return `I searched the web for: "${query}"

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
}
