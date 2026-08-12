import type { Delivery, Member, ProjectTask } from '@codor/protocol';
import { describe, expect, it } from 'vitest';

import { unlinkedAgentWork, workingBoardTasks } from './ProjectBoard.js';

const task = (overrides: Partial<ProjectTask> = {}): ProjectTask => ({
  id: 'T-1',
  milestone_id: 'M-1',
  title: 'Ship the fix',
  description: 'Finish the visible workflow.',
  acceptance_criteria: ['The Board reflects live work.'],
  dependencies: [],
  assignee: 'coder',
  gatekeepers: ['reviewer'],
  workspace_mode: 'write',
  status: 'ready',
  revision: 1,
  evidence: [],
  reviews: [],
  ...overrides,
});

const delivery = (id: string, state: Delivery['state'], recipient = 'coder'): Delivery => ({
  id,
  room: 'room',
  message_id: 1,
  recipient,
  state,
  attempt_count: state === 'delivering' ? 1 : 0,
  ts: '2026-08-11T00:00:00.000Z',
});

const agent = (id: string): Member => ({ id, kind: 'agent' } as Member);

describe('Project Board live-work projection', () => {
  it('shows a ready task once its current revision has queued work', () => {
    const queued = delivery('delivery-1', 'queued');
    const ready = task({ dispatches: { work: [{ revision: 1, delivery_id: queued.id }], reviews: [] } });

    expect(workingBoardTasks([ready], [queued])).toEqual([ready]);
  });

  it('keeps ordinary in-progress tasks visible without a delivery snapshot', () => {
    const active = task({ status: 'in_progress' });

    expect(workingBoardTasks([active], [])).toEqual([active]);
  });

  it('surfaces delivering agent work only when no Board dispatch owns it', () => {
    const linked = delivery('delivery-linked', 'delivering');
    const unlinked = delivery('delivery-unlinked', 'delivering');
    const assigned = task({ dispatches: { work: [{ revision: 1, delivery_id: linked.id }], reviews: [] } });

    expect(unlinkedAgentWork([assigned], [linked, unlinked], [agent('coder')])).toEqual([unlinked]);
  });
});
