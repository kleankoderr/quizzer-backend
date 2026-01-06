import {
  IEnforcementPolicy,
  PolicyContext,
  PolicyResult,
  PolicyType,
} from './interfaces/enforcement-policy.interface';

export class FixedLimitPolicy implements IEnforcementPolicy {
  async evaluate(context: PolicyContext): Promise<PolicyResult> {
    const limit = context.entitlementValue as number;
    const used = context.currentUsage || 0;

    return {
      allowed: used < limit,
      reason: used >= limit ? `Limit of ${limit} reached` : undefined,
      metadata: {
        limit,
        used,
        remaining: Math.max(0, limit - used),
      },
    };
  }

  getPolicyType(): PolicyType {
    return PolicyType.FIXED_LIMIT;
  }
}
