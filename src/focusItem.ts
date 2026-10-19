import * as vscode from 'vscode';
import * as path from 'path';

/** Single-character status codes from `git status --porcelain` and `git diff --name-status`. */
export type GitStatus = 'M' | 'A' | 'D' | 'R' | '?' | 'C' | 'U';

/** Where the change lives: index, working tree, committed on this branch, or new/untracked. */
export type ChangeCategory = 'staged' | 'unstaged' | 'committed' | 'untracked';

/** Represents one changed file as reported by git. */
export interface FileChange {
  absolutePath: string;
  relativePath: string;
  status: GitStatus;
  category: ChangeCategory;
  /** Set for renamed/copied files — the path before the rename. */
  originalPath?: string;
}

const STATUS_ICONS: Record<GitStatus, string> = {
  'M': 'git-commit',
  'A': 'diff-added',
  'D': 'diff-removed',
  'R': 'diff-renamed',
  '?': 'question',
  'C': 'copy',
  'U': 'warning',
};

// Circular import avoided by using an interface instead of importing DirNode from focusProvider
export interface DirNodeRef {
  absolutePath: string;
  children: Map<string, DirNodeRef>;
  files: FileChange[];
}

/** A node in the Focus tree view — either a file change or a directory. */
export class FocusItem extends vscode.TreeItem {
  constructor(
    public readonly change: FileChange | null,
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly dirNode: DirNodeRef | null
  ) {
    super(label, collapsibleState);

    if (change) {
      this.resourceUri = vscode.Uri.file(change.absolutePath);
      this.command = {
        command: 'focus.openFile',
        title: 'Open File',
        arguments: [this.resourceUri, change.status],
      };
      this.iconPath = iconForStatus(change.status);
      this.description = change.category;
      this.tooltip = `${change.relativePath} [${change.status}] — ${change.category}`;
      this.contextValue = `focusFile_${change.status}`;
    } else if (dirNode) {
      this.resourceUri = vscode.Uri.file(dirNode.absolutePath);
      this.iconPath = new vscode.ThemeIcon('folder');
      this.contextValue = 'focusDir';
    }
  }
}

/** Maps a git status code to the corresponding VS Code theme icon. */
export function iconForStatus(status: GitStatus): vscode.ThemeIcon {
  return new vscode.ThemeIcon(STATUS_ICONS[status] ?? 'file');
}

/** Returns the filename portion of a change's relative path, used as the tree label. */
export function labelForChange(change: FileChange): string {
  return path.basename(change.relativePath);
}
