import * as vscode from 'vscode';
import { CommentEntry, entryKind, formatRange } from './types';
import { Store } from './store';

export class EntryTreeProvider implements vscode.TreeDataProvider<CommentEntry> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly store: Store) {
    store.onDidChange(() => this._onDidChangeTreeData.fire());
  }

  getTreeItem(entry: CommentEntry): vscode.TreeItem {
    const idx = this.store.all.indexOf(entry);
    const kind = entryKind(entry);
    const label = formatLabel(entry, kind, idx + 1);
    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
    item.id = entry.id;
    item.description = truncate(entry.comment, 60);
    item.tooltip = buildTooltip(entry, kind);
    item.contextValue = `commentEntry.${kind}`;
    item.iconPath = new vscode.ThemeIcon(iconFor(kind));
    item.command = {
      command: 'mreview.jumpToEntry',
      title: 'Jump',
      arguments: [entry.id],
    };
    return item;
  }

  getChildren(): CommentEntry[] {
    return this.store.all;
  }
}

function formatLabel(entry: CommentEntry, kind: ReturnType<typeof entryKind>, num: number): string {
  switch (kind) {
    case 'snippet':
      return `[#${num}] ${entry.file}:${formatRange(entry.range!)}`;
    case 'file':
      return `[#${num}] ${entry.file} (whole file)`;
    case 'project':
      return `[#${num}] (project-level)`;
  }
}

function buildTooltip(entry: CommentEntry, kind: ReturnType<typeof entryKind>): vscode.MarkdownString {
  const md = new vscode.MarkdownString();
  if (kind === 'snippet') {
    md.appendMarkdown(`**${entry.file}:${formatRange(entry.range!)}**\n\n`);
    md.appendMarkdown(entry.comment + '\n\n');
    md.appendCodeblock(entry.snippet ?? '', entry.language ?? '');
  } else if (kind === 'file') {
    md.appendMarkdown(`**${entry.file}** (whole file)\n\n`);
    md.appendMarkdown(entry.comment);
  } else {
    md.appendMarkdown(`**Project-level note**\n\n`);
    md.appendMarkdown(entry.comment);
  }
  return md;
}

function iconFor(kind: ReturnType<typeof entryKind>): string {
  switch (kind) {
    case 'snippet':
      return 'comment';
    case 'file':
      return 'file';
    case 'project':
      return 'folder';
  }
}

function truncate(s: string, n: number): string {
  const flat = s.replace(/\s+/g, ' ').trim();
  return flat.length <= n ? flat : flat.slice(0, n - 1) + '…';
}

export async function jumpToEntry(
  store: Store,
  workspaceRoot: vscode.Uri,
  entryId: string,
): Promise<void> {
  const entry = store.getById(entryId);
  if (!entry || !entry.file) {
    // Project-level entry — nothing to jump to.
    return;
  }
  const fileUri = vscode.Uri.joinPath(workspaceRoot, ...entry.file.split('/'));
  const doc = await vscode.workspace.openTextDocument(fileUri);
  const editor = await vscode.window.showTextDocument(doc, { preview: false });

  if (!entry.range) {
    // File-level entry — open at top of file, no highlight range.
    editor.selection = new vscode.Selection(0, 0, 0, 0);
    editor.revealRange(
      new vscode.Range(0, 0, 0, 0),
      vscode.TextEditorRevealType.AtTop,
    );
    return;
  }

  const startLine = clamp(entry.range.start.line - 1, 0, doc.lineCount - 1);
  const startCol = Math.max(0, entry.range.start.column - 1);
  const endLine = clamp(entry.range.end.line - 1, startLine, doc.lineCount - 1);
  const endCol = Math.max(0, entry.range.end.column - 1);
  const range = new vscode.Range(
    new vscode.Position(startLine, startCol),
    new vscode.Position(endLine, endCol),
  );

  // Collapsed cursor at range start — do NOT select, otherwise the
  // selectionWatcher would treat this as a new user selection and re-pop
  // the comment input.
  editor.selection = new vscode.Selection(range.start, range.start);
  editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  flashHighlight(editor, range);
}

interface FlashState {
  decoration: vscode.TextEditorDecorationType;
  timer: NodeJS.Timeout;
}
const activeFlash = new WeakMap<vscode.TextEditor, FlashState>();

function flashHighlight(editor: vscode.TextEditor, range: vscode.Range): void {
  const prev = activeFlash.get(editor);
  if (prev) {
    clearTimeout(prev.timer);
    prev.decoration.dispose();
    activeFlash.delete(editor);
  }
  const decoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
    isWholeLine: true,
  });
  editor.setDecorations(decoration, [range]);
  const timer = setTimeout(() => {
    decoration.dispose();
    if (activeFlash.get(editor)?.decoration === decoration) {
      activeFlash.delete(editor);
    }
  }, 1500);
  activeFlash.set(editor, { decoration, timer });
}

function clamp(n: number, lo: number, hi: number): number {
  if (hi < lo) {
    return lo;
  }
  return Math.min(Math.max(n, lo), hi);
}
