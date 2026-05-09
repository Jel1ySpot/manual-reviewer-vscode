# Manual Reviewer — VSCode Extension

\[**English**\] \[[中文](README_zh.md)\]

> **Tired of letting LLMs review LLM-written code?** Use Manual Reviewer to boss AI around like a real client.

## Usage

Press `⇧-⌘-'` / `Ctrl-Shift-'` to add a comment for the selected text / file / project. Press `⇧-⌘-I` / `Ctrl-Shift-I` to write `.mreview/PROMPT.md`, copy it to your clipboard, and open it in a new tab.

The TreeView title bar `…` menu offers:
- Export to file
- Export to clipboard
- Send to agent

## Settings

| Key | Default | Description |
|---|---|---|
| `mreview.exportPath` | `.mreview/PROMPT.md` | output path for `mreview.export` |
| `mreview.archiveOnExport` | `true` | move old PROMPT.md to `.mreview/archive/` on export |
| `mreview.archiveOnClear` | `true` | archive session.json on clear |
| `mreview.includeGitInfo` | `true` | capture branch/sha/dirty per entry |
| `mreview.agents.<id>.command` | (varies) | override agent command IDs (see below) |

## Agent command IDs

| Agent | Default candidates | Setting |
|---|---|---|
| Copilot Chat | `workbench.action.chat.open` | `mreview.agents.copilot.command` |
| Cursor | `composer.startComposerPrompt`, `aichat.newchataction`, `aichat.insertselectionintochat` | `mreview.agents.cursor.command` |
| Windsurf | `windsurf.prioritized.chat.openNewConversation`, `cascade.start` | `mreview.agents.windsurf.command` |
| Cline | `cline.newTask` | `mreview.agents.cline.command` |
| Roo Code | `roo-cline.newTask` | `mreview.agents.rooCode.command` |
| Continue | `continue.focusContinueInput` (paste after opening) | `mreview.agents.continue.command` |

## Development

```bash
pnpm install
pnpm run compile
pnpm test
pnpm dlx @vscode/vsce package   # produce .vsix
```

## License

MIT
