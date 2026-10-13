import * as vscode from 'vscode';
import * as path from 'path';

export type GitStatus = 'M' | 'A' | 'D' | 'R' | '?' | 'C' | 'U';
export type ChangeCategory = 'staged' | 'unstaged' | 'committed' | 'untracked';

export interface FileChange {
  absolutePath: string;
  relativePath: string;
  status: GitStatus;
  category: ChangeCategory;
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
  children: Map<string, DirNodeRef>;
  files: FileChange[];
}

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
      this.iconPath = new vscode.ThemeIcon('folder');
      this.contextValue = 'focusDir';
    }
  }
}

export function iconForStatus(status: GitStatus): vscode.ThemeIcon {
  return new vscode.ThemeIcon(STATUS_ICONS[status] ?? 'file');
}

export function labelForChange(change: FileChange): string {
  return path.basename(change.relativePath);
}
