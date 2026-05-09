import * as vscode from 'vscode';
import { randomUUID } from 'crypto';
import { CommentEntry } from './types';
import { Store, captureGitInfo } from './store';

interface PromptOpts {
  initial?: string;
  title?: string;
}

export interface PromptResult {
  value: string;
  cancelled: boolean;
}

const MULTILINE_BUTTON: vscode.QuickInputButton = {
  iconPath: new vscode.ThemeIcon('go-to-file'),
  tooltip: 'Edit in editor (multi-line)',
};

export async function promptCommentInline(
  fileLabel: string,
  charsCount: number,
  language: string,
  opts: PromptOpts = {},
): Promise<PromptResult> {
  return new Promise<PromptResult>(resolve => {
    const input = vscode.window.createInputBox();
    input.title = opts.title ?? 'Add Comment';
    input.placeholder = '输入对该选区的评论 (Esc 取消，点右上 ⇉ 切换多行编辑器)';
    input.prompt = `${fileLabel} · ${charsCount} chars${language ? ' · ' + language : ''}`;
    input.value = opts.initial ?? '';
    input.ignoreFocusOut = true;
    input.buttons = [MULTILINE_BUTTON];

    let resolved = false;
    const finish = (r: PromptResult) => {
      if (resolved) {
        return;
      }
      resolved = true;
      input.dispose();
      resolve(r);
    };

    input.onDidAccept(() => finish({ value: input.value, cancelled: false }));
    input.onDidHide(() => finish({ value: '', cancelled: true }));
    input.onDidTriggerButton(async btn => {
      if (btn === MULTILINE_BUTTON) {
        const current = input.value;
        input.dispose();
        const multi = await promptCommentMultiline(fileLabel, current);
        finish(multi);
      }
    });
    input.show();
  });
}

async function promptCommentMultiline(fileLabel: string, initial: string): Promise<PromptResult> {
  const header =
    `<!-- Comment for ${fileLabel}\n` +
    '     Save and close this tab to commit. Close without saving to cancel. -->\n\n';
  const doc = await vscode.workspace.openTextDocument({
    language: 'markdown',
    content: header + initial,
  });
  const editor = await vscode.window.showTextDocument(doc, { preview: false });

  return new Promise<PromptResult>(resolve => {
    let saved = false;
    let resolved = false;
    const disposables: vscode.Disposable[] = [];

    const finish = (r: PromptResult) => {
      if (resolved) {
        return;
      }
      resolved = true;
      disposables.forEach(d => d.dispose());
      resolve(r);
    };

    disposables.push(
      vscode.workspace.onDidSaveTextDocument(d => {
        if (d.uri.toString() === doc.uri.toString()) {
          saved = true;
        }
      }),
    );

    disposables.push(
      vscode.workspace.onDidCloseTextDocument(d => {
        if (d.uri.toString() !== doc.uri.toString()) {
          return;
        }
        if (!saved) {
          finish({ value: '', cancelled: true });
          return;
        }
        const text = stripHeader(d.getText()).trim();
        finish({ value: text, cancelled: text.length === 0 });
      }),
    );

    void editor;
  });
}

function stripHeader(text: string): string {
  const m = text.match(/^<!--[\s\S]*?-->\n\n?/);
  if (!m) {
    return text;
  }
  return text.slice(m[0].length);
}

type EntryMode =
  | { kind: 'snippet'; relPath: string; startLine: number; startCol: number; endLine: number; endCol: number; snippet: string; language: string }
  | { kind: 'file'; relPath: string; language: string }
  | { kind: 'project' };

export async function addEntryFromSelection(
  store: Store,
  editor: vscode.TextEditor | undefined,
  selection: vscode.Selection | undefined,
  workspaceRoot: vscode.Uri,
  includeGit: boolean,
): Promise<CommentEntry | undefined> {
  const mode = detectMode(editor, selection, workspaceRoot);
  const fileLabel = describeMode(mode);
  const charsCount = mode.kind === 'snippet' ? mode.snippet.length : 0;
  const language = mode.kind === 'project' ? '' : mode.language;

  const result = await promptCommentInline(fileLabel, charsCount, language);
  if (result.cancelled || !result.value.trim()) {
    return undefined;
  }

  const now = new Date().toISOString();
  const git = includeGit ? await captureGitInfo(workspaceRoot) : undefined;
  let entry: CommentEntry;
  switch (mode.kind) {
    case 'snippet':
      entry = {
        id: randomUUID(),
        file: mode.relPath,
        language: mode.language,
        range: {
          start: { line: mode.startLine, column: mode.startCol },
          end: { line: mode.endLine, column: mode.endCol },
        },
        snippet: mode.snippet,
        comment: result.value.trim(),
        createdAt: now,
        git,
      };
      break;
    case 'file':
      entry = {
        id: randomUUID(),
        file: mode.relPath,
        language: mode.language,
        comment: result.value.trim(),
        createdAt: now,
        git,
      };
      break;
    case 'project':
      entry = {
        id: randomUUID(),
        comment: result.value.trim(),
        createdAt: now,
        git,
      };
      break;
  }
  await store.add(entry);
  return entry;
}

function detectMode(
  editor: vscode.TextEditor | undefined,
  selection: vscode.Selection | undefined,
  workspaceRoot: vscode.Uri,
): EntryMode {
  if (!editor) {
    return { kind: 'project' };
  }
  const doc = editor.document;
  const sel = selection ?? editor.selection;
  if (sel.isEmpty) {
    return { kind: 'project' };
  }
  const lastLine = doc.lineCount - 1;
  const lastLineEndChar = doc.lineAt(lastLine).range.end.character;
  const isWholeFile =
    sel.start.line === 0 &&
    sel.start.character === 0 &&
    sel.end.line === lastLine &&
    sel.end.character === lastLineEndChar;

  const relPath = relativePath(doc.uri, workspaceRoot);
  if (isWholeFile) {
    return { kind: 'file', relPath, language: doc.languageId };
  }
  return {
    kind: 'snippet',
    relPath,
    startLine: sel.start.line + 1,
    startCol: sel.start.character + 1,
    endLine: sel.end.line + 1,
    endCol: sel.end.character + 1,
    snippet: doc.getText(sel),
    language: doc.languageId,
  };
}

function describeMode(mode: EntryMode): string {
  switch (mode.kind) {
    case 'snippet':
      return `${mode.relPath}:${mode.startLine}:${mode.startCol}-${mode.endLine}:${mode.endCol}`;
    case 'file':
      return `${mode.relPath} (whole file)`;
    case 'project':
      return '(project-level)';
  }
}

export function relativePath(uri: vscode.Uri, root: vscode.Uri): string {
  const folder = vscode.workspace.getWorkspaceFolder(uri);
  if (folder) {
    const rel = vscode.workspace.asRelativePath(uri, false);
    return rel.split(/[\\/]/).join('/');
  }
  // Fallback: best-effort relative to provided root
  const rootPath = root.fsPath.replace(/\\/g, '/');
  const filePath = uri.fsPath.replace(/\\/g, '/');
  if (filePath.startsWith(rootPath + '/')) {
    return filePath.slice(rootPath.length + 1);
  }
  return filePath;
}
