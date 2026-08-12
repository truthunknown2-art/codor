import {
  ProjectDocumentSchema,
  type Member,
  type ProjectDocument,
  type ProjectDocumentInput,
  type ProjectMutation,
  type ProjectTask,
} from '@codor/protocol';

export interface ProjectMutationContext {
  room: string;
  actor: Member;
  current?: ProjectDocument;
  member(id: string): Member | undefined;
  messageExists(id: number): boolean;
  commitExists(sha: string): boolean;
}

const owner = (member: Member): boolean => member.kind === 'human' && member.role === 'owner';

function activeMember(context: ProjectMutationContext, id: string, label: string): Member {
  const member = context.member(id);
  if (!member || member.removed_ts !== undefined) throw new Error(`${label} is not an active room member`);
  return member;
}

function projectFor(context: ProjectMutationContext, mutation: ProjectMutation): ProjectDocument {
  const project = context.current;
  if (!project) throw new Error('project is not initialized');
  if (mutation.expected_version !== project.version) {
    throw new Error(`project version conflict: expected ${mutation.expected_version}, current ${project.version}`);
  }
  return project;
}

function canCoordinate(project: ProjectDocument, actor: Member): boolean {
  return owner(actor) || actor.id === project.coordinator;
}

function requireCoordinator(project: ProjectDocument, actor: Member): void {
  if (!canCoordinate(project, actor)) throw new Error('forbidden: only the coordinator or owner may change project structure');
}

function taskFor(project: ProjectDocument, id: string): ProjectTask {
  const task = project.tasks.find((candidate) => candidate.id === id);
  if (!task) throw new Error(`no such project task: ${id}`);
  return task;
}

const samePlan = (left: ProjectTask, right: ProjectTask): boolean =>
  left.milestone_id === right.milestone_id
  && left.title === right.title
  && left.description === right.description
  && JSON.stringify(left.acceptance_criteria) === JSON.stringify(right.acceptance_criteria)
  && JSON.stringify(left.dependencies) === JSON.stringify(right.dependencies)
  && left.assignee === right.assignee
  && JSON.stringify(left.gatekeepers) === JSON.stringify(right.gatekeepers)
  && left.workspace_mode === right.workspace_mode;

function validateEvidence(context: ProjectMutationContext, task: ProjectTask): void {
  for (const evidence of task.evidence) {
    if (evidence.type === 'message' && !context.messageExists(evidence.message_id)) {
      throw new Error(`message evidence ${evidence.message_id} does not exist in this room`);
    }
    if (evidence.type === 'commit' && !context.commitExists(evidence.sha)) {
      throw new Error(`commit evidence ${evidence.sha} does not resolve in a known room working directory`);
    }
  }
}

function validateTasks(context: ProjectMutationContext, tasks: ProjectTask[]): void {
  for (const task of tasks) {
    if (task.workspace_mode === 'write' && task.gatekeepers.length === 0) {
      throw new Error(`write task ${task.id} requires at least one gatekeeper`);
    }
    // Completed work is immutable history. Its recorded participants may later
    // leave the room; that must not freeze unrelated current Board mutations.
    if (task.status !== 'done') {
      if (task.assignee) activeMember(context, task.assignee, `assignee for ${task.id}`);
      for (const gatekeeper of task.gatekeepers) activeMember(context, gatekeeper, `gatekeeper for ${task.id}`);
    }
  }
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) throw new Error(`project task dependency cycle includes ${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of byId.get(id)?.dependencies ?? []) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const task of tasks) visit(task.id);
}

function refresh(project: ProjectDocumentInput): ProjectDocumentInput {
  const done = new Set(project.tasks.filter((task) => task.status === 'done').map((task) => task.id));
  const tasks = project.tasks.map((task) => {
    if (task.status !== 'backlog' && task.status !== 'ready') return task;
    const ready = task.dependencies.every((dependency) => done.has(dependency));
    return { ...task, status: ready ? 'ready' as const : 'backlog' as const };
  });
  const milestones = project.milestones.map((milestone) => {
    const members = tasks.filter((task) => task.milestone_id === milestone.id);
    const status = members.length === 0 || members.every((task) => task.status === 'backlog')
      ? 'backlog' as const
      : members.every((task) => task.status === 'done')
        ? 'completed' as const
        : 'active' as const;
    return { ...milestone, status };
  });
  return { ...project, tasks, milestones };
}

function validated(input: ProjectDocumentInput): ProjectDocumentInput {
  const { version: _version, created_ts: _created, updated_ts: _updated, ...project } =
    ProjectDocumentSchema.parse({
      ...input,
      version: 1,
      created_ts: '2000-01-01T00:00:00.000Z',
      updated_ts: '2000-01-01T00:00:00.000Z',
    });
  return project;
}

export function applyProjectMutation(
  context: ProjectMutationContext,
  mutation: ProjectMutation,
): ProjectDocumentInput {
  const actor = activeMember(context, context.actor.id, 'actor');

  if (mutation.op === 'init') {
    if (context.current) throw new Error('project is already initialized');
    if (mutation.expected_version !== 0) throw new Error('a new project expects version 0');
    activeMember(context, mutation.coordinator, 'coordinator');
    if (!owner(actor) && actor.role !== 'admin' && actor.id !== mutation.coordinator) {
      throw new Error('forbidden: initialize as owner, admin, or the selected coordinator');
    }
    return validated({
      room: context.room,
      title: mutation.title,
      objective: mutation.objective,
      status: 'planning',
      coordinator: mutation.coordinator,
      guarded_autopilot: mutation.guarded_autopilot,
      milestones: [],
      tasks: [],
    });
  }

  const project = projectFor(context, mutation);
  let next: ProjectDocumentInput = {
    room: project.room,
    title: project.title,
    objective: project.objective,
    status: project.status,
    coordinator: project.coordinator,
    guarded_autopilot: project.guarded_autopilot,
    ...(project.steering && { steering: project.steering }),
    milestones: project.milestones,
    tasks: project.tasks,
  };

  if (mutation.op === 'add_milestone') {
    requireCoordinator(project, actor);
    if (project.milestones.some((milestone) => milestone.id === mutation.id)) {
      throw new Error(`project milestone already exists: ${mutation.id}`);
    }
    next = {
      ...next,
      milestones: [...project.milestones, {
        id: mutation.id,
        title: mutation.title,
        order: project.milestones.length,
        status: 'backlog',
      }],
    };
  } else if (mutation.op === 'add_task') {
    requireCoordinator(project, actor);
    if (!project.milestones.some((milestone) => milestone.id === mutation.milestone_id)) {
      throw new Error(`no such project milestone: ${mutation.milestone_id}`);
    }
    if (project.tasks.some((task) => task.id === mutation.id)) throw new Error(`project task already exists: ${mutation.id}`);
    next = {
      ...next,
      tasks: [...project.tasks, {
        id: mutation.id,
        milestone_id: mutation.milestone_id,
        title: mutation.title,
        description: mutation.description,
        acceptance_criteria: mutation.acceptance_criteria,
        dependencies: mutation.dependencies,
        ...(mutation.assignee && { assignee: mutation.assignee }),
        gatekeepers: mutation.gatekeepers,
        workspace_mode: mutation.workspace_mode,
        status: 'backlog',
        revision: 0,
        evidence: [],
        reviews: [],
      }],
    };
  } else if (mutation.op === 'edit_task') {
    requireCoordinator(project, actor);
    const task = taskFor(project, mutation.task_id);
    if (task.status === 'done' && !owner(actor)) throw new Error('only the owner may edit completed work');
    next = {
      ...next,
      tasks: project.tasks.map((candidate) => candidate.id === task.id ? {
        ...candidate,
        ...(mutation.title !== undefined && { title: mutation.title }),
        ...(mutation.description !== undefined && { description: mutation.description }),
        ...(mutation.acceptance_criteria !== undefined && { acceptance_criteria: mutation.acceptance_criteria }),
        ...(mutation.dependencies !== undefined && { dependencies: mutation.dependencies }),
        ...(mutation.gatekeepers !== undefined && { gatekeepers: mutation.gatekeepers }),
        ...(mutation.workspace_mode !== undefined && { workspace_mode: mutation.workspace_mode }),
      } : candidate),
    };
  } else if (mutation.op === 'assign') {
    requireCoordinator(project, actor);
    activeMember(context, mutation.assignee, 'assignee');
    const task = taskFor(project, mutation.task_id);
    if (task.status === 'done') throw new Error('completed work cannot be reassigned');
    next = { ...next, tasks: project.tasks.map((candidate) => candidate.id === task.id
      ? { ...candidate, assignee: mutation.assignee }
      : candidate) };
  } else if (mutation.op === 'block') {
    const task = taskFor(project, mutation.task_id);
    if (!owner(actor) && actor.id !== project.coordinator && actor.id !== task.assignee) {
      throw new Error('forbidden: only the assignee, coordinator, or owner may block this task');
    }
    if (task.status === 'done') throw new Error('completed work cannot be blocked');
    next = { ...next, tasks: project.tasks.map((candidate) => candidate.id === task.id
      ? { ...candidate, status: 'blocked', evidence: [...candidate.evidence, { type: 'note', text: mutation.note }] }
      : candidate) };
  } else if (mutation.op === 'submit') {
    const task = taskFor(project, mutation.task_id);
    if (!owner(actor) && actor.id !== task.assignee) throw new Error('forbidden: only the assignee or owner may submit this task');
    if (!['ready', 'in_progress', 'blocked'].includes(task.status)) throw new Error(`task ${task.id} cannot be submitted from ${task.status}`);
    validateEvidence(context, { ...task, evidence: mutation.evidence });
    const submitted = { ...task, evidence: [...task.evidence, ...mutation.evidence] };
    next = { ...next, tasks: project.tasks.map((candidate) => candidate.id === task.id
      ? { ...submitted, status: task.gatekeepers.length === 0 ? 'done' : 'in_review' }
      : candidate) };
  } else if (mutation.op === 'review') {
    const task = taskFor(project, mutation.task_id);
    if (task.status !== 'in_review') throw new Error(`task ${task.id} is not in review`);
    if (!owner(actor) && !task.gatekeepers.includes(actor.id)) throw new Error('forbidden: actor is not a gatekeeper for this task');
    const review = {
      gatekeeper: actor.id,
      decision: mutation.decision,
      revision: task.revision,
      ts: new Date().toISOString(),
      ...(mutation.note && { note: mutation.note }),
    };
    const reviews = [
      ...task.reviews.filter((candidate) => candidate.gatekeeper !== actor.id || candidate.revision !== task.revision),
      review,
    ];
    const approved = owner(actor) || task.gatekeepers.every((gatekeeper) => reviews.some((candidate) =>
      candidate.gatekeeper === gatekeeper && candidate.revision === task.revision && candidate.decision === 'approved'));
    next = { ...next, tasks: project.tasks.map((candidate) => candidate.id === task.id
      ? mutation.decision === 'changes_requested'
        ? { ...candidate, status: 'ready', revision: candidate.revision + 1, reviews }
        : { ...candidate, status: approved ? 'done' : 'in_review', reviews }
      : candidate) };
  } else if (mutation.op === 'set_status') {
    requireCoordinator(project, actor);
    if (mutation.status === 'completed' && !owner(actor) && project.tasks.some((task) => task.status !== 'done')) {
      throw new Error('all project tasks must be done before completion');
    }
    next = { ...next, status: mutation.status };
  } else if (mutation.op === 'set_autopilot') {
    requireCoordinator(project, actor);
    next = { ...next, guarded_autopilot: mutation.enabled };
  } else if (mutation.op === 'reconcile_plan') {
    requireCoordinator(project, actor);
    if ((project.steering?.proposal_version ?? 0) >= mutation.proposal_version) {
      throw new Error(`steering proposal ${mutation.proposal_version} was already applied or superseded`);
    }
    const milestones = [...project.milestones];
    for (const proposed of mutation.milestones) {
      const index = milestones.findIndex((milestone) => milestone.id === proposed.id);
      if (index < 0) {
        milestones.push({ ...proposed, order: milestones.length, status: 'backlog' });
      } else if (milestones[index]!.title !== proposed.title) {
        if (milestones[index]!.status !== 'backlog') {
          throw new Error(`steering cannot edit active or completed milestone ${proposed.id}`);
        }
        milestones[index] = { ...milestones[index]!, title: proposed.title };
      }
    }
    const tasks = [...project.tasks];
    for (const proposed of mutation.tasks) {
      const candidate: ProjectTask = {
        ...proposed,
        status: 'backlog',
        revision: 0,
        evidence: [],
        reviews: [],
      };
      const index = tasks.findIndex((task) => task.id === proposed.id);
      if (index < 0) {
        tasks.push(candidate);
      } else if (!samePlan(tasks[index]!, candidate)) {
        if (!['backlog', 'ready'].includes(tasks[index]!.status)) {
          throw new Error(`steering cannot edit ${tasks[index]!.status} task ${proposed.id}`);
        }
        tasks[index] = {
          ...tasks[index]!,
          ...proposed,
        };
      }
    }
    next = {
      ...next,
      milestones,
      tasks,
      steering: {
        proposal_version: mutation.proposal_version,
        based_on_board_version: mutation.expected_version,
        ...(mutation.source_commit && { source_commit: mutation.source_commit }),
        ...(mutation.summary && { summary: mutation.summary }),
        applied_ts: new Date().toISOString(),
      },
    };
  }

  next = refresh(next);
  validateTasks(context, next.tasks);
  return validated(next);
}

/** Internal orchestration transitions use the same refresh and validation path as user mutations. */
export function replaceProjectTasks(
  context: ProjectMutationContext,
  project: ProjectDocument,
  tasks: ProjectTask[],
  continuation = project.continuation,
): ProjectDocumentInput {
  const next = refresh({
    room: project.room,
    title: project.title,
    objective: project.objective,
    status: project.status,
    coordinator: project.coordinator,
    guarded_autopilot: project.guarded_autopilot,
    ...(project.steering && { steering: project.steering }),
    ...(continuation && { continuation }),
    milestones: project.milestones,
    tasks,
  });
  validateTasks(context, next.tasks);
  return validated(next);
}
