import * as vscode from 'vscode';
import { AgentTarget, ensureExtensionActive, getOverrideCommand, tryCommands } from './index';

export const continueAgent: AgentTarget = {
  id: 'continue',
  label: 'Continue',
  async detect() {
    return await ensureExtensionActive('Continue.continue');
  },
  async send(prompt: string) {
    const override = getOverrideCommand('continue.command');

    // Continue's public command is to focus the input panel; the prompt itself
    // must be pasted by the user. We put it on the clipboard and surface a hint.
    await vscode.env.clipboard.writeText(prompt);

    const candidates = override
      ? [override]
      : ['continue.focusContinueInput', 'continue.newSession', 'continue.openChat'];
    await tryCommands(candidates);
    void vscode.window.showInformationMessage(
      'Continue panel focused. Press ⌘V / Ctrl+V to paste the prompt.',
    );
  },
};
