import { UserRole } from '@prisma/client';

// Admin roles that can bypass entitlement checks by default
export const ADMIN_ROLES: UserRole[] = [UserRole.ADMIN, UserRole.SUPER_ADMIN];

/**
 * Check if a user role is an admin role
 */
export function isAdminRole(role: UserRole): boolean {
  return ADMIN_ROLES.includes(role);
}
