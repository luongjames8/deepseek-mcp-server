/**
 * Tool implementations for DeepSeek Agent
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from "fs";
import { join, resolve, relative } from "path";
import { execSync } from "child_process";
import { glob } from "glob";
/**
 * Tool definitions for DeepSeek API
 */
export const TOOL_DEFINITIONS = [
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
            description: "Search the web and get synthesized results. " +
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
function validatePath(targetPath, base) {
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
    base;
    config;
    webSearchConfig;
    constructor(workingDir, config, webSearchConfig) {
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
    async execute(name, args) {
        try {
            switch (name) {
                case "read_file":
                    return this.readFile(args.path);
                case "write_file":
                    return this.writeFile(args.path, args.content);
                case "edit_file":
                    return this.editFile(args.path, args.old_string, args.new_string);
                case "run_bash":
                    return this.runBash(args.command, args.timeout);
                case "glob":
                    return this.globFiles(args.pattern);
                case "grep":
                    return this.grepFiles(args.pattern, args.path);
                case "list_dir":
                    return this.listDir(args.path);
                case "web_search":
                    return this.webSearch(args.query);
                default:
                    return `ERROR: Unknown tool '${name}'`;
            }
        }
        catch (e) {
            if (e instanceof Error) {
                return `ERROR: ${e.message}`;
            }
            return `ERROR: ${String(e)}`;
        }
    }
    readFile(path) {
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
    writeFile(path, content) {
        const filePath = validatePath(path, this.base);
        const dir = join(filePath, "..");
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }
        writeFileSync(filePath, content, "utf-8");
        return "OK";
    }
    editFile(path, oldString, newString) {
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
    runBash(command, timeout) {
        const effectiveTimeout = Math.min(timeout ?? this.config.bash.defaultTimeout, this.config.bash.maxTimeout);
        try {
            const result = execSync(command, {
                cwd: this.base,
                timeout: effectiveTimeout * 1000,
                encoding: "utf-8",
                maxBuffer: 10 * 1024 * 1024, // 10MB buffer
                shell: process.platform === "win32" ? "cmd.exe" : "/bin/bash",
            });
            return result.slice(0, 50000); // Truncate long output
        }
        catch (e) {
            if (e && typeof e === "object" && "killed" in e && e.killed) {
                return `ERROR: Command timed out after ${effectiveTimeout} seconds`;
            }
            if (e && typeof e === "object" && "stdout" in e && "stderr" in e) {
                const err = e;
                const output = (err.stdout ?? "") + (err.stderr ?? "");
                return `[Exit code: ${err.status ?? 1}]\n${output}`.slice(0, 50000);
            }
            return `ERROR: ${String(e)}`;
        }
    }
    async globFiles(pattern) {
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
    grepFiles(pattern, searchPath) {
        const targetPath = validatePath(searchPath ?? ".", this.base);
        if (!existsSync(targetPath)) {
            return `ERROR: Path not found: ${searchPath}`;
        }
        let regex;
        try {
            regex = new RegExp(pattern);
        }
        catch (e) {
            return `ERROR: Invalid regex: ${e}`;
        }
        const results = [];
        const filesToSearch = [];
        const stat = statSync(targetPath);
        if (stat.isFile()) {
            filesToSearch.push(targetPath);
        }
        else {
            // Recursively find all files
            const walk = (dir) => {
                try {
                    const entries = readdirSync(dir, { withFileTypes: true });
                    for (const entry of entries) {
                        const fullPath = join(dir, entry.name);
                        if (entry.isDirectory()) {
                            // Skip node_modules, .git, etc.
                            if (!["node_modules", ".git", "dist", "__pycache__"].includes(entry.name)) {
                                walk(fullPath);
                            }
                        }
                        else if (entry.isFile()) {
                            filesToSearch.push(fullPath);
                        }
                    }
                }
                catch {
                    // Ignore permission errors
                }
            };
            walk(targetPath);
        }
        for (const file of filesToSearch) {
            if (results.length >= this.config.grepMaxResults)
                break;
            try {
                const content = readFileSync(file, "utf-8");
                const lines = content.split("\n");
                for (let i = 0; i < lines.length; i++) {
                    if (regex.test(lines[i])) {
                        const relPath = relative(this.base, file);
                        results.push(`${relPath}:${i + 1}: ${lines[i].slice(0, 200)}`);
                        if (results.length >= this.config.grepMaxResults)
                            break;
                    }
                }
            }
            catch {
                // Ignore read errors (binary files, etc.)
            }
        }
        if (results.length === 0) {
            return "No matches found";
        }
        return results.join("\n");
    }
    listDir(path) {
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
    async webSearch(query) {
        // Dynamic import to avoid circular dependencies
        const { searchAndSynthesize } = await import("./web-search.js");
        return searchAndSynthesize(query, this.webSearchConfig);
    }
}
//# sourceMappingURL=tools.js.map