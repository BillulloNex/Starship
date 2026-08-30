I imagine a self-sustaining and hyper agentic application.

There is a 'job board', a kanban board type that humans, agents and automations can add job too.

And automatically the agents can pick up jobs, and execute them, and update the job board with the status and results.

The features can include like:

- When an Agent usage is low (like Codex 5% left of 5hr usage or Claude 10% left of 10k tokens usage, or Kimi k3 spent 100$ in API already), they can be aware of it and push jobs to the board so other agents can carry on
- When a job is long or the agent feel like its best done in parallel, the agent can post on the job board
- The job can be marked done, or can be required review by another agent (like Codex makes a job on the board, make it required that the final review is done by Codex itself, sent out, Claude picks up, do its things, done and get reviewed by Codex - either do final touches or just accept it done)
- the job board UI should show clearly what's been done, assigned by whom (source of the job), the workspace attached (if any), dates & times, details, completed by whom, review by whom (if applicable), so on and so forth

You get the gist

# Status: SHIPPED (v0.46.0)

Kanban at `/jobs` with persistent JSON store (`/projects/.grokbot/jobs.json`).

- Humans post from the UI. Agents post/claim/complete/review via `grokbot-job` or `GET/POST /api/jobs`.
- Columns: Backlog, Ready, In Progress, Review, Done, Blocked.
- Cards show source, assignee, workspace, timestamps, reviewer, completed-by.
- Start launches a conversation with the job prompt. Optional Auto-run picks Ready jobs when enabled.
- Reviewer field sends completed work to Review instead of Done.
- Agent skill `job-board` + `<RUNTIME_SERVICES>` advertise the CLI so agents can hand off when quota is low.
