# Milestone 1: Production team workflow

Status: approved; Work Packages 1-4 complete; Work Package 5 implementation and local verification complete
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

### WP2 - Protocol and durable-state foundation

Primary invariant: project, profile, and member metadata survive restart and
synchronize atomically.

Non-goals: final board UI and automatic routing.

Verification: migration from the current schema, bounded document validation,
optimistic-version conflicts, cold/warm synchronization, and backward defaults.

Completion: schemas, SQLite persistence, and live project frames are
review-clean.

WP2 result (2026-08-06): complete and merged in PR #3 at
`6a7eae59490edbef761690c2a154daa405c152d5`. The
protocol now defines bounded project documents, reusable team profiles,
member accent/billing metadata, project change-log entries, and project/profile
sync frames. SQLite persists one versioned project per room, versioned global
team profiles, and additive member metadata. Project/profile saves reject stale
versions atomically; projects participate in warm and cold room sync and live
fanout. Profile spawning, board mutations/UI, and automatic routing remain in
their later work packages.

Verification evidence:

- Protocol and Switchboard TypeScript builds passed.
- Protocol, store, server, and affected web-state regression suites passed
  411/411 tests with two existing platform skips.
- Focused daemon project-frame verification passed 1/1.
- Migration coverage removes the new member columns from a populated current
  database, reopens it, and proves the honest `billing_mode: unknown` default.
- Persistence coverage closes and reopens SQLite, proving project, profile,
  accent, and billing state survive; stale project and profile versions fail.
- WebSocket coverage proves profile listing, project cold hydration, and a live
  subsequent project version on the shared protocol.
- The broader daemon suite reproduced the inherited Windows artifact-snapshot
  exceptions recorded under WP1; no WP2 assertion remains failing.

### WP3 - Team profiles and editable member configuration

Primary invariant: a profile reproduces its required team without credentials,
sessions, working directories, or arbitrary ACP commands.

Non-goals: applying or replacing a profile on an already-populated channel.

Verification: profile CRUD, save-current-team, live purpose/accent/billing edits,
provider validation, partial-spawn failure, retry, and mobile channel creation.

Completion: a new channel can select a profile and visibly reach team-ready
state.

WP3 result (2026-08-06): complete and merged in PR #4 at
`d98f4d9cd781ba4956b7b353b652917d4f5f813b`. Team
profiles can be created, updated from a current channel, listed, deleted, and
selected during channel creation. One channel working directory is applied to
every profile member. Required-member failures remain visible in durable room
state with bounded Retry controls; readiness stays false until every required
member is live. Existing agents can change purpose, accent, and declared billing
mode without respawning, and the saved purpose is included in the next roster
briefing. Profiles contain no credentials, sessions, working directories, or
custom ACP commands; unavailable harnesses/providers fail before persistence.

Verification evidence:

- Protocol, Switchboard, and production web builds passed.
- Protocol schemas passed 196/196 tests; Switchboard server/API passed 108/108
  with two existing platform skips; store persistence passed 86/86.
- The focused partial-failure/retry, unavailable-provider, and live-metadata
  daemon regressions passed 3/3. A broader daemon run again exposed only the
  inherited Windows artifact-snapshot exceptions recorded under WP1 after the
  new assertion wording was corrected.
- The complete web source suite passed 437/437 tests.
- An isolated 320px browser journey created a two-agent channel from a saved
  profile, showed both members, and reported `Team ready`; the focused dark/light
  create-dialog accessibility gate also passed.
- Production port 8137 and `C:\Users\pbirc\.codor` were not modified or restarted.

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

WP4 result (2026-08-06): complete and merged in PR #5 at
`91e0170b171ba923d414939ebd1d0b90c9f1eae5`. One
versioned project per channel is now mutable through a server-side authorization
and transition reducer. Owners can override, coordinators control structure,
assignees submit or block, and every listed gatekeeper must approve before a
write task completes. Dependencies unlock only after their prerequisites are
done; revisions, evidence, and completed work remain in the durable document.
The desktop/mobile Board modal and `codor project` CLI commands mutate and read
that same synchronized state. Assignment delivery and automatic continuation
remain intentionally deferred to WP5.

Verification evidence:

- Protocol validation passed 210/210 tests; the focused Switchboard project,
  authorization, and server suites passed 119/119 with two existing platform
  skips.
- The complete web source suite passed 440/440 tests, and production builds for
  Protocol, Switchboard, CLI, and Web completed successfully.
- A focused CLI integration initialized a project, added gated work, submitted
  evidence, approved and closed it, then read the completed durable document
  through `codor project show`.
- An isolated browser journey created the board, added a milestone and gated
  task, submitted and approved it, completed the project, proved reload
  persistence, and reopened the completed board at a 320px mobile viewport.
- The full CLI suite passed 217 WP4/unrelated tests with 18 skips but retained
  five inherited POSIX launcher-fixture failures on Windows already covered by
  the WP1 portability boundary; no WP4 CLI assertion failed.
- Production port 8137 and `C:\Users\pbirc\.codor` were not modified or
  restarted.

### WP5 - Assignment dispatch and guarded autopilot

Primary invariant: assigned work advances without remembered mentions, while
an unchanged plan cannot loop indefinitely.

Non-goals: unrestricted scheduling and bypassing existing brakes.

Verification: exactly-once dispatch across restart, mentionless worker and
collaboration returns, reject/revision flow, dependency release, one-nudge
latch, human/block stops, and brake holds.

Completion: a planner can assign, review, revise, and close a multi-agent
project without manual tagging.

WP5 result (2026-08-06): implementation and local verification complete.
Ready assigned tasks now create one durable, task-linked delivery through the
existing inbox WAL. Turn admission marks work in progress; successful terminal
results attach message evidence, dispatch every configured review gate, and
return to the coordinator without requiring an agent-authored mention. Rejected
revisions and newly unlocked assigned dependencies dispatch once. Project-linked
collaboration rounds return their barrier aggregate to the original assignee
before review, while ordinary non-project routing remains unchanged.

Guarded continuation is stored in the project document and uses ordinary
deliveries, so the existing turn/spend brakes remain authoritative. A
coordinator receives at most one nudge for an unchanged actionable board; a
second non-advancing response disables guarded autopilot and surfaces attention.
Blocked, inactive, completed, or still-agent-active work does not self-loop.
Project task prompts explicitly prohibit hidden Goal/CreateGoal continuation
state and keep long-running truth in the board, Git, and visible messages.

Verification evidence:

- Protocol and Switchboard TypeScript builds passed.
- Protocol schema, project reducer, and store suites passed 286/286 tests.
- The focused guarded-project daemon suite passed 5/5: restart-safe exactly-once
  assignment, mentionless result/review return, rejection and revision
  redispatch, dependency release, one-nudge/two-response pause, exact failure
  blocking, configured brake hold, and task-linked collaboration-barrier return.
- The broader affected run passed 561 tests. Its only eight failures were the
  same inherited Windows artifact-snapshot path exceptions recorded under WP1;
  no WP5 assertion failed.
- No second scheduler or hidden agent continuation engine was added; dispatch,
  recovery, and brakes reuse the existing SQLite delivery lifecycle.
- Production port 8137 and `C:\Users\pbirc\.codor` were not modified or restarted.

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
