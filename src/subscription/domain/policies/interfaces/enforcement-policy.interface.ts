export enum PolicyType {
  FIXED_LIMIT = 'FIXED_LIMIT',
  BOOLEAN = 'BOOLEAN',
  FREQUENCY = 'FREQUENCY',
  LEVEL = 'LEVEL',
}

export interface PolicyContext {
  userId: string;
  entitlementKey: string;
  entitlementValue: any;
  currentUsage?: number;
  metadata?: Record<string, any>;
}

export interface PolicyResult {
  allowed: boolean;
  reason?: string;
  metadata?: {
    limit?: number;
    used?: number;
    remaining?: number;
    window?: string;
    userLevel?: number;
    requiredLevel?: number;
  };
}

export interface IEnforcementPolicy {
  /**
   * Evaluate if user can perform action
   */
  evaluate(context: PolicyContext): Promise<PolicyResult>;

  /**
   * Get policy type identifier
   */
  getPolicyType(): PolicyType;
}
