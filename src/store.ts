import * as vscode from 'vscode';
import * as path from 'path';
import { CommentEntry, GitInfo, Session, SCHEMA_VERSION, emptySession } from './types';

const SESSION_DIR = '.mreview';
const SESSION_FILE = 'session.json';
const ARCHIVE_DIR = 'archive';

export class Store {
  private session: Session;
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  constructor(private readonly workspaceRoot: vscode.Uri) {
    this.session = emptySession(workspaceRoot.fsPath);
  }

  static async open(workspaceRoot: vscode.Uri): Promise<Store> {
    const s = new Store(workspaceRoot);
    await s.reload();
    return s;
  }

  get all(): CommentEntry[] {
    return this.session.entries;
  }

  get count(): number {
    return this.session.entries.length;
  }

  getById(id: string): CommentEntry | undefined {
    return this.session.entries.find(e => e.id === id);
  }

  async add(entry: CommentEntry): Promise<void> {
    this.session.entries.push(entry);
    await this.persist();
    this._onDidChange.fire();
  }

  async update(id: string, patch: Partial<Pick<CommentEntry, 'comment'>>): Promise<void> {
    const e = this.getById(id);
    if (!e) {
      return;
    }
    Object.assign(e, patch);
    await this.persist();
    this._onDidChange.fire();
  }

  async remove(id: string): Promise<void> {
    this.session.entries = this.session.entries.filter(e => e.id !== id);
    await this.persist();
    this._onDidChange.fire();
  }

  async clear(archive: boolean): Promise<void> {
    if (archive && this.session.entries.length > 0) {
      await this.archiveCurrent();
    }
    this.session = emptySession(this.workspaceRoot.fsPath);
    await this.persist();
    this._onDidChange.fire();
  }

  async reload(): Promise<void> {
    const fileUri = this.sessionUri();
    try {
      const buf = await vscode.workspace.fs.readFile(fileUri);
      const text = Buffer.from(buf).toString('utf8');
      const parsed = JSON.parse(text) as Session;
      if (parsed.schemaVersion !== SCHEMA_VERSION) {
        // Future-proofing: if we ever bump schema, migrate here.
        this.session = emptySession(this.workspaceRoot.fsPath);
      } else {
        this.session = {
          ...parsed,
          workspaceRoot: this.workspaceRoot.fsPath,
        };
      }
    } catch (err) {
      // No session file yet → empty.
      this.session = emptySession(this.workspaceRoot.fsPath);
    }
    this._onDidChange.fire();
  }

  async archivePromptFile(currentPromptUri: vscode.Uri): Promise<void> {
    try {
      const stat = await vscode.workspace.fs.stat(currentPromptUri);
      if (!stat) {
        return;
      }
    } catch {
      return;
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const archiveUri = vscode.Uri.joinPath(
      this.workspaceRoot,
      SESSION_DIR,
      ARCHIVE_DIR,
      `PROMPT-${stamp}.md`,
    );
    await ensureDir(vscode.Uri.joinPath(archiveUri, '..'));
    const data = await vscode.workspace.fs.readFile(currentPromptUri);
    await vscode.workspace.fs.writeFile(archiveUri, data);
  }

  private async archiveCurrent(): Promise<void> {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const archiveUri = vscode.Uri.joinPath(
      this.workspaceRoot,
      SESSION_DIR,
      ARCHIVE_DIR,
      `session-${stamp}.json`,
    );
    await ensureDir(vscode.Uri.joinPath(archiveUri, '..'));
    const data = Buffer.from(JSON.stringify(this.session, null, 2), 'utf8');
    await vscode.workspace.fs.writeFile(archiveUri, data);
  }

  private async persist(): Promise<void> {
    const fileUri = this.sessionUri();
    const tmpUri = vscode.Uri.joinPath(this.workspaceRoot, SESSION_DIR, `${SESSION_FILE}.tmp`);
    await ensureDir(vscode.Uri.joinPath(fileUri, '..'));
    const data = Buffer.from(JSON.stringify(this.session, null, 2), 'utf8');
    await vscode.workspace.fs.writeFile(tmpUri, data);
    try {
      await vscode.workspace.fs.rename(tmpUri, fileUri, { overwrite: true });
    } catch {
      // Some FS providers (e.g. remote) don't support rename → fall back.
      await vscode.workspace.fs.writeFile(fileUri, data);
      try {
        await vscode.workspace.fs.delete(tmpUri);
      } catch {
        /* ignore */
      }
    }
  }

  sessionUri(): vscode.Uri {
    return vscode.Uri.joinPath(this.workspaceRoot, SESSION_DIR, SESSION_FILE);
  }

  promptUri(relPath: string): vscode.Uri {
    return vscode.Uri.joinPath(this.workspaceRoot, ...relPath.split(/[\\/]/));
  }

  toRelative(absPath: string): string {
    const root = this.workspaceRoot.fsPath;
    const rel = path.relative(root, absPath);
    return rel.split(path.sep).join('/');
  }

  dispose(): void {
    this._onDidChange.dispose();
  }
}

async function ensureDir(uri: vscode.Uri): Promise<void> {
  try {
    await vscode.workspace.fs.createDirectory(uri);
  } catch {
    /* already exists or fs error — let later writes surface real errors */
  }
}

export async function captureGitInfo(workspaceRoot: vscode.Uri): Promise<GitInfo | undefined> {
  // Use the bundled git extension when available; never shell out.
  try {
    const ext = vscode.extensions.getExtension<GitExtensionApi>('vscode.git');
    if (!ext) {
      return undefined;
    }
    if (!ext.isActive) {
      await ext.activate();
    }
    const api = ext.exports.getAPI(1);
    const repo = api.repositories.find(r => isInside(r.rootUri.fsPath, workspaceRoot.fsPath));
    if (!repo) {
      return undefined;
    }
    const head = repo.state.HEAD;
    const sha = head?.commit ?? '';
    const branch = head?.name ?? '';
    const dirty = repo.state.workingTreeChanges.length > 0 || repo.state.indexChanges.length > 0;
    if (!sha && !branch) {
      return undefined;
    }
    return { sha, branch, dirty };
  } catch {
    return undefined;
  }
}

function isInside(repoRoot: string, dir: string): boolean {
  const rel = path.relative(repoRoot, dir);
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

interface GitExtensionApi {
  getAPI(version: 1): {
    repositories: Array<{
      rootUri: vscode.Uri;
      state: {
        HEAD?: { commit?: string; name?: string };
        workingTreeChanges: unknown[];
        indexChanges: unknown[];
      };
    }>;
  };
}
