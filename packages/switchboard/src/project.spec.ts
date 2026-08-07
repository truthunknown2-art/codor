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
});
