import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export const ENTITLEMENT_KEY = 'entitlement';

export interface EntitlementOptions {
  key: string;
  consume?: boolean; // If true, increment usage
  amount?: number; // Amount to consume (default 1)
  bypassRoles?: UserRole[]; // Roles that can bypass this entitlement check
}

/**
 * Decorator to require entitlement for accessing an endpoint
 * @param options Entitlement key or options object
 * @example
 * // Simple check (admins bypass by default)
 * @RequireEntitlement(EntitlementKeys.QUIZ)
 *
 * // Check with consumption (admins bypass by default)
 * @RequireEntitlement({ key: EntitlementKeys.QUIZ, consume: true, amount: 1 })
 *
 * // No admin bypass - everyone must pass
 * @RequireEntitlement({ key: EntitlementKeys.QUIZ, bypassRoles: [] })
 *
 * // Only specific roles bypass
 * @RequireEntitlement({ key: EntitlementKeys.QUIZ, bypassRoles: [UserRole.SUPER_ADMIN] })
 */
export const RequireEntitlement = (options: string | EntitlementOptions) =>
  SetMetadata(
    ENTITLEMENT_KEY,
    typeof options === 'string' ? { key: options, consume: false } : options
  );
