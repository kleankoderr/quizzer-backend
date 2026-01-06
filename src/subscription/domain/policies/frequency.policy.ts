import {
  IEnforcementPolicy,
  PolicyContext,
  PolicyResult,
  PolicyType,
} from './interfaces/enforcement-policy.interface';
import { UsageService } from '../services/usage.service';

export class FrequencyPolicy implements IEnforcementPolicy {
  constructor(private readonly usageService: UsageService) {}

  async evaluate(context: PolicyContext): Promise<PolicyResult> {
    const config = this.extractFrequencyConfig(
      context.entitlementValue as { limit: number; window: string }
    );

    // Get usage within time window
    const windowStart = new Date(Date.now() - config.windowMs);
    const usage = await this.usageService.getUsageInWindow(
      context.userId,
      context.entitlementKey,
      windowStart
    );

    return {
      allowed: usage < config.limit,
      reason:
        usage >= config.limit
          ? `Rate limit exceeded: ${config.limit} per ${config.window}`
          : undefined,
      metadata: {
        limit: config.limit,
        used: usage,
        remaining: Math.max(0, config.limit - usage),
        window: config.window,
      },
    };
  }

  getPolicyType(): PolicyType {
    return PolicyType.FREQUENCY;
  }

  private extractFrequencyConfig(value: { limit: number; window: string }) {
    return {
      limit: value.limit,
      window: value.window,
      windowMs: this.parseWindow(value.window),
    };
  }

  private parseWindow(window: string): number {
    // Parse '1m', '1h', '1d' to milliseconds
    const match = new RegExp(/^(\d+)([smhd])$/).exec(window);
    if (!match) return 3600000; // Default 1 hour

    const [, num, unit] = match;
    const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
    return (
      Number.parseInt(num) *
      (multipliers[unit as keyof typeof multipliers] || 3600000)
    );
  }
}
