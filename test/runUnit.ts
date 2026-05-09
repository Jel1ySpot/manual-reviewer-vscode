/* eslint-disable no-console */
import * as assert from 'assert';
import { render } from '../src/exporter';
import { Session, CommentEntry } from '../src/types';

const TEMPLATE = `# Modification Checklist — {{timestamp}}

Repository: {{repo_name}}{{git_info}}
Items: {{count}}

{{entries}}
`;

function snippetEntry(partial: Partial<CommentEntry> = {}): CommentEntry {
  return {
    id: partial.id ?? 'id-1',
    file: partial.file ?? 'src/foo.ts',
    language: partial.language ?? 'typescript',
    range:
      partial.range ?? {
        start: { line: 10, column: 1 },
        end: { line: 20, column: 12 },
      },
    snippet: partial.snippet ?? 'const x = 1;\nconst y = 2;',
    comment: partial.comment ?? 'rename x to count',
    createdAt: partial.createdAt ?? '2026-05-08T00:00:00Z',
    git: partial.git,
  };
}

function session(entries: CommentEntry[] = []): Session {
  return {
    schemaVersion: 1,
    workspaceRoot: '/tmp/repo',
    createdAt: '2026-05-08T00:00:00Z',
    entries,
  };
}

const tests: Array<[string, () => void | Promise<void>]> = [];
function test(name: string, fn: () => void | Promise<void>) {
  tests.push([name, fn]);
}

test('empty session: placeholder + no git parenthetical when git absent', () => {
  const out = render({ session: session([]), templateText: TEMPLATE });
  assert.match(out, /Items: 0/);
  assert.match(out, /_\(no entries\)_/);
  // No git: line ends right after repo name, no "(branch ...)" trailing.
  assert.match(out, /Repository: repo\n/);
  assert.ok(!out.includes('Repository: repo ('), 'expected no git parenthetical');
});

test('snippet entry: header + fence + comment, no trailing ---', () => {
  const e = snippetEntry({
    file: 'src/a.ts',
    language: 'typescript',
    range: { start: { line: 1, column: 1 }, end: { line: 3, column: 8 } },
  });
  const out = render({ session: session([e]), templateText: TEMPLATE });
  assert.match(out, /## \[1\] src\/a\.ts<1:1-3:8>/);
  assert.match(out, /```typescript/);
  assert.match(out, /const x = 1;/);
  assert.ok(out.endsWith('rename x to count\n'), `expected single trailing newline, got:\n${out}`);
});

test('multiple entries separated by blank+---+blank', () => {
  const a = snippetEntry({ id: 'a', file: 'a.ts' });
  const b = snippetEntry({ id: 'b', file: 'b.ts' });
  const out = render({ session: session([a, b]), templateText: TEMPLATE });
  assert.ok(out.includes('rename x to count\n\n---\n\n## [2] b.ts<'), `got:\n${out}`);
  assert.ok(out.endsWith('rename x to count\n'), 'no trailing --- after last entry');
});

test('git provided: renders inline parenthetical with sha truncated to 7', () => {
  const out = render({
    session: session([snippetEntry()]),
    templateText: TEMPLATE,
    repoName: 'my-repo',
    git: { sha: 'a1b2c3d4e5f6g7', branch: 'main', dirty: true },
  });
  assert.match(out, /Repository: my-repo \(branch `main`, sha `a1b2c3d`, dirty\)/);
});

test('clean tree marked correctly', () => {
  const out = render({
    session: session([snippetEntry()]),
    templateText: TEMPLATE,
    git: { sha: 'aaa', branch: 'b', dirty: false },
  });
  assert.match(out, /sha `aaa`, clean/);
});

test('empty language → bare fence', () => {
  const e = snippetEntry({ language: '' });
  const out = render({ session: session([e]), templateText: TEMPLATE });
  assert.match(out, /\n```\n/);
});

test('first line indented to match start column', () => {
  const e = snippetEntry({
    range: { start: { line: 17, column: 21 }, end: { line: 18, column: 5 } },
    snippet: 'ttps://example\nchecksum = "x"',
  });
  const out = render({ session: session([e]), templateText: TEMPLATE });
  assert.ok(
    out.includes('                    ttps://example\nchecksum = "x"'),
    `expected first-line indent, got:\n${out}`,
  );
});

test('single-line snippet skips indent even with offset start column', () => {
  const e = snippetEntry({
    snippet: 'println!("hi")',
    range: { start: { line: 5, column: 9 }, end: { line: 5, column: 23 } },
  });
  const out = render({ session: session([e]), templateText: TEMPLATE });
  assert.ok(
    out.includes('\n```typescript\nprintln!("hi")\n```'),
    `single-line snippet should not get leading indent, got:\n${out}`,
  );
});

test('start column 1 → no indent', () => {
  const e = snippetEntry({
    range: { start: { line: 1, column: 1 }, end: { line: 2, column: 5 } },
  });
  const out = render({ session: session([e]), templateText: TEMPLATE });
  assert.match(out, /\n```typescript\nconst x = 1;\n/);
});

test('long snippet truncated with elision marker', () => {
  const lines: string[] = [];
  for (let i = 1; i <= 60; i++) {
    lines.push(`line ${i}`);
  }
  const e = snippetEntry({
    snippet: lines.join('\n'),
    range: { start: { line: 1, column: 1 }, end: { line: 60, column: 8 } },
  });
  const out = render({ session: session([e]), templateText: TEMPLATE });
  assert.ok(out.includes('line 30\n'), 'head must be present');
  assert.ok(!out.includes('line 31\n'), 'elided portion must be gone');
  assert.ok(out.includes('[... 30 more lines elided ...]'), 'expected elision marker');
});

test('file entry: ## [N] file (no range, no fence)', () => {
  const e: CommentEntry = {
    id: 'x',
    file: 'README.md',
    comment: 'don\'t add hard-wrap line breaks',
    createdAt: '2026-05-08T00:00:00Z',
  };
  const out = render({ session: session([e]), templateText: TEMPLATE });
  assert.ok(out.includes('## [1] README.md\n\ndon\'t'), `got:\n${out}`);
  assert.ok(!out.includes('```'), 'should not include code fence');
});

test('project entry: ## [N] alone (no file, no fence)', () => {
  const e: CommentEntry = {
    id: 'p',
    comment: 'add cmd-shift-K behaviour for project-level edits',
    createdAt: '2026-05-08T00:00:00Z',
  };
  const out = render({ session: session([e]), templateText: TEMPLATE });
  assert.ok(out.includes('## [1]\n\nadd'), `got:\n${out}`);
  assert.ok(!out.includes('```'), 'should not include code fence');
});

(async () => {
  let failed = 0;
  for (const [name, fn] of tests) {
    try {
      await fn();
      console.log(`  ok  ${name}`);
    } catch (e) {
      failed++;
      console.error(`  FAIL ${name}`);
      console.error(e);
    }
  }
  console.log(`\n${tests.length - failed}/${tests.length} tests passed`);
  process.exit(failed === 0 ? 0 : 1);
})();
