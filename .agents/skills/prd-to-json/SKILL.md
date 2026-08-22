---
name: prd-to-json
description: "Convert markdown PRDs to machine-executable prd.json format for Grokbot's Ralph autonomous loop with budget controls. Triggers on: convert prd to json, create prd.json, ralph json, prepare overnight loop."
user-invocable: true
---

# PRD to JSON Compiler for Grokbot Ralph Loop

Converts human-readable PRD markdown files into `prd.json` format for autonomous iterative execution with budget, token, and turn guardrails.

---

## Output JSON Schema

```json
{
  "project": "Grokbot",
  "branchName": "ralph/feature-name-kebab-case",
  "description": "Short feature description",
  "budgetConfig": {
    "authMode": "subscription",
    "maxTurns": 30,
    "maxIterations": 15,
    "maxConsecutiveFailures": 2,
    "cooldownSeconds": 15,
    "maxTotalSpendUsd": 10.00,
    "maxSpendPerStoryUsd": 0.80,
    "maxDurationMinutes": 240,
    "onRateLimit": "graceful_exit"
  },
  "userStories": [
    {
      "id": "US-001",
      "title": "Short title",
      "description": "As a [user], I want [feature] so that [benefit]",
      "acceptanceCriteria": [
        "Explicit verifiable criterion 1",
        "Typecheck and build pass",
        "Verify on preview port"
      ],
      "priority": 1,
      "passes": false,
      "notes": ""
    }
  ]
}
```

---

## Story Sizing Rules (Critical for Loop Success)

Each user story **must fit in a single context window / iteration**.

### Right-Sized Stories:
- Add a new state hook or store property.
- Create an isolated UI component or modal.
- Connect an API endpoint to a UI action.
- Add a table column / configuration field.

### Too Large (Must be split):
- "Build authentication system" $\rightarrow$ Split: (1) schema/types, (2) API service, (3) UI login form, (4) session context.
- "Build dashboard page" $\rightarrow$ Split: (1) metric cards, (2) charts, (3) filtering controls.

---

## Dependency Ordering

Stories execute in ascending priority order (`1, 2, 3...`):
1. **Types / State / Schema**
2. **Services / Actions / Backend hooks**
3. **UI Components**
4. **Integration & End-to-End Visual Verification**

---

## Acceptance Criteria Checklist for Every Story
Every story MUST include:
- `Typecheck and build pass`
- For UI changes: `Verify on live preview port or browser`
