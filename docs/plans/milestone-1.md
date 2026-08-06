# Milestone 1: Production team workflow

Status: approved; Work Package 1 complete with inherited Windows test exceptions recorded below
Upstream baseline: `rjx18/codor@3b587c75cc02a9580ffbdaaafc217fc4d12d8cf5`
Fork: `truthunknown2-art/codor`
Production boundary: port `8137` and `C:\Users\pbirc\.codor` must remain untouched until final acceptance.
Development boundary: port `8138` and `C:\Users\pbirc\.codor-dev`.

## Goal and release gate

Make Codor a durable project-team workspace: one canonical board per channel,
board-driven dispatch, guarded coordinator continuation, reusable team profiles,
safe recovery, consistent identity colours, honest cost labelling, stronger Git
visibility, and a rollback-safe Windows updater.

The release is accepted only when one real coordinator/coder/reviewer/tester
channel completes a project without manual handoff mentions, preserves review
and Git evidence, safely replaces one agent, settles fully idle, and passes
desktop, mobile, restart, update, and rollback checks.

## Locked product decisions

- One active project per channel; completed history remains visible.
- Assigning a board task dispatches it. Chat mentions remain available but are
  not the workflow engine.
- The owner may override anything. The coordinator plans and assigns, assignees
  submit or block, and all configured gatekeepers must approve implementation
  tasks.
- Guarded autopilot sends at most one coordinator nudge per unchanged board
  version. Existing turn and spend brakes remain authoritative.
- Crashed active turns fail closed and are never replayed automatically.
- Subscription-backed agents show a zero Codor charge and clearly advisory
  API-equivalent estimates, never an exact bill.
- Git remains authoritative for code and artifacts; Codor's SQLite project
  document is authoritative for orchestration and references Git evidence.
- Existing channels retain upstream routing unless guarded project mode is
  explicitly enabled.

## Work packages

### WP1 - Fork and isolated development baseline

Primary invariant: development cannot modify or restart production Codor.

Non-goals: feature code and production-data migration.

Verification: clean upstream install/build/test baseline; development service
answers on port 8138 using `.codor-dev`; production remains healthy on 8137.

Completion: baseline PR records exact SHA, remotes, checks, dev smoke result,
and unchanged production health.

WP1 result (2026-08-06): complete. `origin` is
`https://github.com/truthunknown2-art/codor.git`; `upstream` is
`https://github.com/rjx18/codor.git`; both baseline branches and the clone began
at `3b587c75cc02a9580ffbdaaafc217fc4d12d8cf5`. The baseline contains only this
plan and minimal Windows portability corrections discovered while exercising
the upstream checks: ACP fixture resolution, Antigravity interrupt
classification, Cursor's use of the repository-standard `cross-spawn`, and the
web E2E runner's pnpm launch path. Existing Linux CI is enabled on the fork, with fork
guards preventing this repository from invoking upstream Cloudflare deployment
or npm publication jobs. No planned product feature has started.

Verification evidence:

- All 20 buildable workspace projects compiled successfully with the
  repository-pinned pnpm 10.9.0.
- Focused adapter suites passed: ACP 15/15, Antigravity 10/10, and Cursor 19/19.
- Fork CI run `31125479805` passed the Linux build, serialized workspace tests,
  complete browser suite, and release/license audits on `2ef5157`. GitHub then
  failed to acquire a second hosted runner for installer packaging and returned
  an internal server error after 15 minutes. Installer packaging now runs in
  the already-verified job, avoiding that unnecessary runner reacquisition.
- The complete upstream `pnpm test:all` is not green on this Windows host.
  Relay-worker's local Cloudflare emulator produced 28 generic internal errors.
  A separate run excluding relay-worker reached Switchboard and exposed 17
  inherited Windows-assumption failures covering POSIX executable/mode checks,
  artifact paths, and temporary-directory file locks. These are baseline test
  portability defects, not failures of the isolated local server smoke test.
- The Windows E2E runner now launches pnpm correctly. Its 41 serial,
  fresh-daemon browser specs exceeded a bounded 20-minute run while starting
  `room36-computer-ui.e2e.spec.ts`; termination caused an output-pipe error, so
  no aggregate browser verdict is claimed.
- The development server used `C:\Users\pbirc\.codor-dev`, listened only on
  `127.0.0.1:8138`, and returned HTTP 200 from PID 43324. At the same time,
  production returned HTTP 200 on port 8137 from PID 47468. After stopping only
  PID 43324, port 8138 closed and production remained HTTP 200 on PID 47468.
- No production runtime, room, agent, token, database, Scheduled Task, or
  Tailscale configuration was read, copied, restarted, or modified.

WP2 is the next unblocked package and has not started.

### WP2 - Protocol and durable-state foundation

Primary invariant: project, profile, and member metadata survive restart and
synchronize atomically.

Non-goals: final board UI and automatic routing.

Verification: migration from the current schema, bounded document validation,
optimistic-version conflicts, cold/warm synchronization, and backward defaults.

Completion: schemas, SQLite persistence, and live project frames are
review-clean.

### WP3 - Team profiles and editable member configuration

Primary invariant: a profile reproduces its required team without credentials,
sessions, working directories, or arbitrary ACP commands.

Non-goals: applying or replacing a profile on an already-populated channel.

Verification: profile CRUD, save-current-team, live purpose/accent/billing edits,
provider validation, partial-spawn failure, retry, and mobile channel creation.

Completion: a new channel can select a profile and visibly reach team-ready
state.

### WP4 - Canonical project board

Primary invariant: the room-level project document, not transient per-agent CLI
task projections, is authoritative.

Non-goals: drag-and-drop Kanban, multiple active projects, and external tracker
synchronization.

Verification: authorization, state transitions, dependencies, review gates,
evidence, retained completed work, and version conflicts through both UI and
CLI.

Completion: the responsive header Board view and `codor project` commands use
the same live state.

### WP5 - Assignment dispatch and guarded autopilot

Primary invariant: assigned work advances without remembered mentions, while
an unchanged plan cannot loop indefinitely.

Non-goals: unrestricted scheduling and bypassing existing brakes.

Verification: exactly-once dispatch across restart, mentionless worker and
collaboration returns, reject/revision flow, dependency release, one-nudge
latch, human/block stops, and brake holds.

Completion: a planner can assign, review, revise, and close a multi-agent
project without manual tagging.

### WP6 - Context continuity and failure recovery

Primary invariant: failures preserve evidence and uncertain active actions are
not replayed automatically.

Non-goals: claiming unsupported ACP session restoration.

Verification: native revive, one bounded idle restart, active failure, failed
replacement, replacement brief, dead-assignee blocking, and restart from a
copied database.

Completion: every dead or unreachable state explains the cause and offers only
safe supported actions.

### WP7 - Identity, billing, and Git clarity

Primary invariant: identity, money, and repository claims are consistent and
truthfully labelled.

Non-goals: GitHub credential storage, automatic repository/worktree creation,
and provider-billing inference from tokens.

Verification: accessible colours in both themes and responsive surfaces, mixed
billing modes, historical repricing, extended Git status, commit resolution,
and concurrent-writer exclusion.

Completion: agent colours match everywhere, subscription estimates are never
called exact, and board evidence names verified Git state.

### WP8 - Safe updater, integration acceptance, and cutover

Primary invariant: a failed Windows update restores the previously healthy
runtime and database.

Non-goals: unattended recurring updates.

Verification: active-work refusal, staging interruption, Windows file locks,
failed-restart rollback, successful health/Tailscale continuity, full
`pnpm test:all`, and the release-gate workflow.

Completion: publish a SHA-pinned fork release, prove rollback on a copied
production database, then cut over only while every production agent is idle.

## Execution rules

- Work packages are dependency ordered. Implement only the next unblocked
  package, run its narrowest checks, update this document, and stop.
- Prefer one PR per package. Each PR records exact SHA, verification evidence,
  status, and next action.
- Keep the previous completed package passing; do not advertise incomplete
  capabilities.
- After WP8 is review-clean, perform a separate integration review and the full
  acceptance gate before production cutover.

## Explicit exclusions

No automatic GitHub repository, PR, or worktree creation; no external task
tracker; no custom context summarizer; no active-turn crash replay; and no
production mutation before final acceptance.
