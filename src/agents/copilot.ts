import * as vscode from 'vscode';
import { AgentTarget, ensureExtensionActive, getOverrideCommand, tryCommands } from './index';

export const copilot: AgentTarget = {
  id: 'copilot',
  label: 'GitHub Copilot Chat',
  async detect() {
    return await ensureExtensionActive('GitHub.copilot-chat');
  },
  async send(prompt: string) {
    const override = getOverrideCommand('copilot.command');
    const candidates = override
      ? [override]
      : ['workbench.action.chat.open', 'workbench.action.chat.openInSidebar'];
    await tryCommands(candidates, { query: prompt });
  },
};

void vscode;
