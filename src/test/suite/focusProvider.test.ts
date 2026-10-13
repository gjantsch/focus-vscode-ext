import * as assert from 'assert';
import { FocusProvider } from '../../focusProvider';
import { GitService } from '../../gitService';
import { FileChange } from '../../focusItem';

function makeGitService(changes: FileChange[]): GitService {
  const svc = Object.create(GitService.prototype) as GitService;
  (svc as unknown as Record<string, unknown>).getAllChanges = async () => changes;
  (svc as unknown as Record<string, unknown>).getCurrentBranch = async () => 'feature/test';
  (svc as unknown as Record<string, unknown>).invalidateCache = () => {};
  (svc as unknown as Record<string, unknown>).workspaceRoot = '/fake';
  return svc;
}

const BASE_CHANGES: FileChange[] = [
  { absolutePath: '/w/c.ts', relativePath: 'c.ts', status: 'A', category: 'staged' },
  { absolutePath: '/w/a.ts', relativePath: 'a.ts', status: 'M', category: 'committed' },
  { absolutePath: '/w/b.ts', relativePath: 'b.ts', status: 'M', category: 'unstaged' },
];

suite('FocusProvider — buildFlatTree', () => {
  test('sorts by relativePath ascending', async () => {
    const provider = new FocusProvider(makeGitService(BASE_CHANGES));
    await provider.getChildren(undefined);
    const items = provider.buildFlatTree();
    assert.strictEqual(items.length, 3);
    assert.strictEqual(items[0].label, 'a.ts');
    assert.strictEqual(items[1].label, 'b.ts');
    assert.strictEqual(items[2].label, 'c.ts');
  });

  test('returns empty array when no changes', async () => {
    const provider = new FocusProvider(makeGitService([]));
    await provider.getChildren(undefined);
    const items = provider.buildFlatTree();
    assert.strictEqual(items.length, 0);
  });

  test('each item has a FileChange attached', async () => {
    const provider = new FocusProvider(makeGitService(BASE_CHANGES));
    await provider.getChildren(undefined);
    const items = provider.buildFlatTree();
    items.forEach(item => {
      assert.notStrictEqual(item.change, null, `item '${item.label}' should have a change`);
    });
  });
});

suite('FocusProvider — buildTree', () => {
  test('files at root level appear directly', async () => {
    const provider = new FocusProvider(makeGitService(BASE_CHANGES));
    await provider.getChildren(undefined);
    const items = provider.buildTree();
    const labels = items.map(i => i.label as string);
    assert.ok(labels.includes('a.ts'));
    assert.ok(labels.includes('b.ts'));
    assert.ok(labels.includes('c.ts'));
  });

  test('nested files appear under directory node', async () => {
    const changes: FileChange[] = [
      { absolutePath: '/w/src/a.ts', relativePath: 'src/a.ts', status: 'M', category: 'staged' },
      { absolutePath: '/w/src/b.ts', relativePath: 'src/b.ts', status: 'A', category: 'staged' },
      { absolutePath: '/w/root.ts', relativePath: 'root.ts', status: 'M', category: 'unstaged' },
    ];
    const provider = new FocusProvider(makeGitService(changes));
    await provider.getChildren(undefined);
    const items = provider.buildTree();

    const dirItem = items.find(i => i.label === 'src');
    assert.ok(dirItem, 'src directory node should exist');
    assert.ok(dirItem!.dirNode, 'src node should have a dirNode');

    const rootFile = items.find(i => i.label === 'root.ts');
    assert.ok(rootFile, 'root.ts should appear at top level');
  });

  test('directories appear before files', async () => {
    const changes: FileChange[] = [
      { absolutePath: '/w/src/a.ts', relativePath: 'src/a.ts', status: 'M', category: 'staged' },
      { absolutePath: '/w/root.ts', relativePath: 'root.ts', status: 'M', category: 'unstaged' },
    ];
    const provider = new FocusProvider(makeGitService(changes));
    await provider.getChildren(undefined);
    const items = provider.buildTree();
    assert.strictEqual(items[0].label, 'src', 'directory should come first');
    assert.strictEqual(items[1].label, 'root.ts', 'file should come after');
  });

  test('returns empty array when no changes', async () => {
    const provider = new FocusProvider(makeGitService([]));
    await provider.getChildren(undefined);
    assert.strictEqual(provider.buildTree().length, 0);
  });
});
