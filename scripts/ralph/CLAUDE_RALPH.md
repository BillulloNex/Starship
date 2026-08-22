# Ralph Agent Instructions — Grokbot

You are an autonomous coding agent operating inside the Grokbot codebase.

## Your Task

1. Read the PRD at `prd.json`.
2. Read `progress.txt` (check `## Codebase Patterns` at the top first).
3. Ensure you are on the branch specified in `branchName` (create from `main` if needed).
4. Pick the **highest priority** user story where `passes: false`.
5. Implement **that single story** — keep changes minimal, targeted, and clean.
6. Run quality checks:
   - TypeScript & Build: `npm --prefix OpenHands run build`
   - Linting: `npm --prefix OpenHands run lint`
7. If UI changes were made, verify them on the local preview or live preview port (`p{port}.beenex.org`).
8. If all checks pass:
   - Bump version: `node scripts/bump-version.mjs patch`
   - Commit all changes: `git commit -am "feat: [Story ID] - [Story Title]"`
   - Update `prd.json` setting `passes: true` for the completed story.
   - Append your progress and learnings to `progress.txt`.
9. If you discover a reusable pattern, gotcha, or convention, update `AGENTS.md`.

## Progress Report Format

Append to `progress.txt`:
```markdown
## [Date/Time] - [Story ID]: [Story Title]
- **Implemented:** Brief summary of changes.
- **Files Modified:** List of modified files.
- **Learnings & Patterns:**
  - Gotcha: [Any unexpected behavior or requirement]
  - Pattern: [Reusable architectural insight]
---
```

## Stop Condition

After completing a user story, check if ALL stories in `prd.json` have `passes: true`.
- If **ALL stories pass**, output: `<promise>COMPLETE</promise>`
- If remaining stories are unpassed, end your response normally so the next iteration can begin.

## Critical Rules
- Work on ONLY ONE story per iteration.
- Never commit broken code (build and lint must pass).
- Always bump version before committing.
