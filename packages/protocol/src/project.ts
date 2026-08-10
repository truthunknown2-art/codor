import { z } from 'zod';

import { MemberIdSchema, MessageIdSchema, RoomIdSchema, TimestampSchema } from './ids.js';
import { AssignableHandleSchema } from './member.js';

const boundedText = (max: number): z.ZodString => z.string().trim().min(1).max(max);
const unique = <T>(items: T[]): boolean => new Set(items).size === items.length;

export const ProjectStatusSchema = z.enum(['planning', 'active', 'blocked', 'completed', 'archived']);
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;

export const ProjectTaskStatusSchema = z.enum([
  'backlog', 'ready', 'in_progress', 'in_review', 'done', 'blocked',
]);
export type ProjectTaskStatus = z.infer<typeof ProjectTaskStatusSchema>;

export const ProjectWorkspaceModeSchema = z.enum(['read_only', 'write']);
export type ProjectWorkspaceMode = z.infer<typeof ProjectWorkspaceModeSchema>;

export const ProjectEvidenceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('commit'), sha: z.string().regex(/^[0-9a-f]{40}$/) }).strict(),
  z.object({
    type: z.literal('check'),
    name: boundedText(200),
    result: z.enum(['passed', 'failed']),
    details: boundedText(2_000).optional(),
  }).strict(),
  z.object({ type: z.literal('message'), message_id: MessageIdSchema }).strict(),
  z.object({ type: z.literal('pr'), url: z.url().max(2_000) }).strict(),
  z.object({ type: z.literal('note'), text: boundedText(2_000) }).strict(),
]);
export type ProjectEvidence = z.infer<typeof ProjectEvidenceSchema>;

export const ProjectReviewSchema = z.object({
  gatekeeper: MemberIdSchema,
  decision: z.enum(['approved', 'changes_requested']),
  revision: z.number().int().nonnegative(),
  ts: TimestampSchema,
  note: boundedText(2_000).optional(),
}).strict();
export type ProjectReview = z.infer<typeof ProjectReviewSchema>;

export const ProjectMilestoneSchema = z.object({
  id: boundedText(128),
  title: boundedText(300),
  order: z.number().int().nonnegative(),
  status: z.enum(['backlog', 'active', 'completed']),
}).strict();
export type ProjectMilestone = z.infer<typeof ProjectMilestoneSchema>;

const ProjectDispatchResultSchema = z.object({
  delivery_id: boundedText(128),
  result_message_id: MessageIdSchema.optional(),
  coordinator_delivery_id: boundedText(128).optional(),
  coordinator_version: z.number().int().positive().optional(),
}).strict().superRefine((dispatch, ctx) => {
  if ((dispatch.coordinator_delivery_id === undefined) !== (dispatch.coordinator_version === undefined)) {
    ctx.addIssue({
      code: 'custom',
      path: [dispatch.coordinator_delivery_id === undefined ? 'coordinator_delivery_id' : 'coordinator_version'],
      message: 'coordinator delivery id and version must be provided together',
    });
  }
});

const ProjectWorkDispatchSchema = ProjectDispatchResultSchema.and(z.object({
  revision: z.number().int().nonnegative(),
  group_id: boundedText(128).optional(),
}).strict());

const ProjectReviewDispatchSchema = ProjectDispatchResultSchema.and(z.object({
  revision: z.number().int().nonnegative(),
  gatekeeper: MemberIdSchema,
}).strict());

export const ProjectTaskDispatchesSchema = z.object({
  work: z.array(ProjectWorkDispatchSchema).max(100),
  reviews: z.array(ProjectReviewDispatchSchema).max(500),
}).strict();
export type ProjectTaskDispatches = z.infer<typeof ProjectTaskDispatchesSchema>;

export const ProjectTaskSchema = z.object({
  id: boundedText(128),
  milestone_id: boundedText(128),
  title: boundedText(300),
  description: boundedText(10_000),
  acceptance_criteria: z.array(boundedText(1_000)).min(1).max(50),
  dependencies: z.array(boundedText(128)).max(50).refine(unique, 'task dependencies must be unique'),
  assignee: MemberIdSchema.optional(),
  gatekeepers: z.array(MemberIdSchema).max(50).refine(unique, 'task gatekeepers must be unique'),
  workspace_mode: ProjectWorkspaceModeSchema,
  status: ProjectTaskStatusSchema,
  revision: z.number().int().nonnegative(),
  evidence: z.array(ProjectEvidenceSchema).max(50),
  reviews: z.array(ProjectReviewSchema).max(50),
  dispatches: ProjectTaskDispatchesSchema.optional(),
}).strict().superRefine((task, ctx) => {
  if (task.dependencies.includes(task.id)) {
    ctx.addIssue({ code: 'custom', path: ['dependencies'], message: 'a task cannot depend on itself' });
  }
  const workRevisions = task.dispatches?.work.map((dispatch) => dispatch.revision) ?? [];
  if (!unique(workRevisions)) {
    ctx.addIssue({ code: 'custom', path: ['dispatches', 'work'], message: 'work dispatch revisions must be unique' });
  }
  const reviewKeys = task.dispatches?.reviews.map((dispatch) => `${dispatch.revision}:${dispatch.gatekeeper}`) ?? [];
  if (!unique(reviewKeys)) {
    ctx.addIssue({ code: 'custom', path: ['dispatches', 'reviews'], message: 'review dispatches must be unique per revision and gatekeeper' });
  }
});
export type ProjectTask = z.infer<typeof ProjectTaskSchema>;

const ProjectPlanMilestoneSchema = z.object({
  id: boundedText(128),
  title: boundedText(300),
}).strict();

const projectPlanTaskShape = {
  id: boundedText(128),
  milestone_id: boundedText(128),
  title: boundedText(300),
  description: boundedText(10_000),
  acceptance_criteria: z.array(boundedText(1_000)).min(1).max(50),
  dependencies: z.array(boundedText(128)).max(50).refine(unique, 'task dependencies must be unique'),
  workspace_mode: ProjectWorkspaceModeSchema,
};

export const ProjectSteeringProposalSchema = z.object({
  format: z.literal('codor.pro-steering.v1'),
  proposal_version: z.number().int().positive(),
  based_on_board_version: z.number().int().positive(),
  source_commit: z.string().regex(/^[0-9a-f]{40}$/).optional(),
  summary: boundedText(2_000).optional(),
  milestones: z.array(ProjectPlanMilestoneSchema).max(100),
  tasks: z.array(z.object({
    ...projectPlanTaskShape,
    assignee: AssignableHandleSchema.optional(),
    gatekeepers: z.array(AssignableHandleSchema).max(50).refine(unique, 'task gatekeepers must be unique'),
  }).strict()).max(500),
}).strict().superRefine((proposal, ctx) => {
  const milestoneIds = proposal.milestones.map((milestone) => milestone.id);
  const taskIds = proposal.tasks.map((task) => task.id);
  if (!unique(milestoneIds)) ctx.addIssue({ code: 'custom', path: ['milestones'], message: 'milestone ids must be unique' });
  if (!unique(taskIds)) ctx.addIssue({ code: 'custom', path: ['tasks'], message: 'task ids must be unique' });
});
export type ProjectSteeringProposal = z.infer<typeof ProjectSteeringProposalSchema>;

const ProjectReconcileTaskSchema = z.object({
  ...projectPlanTaskShape,
  assignee: MemberIdSchema.optional(),
  gatekeepers: z.array(MemberIdSchema).max(50).refine(unique, 'task gatekeepers must be unique'),
}).strict();

export const ProjectDocumentSchema = z.object({
  room: RoomIdSchema,
  title: boundedText(300),
  objective: boundedText(10_000),
  status: ProjectStatusSchema,
  coordinator: MemberIdSchema,
  guarded_autopilot: z.boolean(),
  continuation: z.object({
    delivery_id: boundedText(128),
    project_version: z.number().int().positive(),
  }).strict().optional(),
  steering: z.object({
    proposal_version: z.number().int().positive(),
    based_on_board_version: z.number().int().positive(),
    source_commit: z.string().regex(/^[0-9a-f]{40}$/).optional(),
    summary: boundedText(2_000).optional(),
    applied_ts: TimestampSchema,
  }).strict().optional(),
  milestones: z.array(ProjectMilestoneSchema).max(100),
  tasks: z.array(ProjectTaskSchema).max(500),
  version: z.number().int().positive(),
  created_ts: TimestampSchema,
  updated_ts: TimestampSchema,
}).strict().superRefine((project, ctx) => {
  const milestoneIds = project.milestones.map((milestone) => milestone.id);
  const taskIds = project.tasks.map((task) => task.id);
  if (!unique(milestoneIds)) {
    ctx.addIssue({ code: 'custom', path: ['milestones'], message: 'milestone ids must be unique' });
  }
  if (!unique(taskIds)) {
    ctx.addIssue({ code: 'custom', path: ['tasks'], message: 'task ids must be unique' });
  }
  const milestoneSet = new Set(milestoneIds);
  const taskSet = new Set(taskIds);
  for (const [index, task] of project.tasks.entries()) {
    if (!milestoneSet.has(task.milestone_id)) {
      ctx.addIssue({
        code: 'custom', path: ['tasks', index, 'milestone_id'], message: 'task milestone does not exist',
      });
    }
    for (const dependency of task.dependencies) {
      if (!taskSet.has(dependency)) {
        ctx.addIssue({
          code: 'custom', path: ['tasks', index, 'dependencies'], message: 'task dependency does not exist',
        });
      }
    }
  }
});
export type ProjectDocument = z.infer<typeof ProjectDocumentSchema>;

export type ProjectDocumentInput = Omit<ProjectDocument, 'version' | 'created_ts' | 'updated_ts'>;

const mutationBase = { expected_version: z.number().int().nonnegative() };

export const ProjectMutationSchema = z.discriminatedUnion('op', [
  z.object({
    ...mutationBase,
    op: z.literal('init'),
    title: boundedText(300),
    objective: boundedText(10_000),
    coordinator: MemberIdSchema,
    guarded_autopilot: z.boolean().default(false),
  }).strict(),
  z.object({
    ...mutationBase,
    op: z.literal('add_milestone'),
    id: boundedText(128),
    title: boundedText(300),
  }).strict(),
  z.object({
    ...mutationBase,
    op: z.literal('add_task'),
    id: boundedText(128),
    milestone_id: boundedText(128),
    title: boundedText(300),
    description: boundedText(10_000),
    acceptance_criteria: z.array(boundedText(1_000)).min(1).max(50),
    dependencies: z.array(boundedText(128)).max(50).refine(unique, 'task dependencies must be unique'),
    assignee: MemberIdSchema.optional(),
    gatekeepers: z.array(MemberIdSchema).max(50).refine(unique, 'task gatekeepers must be unique'),
    workspace_mode: ProjectWorkspaceModeSchema,
  }).strict(),
  z.object({
    ...mutationBase,
    op: z.literal('edit_task'),
    task_id: boundedText(128),
    title: boundedText(300).optional(),
    description: boundedText(10_000).optional(),
    acceptance_criteria: z.array(boundedText(1_000)).min(1).max(50).optional(),
    dependencies: z.array(boundedText(128)).max(50).refine(unique, 'task dependencies must be unique').optional(),
    gatekeepers: z.array(MemberIdSchema).max(50).refine(unique, 'task gatekeepers must be unique').optional(),
    workspace_mode: ProjectWorkspaceModeSchema.optional(),
  }).strict(),
  z.object({ ...mutationBase, op: z.literal('assign'), task_id: boundedText(128), assignee: MemberIdSchema }).strict(),
  z.object({ ...mutationBase, op: z.literal('block'), task_id: boundedText(128), note: boundedText(2_000) }).strict(),
  z.object({
    ...mutationBase,
    op: z.literal('submit'),
    task_id: boundedText(128),
    evidence: z.array(ProjectEvidenceSchema).min(1).max(50),
  }).strict(),
  z.object({
    ...mutationBase,
    op: z.literal('review'),
    task_id: boundedText(128),
    decision: z.enum(['approved', 'changes_requested']),
    note: boundedText(2_000).optional(),
  }).strict(),
  z.object({ ...mutationBase, op: z.literal('set_status'), status: ProjectStatusSchema }).strict(),
  z.object({ ...mutationBase, op: z.literal('set_autopilot'), enabled: z.boolean() }).strict(),
  z.object({
    ...mutationBase,
    op: z.literal('reconcile_plan'),
    proposal_version: z.number().int().positive(),
    source_commit: z.string().regex(/^[0-9a-f]{40}$/).optional(),
    summary: boundedText(2_000).optional(),
    milestones: z.array(ProjectPlanMilestoneSchema).max(100),
    tasks: z.array(ProjectReconcileTaskSchema).max(500),
  }).strict(),
]);
export type ProjectMutation = z.infer<typeof ProjectMutationSchema>;
