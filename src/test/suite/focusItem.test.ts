import * as assert from 'assert';
import { iconForStatus } from '../../focusItem';
import type { GitStatus } from '../../focusItem';

// These tests verify the mapping without needing the full vscode module.
// The vscode mock is loaded via MODULE_PATH_MAPPER in mocha opts.

suite('focusItem — iconForStatus', () => {
  const cases: Array<[GitStatus, string]> = [
    ['M', 'git-commit'],
    ['A', 'diff-added'],
    ['D', 'diff-removed'],
    ['R', 'diff-renamed'],
    ['?', 'question'],
    ['C', 'copy'],
    ['U', 'warning'],
  ];

  for (const [status, expectedId] of cases) {
    test(`status '${status}' maps to icon '${expectedId}'`, () => {
      const icon = iconForStatus(status);
      assert.strictEqual((icon as { id: string }).id, expectedId);
    });
  }
});
