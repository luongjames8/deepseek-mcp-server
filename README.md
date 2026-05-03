# DeepSeek MCP Server

An MCP (Model Context Protocol) server that lets Claude Code delegate tasks to DeepSeek, saving you **10-100x on API costs** for routine work.

## Why This Exists

**Problem:** Claude is expensive. Running Sonnet/Opus for every file read, web fetch, or code-gen task adds up fast.

**Solution:** Delegate routine work to DeepSeek (~$0.14/M input tokens vs Claude's $3-15/M) while keeping Claude for orchestration and complex reasoning.

### Cost Comparison (per 1M tokens, cache miss)

| Model | Input | Output |
|-------|-------|--------|
| Claude Opus | $15.00 | $75.00 |
| Claude Sonnet | $3.00 | $15.00 |
| **DeepSeek v4 Pro** | **$1.74** ($0.435 promo through 2026-05-31) | **$3.48** ($0.87 promo) |
| **DeepSeek v4 Flash** | **$0.14** | **$0.28** |

Both v4 models support **1M context**, **384K max output**, and **thinking mode on by default**. Cache hits are 1/10th the input price.

## Features

Five tools, each with caller-overridable model parameters:

| Tool | What it does | Default model | Why |
|------|--------------|---------------|-----|
| `deepseek_agent` | Agentic loop: file/shell/web tools | `deepseek-v4-pro` | Real work being delegated — pay for quality |
| `deepseek_chat` | Single-turn chat, no tools | `deepseek-v4-pro` | Explicit "ask deepseek" — want the better brain |
| `web_fetch` | Fetch URL + extract with DeepSeek | `deepseek-v4-flash` | High call volume; extraction is cheap work |
| `web_fetch_raw` | Fetch URL, return raw text (no AI) | n/a | Cheapest — for verification |
| `web_search` | Brave search + DeepSeek synthesis | `deepseek-v4-flash` | High call volume; summarization is cheap work |

### Caller-overridable parameters

Every tool that calls a model accepts these optional args:

| Param | Type | Effect |
|-------|------|--------|
| `model` | string | Override the per-tool default |
| `max_tokens` | int | Cap output (omit → API decides; v4 supports 384K) |
| `thinking` | bool | `false` to disable thinking mode (faster, cheaper) |
| `reasoning_effort` | `"low"` \| `"medium"` \| `"high"` | How hard to think when thinking is on |

`deepseek_agent` additionally accepts:
- `max_iterations` — tool-call loop cap
- `timeout_seconds` — overall timeout
- `strict_tools` — Beta: route to `api.deepseek.com/beta` and enforce JSON-schema-strict tool args

### Sub-tools available to `deepseek_agent`

`read_file`, `write_file`, `edit_file`, `run_bash`, `glob`, `grep`, `list_dir`, `web_search`

## Model notes

- **`deepseek-v4-pro`** and **`deepseek-v4-flash`** are the current generation. Both have thinking mode on by default — the response includes a `reasoning_content` field unless you pass `thinking: false`.
- Legacy aliases **`deepseek-chat`** and **`deepseek-reasoner`** are supported but **deprecated 2026-07-24** by DeepSeek. They map to v4-flash non-thinking / v4-flash thinking respectively.
- Pro is currently discounted ~75% (through 2026-05-31). After that it's ~6-12x Flash, but still cheaper than Sonnet.

## Installation

### Prerequisites
- **Node.js 20+**
- **Claude Code CLI**
- **DeepSeek API key** — [Get one here](https://platform.deepseek.com/api_keys)
- **Brave Search API key** (optional, for `web_search`) — [Get one here](https://brave.com/search/api/)

### Step 1: Clone and Build

```bash
git clone https://github.com/luongjames8/deepseek-mcp-server.git
cd deepseek-mcp-server
npm install
npm run build
```

### Step 2: Configure Claude Code

Add to the `mcpServers` section of `~/.claude.json`:

```json
{
  "mcpServers": {
    "deepseek-agent": {
      "command": "node",
      "args": ["/absolute/path/to/deepseek-mcp-server/dist/index.js"],
      "env": {
        "DEEPSEEK_API_KEY": "your-deepseek-api-key",
        "BRAVE_API_KEY": "your-brave-api-key"
      }
    }
  }
}
```

### Step 3: Restart Claude Code

Run `/mcp` to confirm `deepseek-agent` is connected.

### Alternative: `.env` file

Instead of putting keys in `~/.claude.json`:

```bash
cp .env.example .env
# Edit .env with your API keys
```

The server searches for `.env` in cwd, project root, and `$HOME` in that order.

## Usage examples

```
# File operations (defaults to v4-pro)
Use deepseek_agent to add JSDoc to all exported functions in src/

# Cheap, single-turn (defaults to v4-pro)
Use deepseek_chat to explain Promise.all vs Promise.allSettled

# Web fetch (defaults to v4-flash)
Use web_fetch on https://react.dev/blog/... to summarize the post

# Override the default to use Pro for a fetch
web_fetch with url=https://x.com/... model=deepseek-v4-pro

# Disable thinking for a fast, cheap chat
deepseek_chat with prompt="..." thinking=false
```

## Configuration

`config.yaml` sets per-tool defaults. All values can be overridden per-call.

```yaml
model:
  allowed:
    - "deepseek-v4-pro"
    - "deepseek-v4-flash"
    - "deepseek-chat"          # legacy, deprecated 2026-07-24
    - "deepseek-reasoner"      # legacy, deprecated 2026-07-24

agent:
  default_model: "deepseek-v4-pro"
  max_iterations: 50
  timeout_seconds: 300

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

## Tests

```bash
npm test
```

21 tests run in ~4s:
- **Unit** — config loading, parameter translation, validation (mocked, no API).
- **Smoke** — 4 real DeepSeek API calls (~$0.005 per run) verifying v4-pro/flash respond, thinking-on-by-default works, `thinking: false` opts out.

Smoke tests skip cleanly if `DEEPSEEK_API_KEY` is unset, but unit tests still run.

## Limitations

- **Path sandboxing**: agent file ops restricted to working directory.
- **No interactive commands**: agent can't run anything that needs stdin.
- **Web search latency**: 10-30s (Brave + synthesis).

## Troubleshooting

**"DEEPSEEK_API_KEY is required"** — Set in `~/.claude.json` env, or `.env` file.

**Tools not appearing** — `/mcp` output should show `deepseek-agent` connected. Verify the absolute path and that `npm run build` succeeded.

**Old behavior persisting** — If you previously installed via npm, the `node_modules` copy may shadow your changes. Either reinstall or symlink: `ln -sfn /path/to/deepseek-mcp-server node_modules/deepseek-mcp-server`.

## Security

- File operations sandboxed to working directory.
- API keys via environment variables only — never logged.
- Agent's web access limited to explicit `web_search` / `web_fetch` calls.

## License

MIT
