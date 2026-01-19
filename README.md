# DeepSeek MCP Server

An MCP (Model Context Protocol) server that lets Claude Code delegate tasks to DeepSeek, saving you **10-50x on API costs** for routine coding tasks.

## Why This Exists

**The Problem:** Claude is expensive. Running Claude Opus for every file read, code generation, or refactoring task adds up fast.

**The Solution:** Delegate routine tasks to DeepSeek (which costs ~$0.14/M input tokens vs Claude's $3-15/M) while keeping Claude for complex reasoning and coordination.

### Cost Comparison

| Model | Input (per 1M tokens) | Output (per 1M tokens) |
|-------|----------------------|------------------------|
| Claude Opus | $15.00 | $75.00 |
| Claude Sonnet | $3.00 | $15.00 |
| **DeepSeek Chat** | **$0.14** | **$0.28** |
| DeepSeek Reasoner | $0.55 | $2.19 |

**Real example:** A coding session with 50 file operations might cost $5-10 with Claude. With DeepSeek handling the file operations: **~$0.20**.

## Features

This MCP server provides **4 tools** to Claude:

### 1. `deepseek_agent` - Agentic File Operations
Full coding agent with tool access. Use for tasks requiring file system interaction.

**Sub-tools available:**
- `read_file` - Read file contents
- `write_file` - Create/overwrite files
- `edit_file` - Find-and-replace in files
- `run_bash` - Execute shell commands
- `glob` - Find files by pattern
- `grep` - Search file contents
- `list_dir` - List directory contents
- `web_search` - Search the web (requires Brave API key)

**Example:**
```
Use deepseek_agent to refactor all the error handling in src/ to use a custom AppError class
```

### 2. `deepseek_chat` - Fast Chat Completion
Simple prompt → response. No tools, no overhead. Use for analysis, explanations, code review.

**Example:**
```
Use deepseek_chat to explain what this regex does: ^(?=.*[A-Z])(?=.*\d).{8,}$
```

### 3. `web_fetch` - Fetch & Analyze Web Pages
Fetches a URL, extracts content, answers questions about it. Cheaper than Claude's built-in WebFetch.

**Example:**
```
Use web_fetch to get the main features from https://docs.python.org/3/whatsnew/3.12.html
```

### 4. `web_search` - Web Search with Synthesis
Searches Brave, synthesizes results with DeepSeek. Requires `BRAVE_API_KEY`.

**Example:**
```
Use web_search to find the latest TypeScript 5.4 features
```

## Installation

### Prerequisites
- **Node.js 20+** - [Download](https://nodejs.org/)
- **Claude Code CLI** - [Installation guide](https://docs.anthropic.com/en/docs/claude-code)
- **DeepSeek API key** (required) - [Get one here](https://platform.deepseek.com/api_keys) (~$0.14/M tokens)
- **Brave Search API key** (optional, for web_search) - [Get one here](https://brave.com/search/api/) (free tier available)

### Step 1: Clone and Build

```bash
git clone https://github.com/luongjames8/deepseek-mcp-server.git
cd deepseek-mcp-server
npm install
npm run build
```

### Step 2: Configure Claude Code

Edit your Claude config file:

**Location:**
- Windows: `%USERPROFILE%\.claude.json`
- Mac/Linux: `~/.claude.json`

Add to the `mcpServers` section:

```json
{
  "mcpServers": {
    "deepseek": {
      "command": "node",
      "args": ["/absolute/path/to/deepseek-mcp-server/dist/index.js"],
      "env": {
        "DEEPSEEK_API_KEY": "your-deepseek-api-key"
      }
    }
  }
}
```

**Important:** Use the absolute path to `dist/index.js`. Examples:
- Windows: `"C:/Users/YourName/deepseek-mcp-server/dist/index.js"`
- Mac: `"/Users/yourname/deepseek-mcp-server/dist/index.js"`
- Linux: `"/home/yourname/deepseek-mcp-server/dist/index.js"`

**Optional:** Add Brave API key for web search:
```json
"env": {
  "DEEPSEEK_API_KEY": "your-deepseek-api-key",
  "BRAVE_API_KEY": "your-brave-api-key"
}
```

### Step 3: Restart Claude Code

Run `/mcp` in Claude Code to restart the MCP servers. You should see `deepseek` in the list.

### Alternative: Environment File

Instead of putting keys in `~/.claude.json`, create a `.env` file in the project:

```bash
cp .env.example .env
# Edit .env with your API keys
```

## Usage

Once installed, Claude can use the tools directly:

```
# File operations
Use deepseek_agent to read all .ts files in src/ and add JSDoc comments to exported functions

# Quick questions
Use deepseek_chat to explain the difference between Promise.all and Promise.allSettled

# Web research
Use web_fetch to summarize https://react.dev/blog/2024/02/15/react-labs-what-we-have-been-working-on-february-2024

# Web search
Use web_search for "Node.js 22 new features"
```

### Recommended Workflow

1. **Use Claude for:** Planning, architecture decisions, complex debugging, multi-step coordination
2. **Delegate to DeepSeek for:** File reading/writing, code generation, refactoring, simple explanations, web fetching

### Tool Selection Guide

| Task | Tool | Why |
|------|------|-----|
| Read/write files | `deepseek_agent` | Full file system access |
| Generate boilerplate | `deepseek_agent` | Can write files directly |
| Explain code | `deepseek_chat` | Fast, no overhead |
| Code review | `deepseek_chat` | Analysis only |
| Fetch documentation | `web_fetch` | Cheaper than Claude |
| Research current topics | `web_search` | Real-time web access |

## Configuration

Edit `config.yaml` to customize behavior:

```yaml
# Model settings
model:
  default: "deepseek-chat"
  allowed:
    - "deepseek-chat"
    - "deepseek-reasoner"  # Better for complex reasoning

# Agent limits
agent:
  max_iterations: 50       # Max tool calls per task
  timeout_seconds: 300     # 5 minute timeout

# Tool settings
tools:
  bash:
    default_timeout: 120   # 2 minutes per command
    max_timeout: 600       # 10 minute max
```

## Limitations

### What DeepSeek is Good At
- Routine file operations
- Code generation from clear specs
- Refactoring with explicit instructions
- Answering factual questions
- Summarizing content

### What Claude is Better At
- Complex multi-step reasoning
- Ambiguous requirements
- Architecture decisions
- Nuanced code review
- Tasks requiring judgment

### Technical Limitations
- **Path sandboxing:** File operations are restricted to the working directory
- **No interactive commands:** Can't run commands that require user input
- **Web search latency:** 10-30 seconds (Brave API + synthesis)
- **Context limits:** DeepSeek has smaller context than Claude

## Troubleshooting

### "DEEPSEEK_API_KEY is required"
Set the API key in `~/.claude.json` env section or in `.env` file.

### Tools not appearing in Claude
1. Check `/mcp` output for errors
2. Verify the `cwd` path is correct and absolute
3. Make sure `npm run build` completed successfully

### "Path escape attempt blocked"
The agent tried to access files outside the working directory. This is a security feature.

### Slow web_search
Web search has inherent latency (10-30s). For faster results:
- Use `web_fetch` if you know the exact URL
- Use Claude's built-in WebSearch for time-sensitive queries

## Security

- **Path sandboxing:** All file operations are restricted to the specified working directory
- **No credential storage:** API keys are passed via environment variables
- **No network access from agent tools:** Only explicit web_fetch/web_search can access the internet

## License

MIT

## Contributing

PRs welcome! Please ensure:
1. `npm run build` succeeds
2. Test all 4 tools manually
3. Update README if adding features
