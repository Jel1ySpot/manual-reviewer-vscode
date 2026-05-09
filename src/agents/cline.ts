import * as vscode from 'vscode';
import { AgentTarget, ensureExtensionActive, getOverrideCommand, tryCommands } from './index';

export const cline: AgentTarget = {
  id: 'cline',
  label: 'Cline',
  async detect() {
    return await ensureExtensionActive('saoudrizwan.claude-dev');
  },
  async send(prompt: string) {
    const override = getOverrideCommand('cline.command');
    const candidates = override ? [override] : ['cline.newTask', 'claude-dev.newTask'];
    await vscode.env.clipboard.writeText(prompt);
    try {
      await tryCommands(candidates, { task: prompt });
    } catch {
      await tryCommands(candidates, prompt);
    }
  },
};
