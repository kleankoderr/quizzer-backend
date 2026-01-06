import { Injectable } from '@nestjs/common';
import {
  IEnforcementPolicy,
  PolicyResult,
  PolicyType,
} from '../policies/interfaces/enforcement-policy.interface';
import { FixedLimitPolicy } from '../policies/fixed-limit.policy';
import { BooleanPolicy } from '../policies/boolean.policy';
import { FrequencyPolicy } from '../policies/frequency.policy';
import { LevelPolicy } from '../policies/level.policy';
import { EntitlementConfigProvider } from './entitlement-config.provider';
import { UsageService } from './usage.service';

@Injectable()
export class EntitlementEngine {
  private readonly policies: Map<PolicyType, IEnforcementPolicy>;

  constructor(
    private readonly entitlementConfigProvider: EntitlementConfigProvider,
    private readonly usageService: UsageService
  ) {
    this.policies = new Map([
      [PolicyType.FIXED_LIMIT, new FixedLimitPolicy()],
      [PolicyType.BOOLEAN, new BooleanPolicy()],
      [PolicyType.FREQUENCY, new FrequencyPolicy(this.usageService)],
      [PolicyType.LEVEL, new LevelPolicy()],
    ]);
  }

  /**
   * Authorize user action against entitlement
   * @param userId User ID
   * @param actionKey Entitlement key (e.g., 'quiz', 'aiTutor')
   * @param metadata Optional context (e.g., requiredLevel)
   * @returns Authorization result
   */
  async authorize(
    userId: string,
    actionKey: string,
    metadata?: Record<string, any>
  ): Promise<PolicyResult> {
    // Get user's active plan with entitlements (cached)
    const plan = await this.entitlementConfigProvider.getUserActivePlan(userId);

    if (!plan) {
      return {
        allowed: false,
        reason: 'No active subscription',
      };
    }

    // Find entitlement for this action
    const entitlement = plan.entitlements.find(
      (e) => e.entitlement.key === actionKey
    );

    if (!entitlement) {
      return {
        allowed: false,
        reason: `Feature '${actionKey}' not included in your plan`,
      };
    }

    // Determine policy type from entitlement type
    const policyType = this.mapEntitlementTypeToPolicy(
      entitlement.entitlement.type
    );

    const policy = this.policies.get(policyType);
    if (!policy) {
      throw new Error(`No policy found for type: ${policyType}`);
    }

    // Get current usage for quota-based policies
    let currentUsage: number | undefined;
    if (policyType === PolicyType.FIXED_LIMIT) {
      currentUsage = await this.usageService.getUsage(userId, actionKey);
    }

    // Evaluate policy
    return policy.evaluate({
      userId,
      entitlementKey: actionKey,
      entitlementValue: entitlement.value,
      currentUsage,
      metadata,
    });
  }

  /**
   * Authorize and increment usage (for quota-based features)
   * @param userId User ID
   * @param actionKey Entitlement key
   * @param amount Amount to consume (default 1)
   * @returns Authorization result
   */
  async authorizeAndConsume(
    userId: string,
    actionKey: string,
    amount: number = 1
  ): Promise<PolicyResult> {
    const result = await this.authorize(userId, actionKey);

    if (result.allowed) {
      // Increment usage
      await this.usageService.incrementUsage(userId, actionKey, amount);

      // Update metadata with new usage
      if (result.metadata) {
        result.metadata.used = (result.metadata.used || 0) + amount;
        result.metadata.remaining = Math.max(
          0,
          (result.metadata.limit || 0) - result.metadata.used
        );
      }
    }

    return result;
  }

  /**
   * Check multiple entitlements at once
   * @param userId User ID
   * @param actionKeys Array of entitlement keys
   * @returns Map of action key to authorization result
   */
  async authorizeMany(
    userId: string,
    actionKeys: string[]
  ): Promise<Map<string, PolicyResult>> {
    const results = new Map<string, PolicyResult>();

    for (const actionKey of actionKeys) {
      results.set(actionKey, await this.authorize(userId, actionKey));
    }

    return results;
  }

  private mapEntitlementTypeToPolicy(type: string): PolicyType {
    switch (type) {
      case 'COUNTER':
        return PolicyType.FIXED_LIMIT;
      case 'BOOLEAN':
        return PolicyType.BOOLEAN;
      case 'FREQUENCY':
        return PolicyType.FREQUENCY;
      case 'LEVEL':
        return PolicyType.LEVEL;
      default:
        return PolicyType.BOOLEAN;
    }
  }
}
