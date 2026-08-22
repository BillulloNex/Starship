---
name: generate-prd
description: "Generate a Product Requirements Document (PRD) for a new feature. Use when planning a feature, starting a new project, or when asked to create a PRD or plan for autonomous execution. Triggers on: create a prd, write prd for, plan this feature, requirements for, spec out."
user-invocable: true
---

# PRD Generator for Grokbot

Create detailed Product Requirements Documents (PRDs) that are clear, actionable, and structured for autonomous iterative execution (Ralph loop).

---

## Workflow

1. Receive a feature description from the user.
2. Ask 3–5 essential clarifying questions with lettered options (`1A, 2C, 3B`).
3. Generate a structured PRD incorporating the answers.
4. Save the file to `tasks/prd-[feature-name].md`.

> [!IMPORTANT]
> Do NOT start implementing the feature immediately. Your sole output is creating the structured PRD.

---

## Step 1: Clarifying Questions

Ask only critical questions where the initial request is ambiguous. Focus on:
- **Primary Goal & Target Persona**: What problem does this solve? Who is using it?
- **Core Scope**: What are the mandatory user actions vs non-goals?
- **Budget / Auth Mode**: API billing with dollar budget or Subscription/ACP mode with turn caps?
- **Verification Criteria**: Specific tests, preview checks (`p{port}.beenex.org`), or browser validation.

### Example Question Format:
```
1. What is the primary scope of this feature?
   A. UI components only
   B. Backend API / services only
   C. Full-stack end-to-end implementation
   D. Other: [specify]

2. Which execution/budget mode will you use?
   A. Subscription / ACP mode (Claude Pro/Team or ChatGPT with turn caps & rate-limit protection)
   B. API Key mode (Direct token billing with hard dollar ceiling)
   C. Default / Balanced

3. Verification requirements:
   A. Unit tests + typecheck + build
   B. Browser / Live Preview verification on p{port}.beenex.org
   C. Both
```

---

## Step 2: PRD Structure

Generate the markdown PRD with these sections:

```markdown
# PRD: [Feature Name]

## 1. Introduction & Overview
Brief description of the feature, target problem, and intended behavior.

## 2. Goals & Success Criteria
- Specific, measurable objectives.

## 3. Budget & Guardrail Recommendations
- **Recommended Mode**: `subscription` (with max turns) OR `api` (with dollar ceiling)
- **Target Budget**: Max turns or USD budget estimate.

## 4. User Stories (Atomic & Dependency-Ordered)

### US-001: [Title]
**Description:** As a [user], I want [feature] so that [benefit].
**Acceptance Criteria:**
- [ ] Explicit verifiable criterion 1
- [ ] Explicit verifiable criterion 2
- [ ] Typecheck & build pass (`npm --prefix OpenHands run build`)
- [ ] **[UI stories only]** Verify on live preview URL (p{port}.beenex.org)

## 5. Functional Requirements
- FR-1: Explicit system behavior.
- FR-2: Expected UI interaction or data flow.

## 6. Non-Goals (Out of Scope)
- Explicitly state what is NOT included to prevent agent drift.

## 7. Technical Considerations
- Grokbot architecture notes, component reuse, state management, and deployment hooks.
```

---

## Output
- **File Location:** `tasks/prd-[feature-name].md` (kebab-case)
