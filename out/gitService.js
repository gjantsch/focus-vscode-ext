"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitService = void 0;
const cp = __importStar(require("child_process"));
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const CATEGORY_PRIORITY = {
    untracked: 4,
    staged: 3,
    unstaged: 2,
    committed: 1,
};
class GitService {
    constructor(workspaceRoot) {
        this.workspaceRoot = workspaceRoot;
        this.baseBranchCache = null;
    }
    async isGitRepository() {
        try {
            await this.execGit(['rev-parse', '--git-dir']);
            return true;
        }
        catch {
            return false;
        }
    }
    async getCurrentBranch() {
        try {
            return await this.execGit(['rev-parse', '--abbrev-ref', 'HEAD']);
        }
        catch {
            return 'HEAD';
        }
    }
    async getBaseBranch() {
        if (this.baseBranchCache !== null) {
            return this.baseBranchCache;
        }
        this.baseBranchCache = await this.detectBaseBranch();
        return this.baseBranchCache;
    }
    invalidateCache() {
        this.baseBranchCache = null;
    }
    async getAllChanges() {
        const baseBranch = await this.getBaseBranch();
        const [committed, working] = await Promise.all([
            this.getCommittedChanges(baseBranch),
            this.getWorkingTreeChanges(),
        ]);
        const showUntracked = vscode.workspace
            .getConfiguration('focus')
            .get('showUntracked', true);
        const allChanges = showUntracked
            ? [...working, ...committed]
            : [...working.filter(c => c.category !== 'untracked'), ...committed];
        return this.deduplicateChanges(allChanges);
    }
    // --- Private ---
    async detectBaseBranch() {
        // Try remote HEAD first
        try {
            const out = await this.execGit(['remote', 'show', 'origin']);
            const match = out.match(/HEAD branch:\s*(.+)/);
            if (match) {
                return match[1].trim();
            }
        }
        catch {
            // no remote or network issue — fall through
        }
        // Check if main exists locally
        try {
            await this.execGit(['rev-parse', '--verify', 'main']);
            return 'main';
        }
        catch {
            // fall through
        }
        return 'master';
    }
    async getCommittedChanges(baseBranch) {
        let output;
        try {
            output = await this.execGit(['diff', '--name-status', `${baseBranch}...HEAD`]);
        }
        catch {
            // branch may not exist or no commits yet
            return [];
        }
        return output
            .split('\n')
            .filter(Boolean)
            .map(line => this.parseNameStatusLine(line, 'committed'))
            .filter((c) => c !== null);
    }
    async getWorkingTreeChanges() {
        let output;
        try {
            output = await this.execGit(['status', '--porcelain=v1']);
        }
        catch {
            return [];
        }
        const changes = [];
        const untrackedDirs = [];
        for (const line of output.split('\n').filter(Boolean)) {
            const stagedCode = line[0];
            const unstagedCode = line[1];
            const filePart = line.slice(3);
            // Untracked entries — directories end with '/', files don't
            if (stagedCode === '?' && unstagedCode === '?') {
                if (filePart.trim().endsWith('/')) {
                    untrackedDirs.push(filePart.trim().slice(0, -1));
                }
                else {
                    const change = this.makeChange(filePart, '?', 'untracked');
                    if (change)
                        changes.push(change);
                }
                continue;
            }
            // Staged changes (index)
            if (stagedCode !== ' ' && stagedCode !== '?') {
                const change = this.makeChange(filePart, stagedCode, 'staged');
                if (change)
                    changes.push(change);
            }
            // Unstaged changes (working tree)
            if (unstagedCode !== ' ' && unstagedCode !== '?') {
                const change = this.makeChange(filePart, unstagedCode, 'unstaged');
                if (change)
                    changes.push(change);
            }
        }
        // Expand each untracked directory into individual files (respects .gitignore)
        for (const dir of untrackedDirs) {
            const files = await this.listUntrackedFiles(dir);
            for (const rel of files) {
                const change = this.makeChange(rel, '?', 'untracked');
                if (change)
                    changes.push(change);
            }
        }
        return changes;
    }
    async listUntrackedFiles(dir) {
        try {
            const out = await this.execGit([
                'ls-files',
                '--others',
                '--exclude-standard',
                '--',
                dir,
            ]);
            return out.split('\n').filter(Boolean);
        }
        catch {
            return [];
        }
    }
    deduplicateChanges(changes) {
        const byPath = new Map();
        for (const change of changes) {
            const key = change.relativePath;
            const existing = byPath.get(key);
            if (!existing) {
                byPath.set(key, change);
            }
            else if (CATEGORY_PRIORITY[change.category] > CATEGORY_PRIORITY[existing.category]) {
                byPath.set(key, change);
            }
        }
        return Array.from(byPath.values());
    }
    parseStatusLine(line, category) {
        if (!line.trim())
            return null;
        return this.parseNameStatusLine(line, category);
    }
    parseNameStatusLine(line, category) {
        const tab = line.indexOf('\t');
        if (tab === -1)
            return null;
        const statusPart = line.slice(0, tab).trim();
        const rest = line.slice(tab + 1);
        // Rename/copy: "R\told/path\tnew/path" or "R100\told\tnew"
        const baseStatus = statusPart[0];
        if (baseStatus === 'R' || baseStatus === 'C') {
            const parts = rest.split('\t');
            if (parts.length >= 2) {
                const newPath = parts[1].trim();
                return {
                    absolutePath: path.join(this.workspaceRoot, newPath),
                    relativePath: newPath,
                    status: baseStatus,
                    category,
                    originalPath: parts[0].trim(),
                };
            }
        }
        const filePath = rest.trim();
        return this.makeChange(filePath, baseStatus, category);
    }
    makeChange(filePart, status, category) {
        const relativePath = filePart.trim();
        // Strip trailing slash from untracked directory entries (e.g. "?? dirname/")
        const cleanPath = relativePath.endsWith('/')
            ? relativePath.slice(0, -1)
            : relativePath;
        if (!cleanPath)
            return null;
        return {
            absolutePath: path.join(this.workspaceRoot, cleanPath),
            relativePath: cleanPath,
            status,
            category,
        };
    }
    execGit(args) {
        return new Promise((resolve, reject) => {
            const proc = cp.spawn('git', args, {
                cwd: this.workspaceRoot,
                env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
            });
            let stdout = '';
            let stderr = '';
            proc.stdout.on('data', (d) => { stdout += d.toString(); });
            proc.stderr.on('data', (d) => { stderr += d.toString(); });
            const timer = setTimeout(() => {
                proc.kill();
                reject(new Error(`git ${args[0]} timed out`));
            }, 5000);
            proc.on('close', (code) => {
                clearTimeout(timer);
                if (code === 0) {
                    resolve(stdout.trim());
                }
                else {
                    reject(new Error(stderr.trim() || `git ${args[0]} exited with code ${code}`));
                }
            });
        });
    }
}
exports.GitService = GitService;
//# sourceMappingURL=gitService.js.map