import type { BillingMode } from '@codor/protocol';

import { compactCount, usd } from '../primitives/identity.js';

export interface CostProvenance {
  cost_usd: number;
  estimated_cost_usd?: number;
  uncosted_tokens?: number;
}

// harn:assume estimated-cost-is-advisory-not-spend-brake-input ref=member-advisory-cost-surface
export function costProvenanceLabel(value: CostProvenance): string {
  const estimate = value.estimated_cost_usd ?? 0;
  const unknown = value.uncosted_tokens ?? 0;
  const parts: string[] = [];
  if (value.cost_usd > 0 || (estimate === 0 && unknown === 0)) {
    parts.push(`${usd(value.cost_usd)}${value.cost_usd > 0 ? ' provider-reported' : ''}`);
  }
  if (estimate > 0) parts.push(`~${usd(estimate)} est.`);
  if (unknown > 0) parts.push(`${compactCount(unknown)} unpriced tokens`);
  return parts.join(' + ');
}
// harn:end estimated-cost-is-advisory-not-spend-brake-input

export function memberCostLabel(value: CostProvenance, billingMode: BillingMode): string {
  const unknown = value.uncosted_tokens ?? 0;
  if (billingMode !== 'subscription') return costProvenanceLabel(value);
  const equivalent = value.cost_usd + (value.estimated_cost_usd ?? 0);
  return [
    'Codor charge $0.00',
    ...(equivalent > 0 ? [`~${usd(equivalent)} advisory API equivalent`] : []),
    ...(unknown > 0 ? [`${compactCount(unknown)} unpriced tokens`] : []),
  ].join(' + ');
}
