import type { Member, ProjectDocument, ProjectMutation } from '@codor/protocol';
import { describe, expect, it } from 'vitest';

import { applyProjectMutation } from './project.js';

const OWNER = '01J00000000000000000000000';
const PLANNER = '01J00000000000000000000001';
const CODER = '01J00000000000000000000002';
const REVIEWER = '01J00000000000000000000003';
const TS = '2026-08-07T00:00:00.000Z';

const members: Record<string, Member> = {
  [OWNER]: { id: OWNER, kind: 'human', handle: 'owner', display_name: 'Owner', role: 'owner', conventions_sent: false, misaddressed: false, roster_stale: false },
  [PLANNER]: { id: PLANNER, kind: 'agent', handle: 'planner', display_name: 'Planner', harness: 'fake', state: 'idle', conventions_sent: false, misaddressed: false, roster_stale: false },
  [CODER]: { id: CODER, kind: 'agent', handle: 'coder', display_name: 'Coder', harness: 'fake', state: 'idle', conventions_sent: false, misaddressed: false, roster_stale: false },
  [REVIEWER]: { id: REVIEWER, kind: 'agent', handle: 'reviewer', display_name: 'Reviewer', harness: 'fake', state: 'idle', conventions_sent: false, misaddressed: false, roster_stale: false },
};

function mutate(
  current: ProjectDocument | undefined,
  actor: string,
  mutation: ProjectMutation,
): ProjectDocument {
  const input = applyProjectMutation({
    room: 'eng', actor: members[actor]!, current,
    member: (id) => members[id], messageExists: (id) => id === 7,
    commitExists: (sha) => sha === 'a'.repeat(40),
  }, mutation);
  return { ...input, version: (current?.version ?? 0) + 1, created_ts: TS, updated_ts: TS };
}

function initialized(): ProjectDocument {
  return mutate(undefined, PLANNER, {
    op: 'init', expected_version: 0, title: 'Ship', objective: 'Finish safely',
    coordinator: PLANNER, guarded_autopilot: false,
  });
}

describe('canonical project mutations', () => {
  it('accepts only commit evidence resolved by the room', () => {
    let project = initialized();
    project = mutate(project, PLANNER, { op: 'add_milestone', expected_version: 1, id: 'm1', title: 'Build' });
    project = mutate(project, PLANNER, {
      op: 'add_task', expected_version: 2, id: 't1', milestone_id: 'm1', title: 'Code', description: 'Implement',
      acceptance_criteria: ['Pass'], dependencies: [], assignee: CODER,
      gatekeepers: [REVIEWER], workspace_mode: 'write',
    });
    expect(() => mutate(project, CODER, {
      op: 'submit', expected_version: 3, task_id: 't1', evidence: [{ type: 'commit', sha: 'b'.repeat(40) }],
    })).toThrow('does not resolve in a known room working directory');
    expect(mutate(project, CODER, {
      op: 'submit', expected_version: 3, task_id: 't1', evidence: [{ type: 'commit', sha: 'a'.repeat(40) }],
    }).tasks[0]?.evidence).toContainEqual({ type: 'commit', sha: 'a'.repeat(40) });
  });

  it('keeps structure coordinator-owned and rejects unsafe write tasks and dependency cycles', () => {
    let project = initialized();
    project = mutate(project, PLANNER, {
      op: 'add_milestone', expected_version: project.version, id: 'm1', title: 'Build',
    });
    expect(() => mutate(project, PLANNER, {
      op: 'add_task', expected_version: project.version, id: 't1', milestone_id: 'm1',
      title: 'Code', description: 'Implement', acceptance_criteria: ['Tests pass'], dependencies: [],
      gatekeepers: [], workspace_mode: 'write',
    })).toThrow('requires at least one gatekeeper');
    project = mutate(project, PLANNER, {
      op: 'add_task', expected_version: project.version, id: 't1', milestone_id: 'm1',
      title: 'Code', description: 'Implement', acceptance_criteria: ['Tests pass'], dependencies: [],
      assignee: CODER, gatekeepers: [REVIEWER], workspace_mode: 'write',
    });
    expect(project.tasks[0]).toMatchObject({ status: 'ready', assignee: CODER });
    expect(() => mutate(project, CODER, {
      op: 'add_milestone', expected_version: project.version, id: 'hack', title: 'Hack',
    })).toThrow('only the coordinator or owner');
    expect(() => mutate(project, PLANNER, {
      op: 'edit_task', expected_version: project.version, task_id: 't1', dependencies: ['t1'],
    })).toThrow('dependency cycle');
  });

  it('retains evidence and revisions while gates unlock dependent work', () => {
    let project = initialized();
    project = mutate(project, PLANNER, { op: 'add_milestone', expected_version: 1, id: 'm1', title: 'Build' });
    project = mutate(project, PLANNER, {
      op: 'add_task', expected_version: 2, id: 't1', milestone_id: 'm1', title: 'Code', description: 'Implement',
      acceptance_criteria: ['Tests pass'], dependencies: [], assignee: CODER,
      gatekeepers: [REVIEWER], workspace_mode: 'write',
    });
    project = mutate(project, PLANNER, {
      op: 'add_task', expected_version: 3, id: 't2', milestone_id: 'm1', title: 'Docs', description: 'Document',
      acceptance_criteria: ['Clear'], dependencies: ['t1'], gatekeepers: [], workspace_mode: 'read_only',
    });
    expect(project.tasks[1]?.status).toBe('backlog');
    project = mutate(project, CODER, {
      op: 'submit', expected_version: 4, task_id: 't1', evidence: [{ type: 'message', message_id: 7 }],
    });
    project = mutate(project, REVIEWER, {
      op: 'review', expected_version: 5, task_id: 't1', decision: 'changes_requested', note: 'Fix it',
    });
    expect(project.tasks[0]).toMatchObject({ status: 'ready', revision: 1 });
    project = mutate(project, CODER, {
      op: 'submit', expected_version: 6, task_id: 't1', evidence: [{ type: 'check', name: 'tests', result: 'passed' }],
    });
    project = mutate(project, REVIEWER, {
      op: 'review', expected_version: 7, task_id: 't1', decision: 'approved',
    });
    expect(project.tasks[0]).toMatchObject({ status: 'done', revision: 1 });
    expect(project.tasks[0]?.reviews).toHaveLength(2);
    expect(project.tasks[1]?.status).toBe('ready');
  });

  it('enforces assignee, gatekeeper, version, and completion authority', () => {
    let project = initialized();
    project = mutate(project, PLANNER, { op: 'add_milestone', expected_version: 1, id: 'm1', title: 'Build' });
    project = mutate(project, PLANNER, {
      op: 'add_task', expected_version: 2, id: 't1', milestone_id: 'm1', title: 'Code', description: 'Implement',
      acceptance_criteria: ['Pass'], dependencies: [], assignee: CODER,
      gatekeepers: [REVIEWER], workspace_mode: 'write',
    });
    expect(() => mutate(project, REVIEWER, {
      op: 'submit', expected_version: 3, task_id: 't1', evidence: [{ type: 'note', text: 'no' }],
    })).toThrow('only the assignee or owner');
    expect(() => mutate(project, PLANNER, {
      op: 'set_status', expected_version: 3, status: 'completed',
    })).toThrow('all project tasks must be done');
    expect(() => mutate(project, PLANNER, {
      op: 'set_autopilot', expected_version: 2, enabled: true,
    })).toThrow('version conflict');
    expect(mutate(project, OWNER, {
      op: 'set_status', expected_version: 3, status: 'completed',
    }).status).toBe('completed');
  });

  it('keeps completed task participants as history after they leave the room', () => {
    let project = initialized();
    project = mutate(project, PLANNER, { op: 'add_milestone', expected_version: 1, id: 'm1', title: 'Build' });
    project = mutate(project, PLANNER, {
      op: 'add_task', expected_version: 2, id: 'old', milestone_id: 'm1', title: 'Past work', description: 'Done',
      acceptance_criteria: ['Pass'], dependencies: [], assignee: CODER,
      gatekeepers: [REVIEWER], workspace_mode: 'write',
    });
    project = mutate(project, CODER, {
      op: 'submit', expected_version: 3, task_id: 'old', evidence: [{ type: 'note', text: 'complete' }],
    });
    project = mutate(project, REVIEWER, {
      op: 'review', expected_version: 4, task_id: 'old', decision: 'approved',
    });
    members[CODER] = { ...members[CODER]!, removed_ts: TS };
    try {
      expect(mutate(project, PLANNER, {
        op: 'add_task', expected_version: 5, id: 'new', milestone_id: 'm1', title: 'Current work',
        description: 'Continue', acceptance_criteria: ['Pass'], dependencies: [],
        gatekeepers: [], workspace_mode: 'read_only',
      }).tasks).toMatchObject([
        { id: 'old', status: 'done', assignee: CODER },
        { id: 'new', status: 'ready' },
      ]);
    } finally {
      delete members[CODER]!.removed_ts;
    }
  });

  it('lets steering clear only a removed assignee from completed work', () => {
    let project = initialized();
    project = mutate(project, PLANNER, { op: 'add_milestone', expected_version: 1, id: 'm1', title: 'Build' });
    project = mutate(project, PLANNER, {
      op: 'add_task', expected_version: 2, id: 'old', milestone_id: 'm1', title: 'Past work', description: 'Done',
      acceptance_criteria: ['Pass'], dependencies: [], assignee: CODER,
      gatekeepers: [REVIEWER], workspace_mode: 'write',
    });
    project = mutate(project, CODER, {
      op: 'submit', expected_version: 3, task_id: 'old', evidence: [{ type: 'note', text: 'complete' }],
    });
    project = mutate(project, REVIEWER, {
      op: 'review', expected_version: 4, task_id: 'old', decision: 'approved',
    });
    const proposal = {
      op: 'reconcile_plan' as const, expected_version: 5, proposal_version: 1,
      milestones: [{ id: 'm1', title: 'Build' }],
      tasks: [{
        id: 'old', milestone_id: 'm1', title: 'Past work', description: 'Done',
        acceptance_criteria: ['Pass'], dependencies: [], gatekeepers: [REVIEWER], workspace_mode: 'write' as const,
      }],
    };
    expect(() => mutate(project, PLANNER, proposal)).toThrow('cannot edit done task old');

    members[CODER] = { ...members[CODER]!, removed_ts: TS };
    try {
      project = mutate(project, PLANNER, proposal);
      expect(project.tasks[0]).toMatchObject({
        id: 'old', status: 'done', evidence: [{ type: 'note', text: 'complete' }],
      });
      expect(project.tasks[0]).not.toHaveProperty('assignee');
      expect(() => mutate(project, PLANNER, {
        ...proposal, expected_version: 6, proposal_version: 2,
        tasks: [{ ...proposal.tasks[0]!, title: 'Rewrite history' }],
      })).toThrow('cannot edit done task old');
    } finally {
      delete members[CODER]!.removed_ts;
    }
  });

  it('atomically reconciles fresh steering while protecting active work', () => {
    let project = initialized();
    project = mutate(project, PLANNER, { op: 'add_milestone', expected_version: 1, id: 'm1', title: 'Build' });
    project = mutate(project, PLANNER, {
      op: 'add_task', expected_version: 2, id: 't1', milestone_id: 'm1', title: 'First', description: 'Before',
      acceptance_criteria: ['Old'], dependencies: [], assignee: CODER,
      gatekeepers: [REVIEWER], workspace_mode: 'write',
    });
    project = mutate(project, PLANNER, {
      op: 'reconcile_plan', expected_version: 3, proposal_version: 1, summary: 'Pro review',
      source_commit: 'a'.repeat(40),
      milestones: [{ id: 'm1', title: 'Build' }, { id: 'm2', title: 'Finish' }],
      tasks: [{
        id: 't1', milestone_id: 'm1', title: 'First corrected', description: 'After',
        acceptance_criteria: ['New'], dependencies: [], assignee: CODER,
        gatekeepers: [REVIEWER], workspace_mode: 'write',
      }, {
        id: 't2', milestone_id: 'm2', title: 'Second', description: 'Next',
        acceptance_criteria: ['Done'], dependencies: ['t1'],
        gatekeepers: [], workspace_mode: 'read_only',
      }],
    });
    expect(project.steering).toMatchObject({ proposal_version: 1, based_on_board_version: 3, summary: 'Pro review' });
    expect(project.tasks).toMatchObject([
      { id: 't1', title: 'First corrected', status: 'ready' },
      { id: 't2', status: 'backlog' },
    ]);
    expect(() => mutate(project, PLANNER, {
      op: 'reconcile_plan', expected_version: 4, proposal_version: 1, milestones: [], tasks: [],
    })).toThrow('already applied or superseded');

    project = mutate(project, CODER, {
      op: 'submit', expected_version: 4, task_id: 't1', evidence: [{ type: 'note', text: 'ready for review' }],
    });
    expect(() => mutate(project, PLANNER, {
      op: 'reconcile_plan', expected_version: 5, proposal_version: 2, milestones: [{ id: 'm1', title: 'Build' }],
      tasks: [{
        id: 't1', milestone_id: 'm1', title: 'Rewrite active work', description: 'Unsafe',
        acceptance_criteria: ['Changed'], dependencies: [], assignee: CODER,
        gatekeepers: [REVIEWER], workspace_mode: 'write',
      }],
    })).toThrow('cannot edit in_review task t1');
    expect(() => mutate(project, PLANNER, {
      op: 'reconcile_plan', expected_version: 4, proposal_version: 2, milestones: [], tasks: [],
    })).toThrow('version conflict');
  });
});
