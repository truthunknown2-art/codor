import type { Member, ProjectDocument } from './index.js';
import { projectBoardSnapshot, projectSteeringMutation } from './index.js';
import { describe, expect, it } from 'vitest';

const PLANNER = '01J00000000000000000000001';
const CODER = '01J00000000000000000000002';
const REVIEWER = '01J00000000000000000000003';
const members: Member[] = [
  { id: PLANNER, kind: 'agent', handle: 'planner', display_name: 'Planner', harness: 'fake', state: 'idle', conventions_sent: false, misaddressed: false, roster_stale: false },
  { id: CODER, kind: 'agent', handle: 'coder', display_name: 'Coder', harness: 'fake', state: 'idle', conventions_sent: false, misaddressed: false, roster_stale: false },
  { id: REVIEWER, kind: 'agent', handle: 'reviewer', display_name: 'Reviewer', harness: 'fake', state: 'idle', conventions_sent: false, misaddressed: false, roster_stale: false },
];
const project: ProjectDocument = {
  room: 'eng', title: 'Ship', objective: 'Finish', status: 'active', coordinator: PLANNER,
  guarded_autopilot: true, milestones: [{ id: 'm1', title: 'Build', order: 0, status: 'active' }],
  tasks: [{
    id: 't1', milestone_id: 'm1', title: 'Code', description: 'Implement', acceptance_criteria: ['Pass'],
    dependencies: [], assignee: CODER, gatekeepers: [REVIEWER], workspace_mode: 'write', status: 'ready',
    revision: 0, evidence: [], reviews: [],
  }],
  version: 7, created_ts: '2026-08-10T00:00:00.000Z', updated_ts: '2026-08-10T00:00:00.000Z',
};

describe('Pro steering bridge', () => {
  it('exports handles and a ready-to-edit proposal without private member ids', () => {
    const packet = projectBoardSnapshot(project, members);
    expect(packet).toMatchObject({
      board_version: 7, coordinator: 'planner',
      tasks: [{ assignee: 'coder', gatekeepers: ['reviewer'] }],
      pro_steering_template: { proposal_version: 1, based_on_board_version: 7 },
    });
    expect(JSON.stringify(packet)).not.toContain(PLANNER);
  });

  it('resolves proposal handles into one atomic mutation', () => {
    const mutation = projectSteeringMutation({
      format: 'codor.pro-steering.v1', proposal_version: 2, based_on_board_version: 7,
      milestones: [{ id: 'm1', title: 'Build' }],
      tasks: [{
        id: 't1', milestone_id: 'm1', title: 'Code', description: 'Implement', acceptance_criteria: ['Pass'],
        dependencies: [], assignee: 'coder', gatekeepers: ['reviewer'], workspace_mode: 'write',
      }],
    }, members);
    expect(mutation).toMatchObject({ expected_version: 7, proposal_version: 2, tasks: [{ assignee: CODER, gatekeepers: [REVIEWER] }] });
    expect(() => projectSteeringMutation({
      format: 'codor.pro-steering.v1', proposal_version: 2, based_on_board_version: 7,
      milestones: [], tasks: [{
        id: 't2', milestone_id: 'm1', title: 'Test', description: 'Test', acceptance_criteria: ['Pass'],
        dependencies: [], assignee: 'missing', gatekeepers: [], workspace_mode: 'read_only',
      }],
    }, members)).toThrow('assignee for t2 @missing is not an active channel member');
  });
});
