import * as vscode from 'vscode';

export async function loadTemplate(extensionUri: vscode.Uri): Promise<string> {
  const tmplUri = vscode.Uri.joinPath(extensionUri, 'prompt.template.md');
  const buf = await vscode.workspace.fs.readFile(tmplUri);
  return Buffer.from(buf).toString('utf8');
}
