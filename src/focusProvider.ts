import * as vscode from 'vscode';
import { GitService } from './gitService';
import { FileChange, FocusItem, DirNodeRef, labelForChange } from './focusItem';

type ChangeEvent = FocusItem | undefined | null;

type DirNode = DirNodeRef;

function makeDirNode(absolutePath: string = ''): DirNode {
  return { absolutePath, children: new Map(), files: [] };
}

/** Inserts a file change into the directory tree, creating intermediate nodes as needed. */
function insertIntoTree(root: DirNode, change: FileChange, workspaceRoot: string): void {
  const parts = change.relativePath.split('/');
  let node = root;
  let currentPath = workspaceRoot;
  for (let i = 0; i < parts.length - 1; i++) {
    const seg = parts[i];
    currentPath = currentPath + '/' + seg;
    if (!node.children.has(seg)) {
      node.children.set(seg, makeDirNode(currentPath));
    }
    node = node.children.get(seg)!;
  }
  node.files.push(change);
}

/**
 * `TreeDataProvider` that populates the Focus view with files changed on the current branch.
 * Fires `onBranchChange` whenever the active branch name changes so the view title can be updated.
 */
export class FocusProvider implements vscode.TreeDataProvider<FocusItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<ChangeEvent>();
  readonly onDidChangeTreeData: vscode.Event<ChangeEvent> = this._onDidChangeTreeData.event;

  private cachedChanges: FileChange[] = [];
  private lastBranch = '';

  private _onBranchChange = new vscode.EventEmitter<string>();
  readonly onBranchChange: vscode.Event<string> = this._onBranchChange.event;

  constructor(private readonly gitService: GitService) {}

  getTreeItem(element: FocusItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: FocusItem): Promise<FocusItem[]> {
    if (element) {
      return element.dirNode ? this.itemsFromDirNode(element.dirNode) : [];
    }
    return this.getRootItems();
  }

  /** Triggers a full tree refresh by firing the change event with no specific element. */
  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  private async getRootItems(): Promise<FocusItem[]> {
    try {
      this.cachedChanges = await this.gitService.getAllChanges();

      const branch = await this.gitService.getCurrentBranch();
      if (branch !== this.lastBranch) {
        this.lastBranch = branch;
        this._onBranchChange.fire(branch);
      }
    } catch {
      return [this.makeErrorItem('Failed to read git status')];
    }

    if (this.cachedChanges.length === 0) {
      return [this.makeMessageItem('No changes on this branch')];
    }

    return this.buildTree();
  }

  /** Builds a nested directory/file tree from `cachedChanges` and returns the top-level items. */
  buildTree(): FocusItem[] {
    const root = makeDirNode(this.gitService.workspaceRoot);
    const sorted = [...this.cachedChanges].sort((a, b) =>
      a.relativePath.localeCompare(b.relativePath)
    );
    for (const change of sorted) {
      insertIntoTree(root, change, this.gitService.workspaceRoot);
    }
    return this.itemsFromDirNode(root);
  }

  private itemsFromDirNode(node: DirNode): FocusItem[] {
    const items: FocusItem[] = [];

    // Directories first, sorted alphabetically
    const dirEntries = [...node.children.entries()].sort(([a], [b]) => a.localeCompare(b));
    for (const [seg, child] of dirEntries) {
      items.push(
        new FocusItem(
          null,
          seg,
          vscode.TreeItemCollapsibleState.Expanded,
          child
        )
      );
    }

    // Then files, already sorted from buildTree
    for (const change of node.files) {
      items.push(
        new FocusItem(
          change,
          labelForChange(change),
          vscode.TreeItemCollapsibleState.None,
          null
        )
      );
    }

    return items;
  }

  // Kept for tests
  buildFlatTree(): FocusItem[] {
    return [...this.cachedChanges]
      .sort((a, b) => a.relativePath.localeCompare(b.relativePath))
      .map(change => new FocusItem(change, labelForChange(change), vscode.TreeItemCollapsibleState.None, null));
  }

  private makeErrorItem(message: string): FocusItem {
    const item = new FocusItem(null, message, vscode.TreeItemCollapsibleState.None, null);
    item.iconPath = new vscode.ThemeIcon('error');
    item.tooltip = message;
    return item;
  }

  private makeMessageItem(message: string): FocusItem {
    const item = new FocusItem(null, message, vscode.TreeItemCollapsibleState.None, null);
    item.iconPath = new vscode.ThemeIcon('info');
    return item;
  }
}
