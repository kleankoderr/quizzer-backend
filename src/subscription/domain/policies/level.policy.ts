import {
  IEnforcementPolicy,
  PolicyContext,
  PolicyResult,
  PolicyType,
} from './interfaces/enforcement-policy.interface';

export class LevelPolicy implements IEnforcementPolicy {
  async evaluate(context: PolicyContext): Promise<PolicyResult> {
    const requiredLevel = context.metadata?.requiredLevel || 0;
    const userLevel = context.entitlementValue as number;

    return {
      allowed: userLevel >= requiredLevel,
      reason:
        userLevel < requiredLevel
          ? `Requires level ${requiredLevel}, you have level ${userLevel}`
          : undefined,
      metadata: {
        userLevel,
        requiredLevel,
      },
    };
  }

  getPolicyType(): PolicyType {
    return PolicyType.LEVEL;
  }
}
