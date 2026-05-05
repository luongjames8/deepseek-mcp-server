# deepseek — streaming CLI for delegation

A small CLI that lets Claude Code (or any orchestrator) delegate bounded chunks of work to DeepSeek, streaming. Replaces the older `deepseek-agent-mcp` pattern: instead of a black-box agentic loop running inside an MCP tool call (which times out, hides progress, and can't recover from partial failure), the orchestrator drives the loop via small visible CLI invocations.

## Why CLI, not MCP

The previous version of this repo was an MCP server with `deepseek_agent`, `deepseek_chat`, `web_fetch`, `web_search`, `web_fetch_raw` tools. The agent tool didn't fit MCP's contract:

| | MCP function call | Long agentic loop |
|---|---|---|
| Time | Bounded, atomic | Unbounded |
| Visibility | Final response only | Need progress |
| Recovery | Retry the whole thing | Resume mid-loop |
| Streaming | None | First-class |

Squeezing a multi-turn agent loop into a function-shaped tool meant Claude waited 5+ minutes blind, transport timed out, partial work was lost. So we ripped it out. The CLI gives back streaming, visibility, recoverability — and Claude becomes the loop, which it was already doing one level up anyway.

The bounded tools (`chat`, `fetch`, `search`) became CLI subcommands too, for consistency.

## Subcommands

```
deepseek chat       single-turn chat (streams)
deepseek fetch      URL → cleaned text → deepseek summary (streams)
deepseek fetch-raw  URL → cleaned text (no model)
deepseek search     Brave + deepseek synthesis (streams)
```

Every model-using subcommand accepts:

```
-m, --model <name>           per-subcommand default if omitted
--thinking <true|false>      omit → API default = on for v4 models
--reasoning-effort <l|m|h>   only meaningful when thinking is on
--max-tokens <n>             cap output
--show-thinking              stream reasoning_content to stderr
--system <text>              (chat only) system prompt
--temperature <n>            (chat only) sampling temp
```

Prompts can be a positional arg or piped via stdin.

## Defaults

- `chat` → `deepseek-v4-pro` (when you explicitly ask, you want the better brain)
- `fetch`, `search` → `deepseek-v4-flash` (high volume, summarization is cheap work)
- All v4 models have thinking mode **on by default** — pass `--thinking false` to opt out.

Pricing (per 1M tokens, cache miss):

| Model | Input | Output |
|---|---|---|
| v4-pro | $1.74 ($0.435 promo through 2026-05-31) | $3.48 ($0.87 promo) |
| v4-flash | $0.14 | $0.28 |
| Cache hits | 1/10 of input price | — |

## Examples

```bash
# Single question
deepseek chat "What does this regex match: ^(?=.*[A-Z])(?=.*\d).{8,}$"

# Cheap & fast
deepseek chat "summarize this in one sentence" --thinking false --max-tokens 100 < article.txt

# URL summary
deepseek fetch "https://docs.example.com/v3" "list breaking changes" > breaking.md

# Web research
deepseek search "deepseek v4 thinking parameters" -n 8 > research.md

# See the model's reasoning
deepseek chat "what is 7*8" --show-thinking
# stdout: 56
# stderr: We are asked: "what is 7*8"...

# Override default model
deepseek chat "translate 'hello' to japanese" --model deepseek-v4-flash --thinking false
```

## Install

```bash
git clone https://github.com/luongjames8/deepseek-mcp-server.git
cd deepseek-mcp-server
npm install
npm run build
npm link        # puts `deepseek` on PATH globally
```

Set `DEEPSEEK_API_KEY` in your environment (and optionally `BRAVE_API_KEY` for `search`):

```bash
echo 'export DEEPSEEK_API_KEY="sk-..."' >> ~/.bashrc
echo 'export BRAVE_API_KEY="..."' >> ~/.bashrc
```

Or drop a `.env` file in the project root, your cwd, or `$HOME` — the CLI auto-loads from any of those.

## Use with Claude Code

Add a permission rule to `~/.claude/settings.local.json` so Claude doesn't prompt on every call:

```json
{
  "permissions": {
    "allow": ["Bash(deepseek:*)"]
  }
}
```

Then drop a skill at `~/.claude/skills/deepseek/SKILL.md` (the one in this repo's `claude-skill/` is a starting point) telling Claude when to delegate. Claude reads the skill on relevant prompts and invokes `deepseek` via Bash when appropriate.

## Configuration

Per-subcommand defaults live in `config.yaml` at the repo root, project cwd, or `~/.config/deepseek-cli/config.yaml`:

```yaml
chat:
  default_model: "deepseek-v4-pro"

web_search:
  default_model: "deepseek-v4-flash"
  max_results: 10

web_fetch:
  default_model: "deepseek-v4-flash"
  timeout_seconds: 15
  max_content_chars: 50000
```

Every value is overridable per-call via flags.

## Tests

```bash
npm test
```

25 vitest cases (~13s with API key, ~1s without):
- **Unit**: param translation, validation, config loading
- **Smoke (real API)**: spawns the actual CLI binary against DeepSeek/Brave. Catches request-shape regressions, broken streaming, model-routing changes upstream.

Smoke tests skip cleanly if `DEEPSEEK_API_KEY` is unset.

## Sharp edges

- **Legacy aliases die 2026-07-24**: `deepseek-chat` and `deepseek-reasoner` will stop resolving. Use `deepseek-v4-pro` or `deepseek-v4-flash` explicitly. Defaults are already correct.
- **fetch min content size**: 500 chars. Short pages (status pages, redirects) error out — use `fetch-raw` to bypass parsing.
- **No interactive prompts**: every call is one-shot. The CLI doesn't keep conversation history. If you want multi-turn, the orchestrator manages it.
- **Strict tool calling (Beta)**: not exposed via flags. Set `DEEPSEEK_BASE_URL=https://api.deepseek.com/beta` to use the strict endpoint.

## License

MIT
