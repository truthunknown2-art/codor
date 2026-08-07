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
import { TimestampSchema } from './ids.js';

export const TeamProfileMemberSchema = z.object({
  handle: AssignableHandleSchema,
  display_name: z.string().trim().min(1).max(200),
  harness: z.string().trim().min(1).max(100),
  model: z.string().trim().min(1).max(200).optional(),
  thinking: ThinkingLevelSchema.optional(),
  policy: PolicySchema,
  purpose: z.string().trim().min(1).max(10_000),
  accent: MemberAccentSchema,
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

export const TeamProfileSchema = z.object({
  id: z.string().trim().min(1).max(128),
  name: z.string().trim().min(1).max(200),
  coordinator_handle: AssignableHandleSchema,
  members: z.array(TeamProfileMemberSchema).min(1).max(20),
  version: z.number().int().positive(),
  created_ts: TimestampSchema,
  updated_ts: TimestampSchema,
}).strict().superRefine((profile, ctx) => {
  const handles = profile.members.map((member) => member.handle);
  if (new Set(handles).size !== handles.length) {
    ctx.addIssue({ code: 'custom', path: ['members'], message: 'profile handles must be unique' });
  }
  if (!handles.includes(profile.coordinator_handle)) {
    ctx.addIssue({
      code: 'custom', path: ['coordinator_handle'], message: 'profile coordinator must be a member',
    });
  }
});
export type TeamProfile = z.infer<typeof TeamProfileSchema>;

export type TeamProfileInput = Omit<TeamProfile, 'version' | 'created_ts' | 'updated_ts'>;
