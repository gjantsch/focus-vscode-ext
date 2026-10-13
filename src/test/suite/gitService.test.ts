import * as assert from 'assert';
import * as path from 'path';

// Register the vscode mock BEFORE importing anything that imports vscode
// ts-node resolves these via tsconfig-paths or Module._resolveFilename hooks.
// For pure unit tests we use the mock registered in package.json mocha config.
import { GitService } from '../../gitService';

const ROOT = '/fake/workspace';

suite('GitService — parseStatusLine', () => {
  const svc = new GitService(ROOT);
  // Access private method via cast
  const parse = (line: string, cat: Parameters<typeof svc.parseStatusLine>[1]) =>
    (svc as unknown as { parseStatusLine: typeof svc.parseStatusLine }).parseStatusLine(line, cat);

  test('returns null for empty line', () => {
    assert.strictEqual(parse('', 'committed'), null);
  });

  test('parses modified file', () => {
    const result = parse('M\tsrc/foo.ts', 'committed');
    assert.strictEqual(result?.status, 'M');
    assert.strictEqual(result?.relativePath, 'src/foo.ts');
    assert.strictEqual(result?.category, 'committed');
    assert.strictEqual(result?.absolutePath, path.join(ROOT, 'src/foo.ts'));
  });

  test('parses added file', () => {
    const result = parse('A\tsrc/new.ts', 'staged');
    assert.strictEqual(result?.status, 'A');
    assert.strictEqual(result?.relativePath, 'src/new.ts');
  });

  test('parses deleted file', () => {
    const result = parse('D\tsrc/gone.ts', 'committed');
    assert.strictEqual(result?.status, 'D');
    assert.strictEqual(result?.relativePath, 'src/gone.ts');
  });

  test('parses renamed file with tab separator', () => {
    const result = parse('R100\told/path.ts\tnew/path.ts', 'committed');
    assert.strictEqual(result?.status, 'R');
    assert.strictEqual(result?.relativePath, 'new/path.ts');
    assert.strictEqual(result?.originalPath, 'old/path.ts');
  });

  test('parses copied file with tab separator', () => {
    const result = parse('C50\torig.ts\tcopy.ts', 'committed');
    assert.strictEqual(result?.status, 'C');
    assert.strictEqual(result?.relativePath, 'copy.ts');
    assert.strictEqual(result?.originalPath, 'orig.ts');
  });

  test('parses untracked file', () => {
    const result = parse('?\tnew-file.ts', 'untracked');
    assert.strictEqual(result?.status, '?');
    assert.strictEqual(result?.relativePath, 'new-file.ts');
  });

  test('parses conflict/unmerged file', () => {
    const result = parse('U\tconflict.ts', 'unstaged');
    assert.strictEqual(result?.status, 'U');
    assert.strictEqual(result?.relativePath, 'conflict.ts');
  });
});

suite('GitService — deduplicateChanges', () => {
  const svc = new GitService(ROOT);

  test('keeps single change unchanged', () => {
    const changes = [
      { absolutePath: '/a', relativePath: 'a.ts', status: 'M' as const, category: 'committed' as const },
    ];
    const result = svc.deduplicateChanges(changes);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].category, 'committed');
  });

  test('untracked wins over committed', () => {
    const changes = [
      { absolutePath: '/a', relativePath: 'a.ts', status: 'M' as const, category: 'committed' as const },
      { absolutePath: '/a', relativePath: 'a.ts', status: '?' as const, category: 'untracked' as const },
    ];
    const result = svc.deduplicateChanges(changes);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].category, 'untracked');
  });

  test('staged wins over unstaged', () => {
    const changes = [
      { absolutePath: '/a', relativePath: 'a.ts', status: 'M' as const, category: 'unstaged' as const },
      { absolutePath: '/a', relativePath: 'a.ts', status: 'M' as const, category: 'staged' as const },
    ];
    const result = svc.deduplicateChanges(changes);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].category, 'staged');
  });

  test('staged wins over committed', () => {
    const changes = [
      { absolutePath: '/a', relativePath: 'a.ts', status: 'M' as const, category: 'committed' as const },
      { absolutePath: '/a', relativePath: 'a.ts', status: 'M' as const, category: 'staged' as const },
    ];
    const result = svc.deduplicateChanges(changes);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].category, 'staged');
  });

  test('different files are all kept', () => {
    const changes = [
      { absolutePath: '/a', relativePath: 'a.ts', status: 'M' as const, category: 'staged' as const },
      { absolutePath: '/b', relativePath: 'b.ts', status: 'A' as const, category: 'staged' as const },
      { absolutePath: '/c', relativePath: 'c.ts', status: 'D' as const, category: 'committed' as const },
    ];
    const result = svc.deduplicateChanges(changes);
    assert.strictEqual(result.length, 3);
  });

  test('priority order: untracked > staged > unstaged > committed', () => {
    const base = { absolutePath: '/x', relativePath: 'x.ts', status: 'M' as const };
    const changes = [
      { ...base, category: 'committed' as const },
      { ...base, category: 'unstaged' as const },
      { ...base, category: 'staged' as const },
      { ...base, category: 'untracked' as const },
    ];
    const result = svc.deduplicateChanges(changes);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].category, 'untracked');
  });
});
