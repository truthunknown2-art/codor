# Milestone 2: Pro steering bridge

Status: approved for implementation by the owner on 2026-08-10
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
