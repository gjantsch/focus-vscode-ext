import * as vscode from 'vscode';
import { GitService } from './gitService';
import { FocusProvider } from './focusProvider';
import { GitStatus } from './focusItem';

function debounce(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout>;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) {
    return;
  }

  const gitService = new GitService(root);

  const isRepo = await gitService.isGitRepository();
  if (!isRepo) {
    vscode.window.showInformationMessage('Focus: No git repository found in the current workspace.');
    return;
  }

  const provider = new FocusProvider(gitService);

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

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'focus.openFile',
      async (uri: vscode.Uri, status: GitStatus) => {
        if (status === 'D') {
          // Deleted files can't be opened directly — show the git diff view
          await vscode.commands.executeCommand('git.openChange', uri).then(
            undefined,
            () => vscode.window.showWarningMessage(`File was deleted: ${uri.fsPath}`)
          );
          return;
        }
        await vscode.window.showTextDocument(uri, { preview: true, preserveFocus: false });
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('focus.refresh', () => {
      gitService.invalidateCache();
      provider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('focus.setBaseBranch', async () => {
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
    })
  );

  // --- File system watchers for auto-refresh ---

  // .git/HEAD — branch switches, new commits
  const headWatcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(root, '.git/HEAD')
  );
  headWatcher.onDidChange(() => {
    gitService.invalidateCache();
    provider.refresh();
  });
  context.subscriptions.push(headWatcher);

  // .git/index — staging changes
  const indexWatcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(root, '.git/index')
  );
  indexWatcher.onDidChange(() => provider.refresh());
  context.subscriptions.push(indexWatcher);

  // workspace files — unstaged edits (exclude .git/** to avoid double-firing with head/index watchers)
  const debouncedRefresh = debounce(() => provider.refresh(), 1000);
  const workspaceWatcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(root, '{*,*/**}'),
    false, false, false
  );
  workspaceWatcher.onDidChange(uri => {
    if (!uri.fsPath.includes(`${root}/.git/`)) debouncedRefresh();
  });
  workspaceWatcher.onDidCreate(uri => {
    if (!uri.fsPath.includes(`${root}/.git/`)) debouncedRefresh();
  });
  workspaceWatcher.onDidDelete(uri => {
    if (!uri.fsPath.includes(`${root}/.git/`)) debouncedRefresh();
  });
  context.subscriptions.push(workspaceWatcher);

  // Optional: hook into the built-in git extension for cleaner state events
  const gitExt = vscode.extensions.getExtension('vscode.git');
  if (gitExt) {
    const gitApi = gitExt.exports?.getAPI(1);
    if (gitApi) {
      gitApi.repositories.forEach((repo: { state: { onDidChange: (fn: () => void) => void } }) => {
        repo.state.onDidChange(() => provider.refresh());
      });
    }
  }

  // Settings changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('focus')) {
        gitService.invalidateCache();
        provider.refresh();
      }
    })
  );

  context.subscriptions.push(treeView);
}

export function deactivate(): void {
  // Subscriptions auto-dispose via context.subscriptions
}
