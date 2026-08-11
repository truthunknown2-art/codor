import type { Member } from './member.js';
import type { ProjectDocument, ProjectMutation, ProjectSteeringProposal } from './project.js';

const active = (member: Member): boolean => member.removed_ts === undefined;

function memberMaps(members: Member[]): {
  byHandle: Map<string, Member>;
  handle(id: string): string;
} {
  const current = members.filter(active);
  const byId = new Map(members.map((member) => [member.id, member]));
  const byHandle = new Map(current.map((member) => [member.handle, member]));
  return {
    byHandle,
    handle(id) {
      const member = byId.get(id);
      if (!member) throw new Error(`project member ${id} is unavailable`);
      return member.handle;
    },
  };
}

/** A deterministic, credential-free packet suitable for Git or direct paste into Pro. */
export function projectBoardSnapshot(project: ProjectDocument, members: Member[]) {
  const map = memberMaps(members);
  const tasks = project.tasks.map((task) => ({
    id: task.id,
    milestone_id: task.milestone_id,
    title: task.title,
    description: task.description,
    acceptance_criteria: task.acceptance_criteria,
    dependencies: task.dependencies,
    ...(task.assignee && { assignee: map.handle(task.assignee) }),
    gatekeepers: task.gatekeepers.map(map.handle),
    workspace_mode: task.workspace_mode,
    status: task.status,
    revision: task.revision,
    evidence: task.evidence,
    reviews: task.reviews.map((review) => ({ ...review, gatekeeper: map.handle(review.gatekeeper) })),
  }));
  return {
    format: 'codor.board-snapshot.v1' as const,
    board_version: project.version,
    room: project.room,
    title: project.title,
    objective: project.objective,
    status: project.status,
    coordinator: map.handle(project.coordinator),
    guarded_autopilot: project.guarded_autopilot,
    ...(project.steering && { last_applied_steering: project.steering }),
    members: members.filter(active).filter((member) => member.kind !== 'system')
      .sort((left, right) => left.handle.localeCompare(right.handle))
      .map((member) => ({
        handle: member.handle,
        display_name: member.display_name,
        kind: member.kind,
        ...(member.role && { role: member.role }),
        ...(member.harness && { harness: member.harness }),
        ...(member.state && { state: member.state }),
        ...(member.purpose && { purpose: member.purpose }),
      })),
    milestones: project.milestones,
    tasks,
    pro_steering_template: {
      format: 'codor.pro-steering.v1' as const,
      proposal_version: (project.steering?.proposal_version ?? 0) + 1,
      based_on_board_version: project.version,
      milestones: project.milestones.map(({ id, title }) => ({ id, title })),
      tasks: tasks.map(({ status: _status, revision: _revision, evidence: _evidence, reviews: _reviews, ...task }) => task),
    },
  };
}

/** Resolve durable handles only at import time; member ids never enter Git. */
export function projectSteeringMutation(
  proposal: ProjectSteeringProposal,
  members: Member[],
): Extract<ProjectMutation, { op: 'reconcile_plan' }> {
  const map = memberMaps(members);
  const memberId = (handle: string, label: string): string => {
    const member = map.byHandle.get(handle);
    if (!member) throw new Error(`${label} @${handle} is not an active channel member`);
    return member.id;
  };
  return {
    op: 'reconcile_plan',
    expected_version: proposal.based_on_board_version,
    proposal_version: proposal.proposal_version,
    ...(proposal.source_commit && { source_commit: proposal.source_commit }),
    ...(proposal.summary && { summary: proposal.summary }),
    milestones: proposal.milestones,
    tasks: proposal.tasks.map((task) => ({
      ...task,
      ...(task.assignee && { assignee: memberId(task.assignee, `assignee for ${task.id}`) }),
      gatekeepers: task.gatekeepers.map((handle) => memberId(handle, `gatekeeper for ${task.id}`)),
    })),
  };
}
