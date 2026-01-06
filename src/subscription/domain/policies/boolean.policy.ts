import {
  IEnforcementPolicy,
  PolicyContext,
  PolicyResult,
  PolicyType,
} from './interfaces/enforcement-policy.interface';

export class BooleanPolicy implements IEnforcementPolicy {
  async evaluate(context: PolicyContext): Promise<PolicyResult> {
    const enabled = context.entitlementValue as boolean;

    return {
      allowed: enabled,
      reason: enabled ? undefined : 'Feature not included in your plan',
    };
  }

  getPolicyType(): PolicyType {
    return PolicyType.BOOLEAN;
  }
}
