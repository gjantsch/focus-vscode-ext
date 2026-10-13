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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const gitService_1 = require("./gitService");
const focusProvider_1 = require("./focusProvider");
function debounce(fn, ms) {
    let timer;
    return () => {
        clearTimeout(timer);
        timer = setTimeout(fn, ms);
    };
}
async function activate(context) {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) {
        return;
    }
    const gitService = new gitService_1.GitService(root);
    const isRepo = await gitService.isGitRepository();
    if (!isRepo) {
        vscode.window.showInformationMessage('Focus: No git repository found in the current workspace.');
        return;
    }
    const provider = new focusProvider_1.FocusProvider(gitService);
    const treeView = vscode.window.createTreeView('focusView', {
        treeDataProvider: provider,
        showCollapseAll: true,
        canSelectMany: false,
    });
    // Update tree view title to show current branch
    provider.onBranchChange(branch => {
        treeView.title = `Focus — ${branch}`;
    }, null, context.subscriptions);
    // --- Commands ---
    context.subscriptions.push(vscode.commands.registerCommand('focus.openFile', async (uri, status) => {
        if (status === 'D') {
            // Deleted files can't be opened directly — show the git diff view
            await vscode.commands.executeCommand('git.openChange', uri).then(undefined, () => vscode.window.showWarningMessage(`File was deleted: ${uri.fsPath}`));
            return;
        }
        await vscode.window.showTextDocument(uri, { preview: true, preserveFocus: false });
    }));
    context.subscriptions.push(vscode.commands.registerCommand('focus.refresh', () => {
        gitService.invalidateCache();
        provider.refresh();
    }));
    context.subscriptions.push(vscode.commands.registerCommand('focus.setBaseBranch', async () => {
        const current = await gitService.getBaseBranch();
        const input = await vscode.window.showInputBox({
            prompt: 'Enter the base branch to compare against',
            value: current,
            placeHolder: 'e.g. main, master, develop',
        });
        if (input !== undefined) {
            await vscode.workspace
                .getConfiguration('focus')
                .update('baseBranch', input, vscode.ConfigurationTarget.Workspace);
            gitService.invalidateCache();
            provider.refresh();
        }
    }));
    // --- File system watchers for auto-refresh ---
    // .git/HEAD — branch switches, new commits
    const headWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(root, '.git/HEAD'));
    headWatcher.onDidChange(() => {
        gitService.invalidateCache();
        provider.refresh();
    });
    context.subscriptions.push(headWatcher);
    // .git/index — staging changes
    const indexWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(root, '.git/index'));
    indexWatcher.onDidChange(() => provider.refresh());
    context.subscriptions.push(indexWatcher);
    // workspace files — unstaged edits (exclude .git/** to avoid double-firing with head/index watchers)
    const debouncedRefresh = debounce(() => provider.refresh(), 1000);
    const workspaceWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(root, '{*,*/**}'), false, false, false);
    workspaceWatcher.onDidChange(uri => {
        if (!uri.fsPath.includes(`${root}/.git/`))
            debouncedRefresh();
    });
    workspaceWatcher.onDidCreate(uri => {
        if (!uri.fsPath.includes(`${root}/.git/`))
            debouncedRefresh();
    });
    workspaceWatcher.onDidDelete(uri => {
        if (!uri.fsPath.includes(`${root}/.git/`))
            debouncedRefresh();
    });
    context.subscriptions.push(workspaceWatcher);
    // Optional: hook into the built-in git extension for cleaner state events
    const gitExt = vscode.extensions.getExtension('vscode.git');
    if (gitExt) {
        const gitApi = gitExt.exports?.getAPI(1);
        if (gitApi) {
            gitApi.repositories.forEach((repo) => {
                repo.state.onDidChange(() => provider.refresh());
            });
        }
    }
    // Settings changes
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('focus')) {
            gitService.invalidateCache();
            provider.refresh();
        }
    }));
    context.subscriptions.push(treeView);
}
function deactivate() {
    // Subscriptions auto-dispose via context.subscriptions
}
//# sourceMappingURL=extension.js.map