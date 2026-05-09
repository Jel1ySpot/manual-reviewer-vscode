# Manual Reviewer — VSCode 插件

\[[English](README.md)\] \[**中文**\]

> **厌倦了让 LLM 审查 LLM 写的代码？** 使用 Manual Reviewer 让你像一个真正的甲方一样使唤 AI。

## 使用方法

使用 `⇧-⌘-'` / `Ctrl-Shift-'` 为选中的文本 / 文件 / 项目添加 comment。使用 `⇧-⌘-I` / `Ctrl-Shift-I` 写入 `.mreview/PROMPT.md`、复制到剪贴板并在新标签页中打开。

侧面板标题栏 `…` 菜单可以选择：
- 导出到文件
- 导出到剪切板
- 发送到 Agent

## 设置

| 键 | 默认 | 说明 |
|---|---|---|
| `mreview.exportPath` | `.mreview/PROMPT.md` | `mreview.export` 输出路径 |
| `mreview.archiveOnExport` | `true` | 导出时把旧 PROMPT.md 归档到 `.mreview/archive/` |
| `mreview.archiveOnClear` | `true` | 清空时归档 session.json |
| `mreview.includeGitInfo` | `true` | 每条 entry 记录 branch/sha/dirty |
| `mreview.agents.<id>.command` | (各异) | 覆盖 agent 命令 ID（见下表） |

## Agent 命令 ID

| Agent | 默认候选 | 设置 |
|---|---|---|
| Copilot Chat | `workbench.action.chat.open` | `mreview.agents.copilot.command` |
| Cursor | `composer.startComposerPrompt`, `aichat.newchataction`, `aichat.insertselectionintochat` | `mreview.agents.cursor.command` |
| Windsurf | `windsurf.prioritized.chat.openNewConversation`, `cascade.start` | `mreview.agents.windsurf.command` |
| Cline | `cline.newTask` | `mreview.agents.cline.command` |
| Roo Code | `roo-cline.newTask` | `mreview.agents.rooCode.command` |
| Continue | `continue.focusContinueInput`（打开后粘贴） | `mreview.agents.continue.command` |

## 开发

```bash
pnpm install
pnpm run compile
pnpm test
pnpm dlx @vscode/vsce package   # 生成 .vsix
```

## License

MIT
