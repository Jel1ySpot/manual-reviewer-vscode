import * as vscode from 'vscode';
import { AgentTarget, getOverrideCommand } from './index';

export const windsurf: AgentTarget = {
  id: 'windsurf',
  label: 'Windsurf Cascade',
  async detect() {
    return /windsurf/i.test(vscode.env.appName);
  },
  async send(prompt: string) {
    const override = getOverrideCommand('windsurf.command');
    const candidates = override
      ? [override]
      : ['windsurf.prioritized.chat.openNewConversation', 'windsurf.chat.openNewConversation', 'cascade.start'];

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
    throw new Error(`No working Windsurf chat command among: ${candidates.join(', ')}`);
  },
};
