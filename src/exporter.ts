import * as path from 'path';
import { CommentEntry, GitInfo, Session, formatRange, entryKind } from './types';

interface RenderContext {
  session: Session;
  templateText: string;
  repoName?: string;
  git?: GitInfo;
}

/** Snippet truncation thresholds — kept aligned with the Rust `render` module. */
const MAX_SNIPPET_LINES = 40;
const SNIPPET_HEAD_LINES = 30;

export function render(ctx: RenderContext): string {
  const { session, templateText, repoName, git } = ctx;
  const entriesBlock =
    session.entries.length === 0
      ? '_(no entries)_'
      : session.entries.map((e, i) => renderEntry(e, i + 1)).join('\n\n---\n\n');

  return templateText
    .replace(/\{\{timestamp\}\}/g, new Date().toISOString())
    .replace(/\{\{repo_name\}\}/g, repoName ?? path.basename(session.workspaceRoot))
    .replace(/\{\{git_info\}\}/g, formatGit(git))
    .replace(/\{\{count\}\}/g, String(session.entries.length))
    .replace(/\{\{entries\}\}/g, entriesBlock);
}

function formatGit(git?: GitInfo): string {
  if (!git) {
    return '';
  }
  const parts: string[] = [];
  if (git.branch) {
    parts.push(`branch \`${git.branch}\``);
  }
  if (git.sha) {
    parts.push(`sha \`${git.sha.slice(0, 7)}\``);
  }
  parts.push(git.dirty ? 'dirty' : 'clean');
  return ` (${parts.join(', ')})`;
}

function renderEntry(entry: CommentEntry, index: number): string {
  switch (entryKind(entry)) {
    case 'snippet':
      return renderSnippetEntry(entry, index);
    case 'file':
      return renderFileEntry(entry, index);
    case 'project':
      return renderProjectEntry(entry, index);
  }
}

function renderSnippetEntry(entry: CommentEntry, index: number): string {
  const file = entry.file ?? '';
  const range = entry.range!;
  const lang = entry.language ?? '';
  const truncated = truncateSnippet(entry.snippet ?? '');
  const indented = indentFirstLine(truncated, range.start.column);
  return [
    `## [${index}] ${file}<${formatRange(range)}>`,
    '',
    '```' + lang,
    indented,
    '```',
    '',
    entry.comment,
  ].join('\n');
}

function renderFileEntry(entry: CommentEntry, index: number): string {
  return [`## [${index}] ${entry.file ?? ''}`, '', entry.comment].join('\n');
}

function renderProjectEntry(entry: CommentEntry, index: number): string {
  return [`## [${index}]`, '', entry.comment].join('\n');
}

function truncateSnippet(snippet: string): string {
  const lines = snippet.split('\n');
  if (lines.length <= MAX_SNIPPET_LINES) {
    return snippet;
  }
  const elided = lines.length - SNIPPET_HEAD_LINES;
  return lines.slice(0, SNIPPET_HEAD_LINES).join('\n') + `\n[... ${elided} more lines elided ...]`;
}

function indentFirstLine(snippet: string, startColumn: number): string {
  const pad = Math.max(0, startColumn - 1);
  if (pad === 0) {
    return snippet;
  }
  const nl = snippet.indexOf('\n');
  // Single-line snippet: skip indent — alignment only matters when there are
  // subsequent lines anchored at column 1.
  if (nl === -1) {
    return snippet;
  }
  const indent = ' '.repeat(pad);
  return indent + snippet.slice(0, nl) + snippet.slice(nl);
}
