import * as vscode from 'vscode';
import * as path from 'path';
import { Store, captureGitInfo } from './store';
import { addEntryFromSelection, promptCommentInline } from './popup';
import { EntryTreeProvider, jumpToEntry } from './treeView';
import { render } from './exporter';
import { loadTemplate } from './exporterIo';
import { CommentEntry, entryKind } from './types';
import {
  detectAvailable,
  sendWithFallback,
  AgentTarget,
} from './agents';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const root = pickWorkspaceRoot();
  if (!root) {
    void vscode.window.showInformationMessage(
      'Manual Reviewer: open a folder to start collecting code comments.',
    );
    // Register a stub so the keybinding doesn't error with "command not found".
    context.subscriptions.push(
      vscode.commands.registerCommand('mreview.addAtSelection', () => {
        void vscode.window.showWarningMessage('Manual Reviewer: open a folder first.');
      }),
    );
    return;
  }

  const store = await Store.open(root);
  const treeProvider = new EntryTreeProvider(store);

  context.subscriptions.push(
    store,
    vscode.window.registerTreeDataProvider('mreview.entries', treeProvider),
  );

  const treeView = vscode.window.createTreeView('mreview.entries', {
    treeDataProvider: treeProvider,
  });
  context.subscriptions.push(treeView);

  // ---------------- Commands ----------------

  context.subscriptions.push(
    vscode.commands.registerCommand('mreview.addAtSelection', async () => {
      const cfg = vscode.workspace.getConfiguration('comments');
      const includeGit = cfg.get<boolean>('includeGitInfo', true);
      const root2 = pickWorkspaceRoot();
      if (!root2) {
        return;
      }
      const editor = vscode.window.activeTextEditor;
      // Pass through even if editor is undefined — addEntryFromSelection will
      // treat it as a project-level entry.
      await addEntryFromSelection(
        store,
        editor,
        editor?.selection,
        root2,
        includeGit,
      );
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mreview.addEntryFromTitle', () =>
      vscode.commands.executeCommand('mreview.addAtSelection'),
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mreview.list', () => {
      void treeView.reveal(store.all[0], { focus: true, select: false }).then(
        () => {
          /* ok */
        },
        () => {
          void vscode.commands.executeCommand('workbench.view.extension.mreviewContainer');
        },
      );
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mreview.removeEntry', async (item?: { id?: string }) => {
      const id = await resolveEntryId(item);
      if (!id) {
        return;
      }
      await store.remove(id);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mreview.editEntry', async (item?: { id?: string }) => {
      const id = await resolveEntryId(item);
      if (!id) {
        return;
      }
      const e = store.getById(id);
      if (!e) {
        return;
      }
      const fileLabel = describeEntry(e);
      const result = await promptCommentInline(
        fileLabel,
        (e.snippet ?? '').length,
        e.language ?? '',
        {
          initial: e.comment,
          title: 'Edit Comment',
        },
      );
      if (!result.cancelled && result.value.trim()) {
        await store.update(id, { comment: result.value.trim() });
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mreview.jumpToEntry', async (idOrItem: unknown) => {
      const id =
        typeof idOrItem === 'string' ? idOrItem : await resolveEntryId(idOrItem as any);
      if (!id) {
        return;
      }
      const root2 = pickWorkspaceRoot();
      if (!root2) {
        return;
      }
      try {
        await jumpToEntry(store, root2, id);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        void vscode.window.showErrorMessage(`Failed to open file: ${msg}`);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mreview.clearSession', async () => {
      if (store.count === 0) {
        void vscode.window.showInformationMessage('No entries to clear.');
        return;
      }
      const choice = await vscode.window.showWarningMessage(
        `Clear all ${store.count} comment entries?`,
        { modal: true },
        'Clear (archive first)',
        'Clear without archive',
      );
      if (!choice) {
        return;
      }
      const cfg = vscode.workspace.getConfiguration('comments');
      const archive =
        choice === 'Clear (archive first)'
          ? true
          : !!cfg.get<boolean>('archiveOnClear', true);
      await store.clear(archive);
    }),
  );

  // ---- Export ----

  context.subscriptions.push(
    vscode.commands.registerCommand('mreview.export', async () => doExport(context, store)),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mreview.exportToFile', async () => {
      const r = await renderPrompt(context, store);
      if (!r) {
        return;
      }
      const promptUri = await writePromptFile(store, r.text);
      if (promptUri) {
        const doc = await vscode.workspace.openTextDocument(promptUri);
        await vscode.window.showTextDocument(doc, { preview: false });
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mreview.exportToClipboard', async () => {
      const r = await renderPrompt(context, store);
      if (!r) {
        return;
      }
      await vscode.env.clipboard.writeText(r.text);
      void vscode.window.showInformationMessage(
        `Exported ${store.count} entries to clipboard.`,
      );
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mreview.exportToAgent', async () => {
      const r = await renderPrompt(context, store);
      if (!r) {
        return;
      }
      await vscode.env.clipboard.writeText(r.text);
      const available = await detectAvailable();
      if (available.length === 0) {
        void vscode.window.showWarningMessage(
          'No supported AI agent extension detected. Prompt copied to clipboard.',
        );
        return;
      }
      let target: AgentTarget | undefined;
      if (available.length === 1) {
        target = available[0];
      } else {
        const pick = await vscode.window.showQuickPick(
          available.map(a => ({ label: a.label, target: a })),
          { placeHolder: 'Send prompt to which agent?' },
        );
        target = pick?.target;
      }
      if (!target) {
        return;
      }
      await sendWithFallback(target, r.text);
    }),
  );

  // Helper: resolve an entry id from a tree item argument (which may be the
  // CommentEntry itself, or a TreeItem-like wrapper).
  async function resolveEntryId(
    item?: { id?: string } & Record<string, unknown>,
  ): Promise<string | undefined> {
    if (item?.id) {
      return item.id;
    }
    if (store.all.length === 0) {
      return undefined;
    }
    const pick = await vscode.window.showQuickPick(
      store.all.map((e, i) => ({
        label: `[#${i + 1}] ${describeEntry(e)}`,
        description: e.comment,
        id: e.id,
      })),
      { placeHolder: 'Select entry' },
    );
    return pick?.id;
  }
}

export function deactivate(): void {
  /* nothing — disposables registered via context.subscriptions */
}

// ----------------- helpers -----------------

function describeEntry(entry: CommentEntry): string {
  switch (entryKind(entry)) {
    case 'snippet':
      return `${entry.file}:${entry.range!.start.line}:${entry.range!.start.column}-${entry.range!.end.line}:${entry.range!.end.column}`;
    case 'file':
      return `${entry.file} (whole file)`;
    case 'project':
      return '(project-level)';
  }
}

function pickWorkspaceRoot(): vscode.Uri | undefined {
  const editor = vscode.window.activeTextEditor;
  if (editor) {
    const folder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
    if (folder) {
      return folder.uri;
    }
  }
  const folders = vscode.workspace.workspaceFolders;
  if (folders && folders.length > 0) {
    return folders[0].uri;
  }
  return undefined;
}

async function renderPrompt(
  context: vscode.ExtensionContext,
  store: Store,
): Promise<{ text: string } | undefined> {
  if (store.count === 0) {
    void vscode.window.showInformationMessage('No comments to export yet.');
    return undefined;
  }
  const tmpl = await loadTemplate(context.extensionUri);
  const root = pickWorkspaceRoot();
  const cfg = vscode.workspace.getConfiguration('comments');
  const includeGit = cfg.get<boolean>('includeGitInfo', true);
  const git = root && includeGit ? await captureGitInfo(root) : undefined;
  const repoName = root ? path.basename(root.fsPath) : undefined;
  const text = render({
    session: {
      schemaVersion: 1,
      workspaceRoot: root?.fsPath ?? '',
      createdAt: new Date().toISOString(),
      entries: store.all,
    },
    templateText: tmpl,
    repoName,
    git,
  });
  return { text };
}

async function writePromptFile(
  store: Store,
  text: string,
): Promise<vscode.Uri | undefined> {
  const root = pickWorkspaceRoot();
  if (!root) {
    void vscode.window.showWarningMessage('Open a folder to write the prompt file.');
    return undefined;
  }
  const cfg = vscode.workspace.getConfiguration('comments');
  const relPath = cfg.get<string>('exportPath', '.mreview/PROMPT.md');
  const archive = cfg.get<boolean>('archiveOnExport', true);
  const promptUri = vscode.Uri.joinPath(root, ...relPath.split(/[\\/]/));

  if (archive) {
    try {
      await store.archivePromptFile(promptUri);
    } catch {
      /* ignore */
    }
  }

  await ensureDirFor(promptUri);
  await vscode.workspace.fs.writeFile(promptUri, Buffer.from(text, 'utf8'));
  return promptUri;
}

async function ensureDirFor(fileUri: vscode.Uri): Promise<void> {
  const dir = vscode.Uri.joinPath(fileUri, '..');
  try {
    await vscode.workspace.fs.createDirectory(dir);
  } catch {
    /* ignore */
  }
}

async function doExport(
  context: vscode.ExtensionContext,
  store: Store,
): Promise<void> {
  const r = await renderPrompt(context, store);
  if (!r) {
    return;
  }
  const promptUri = await writePromptFile(store, r.text);
  await vscode.env.clipboard.writeText(r.text);
  if (promptUri) {
    const doc = await vscode.workspace.openTextDocument(promptUri);
    await vscode.window.showTextDocument(doc, { preview: false });
    const cfg = vscode.workspace.getConfiguration('comments');
    const relPath = cfg.get<string>('exportPath', '.mreview/PROMPT.md');
    void vscode.window.showInformationMessage(
      `Exported ${store.count} entr${store.count === 1 ? 'y' : 'ies'} · written to ${relPath} · copied to clipboard.`,
    );
  }
}
