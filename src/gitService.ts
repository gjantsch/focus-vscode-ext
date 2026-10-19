import * as cp from 'child_process';
import * as path from 'path';
import * as vscode from 'vscode';
import { FileChange, GitStatus, ChangeCategory } from './focusItem';

/** Higher priority wins when the same file appears in multiple change categories. */
const CATEGORY_PRIORITY: Record<ChangeCategory, number> = {
  untracked: 4,
  staged: 3,
  unstaged: 2,
  committed: 1,
};

/** Runs git commands and aggregates all changed files on the current branch. */
export class GitService {
  /** Cached result of base-branch detection; cleared by `invalidateCache`. */
  private baseBranchCache: string | null = null;

  constructor(public readonly workspaceRoot: string) {}

  async isGitRepository(): Promise<boolean> {
    try {
      await this.execGit(['rev-parse', '--git-dir']);
      return true;
    } catch {
      return false;
    }
  }

  async getCurrentBranch(): Promise<string> {
    try {
      return await this.execGit(['rev-parse', '--abbrev-ref', 'HEAD']);
    } catch {
      return 'HEAD';
    }
  }

  async getBaseBranch(): Promise<string> {
    if (this.baseBranchCache !== null) {
      return this.baseBranchCache;
    }
    this.baseBranchCache = await this.detectBaseBranch();
    return this.baseBranchCache;
  }

  /** Clears the cached base branch so the next call re-detects it. */
  invalidateCache(): void {
    this.baseBranchCache = null;
  }

  /** Returns all file changes: working-tree status merged with committed-but-not-yet-pushed diff. */
  async getAllChanges(): Promise<FileChange[]> {
    const baseBranch = await this.getBaseBranch();
    const [committed, working] = await Promise.all([
      this.getCommittedChanges(baseBranch),
      this.getWorkingTreeChanges(),
    ]);
    const showUntracked = vscode.workspace
      .getConfiguration('focus')
      .get<boolean>('showUntracked', true);
    const allChanges = showUntracked
      ? [...working, ...committed]
      : [...working.filter(c => c.category !== 'untracked'), ...committed];
    return this.deduplicateChanges(allChanges);
  }

  // --- Private ---

  /**
   * Detects the base branch by querying the remote HEAD, then falling back to
   * checking if `main` exists locally, and finally defaulting to `master`.
   */
  private async detectBaseBranch(): Promise<string> {
    // Try remote HEAD first
    try {
      const out = await this.execGit(['remote', 'show', 'origin']);
      const match = out.match(/HEAD branch:\s*(.+)/);
      if (match) {
        return match[1].trim();
      }
    } catch {
      // no remote or network issue — fall through
    }

    // Check if main exists locally
    try {
      await this.execGit(['rev-parse', '--verify', 'main']);
      return 'main';
    } catch {
      // fall through
    }

    return 'master';
  }

  async getCommittedChanges(baseBranch: string): Promise<FileChange[]> {
    let output: string;
    try {
      output = await this.execGit(['diff', '--name-status', `${baseBranch}...HEAD`]);
    } catch {
      // branch may not exist or no commits yet
      return [];
    }
    return output
      .split('\n')
      .filter(Boolean)
      .map(line => this.parseNameStatusLine(line, 'committed'))
      .filter((c): c is FileChange => c !== null);
  }

  async getWorkingTreeChanges(): Promise<FileChange[]> {
    let output: string;
    try {
      output = await this.execGit(['status', '--porcelain=v1']);
    } catch {
      return [];
    }

    const changes: FileChange[] = [];
    const untrackedDirs: string[] = [];

    for (const line of output.split('\n').filter(Boolean)) {
      const stagedCode = line[0];
      const unstagedCode = line[1];
      const filePart = line.slice(3);

      // Untracked entries — directories end with '/', files don't
      if (stagedCode === '?' && unstagedCode === '?') {
        if (filePart.trim().endsWith('/')) {
          untrackedDirs.push(filePart.trim().slice(0, -1));
        } else {
          const change = this.makeChange(filePart, '?', 'untracked');
          if (change) changes.push(change);
        }
        continue;
      }

      // Staged changes (index)
      if (stagedCode !== ' ' && stagedCode !== '?') {
        const change = this.makeChange(filePart, stagedCode as GitStatus, 'staged');
        if (change) changes.push(change);
      }

      // Unstaged changes (working tree)
      if (unstagedCode !== ' ' && unstagedCode !== '?') {
        const change = this.makeChange(filePart, unstagedCode as GitStatus, 'unstaged');
        if (change) changes.push(change);
      }
    }

    // Expand each untracked directory into individual files (respects .gitignore)
    for (const dir of untrackedDirs) {
      const files = await this.listUntrackedFiles(dir);
      for (const rel of files) {
        const change = this.makeChange(rel, '?', 'untracked');
        if (change) changes.push(change);
      }
    }

    return changes;
  }

  private async listUntrackedFiles(dir: string): Promise<string[]> {
    try {
      const out = await this.execGit([
        'ls-files',
        '--others',
        '--exclude-standard',
        '--',
        dir,
      ]);
      return out.split('\n').filter(Boolean);
    } catch {
      return [];
    }
  }

  /**
   * Deduplicates changes by relative path, keeping the entry with the highest
   * category priority (untracked > staged > unstaged > committed).
   */
  deduplicateChanges(changes: FileChange[]): FileChange[] {
    const byPath = new Map<string, FileChange>();
    for (const change of changes) {
      const key = change.relativePath;
      const existing = byPath.get(key);
      if (!existing) {
        byPath.set(key, change);
      } else if (CATEGORY_PRIORITY[change.category] > CATEGORY_PRIORITY[existing.category]) {
        byPath.set(key, change);
      }
    }
    return Array.from(byPath.values());
  }

  parseStatusLine(line: string, category: ChangeCategory): FileChange | null {
    if (!line.trim()) return null;
    return this.parseNameStatusLine(line, category);
  }

  private parseNameStatusLine(line: string, category: ChangeCategory): FileChange | null {
    const tab = line.indexOf('\t');
    if (tab === -1) return null;

    const statusPart = line.slice(0, tab).trim();
    const rest = line.slice(tab + 1);

    // Rename/copy: "R\told/path\tnew/path" or "R100\told\tnew"
    const baseStatus = statusPart[0] as GitStatus;
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

  private makeChange(
    filePart: string,
    status: GitStatus,
    category: ChangeCategory
  ): FileChange | null {
    const relativePath = filePart.trim();

    // Strip trailing slash from untracked directory entries (e.g. "?? dirname/")
    const cleanPath = relativePath.endsWith('/')
      ? relativePath.slice(0, -1)
      : relativePath;

    if (!cleanPath) return null;

    return {
      absolutePath: path.join(this.workspaceRoot, cleanPath),
      relativePath: cleanPath,
      status,
      category,
    };
  }

  /** Spawns a git subprocess with a 5-second timeout. Rejects on non-zero exit or timeout. */
  private execGit(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = cp.spawn('git', args, {
        cwd: this.workspaceRoot,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      });

      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

      const timer = setTimeout(() => {
        proc.kill();
        reject(new Error(`git ${args[0]} timed out`));
      }, 5000);

      proc.on('close', (code: number) => {
        clearTimeout(timer);
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(new Error(stderr.trim() || `git ${args[0]} exited with code ${code}`));
        }
      });
    });
  }
}
