# Introducing starship
Today, we rename the application to Starship.
It has grown enough in my heart to deserve a new name.

with that in mind, it's also time that we be honest about what Starship is about.

I have always been building software - experiments and the company.

It started with handwriting Flutter code & python scripts, or running bash sripts on the CLI.

Later it became writing code with early Cursor - fast at predictable parts (re-writing stateless widget into stateful widgets etc)

Then its about how to make sure I balance Claude Code, Codex and Cursor (we only spent 20$/m per service).

Then I came across Antigravity. The speed and 'just get it' vibe, combined with Browser Control, I was blown away with how much of my brain can be taken away from the task, freed for business and experiment thoughts.

As the company grows, I got myself Antigravity Ultra. Token limit is no longer an issue. I was able to work on 4 projects in parallel (work and experiments). The limit wasn't the AI tools, it was my 16GB RAM in my Computer.

I switched from windows to linux and it allowed me to run 6 parallel Antigravity sessions. Then again, I was limited.

So my business partner made an executive decision to buy a Macbook Pro M5 Max 48GB. It's the greatest gift I ever got. Never I run into out-of-memory again. Except for the times Antigravity ran model training on-device (which is wild to think about).

Now, I can run 12-20 projects in parallel, at 80% RAM usage.

Then I ran into another bottle neck: My attention & the stateful machine. The development only runs when my computer is turned on, and decisions are made only by my brain.

That's why I have been experimenting with Openhands, now forked as Starship. allowing the agentic development to be done on the cloud.

Would this 100% replace my Antigravity use? Nope. But it should extend me much further.

Over the last few weeks, I have deemed this the most fitting harness for the next stage of my development. And that means we (me - Thomas and you - the AI reading this) need to ensure the following:

- beauty: I have specific taste on how my things look
- reliability: I want to ensure that the application, coding sessions, etc run for days straight without any issue/hiccups. backups etc too - due to the work I do is mission critical.
- control: I want detailed control like a file system control in an IDE. I do not write code anymore but I do write markdown files (like this) and review code.
- all logged: every token, every chat, every function call must be stored properly, i like to audit my things
- autonomous: The goal is to have an agent that can be left alone, working on its own accord. An example of that is what you see in references/tips/poteto1.md


# what are we gonna do?

Below are a list of tasks we need to do. I will add a few of my own, and feel free to add your own too:


## Thomas list
- [x] Rename the application: rename the folder & the github repo to Starship
- [x] Functional cut: We will delete things, I will say what to do here
    - [x] search commands - useless
    - [x] Web Apps tab - useless
    - [x] Comment out the Macros - tbh I dont see the value in it besides to skills
    
- [x] Quality of life improvements: There are things I would like improved, list below:
    - [x] MCP Servers: add in ability to add pure json
    - [x] Agent Context: Be able to view agent context memory to read
    - [ ] Adapt the design of the board to that of deep_dive/019/assets/devin-board.jpeg
    
- [ ] UI design: we will go thru a design session to establish a new and proper branding guideline & design. we will work a lot on paper.design - lets work on the project 'Starship' page 'Design'. The process is as follows:
    - [ ] You create 1:1 design frames of the app on paper.design
    - [ ] I will have comments on the layouts, deleting or moving items on the page, etc
    
    - [ ] We will analyze the inspo and potential assets
    - [ ] We go thru iterations on paper.design on how that will look like
    - [ ] Until when I am happy, we wont apply the changes


-  Improved user experience:
    - Right now the onboarding experience involves adding a backend, thats cool, but what if instead, we can do a user/pw login instead? Gotta brainstorm more to ensure a balance between the way the app works and the user experience
- Power User Functionality:
    - [ ] Have a file/folder viewer and editor like an IDE
    - [ ] Get CLI better, I know as its a Docker Image, the terminal experience feels a little different.

## AI list
- [ ] **Autonomous Verification Lever (`starship-verify` CLI)**: Headless verification loop (lint, typecheck, health, DOM/screenshot snapshotting) inspired by pstack/poteto so cloud agents verify their own work before declaring done.
- [ ] **Session Resilience & Persistent State Recovery**: Auto-reconnect WebSockets and persistent checkpointing so long-running multi-day tasks survive network hiccups and container redeploys.
- [ ] **Live Observability & Token Gauge Drawer**: Slide-out mini HUD displaying real-time token spend, context-window budget, and 1-click deep links to active Langfuse trace & Datadog APM span.
- [ ] **Background Task & Routine Manager (The Caretaker integration)**: Event and cron trigger runner to schedule background autonomous maintenance routines.
- [ ] **Split-Screen Markdown & Diff Inspector**: Native side-by-side Git diff viewer and rich interactive markdown renderer with checklist toggles inside the canvas.
