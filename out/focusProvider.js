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
exports.FocusProvider = void 0;
const vscode = __importStar(require("vscode"));
const focusItem_1 = require("./focusItem");
function makeDirNode() {
    return { children: new Map(), files: [] };
}
function insertIntoTree(root, change) {
    const parts = change.relativePath.split('/');
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
        const seg = parts[i];
        if (!node.children.has(seg)) {
            node.children.set(seg, makeDirNode());
        }
        node = node.children.get(seg);
    }
    node.files.push(change);
}
class FocusProvider {
    constructor(gitService) {
        this.gitService = gitService;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.cachedChanges = [];
        this.lastBranch = '';
        this._onBranchChange = new vscode.EventEmitter();
        this.onBranchChange = this._onBranchChange.event;
    }
    getTreeItem(element) {
        return element;
    }
    async getChildren(element) {
        if (element) {
            return element.dirNode ? this.itemsFromDirNode(element.dirNode) : [];
        }
        return this.getRootItems();
    }
    refresh() {
        this._onDidChangeTreeData.fire(undefined);
    }
    async getRootItems() {
        try {
            this.cachedChanges = await this.gitService.getAllChanges();
            const branch = await this.gitService.getCurrentBranch();
            if (branch !== this.lastBranch) {
                this.lastBranch = branch;
                this._onBranchChange.fire(branch);
            }
        }
        catch {
            return [this.makeErrorItem('Failed to read git status')];
        }
        if (this.cachedChanges.length === 0) {
            return [this.makeMessageItem('No changes on this branch')];
        }
        return this.buildTree();
    }
    buildTree() {
        const root = makeDirNode();
        const sorted = [...this.cachedChanges].sort((a, b) => a.relativePath.localeCompare(b.relativePath));
        for (const change of sorted) {
            insertIntoTree(root, change);
        }
        return this.itemsFromDirNode(root);
    }
    itemsFromDirNode(node) {
        const items = [];
        // Directories first, sorted alphabetically
        const dirEntries = [...node.children.entries()].sort(([a], [b]) => a.localeCompare(b));
        for (const [seg, child] of dirEntries) {
            items.push(new focusItem_1.FocusItem(null, seg, vscode.TreeItemCollapsibleState.Expanded, child));
        }
        // Then files, already sorted from buildTree
        for (const change of node.files) {
            items.push(new focusItem_1.FocusItem(change, (0, focusItem_1.labelForChange)(change), vscode.TreeItemCollapsibleState.None, null));
        }
        return items;
    }
    // Kept for tests
    buildFlatTree() {
        return [...this.cachedChanges]
            .sort((a, b) => a.relativePath.localeCompare(b.relativePath))
            .map(change => new focusItem_1.FocusItem(change, (0, focusItem_1.labelForChange)(change), vscode.TreeItemCollapsibleState.None, null));
    }
    makeErrorItem(message) {
        const item = new focusItem_1.FocusItem(null, message, vscode.TreeItemCollapsibleState.None, null);
        item.iconPath = new vscode.ThemeIcon('error');
        item.tooltip = message;
        return item;
    }
    makeMessageItem(message) {
        const item = new focusItem_1.FocusItem(null, message, vscode.TreeItemCollapsibleState.None, null);
        item.iconPath = new vscode.ThemeIcon('info');
        return item;
    }
}
exports.FocusProvider = FocusProvider;
//# sourceMappingURL=focusProvider.js.map