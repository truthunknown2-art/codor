# Milestone 2: Pro steering bridge

Status: complete and running in production on 2026-08-10
Baseline: `truthunknown2-art/codor@55a9068`
Production boundary: port `8137` and `C:\Users\pbirc\.codor` remain untouched until release acceptance.

## Goal and release gate

Let a personal ChatGPT Pro conversation read a bounded Git-friendly project
snapshot and return a structured steering proposal that Codor can reconcile
into its canonical Board without allowing stale input to rewrite active or
completed work.

The release is accepted when TruthForge can export its Board, import a Pro
proposal through both CLI and the Board UI, atomically add or update only safe
future work, reject stale or unsafe proposals without partial mutation, and
continue normal board dispatch afterward.

## Locked decisions

- Codor's SQLite Board remains authoritative for orchestration. Git files are
  review packets and proposals, not a second task database.
- Personal ChatGPT Pro is read/fetch-only for custom MCP and GitHub access, so
  this milestone does not pretend Pro is a wakeable or write-capable agent.
- Pro proposals are versioned JSON. Markdown remains a presentation format,
  not an input parser.
- Imports are additive. They never delete milestones or tasks.
- Existing `in_progress`, `in_review`, `blocked`, or `done` tasks are immutable
  through the bridge. Existing active/completed milestone titles are immutable.
- A proposal must be based on the current Board version. Stale proposals fail
  before any state is written.
- No automatic Git commit, push, pull, or repository creation is introduced.

## Work packages

### WP1 - Atomic steering contract

Primary invariant: one accepted proposal becomes one versioned Board mutation;
one rejected proposal changes nothing.

Non-goals: Git filesystem I/O, MCP hosting, and UI.

Verification: protocol parsing; stale-version rejection; proposal-version
replay rejection; immutable-task rejection; safe backlog edits; additive
milestone/task import; member validation; persisted steering provenance.

Completion: protocol and switchboard focused suites pass with the new atomic
mutation covered.

WP1 result (2026-08-10): complete. The protocol now carries a bounded
`codor.pro-steering.v1` proposal, one atomic `reconcile_plan` mutation, and
persisted proposal provenance. Reconciliation is additive, rejects stale Board
versions and replayed proposal versions, and refuses to modify active, blocked,
reviewing, or completed tasks. Focused protocol verification passed 200/200;
focused switchboard project verification passed 5/5; both affected TypeScript
packages compile once their normal workspace dependencies are built.

### WP2 - CLI and Board UI bridge

Primary invariant: CLI and browser use the same proposal schema and atomic
server mutation.

Non-goals: background polling, automatic commits/pushes, and browser automation
against ChatGPT.

Verification: deterministic snapshot export with member handles; JSON file
import; malformed input feedback; owner/coordinator-only UI; mobile layout; UI
tests for copy/download and import.

Completion: a Pro-ready snapshot can be exported and a proposal can be safely
previewed/applied from desktop, mobile, or CLI.

WP2 result (2026-08-10): complete. `codor project export` now emits or writes a
deterministic credential-free packet containing the live Board, member handles,
evidence, and a ready-to-edit steering template. `codor project import` parses
that template, resolves current handles, and sends the same atomic mutation used
by the Board's new Pro steering panel. The responsive Board supports copying the
packet, validating a pasted proposal, and applying it with stale-version
feedback. Shared bridge tests passed 2/2, the full protocol schema file passed
200/200, CLI/web/switchboard dependency builds passed, and the focused desktop,
reload, and 320px mobile Board browser test passed 1/1 on isolated ports
38137-38140.

### WP3 - Release and TruthForge acceptance

Primary invariant: cutover preserves every existing room, member, delivery,
Board task, and production data record.

Non-goals: Business/Enterprise full-MCP write actions and invisible Pro
background execution.

Verification: full repository checks and hosted CI; isolated upgrade smoke;
production all-idle check; SQLite backup; rollback-safe release cutover;
TruthForge export/import proof using a no-op or additive test proposal that does
not disturb active work.

Completion: the released SHA runs on port `8137`, TruthForge has an exported
review packet and steering template in Git, and its planner purpose names the
new bridge and Board safety rules.

WP3 result (2026-08-10): complete. PR #13 merged the final Windows updater
repair as `f5f2f9f8508e6cabf5e4bbe0ad0222d8fd28fc56`; both binding PR CI runs
(`31439963488` and `31439966294`) passed, including 262/262 browser tests, and
release run `31441904751` passed the complete release gate. The immutable
v0.10.14 release was pinned to that merge SHA. Its TGZ SHA-256 is
`31b21c5c2bf8f96944756a65a008ba1d56d5cf7f686deeba1a647c2c91a47289` and
its VSIX SHA-256 is
`51933242e47a940c890a783ad0ef97e30cfc9b5e33b3e02933e140afec7ecc14`.

Production was cut over only at an all-idle boundary. The consistent SQLite
backup passed `PRAGMA quick_check` and has SHA-256
`1C3A21159D76407621D49C96DA7A888CFFDF187851FCB80A231C06D78F18C4DA`.
The first manual bootstrap deliberately rolled back healthy when its temporary
`Codor Update` task was absent; production returned to v0.10.13 with HTTP 200
and the preserved database. Repeating the same verified swap through the
normal temporary-task lifecycle succeeded. Production now reports v0.10.14,
SHA `f5f2f9f8508e6cabf5e4bbe0ad0222d8fd28fc56`, HTTP 200 on port 8137,
`PRAGMA quick_check = ok`, all existing rooms present, zero pending deliveries
or interactions, and the existing Tailscale HTTPS route still proxies to 8137.

TruthForge accepted actual Pro proposal 3 from Board v76 through the browser
preview and atomic apply path. The proposal added ten future tasks, revised
four future backlog tasks, and changed no done, active, blocked, or in-review
work. Guarded autopilot then advanced the canonical Board to v78 with 30 tasks.
The credential-free Board packet, validated proposal, designated Pro-thread
workflow, and planner purpose are persisted in `truthunknown2-art/truthforge`
through `e94a97de838b747a10aa403ca84d758c816e38b6`; the resumed planner delivery
was posted as TruthForge message `#4795` without a Kimi or fictional `@pro`
recipient.
