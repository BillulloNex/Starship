---
name: review-open-prs
description: This skill should be used when the user asks to "review open PRs", "review latest PRs", "review pull requests", "check open PRs", "review the latest open PRs", "review PRs on the current repo" or mentions reviewing recent pull requests on the current GitHub repository.
---

# Review Latest Open PRs

List and review the most recent open pull requests on the current GitHub repository.

## Workflow

### 1. Detect current repository

Determine owner/repo from the current workspace:

```bash
gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || git remote get-url origin 2>/dev/null | sed -E 's/.*github\.com[:\/]([^\/]+\/[^\/]+)(\.git)?/\1/'
```

Store as `OWNER/REPO` (e.g., `ThomasVuNguyen/Grokbot`). If `gh` complains about auth, export `GH_TOKEN=$GITHUB_TOKEN` (or `GH_TOKEN=$GITHUB_PERSONAL_ACCESS_TOKEN`) first. Abort with a clear message if detection fails.

### 2. List open PRs

Fetch the latest open PRs sorted by most recent:

```bash
gh pr list --repo <OWNER/REPO> --state open --limit 10 --json number,title,author,createdAt,url,additions,deletions,changedFiles,baseRefName,headRefName | jq .
```

For a concise table:

```bash
gh pr list --repo <OWNER/REPO> --state open --limit 5
```

If no open PRs exist, report that and stop.

### 3. Gather details for each PR

For each PR number, fetch metadata and diff:

```bash
gh pr view <NUMBER> --repo <OWNER/REPO> --json number,title,body,author,createdAt,changedFiles,additions,deletions,files,commits,state,url
gh pr diff <NUMBER> --repo <OWNER/REPO> | head -n 800
gh api repos/<OWNER>/<REPO>/pulls/<NUMBER>/files --paginate | jq -r '.[].filename'
```

To inspect full file content at PR head, use `gh pr view <NUMBER> --json headRefName -q .headRefName` or read files directly from workspace if the branch is checked out.

Limit diff review to a few hundred lines per PR to stay within context. If a PR is large, focus on changed files list and sample key diffs.

### 4. Analyze each PR

For each PR, produce a structured review:

- **Summary**: 1-2 sentences on intent and scope.
- **Changes**: Bullet list of key files and what changed (use diff + file list).
- **Taste Rating**: Good taste / Acceptable / Needs improvement (based on simplicity, data structures, pragmatism).
- **[Critical Issues]**: Must-fix bugs, breaking changes, security risks, logic errors. Include file and line reference where possible.
- **[Improvements]**: Simplifications, dead code, over-engineering. Keep suggestions proportional to benefit.
- **[Testing/Risk]**: Note missing tests or risk level (Low / Medium / High) and whether the change is safe to merge.
- **Verdict**: Worth merging / Needs rework + one-line key insight.

Ground line numbers before commenting: verify with `grep -n` or `sed -n 'X,Yp' <file>`. Do not invent line numbers from hunk headers.

Skip style nits. Focus on correctness, data structures, complexity, breaking changes, and real security issues.

### 5. Present results

Render a combined report for all open PRs, most recent first:

```
## Open PRs (OWNER/REPO) -- N found

### #<NUM> -- <title> (<author>, <createdAt>)
URL: ...
Files: N | +additions -deletions
[Review per format above]

### #<NUM> -- ...
```

If only one PR exists, review it in depth. If multiple, keep each review concise (3-7 bullets + verdict) and offer to dive deeper into any specific PR.

### 6. Optionally post review to GitHub

Only post a formal GitHub review when explicitly asked. To post, bundle all inline comments into a single API call:

```bash
cat > /tmp/review.json << 'EOF'
{
  "commit_id": "<COMMIT_SHA>",
  "event": "COMMENT",
  "body": "Summary verdict for PR #<NUM>",
  "comments": [
    {"path": "path/to/file", "line": 42, "side": "RIGHT", "body": "Important: ..."}
  ]
}
EOF
gh api -X POST repos/<OWNER>/<REPO>/pulls/<NUMBER>/reviews --input /tmp/review.json
```

Use `gh pr view <NUM> --json headRefOid -q .headRefOid` for commit_id. Use priority labels Critical / Important / Suggestion. Do not post Nit comments.

## Notes

- Use `GITHUB_TOKEN`/`GH_TOKEN` via `gh` (export `GH_TOKEN=$GITHUB_TOKEN` if `gh` complains about auth).
- For raw API, include `Authorization: token $GITHUB_TOKEN` (or `Bearer`).
- Handle pagination for repos with many PRs: `gh pr list --limit 20`.
- Large diffs: truncate and note `[patch truncated]` to avoid context overflow.
