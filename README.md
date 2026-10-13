# Focus Visual Studio Code Extension

I wasn't satisfied with the Source Control and Merge Request extension when discovering the files I'was working on. I wanted something very simple: to know wich files, in relation to main/master, I had touched during my work.

So, this is a VS Code extension that cuts through the noise of large codebases by showing only the files you are currently working on. Instead of navigating the full file tree, a dedicated panel in the Activity Bar lists every file that is different on your current git branch compared to the base branch, including unstaged edits, staged changes, commits not yet merged, and new untracked files.

---

## Features

- Activity Bar icon that opens a "Working Files" panel
- Shows all files changed on the current branch vs the base branch (main, master, or a custom branch you set)
- Covers all change states: committed, staged, unstaged, and untracked
- Click any file to open it in the editor
- Auto-refreshes when you save, stage, commit, or switch branches
- Optional grouping by status category (staged, unstaged, committed, untracked)
- Toolbar button to manually set the base branch

---

## Requirements

- VS Code 1.80 or later
- Node.js 18 or later
- Git installed and available on your PATH

---

## Build from source

Clone the repository and install dependencies:

```
git clone https://github.com/gjantsch/vscode-ext-focus.git
cd vscode-ext-focus
npm install
```

Compile the TypeScript:

```
npm run compile
```

---

## Run in development

Open the project folder in VS Code, then press F5. This launches an Extension Development Host window with the extension loaded. By default it opens the extension folder itself as the workspace, which is a git repo, so you should see the Focus icon in the Activity Bar right away.

To test against a different project, edit `.vscode/launch.json` and add the path to your repo as an extra argument:

```json
"args": [
  "--extensionDevelopmentPath=${workspaceFolder}",
  "/path/to/your/repo"
]
```

Then press F5 again.

---

## Install as a local extension

Run the install script. It bumps the patch version in `package.json`, recompiles, uninstalls the previous build, packages a fresh `.vsix`, and installs it:

```
./install.sh
```

Or equivalently:

```
npm run install-ext
```

When it finishes, reload VS Code with Cmd+Shift+P then "Developer: Reload Window". The Focus icon will appear in the Activity Bar in any workspace that contains a `.git` folder.

The script increments the patch version automatically on each run (e.g. 0.0.1 to 0.0.2). This prevents VS Code from treating a reinstall as a no-op. The version in `package.json` is the source of truth -- no separate lock file is needed.

To uninstall, open the Extensions panel, find "Focus", and click Uninstall.

---

## Run the tests

Unit tests cover the git output parser, deduplication logic, tree building, and icon mapping. They run without VS Code:

```
npm run test:unit
```

---

## Settings

| Setting | Default | Description |
|---|---|---|
| `focus.baseBranch` | (auto) | Branch to compare against. Leave empty to auto-detect from remote HEAD, falling back to main then master. |
| `focus.showUntracked` | true | Include untracked files in the panel. |
| `focus.groupByStatus` | false | Group files by category instead of showing a flat sorted list. |

You can also set the base branch from inside VS Code using the branch icon in the Focus panel toolbar.
