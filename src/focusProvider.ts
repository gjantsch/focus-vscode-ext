import * as vscode from 'vscode';
import { GitService } from './gitService';
import { FileChange, FocusItem, DirNodeRef, labelForChange } from './focusItem';

type ChangeEvent = FocusItem | undefined | null;

type DirNode = DirNodeRef;

function makeDirNode(): DirNode {
  return { children: new Map(), files: [] };
}

function insertIntoTree(root: DirNode, change: FileChange): void {
  const parts = change.relativePath.split('/');
  let node = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const seg = parts[i];
    if (!node.children.has(seg)) {
      node.children.set(seg, makeDirNode());
    }
    node = node.children.get(seg)!;
  }
  node.files.push(change);
}

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

  buildTree(): FocusItem[] {
    const root = makeDirNode();
    const sorted = [...this.cachedChanges].sort((a, b) =>
      a.relativePath.localeCompare(b.relativePath)
    );
    for (const change of sorted) {
      insertIntoTree(root, change);
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
