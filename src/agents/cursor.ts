import * as vscode from 'vscode';
import { AgentTarget, getOverrideCommand, tryCommands } from './index';

export const cursor: AgentTarget = {
  id: 'cursor',
  label: 'Cursor Chat',
  async detect() {
    return /cursor/i.test(vscode.env.appName);
  },
  async send(prompt: string) {
    const override = getOverrideCommand('cursor.command');
    if (override) {
      await tryCommands([override], prompt);
      return;
    }
    // Cursor's chat command IDs are not officially documented; try a few known ones.
    // The argument shape also varies; we attempt both raw string and {query: ...}.
    await pasteAndOpenChat(prompt, [
      'composer.startComposerPrompt',
      'aichat.newchataction',
      'aichat.insertselectionintochat',
      'workbench.action.chat.open',
    ]);
  },
};

async function pasteAndOpenChat(prompt: string, candidates: string[]): Promise<void> {
  // Best-effort: copy the prompt to clipboard so even if the chat opens empty,
  // the user can ⌘V to paste.
  await vscode.env.clipboard.writeText(prompt);

  const all = await vscode.commands.getCommands(true);
  for (const id of candidates) {
    if (!all.includes(id)) {
      continue;
    }
    try {
      await vscode.commands.executeCommand(id, { query: prompt });
      return;
    } catch {
      try {
        await vscode.commands.executeCommand(id, prompt);
        return;
      } catch {
        try {
          await vscode.commands.executeCommand(id);
          return;
        } catch {
          continue;
        }
      }
    }
  }
  throw new Error(`No working Cursor chat command among: ${candidates.join(', ')}`);
}
