/**
 * Tool implementations for DeepSeek Agent
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from "fs";
import { join, resolve, relative } from "path";
import { execSync } from "child_process";
import { glob } from "glob";
import type { ToolDefinition, ToolsConfig, WebSearchConfig } from "./types.js";

/**
 * Tool definitions for DeepSeek API
 */
export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read the contents of a file",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path relative to working directory" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Write content to a file (creates parent directories if needed)",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path relative to working directory" },
          content: { type: "string", description: "Content to write" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_file",
      description: "Replace text in a file. Use exact string matching.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path relative to working directory" },
          old_string: { type: "string", description: "Exact text to find and replace" },
          new_string: { type: "string", description: "Text to replace with" },
        },
        required: ["path", "old_string", "new_string"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_bash",
      description: "Execute a shell command",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "Shell command to execute" },
          timeout: { type: "integer", description: "Timeout in seconds (default: 120)" },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "glob",
      description: "Find files matching a glob pattern",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Glob pattern (e.g., '**/*.ts', 'src/*.js')" },
        },
        required: ["pattern"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "grep",
      description: "Search for a pattern in files",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Regex pattern to search for" },
          path: { type: "string", description: "Path to search in (default: '.')" },
        },
        required: ["pattern"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_dir",
      description: "List contents of a directory",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Directory path relative to working directory" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Search the web and get synthesized results. " +
        "WARNING: High latency (10-30 seconds). " +
        "Use only when you need current/real-time information that cannot be found in local files. " +
        "For faster results, consider asking the user to provide the information or use Claude's WebSearch.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
        },
        required: ["query"],
      },
    },
  },
];

/**
 * Validate that a path is within the sandbox
 */
function validatePath(targetPath: string, base: string): string {
  const resolved = resolve(base, targetPath);
  const baseResolved = resolve(base);

  // Check if resolved path is within base directory
  if (!resolved.startsWith(baseResolved)) {
    throw new Error(`Path escape attempt blocked: ${targetPath}`);
  }

  return resolved;
}

/**
 * Tool executor class
 */
export class ToolExecutor {
  private base: string;
  private config: ToolsConfig;
  private webSearchConfig: WebSearchConfig;

  constructor(
    workingDir: string,
    config?: ToolsConfig,
    webSearchConfig?: WebSearchConfig
  ) {
    this.base = resolve(workingDir);
    this.config = config ?? {
      bash: { defaultTimeout: 120, maxTimeout: 600 },
      globMaxResults: 100,
      grepMaxResults: 100,
    };
    this.webSearchConfig = webSearchConfig ?? {
      maxResults: 10,
      maxResponseTokens: 8192,
    };
  }

  /**
   * Execute a tool by name
   */
  async execute(name: string, args: Record<string, unknown>): Promise<string> {
    try {
      switch (name) {
        case "read_file":
          return this.readFile(args.path as string);
        case "write_file":
          return this.writeFile(args.path as string, args.content as string);
        case "edit_file":
          return this.editFile(
            args.path as string,
            args.old_string as string,
            args.new_string as string
          );
        case "run_bash":
          return this.runBash(
            args.command as string,
            args.timeout as number | undefined
          );
        case "glob":
          return this.globFiles(args.pattern as string);
        case "grep":
          return this.grepFiles(args.pattern as string, args.path as string | undefined);
        case "list_dir":
          return this.listDir(args.path as string);
        case "web_search":
          return this.webSearch(args.query as string);
        default:
          return `ERROR: Unknown tool '${name}'`;
      }
    } catch (e) {
      if (e instanceof Error) {
        return `ERROR: ${e.message}`;
      }
      return `ERROR: ${String(e)}`;
    }
  }

  private readFile(path: string): string {
    const filePath = validatePath(path, this.base);
    if (!existsSync(filePath)) {
      return `ERROR: File not found: ${path}`;
    }
    const stat = statSync(filePath);
    if (!stat.isFile()) {
      return `ERROR: Not a file: ${path}`;
    }
    return readFileSync(filePath, "utf-8");
  }

  private writeFile(path: string, content: string): string {
    const filePath = validatePath(path, this.base);
    const dir = join(filePath, "..");
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(filePath, content, "utf-8");
    return "OK";
  }

  private editFile(path: string, oldString: string, newString: string): string {
    const filePath = validatePath(path, this.base);
    if (!existsSync(filePath)) {
      return `ERROR: File not found: ${path}`;
    }
    const content = readFileSync(filePath, "utf-8");
    if (!content.includes(oldString)) {
      return "ERROR: old_string not found in file";
    }
    const newContent = content.replace(oldString, newString);
    writeFileSync(filePath, newContent, "utf-8");
    return "OK";
  }

  private runBash(command: string, timeout?: number): string {
    const effectiveTimeout = Math.min(
      timeout ?? this.config.bash.defaultTimeout,
      this.config.bash.maxTimeout
    );
    try {
      const result = execSync(command, {
        cwd: this.base,
        timeout: effectiveTimeout * 1000,
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        shell: process.platform === "win32" ? "cmd.exe" : "/bin/bash",
      });
      return result.slice(0, 50000); // Truncate long output
    } catch (e) {
      if (e && typeof e === "object" && "killed" in e && e.killed) {
        return `ERROR: Command timed out after ${effectiveTimeout} seconds`;
      }
      if (e && typeof e === "object" && "stdout" in e && "stderr" in e) {
        const err = e as { stdout?: string; stderr?: string; status?: number };
        const output = (err.stdout ?? "") + (err.stderr ?? "");
        return `[Exit code: ${err.status ?? 1}]\n${output}`.slice(0, 50000);
      }
      return `ERROR: ${String(e)}`;
    }
  }

  private async globFiles(pattern: string): Promise<string> {
    const matches = await glob(pattern, {
      cwd: this.base,
      nodir: false,
    });
    if (matches.length === 0) {
      return "No files found";
    }
    const limited = matches.slice(0, this.config.globMaxResults);
    return limited.sort().join("\n");
  }

  private grepFiles(pattern: string, searchPath?: string): string {
    const targetPath = validatePath(searchPath ?? ".", this.base);
    if (!existsSync(targetPath)) {
      return `ERROR: Path not found: ${searchPath}`;
    }

    let regex: RegExp;
    try {
      regex = new RegExp(pattern);
    } catch (e) {
      return `ERROR: Invalid regex: ${e}`;
    }

    const results: string[] = [];
    const filesToSearch: string[] = [];

    const stat = statSync(targetPath);
    if (stat.isFile()) {
      filesToSearch.push(targetPath);
    } else {
      // Recursively find all files
      const walk = (dir: string) => {
        try {
          const entries = readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = join(dir, entry.name);
            if (entry.isDirectory()) {
              // Skip node_modules, .git, etc.
              if (!["node_modules", ".git", "dist", "__pycache__"].includes(entry.name)) {
                walk(fullPath);
              }
            } else if (entry.isFile()) {
              filesToSearch.push(fullPath);
            }
          }
        } catch {
          // Ignore permission errors
        }
      };
      walk(targetPath);
    }

    for (const file of filesToSearch) {
      if (results.length >= this.config.grepMaxResults) break;
      try {
        const content = readFileSync(file, "utf-8");
        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (regex.test(lines[i])) {
            const relPath = relative(this.base, file);
            results.push(`${relPath}:${i + 1}: ${lines[i].slice(0, 200)}`);
            if (results.length >= this.config.grepMaxResults) break;
          }
        }
      } catch {
        // Ignore read errors (binary files, etc.)
      }
    }

    if (results.length === 0) {
      return "No matches found";
    }
    return results.join("\n");
  }

  private listDir(path: string): string {
    const dirPath = validatePath(path, this.base);
    if (!existsSync(dirPath)) {
      return `ERROR: Directory not found: ${path}`;
    }
    const stat = statSync(dirPath);
    if (!stat.isDirectory()) {
      return `ERROR: Not a directory: ${path}`;
    }

    const entries = readdirSync(dirPath, { withFileTypes: true }).slice(0, 100);
    if (entries.length === 0) {
      return "(empty directory)";
    }

    const lines = entries
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((entry) => {
        const prefix = entry.isDirectory() ? "[DIR]" : "[FILE]";
        return `${prefix} ${entry.name}`;
      });

    return lines.join("\n");
  }

  private async webSearch(query: string): Promise<string> {
    // Dynamic import to avoid circular dependencies
    const { searchAndSynthesize } = await import("./web-search.js");
    return searchAndSynthesize(query, this.webSearchConfig);
  }
}
