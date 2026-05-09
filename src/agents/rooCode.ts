import * as vscode from 'vscode';
import { AgentTarget, ensureExtensionActive, getOverrideCommand, tryCommands } from './index';

export const rooCode: AgentTarget = {
  id: 'rooCode',
  label: 'Roo Code',
  async detect() {
    return (
      (await ensureExtensionActive('RooVeterinaryInc.roo-cline')) ||
      (await ensureExtensionActive('rooveterinaryinc.roo-cline'))
    );
  },
  async send(prompt: string) {
    const override = getOverrideCommand('rooCode.command');
    const candidates = override ? [override] : ['roo-cline.newTask', 'roo.newTask'];
    await vscode.env.clipboard.writeText(prompt);
    try {
      await tryCommands(candidates, { task: prompt });
    } catch {
      await tryCommands(candidates, prompt);
    }
  },
};
