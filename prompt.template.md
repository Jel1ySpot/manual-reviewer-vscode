# Modification Checklist — {{timestamp}}

Repository: {{repo_name}}{{git_info}}
Items: {{count}}

Below is the checklist of code regions that must be modified. Apply every change in order. Each item's header tells you the scope: `## [N] file<startLine:startCol-endLine:endCol>` is a code-snippet edit (followed by the original snippet); `## [N] file` is a whole-file edit; `## [N]` alone is a project-wide note.

Before editing each item, actively explore the surrounding context: read the full file, trace callers and callees, check related types and tests, search the repository for similar patterns, and confirm any assumptions the instruction depends on. Don't rely on the snippet alone — it is an excerpt, not the full picture. If exploration reveals that the instruction is incomplete, ambiguous, or in conflict with the rest of the codebase, surface that finding in the report instead of guessing.

Only modify code outside the listed ranges if needed, and explain such changes in reports. After finishing, report what you changed for each item using the same numbering, including any context you discovered that informed the change.

{{entries}}
