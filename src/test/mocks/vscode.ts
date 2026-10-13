// Minimal vscode mock for unit tests that run outside the extension host.
// Stubs out what src/focusItem.ts, src/gitService.ts, and src/focusProvider.ts use.

type Listener<T> = (value: T) => void;

export class EventEmitter<T = void> {
  private listeners: Listener<T>[] = [];
  readonly event = (listener: Listener<T>) => {
    this.listeners.push(listener);
    return { dispose: () => { this.listeners = this.listeners.filter(l => l !== listener); } };
  };
  fire(value: T): void {
    this.listeners.forEach(l => l(value));
  }
  dispose(): void {
    this.listeners = [];
  }
}

export const Uri = {
  file: (p: string) => ({ fsPath: p, scheme: 'file', path: p }),
};

export class ThemeIcon {
  constructor(public readonly id: string) {}
}

export const TreeItemCollapsibleState = {
  None: 0,
  Collapsed: 1,
  Expanded: 2,
};

export class TreeItem {
  label: string;
  collapsibleState: number;
  resourceUri?: ReturnType<typeof Uri.file>;
  command?: object;
  iconPath?: ThemeIcon;
  description?: string;
  tooltip?: string;
  contextValue?: string;

  constructor(label: string, collapsibleState: number = 0) {
    this.label = label;
    this.collapsibleState = collapsibleState;
  }
}

export const workspace = {
  getConfiguration: () => ({
    get: (_key: string, defaultVal: unknown) => defaultVal,
  }),
};
