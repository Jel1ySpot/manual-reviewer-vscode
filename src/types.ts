export const SCHEMA_VERSION = 1;

export interface Position {
  line: number;
  column: number;
}

export interface PositionRange {
  start: Position;
  end: Position;
}

export interface GitInfo {
  sha: string;
  branch: string;
  dirty: boolean;
}

export type EntryKind = 'snippet' | 'file' | 'project';

export interface CommentEntry {
  id: string;
  /** Workspace-relative path. Omitted for project-level entries. */
  file?: string;
  language?: string;
  /** Omitted for whole-file and project-level entries. */
  range?: PositionRange;
  /** The captured selection text. Empty for whole-file and project-level entries. */
  snippet?: string;
  comment: string;
  createdAt: string;
  git?: GitInfo;
}

export function entryKind(entry: CommentEntry): EntryKind {
  if (!entry.file) {
    return 'project';
  }
  if (!entry.range) {
    return 'file';
  }
  return 'snippet';
}

export function formatRange(r: PositionRange): string {
  return `${r.start.line}:${r.start.column}-${r.end.line}:${r.end.column}`;
}

export interface Session {
  schemaVersion: typeof SCHEMA_VERSION;
  workspaceRoot: string;
  createdAt: string;
  entries: CommentEntry[];
}

export function emptySession(workspaceRoot: string): Session {
  return {
    schemaVersion: SCHEMA_VERSION,
    workspaceRoot,
    createdAt: new Date().toISOString(),
    entries: [],
  };
}
