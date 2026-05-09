import * as vscode from 'vscode';
import { copilot } from './copilot';
import { cursor } from './cursor';
import { windsurf } from './windsurf';
import { cline } from './cline';
import { rooCode } from './rooCode';
import { continueAgent } from './continue';

export interface AgentTarget {
  id: string;
  label: string;
  detect(): Promise<boolean>;
  send(prompt: string): Promise<void>;
}

export const ALL_AGENTS: AgentTarget[] = [
  copilot,
  cursor,
  windsurf,
  cline,
  rooCode,
  continueAgent,
];

export async function detectAvailable(): Promise<AgentTarget[]> {
  const results = await Promise.all(
    ALL_AGENTS.map(async a => ({ a, ok: await safeDetect(a) })),
  );
  return results.filter(r => r.ok).map(r => r.a);
}

async function safeDetect(a: AgentTarget): Promise<boolean> {
  try {
    return await a.detect();
  } catch {
    return false;
  }
}

export async function trySend(target: AgentTarget, prompt: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await target.send(prompt);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function sendWithFallback(
  target: AgentTarget,
  prompt: string,
): Promise<void> {
  const r = await trySend(target, prompt);
  if (r.ok) {
    return;
  }
  await vscode.env.clipboard.writeText(prompt);
  void vscode.window.showErrorMessage(
    `Failed to send to ${target.label}: ${r.error}. Prompt copied to clipboard instead.`,
  );
}

export function isExtensionActive(extensionId: string): boolean {
  const ext = vscode.extensions.getExtension(extensionId);
  return !!ext && ext.isActive;
}

export function isExtensionInstalled(extensionId: string): boolean {
  return !!vscode.extensions.getExtension(extensionId);
}

export async function ensureExtensionActive(extensionId: string): Promise<boolean> {
  const ext = vscode.extensions.getExtension(extensionId);
  if (!ext) {
    return false;
  }
  if (!ext.isActive) {
    try {
      await ext.activate();
    } catch {
      return false;
    }
  }
  return true;
}

export async function tryCommands(commandIds: string[], arg?: unknown): Promise<void> {
  const all = await vscode.commands.getCommands(true);
  for (const id of commandIds) {
    if (!id) {
      continue;
    }
    if (!all.includes(id)) {
      continue;
    }
    try {
      if (arg === undefined) {
        await vscode.commands.executeCommand(id);
      } else {
        await vscode.commands.executeCommand(id, arg);
      }
      return;
    } catch (e) {
      // Try next
      continue;
    }
  }
  throw new Error(`None of these commands worked: ${commandIds.filter(Boolean).join(', ')}`);
}

export function getOverrideCommand(key: string): string | undefined {
  const cfg = vscode.workspace.getConfiguration('mreview.agents');
  const v = cfg.get<string>(key, '');
  return v && v.trim() ? v.trim() : undefined;
}
