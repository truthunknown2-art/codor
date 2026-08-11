# Milestone 3: Project Board visual command center

Status: approved; WP1-WP2 complete, WP3 in progress
Baseline: `truthunknown2-art/codor@5d46957406b0b5e392fe92d5813de5054f59016a` (`v0.10.18`)
Production boundary: port `8137` and `C:\Users\pbirc\.codor` remain untouched until release acceptance.

## Goal and release gate

Turn the canonical Project Board into a fast, Trello-style command center that
shows current work, required human action, live agent state, workflow columns,
milestone progress, and compact expandable task detail without changing any
dispatch, review, evidence, authorization, or persistence behavior.

The release is accepted when the existing Board workflow remains green on
desktop and mobile, the TruthForge-sized fixture is readable without a blank
screen or horizontal page overflow, retired members remain historical-only,
and the new status-column view passes keyboard, contrast, and live-state checks.

## Locked decisions

- This milestone is a web presentation change over the existing canonical
  Board model; it adds no project schema, migration, or orchestration mutation.
- Task transitions remain explicit controls. Drag-and-drop is out of scope
  because moving a task can dispatch work or trigger review gates.
- Progress uses real completed/total task counts. No story points or synthetic
  elapsed-time values are introduced.
- Board task state and live agent state remain visibly distinct.
- Retired members remain available for historical attribution but never for
  new assignments.
- Pro steering and task creation remain available but move behind progressive
  disclosure so daily monitoring stays primary.
- Desktop and mobile render the same canonical Board data.

## Work packages

### WP1 - Dashboard shell and command center

Primary invariant: the owner can identify project health, active work, review,
human blockers, coordinator, and autopilot state before scrolling.

Non-goals: status columns, task-detail redesign, and new backend data.

Targeted verification: focused web build; existing Board browser test; desktop
snapshot showing the full-screen header, Working now cards, and agent activity.

Completion: the existing actions retain their permissions and mutations while
the Board opens as a responsive full-screen command center.

Result: complete. The Board now opens as a full-screen responsive command
center with project health, real task progress, coordinator/autopilot state,
blocked-aware Working now cards, and live Agent activity. The focused production
build and canonical desktop/mobile Board workflow pass.

### WP2 - Status columns and compact task cards

Primary invariant: every canonical task is visible in exactly one workflow
column and every consequential transition still uses its existing mutation.

Non-goals: drag-and-drop, task weights, and new filters beyond milestone/status.

Targeted verification: status-count assertions; task transition/review flow;
removed-member attribution; no active assignment option for retired members.

Completion: Backlog, Ready, In progress, In review, Blocked, and Done are
scannable columns, with compact summaries and expandable governance detail.

Result: complete. Every task renders in exactly one status column; cards keep
their existing assignment, submit, block, and review mutations while governance
detail is collapsed by default. The focused build and canonical workflow test
pass with explicit Ready, In review, and Done column assertions.

### WP3 - Milestones, advanced controls, and mobile views

Primary invariant: mobile exposes Now, Board, and Milestones without hiding any
canonical task or authorized action.

Non-goals: a separate mobile data model and automatic Pro interaction.

Targeted verification: 390px mobile Board/Now/Milestones navigation; milestone
progress counts; Pro export/import; add milestone/task forms.

Completion: milestone progress is compact and accurate, planning tools are
progressively disclosed, and mobile uses large touch targets without desktop
column compression.

### WP4 - Integration acceptance and safe release

Primary invariant: visual redesign cannot alter dispatch, review, evidence,
authorization, or durable Board state.

Non-goals: unrelated room/chat redesign and production data mutation for QA.

Targeted verification: focused Board E2E, full web unit/build gates, complete
hosted CI/browser suite, immutable release hashes, all-idle rollback-safe update,
and real TruthForge desktop/mobile smoke.

Completion: production serves the redesigned Board with all rooms and projects
preserved, zero pending work caused by cutover, and exact release evidence.
