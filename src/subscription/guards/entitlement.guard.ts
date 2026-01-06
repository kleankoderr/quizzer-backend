import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { EntitlementEngine } from '../domain/services/entitlement-engine.service';
import {
  ENTITLEMENT_KEY,
  EntitlementOptions,
} from '../decorators/require-entitlement.decorator';
import { ADMIN_ROLES } from '../constants/admin-roles';

@Injectable()
export class EntitlementGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly entitlementEngine: EntitlementEngine
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<EntitlementOptions>(
      ENTITLEMENT_KEY,
      [context.getHandler(), context.getClass()]
    );

    if (!options) {
      return true; // No entitlement required
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const userId = user?.id;
    const userRole = user?.role as UserRole;

    if (!userId) {
      throw new ForbiddenException('User not authenticated');
    }

    // Role-based bypass logic
    const bypassRoles = options.bypassRoles ?? ADMIN_ROLES;

    if (bypassRoles.length > 0 && userRole && bypassRoles.includes(userRole)) {
      // User role can bypass this entitlement check
      request.entitlementResult = {
        allowed: true,
        reason: `Bypassed by ${userRole} role`,
      };
      return true;
    }

    // Regular entitlement check
    const result = options.consume
      ? await this.entitlementEngine.authorizeAndConsume(
          userId,
          options.key,
          options.amount
        )
      : await this.entitlementEngine.authorize(userId, options.key);

    if (!result.allowed) {
      throw new ForbiddenException(result.reason);
    }

    // Attach quota info to request for controller access
    request.entitlementResult = result;

    return true;
  }
}
