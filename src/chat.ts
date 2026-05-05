/**
 * Streaming chat primitive.
 *
 * Single API call to DeepSeek. Streams content to a writable stream (stdout
 * by default). Reasoning_content (from thinking-mode models) goes to a
 * separate stream — stderr by default, off entirely unless showThinking.
 *
 * No agentic loop, no tools. Caller is responsible for orchestration.
 */

import OpenAI from "openai";
import { Writable } from "stream";
import type { ModelCallParams } from "./types.js";
import { getApiKey, getBaseUrl } from "./config.js";
import { buildExtraParams } from "./api-params.js";

export interface StreamChatOptions extends ModelCallParams {
  systemPrompt?: string;
  temperature?: number;
  /** stream response content here (default: process.stdout) */
  out?: Writable;
  /** stream reasoning_content here (default: process.stderr) */
  thinkingOut?: Writable;
  /** if false, reasoning_content is dropped entirely */
  showThinking?: boolean;
}

export interface StreamChatResult {
  content: string;
  reasoningContent: string;
  model: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    cachedTokens?: number;
  };
}

/**
 * Run a single streaming chat completion.
 * Returns the accumulated content + reasoning, even though both have
 * already been written to the output streams during the call.
 */
export async function streamChat(
  prompt: string,
  defaultModel: string,
  options: StreamChatOptions = {},
): Promise<StreamChatResult> {
  const client = new OpenAI({
    apiKey: getApiKey(),
    baseURL: getBaseUrl(),
  });

  const out = options.out ?? process.stdout;
  const thinkingOut = options.thinkingOut ?? process.stderr;
  const showThinking = options.showThinking ?? false;
  const model = options.model ?? defaultModel;

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
  if (options.systemPrompt) {
    messages.push({ role: "system", content: options.systemPrompt });
  }
  messages.push({ role: "user", content: prompt });

  const extra = buildExtraParams(options);

  const body = {
    model,
    messages,
    stream: true as const,
    stream_options: { include_usage: true },
    ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
    ...extra,
  };

  const stream = (await client.chat.completions.create(
    body as unknown as Parameters<typeof client.chat.completions.create>[0],
  )) as unknown as AsyncIterable<{
    choices?: Array<{
      delta?: {
        content?: string | null;
        reasoning_content?: string | null;
      };
    }>;
    model?: string;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      prompt_cache_hit_tokens?: number;
    };
  }>;

  let content = "";
  let reasoning = "";
  let actualModel = model;
  let usage: StreamChatResult["usage"];

  for await (const chunk of stream) {
    if (chunk.model) actualModel = chunk.model;
    if (chunk.usage) {
      usage = {
        promptTokens: chunk.usage.prompt_tokens,
        completionTokens: chunk.usage.completion_tokens,
        cachedTokens: chunk.usage.prompt_cache_hit_tokens,
      };
    }

    const delta = chunk.choices?.[0]?.delta;
    if (!delta) continue;

    if (delta.reasoning_content) {
      reasoning += delta.reasoning_content;
      if (showThinking) {
        thinkingOut.write(delta.reasoning_content);
      }
    }

    if (delta.content) {
      content += delta.content;
      out.write(delta.content);
    }
  }

  // ensure trailing newline on stdout for shell-friendly output
  if (content && !content.endsWith("\n")) {
    out.write("\n");
  }

  return {
    content,
    reasoningContent: reasoning,
    model: actualModel,
    usage,
  };
}
