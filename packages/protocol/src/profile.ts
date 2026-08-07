import { z } from 'zod';

import {
  AcpProviderIdSchema,
  PolicySchema,
  ThinkingLevelSchema,
} from './adapter.js';
import {
  AssignableHandleSchema,
  BillingModeSchema,
  MemberAccentSchema,
} from './member.js';
import { MemberIdSchema, RoomIdSchema, TimestampSchema } from './ids.js';

export const TeamProfileMemberSchema = z.object({
  handle: AssignableHandleSchema,
  display_name: z.string().trim().min(1).max(200),
  harness: z.string().trim().min(1).max(100),
  model: z.string().trim().min(1).max(200).optional(),
  thinking: ThinkingLevelSchema.optional(),
  policy: PolicySchema.optional(),
  purpose: z.string().trim().min(1).max(10_000).optional(),
  accent: MemberAccentSchema.optional(),
  billing_mode: BillingModeSchema,
  required: z.boolean(),
  acp_provider: AcpProviderIdSchema.optional(),
}).strict().superRefine((member, ctx) => {
  if (member.harness === 'acp' && member.acp_provider === undefined) {
    ctx.addIssue({
      code: 'custom', path: ['acp_provider'], message: 'ACP profile members require a curated provider id',
    });
  } else if (member.harness !== 'acp' && member.acp_provider !== undefined) {
    ctx.addIssue({
      code: 'custom', path: ['acp_provider'], message: 'only ACP profile members may name an ACP provider',
    });
  }
});
export type TeamProfileMember = z.infer<typeof TeamProfileMemberSchema>;

const TeamProfileInputBaseSchema = z.object({
  id: z.string().trim().min(1).max(128),
  name: z.string().trim().min(1).max(200),
  coordinator_handle: AssignableHandleSchema,
  members: z.array(TeamProfileMemberSchema).min(1).max(20),
}).strict();

const validateTeamProfile = (
  profile: { coordinator_handle: string; members: { handle: string }[] },
  ctx: z.RefinementCtx,
): void => {
  const handles = profile.members.map((member) => member.handle);
  if (new Set(handles).size !== handles.length) {
    ctx.addIssue({ code: 'custom', path: ['members'], message: 'profile handles must be unique' });
  }
  if (!handles.includes(profile.coordinator_handle)) {
    ctx.addIssue({
      code: 'custom', path: ['coordinator_handle'], message: 'profile coordinator must be a member',
    });
  }
};

export const TeamProfileInputSchema = TeamProfileInputBaseSchema.superRefine(validateTeamProfile);
export type TeamProfileInput = z.infer<typeof TeamProfileInputSchema>;

export const TeamProfileSchema = TeamProfileInputBaseSchema.extend({
  version: z.number().int().positive(),
  created_ts: TimestampSchema,
  updated_ts: TimestampSchema,
}).strict().superRefine(validateTeamProfile);
export type TeamProfile = z.infer<typeof TeamProfileSchema>;

export const TeamSetupMemberSchema = z.object({
  handle: AssignableHandleSchema,
  required: z.boolean(),
  status: z.enum(['ready', 'failed']),
  member_id: MemberIdSchema.optional(),
  error: z.string().max(2_000).optional(),
}).strict();
export type TeamSetupMember = z.infer<typeof TeamSetupMemberSchema>;

export const TeamSetupSchema = z.object({
  profile_id: z.string().trim().min(1).max(128),
  profile_version: z.number().int().positive(),
  coordinator_handle: AssignableHandleSchema,
  ready: z.boolean(),
  members: z.array(TeamSetupMemberSchema).min(1).max(20),
}).strict();
export type TeamSetup = z.infer<typeof TeamSetupSchema>;

export const SaveTeamProfileRequestSchema = z.object({
  profile: TeamProfileInputSchema,
  expected_version: z.number().int().nonnegative(),
}).strict();

export const SaveCurrentTeamProfileRequestSchema = z.object({
  room: RoomIdSchema,
  id: z.string().trim().min(1).max(128),
  name: z.string().trim().min(1).max(200),
  coordinator_handle: AssignableHandleSchema,
  expected_version: z.number().int().nonnegative(),
}).strict();

export const DeleteTeamProfileRequestSchema = z.object({
  expected_version: z.number().int().nonnegative(),
}).strict();

export const RetryTeamMemberRequestSchema = z.object({
  handle: AssignableHandleSchema,
}).strict();
