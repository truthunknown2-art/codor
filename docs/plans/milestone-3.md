# Milestone 3: Project Board visual command center

Status: complete; WP1-WP4 accepted in production
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

Result: complete. Milestones show real completed/total counts, planning and Pro
controls are behind one disclosure, and mobile provides tested Now, Board, and
Milestones views over the same canonical state.

### WP4 - Integration acceptance and safe release

Primary invariant: visual redesign cannot alter dispatch, review, evidence,
authorization, or durable Board state.

Non-goals: unrelated room/chat redesign and production data mutation for QA.

Targeted verification: focused Board E2E, full web unit/build gates, complete
hosted CI/browser suite, immutable release hashes, all-idle rollback-safe update,
and real TruthForge desktop/mobile smoke.

Completion: production serves the redesigned Board with all rooms and projects
preserved, zero pending work caused by cutover, and exact release evidence.

Release evidence: feature PR #20 merged as
`5d7c8c07fb0ab915c9574934d36280631f82bd6f`; hosted CI runs `31535599019`
and `31535621250` passed the complete build, workspace-test, browser-suite,
audit, and installer gates. Release PR #21 merged as
`e1cd5e6466d96c5328a04bbd36035d465e77e92a`; release-candidate CI runs
`31537224572` and `31537227863` passed, and release run `31538481237` published
`v0.10.19` after the complete release gate. The immutable TGZ SHA-256 is
`f18a30d77fd968d74e042f30d0637eac913ac563481dde30fd4ee2e29991a5b2`; the
VSIX SHA-256 is
`9e379278e86ed47161650e625a7efc429de941634238925c41830fbbed8dd2f8`.

Result: complete. The all-idle updater installed `v0.10.19` from the fork at the
exact release SHA with a pre-swap SQLite backup and healthy rollback state. Port
`8137` and the Tailscale HTTPS proxy returned HTTP 200. TruthForge retained 22
members, 5,463 messages, Board v206 with 7 milestones and 40 tasks; Araeyas
Laptop retained 14 members, 7,380 messages, Board v11 with 2 milestones and 5
tasks. No member was running, queued, awaiting input, or custody uncertain; no
delivery was queued or delivering; no interaction was pending or answered.
Hard-refresh production smoke rendered the command header, progress, Working
now, Agent activity, all workflow columns, milestones, and planning tools.
