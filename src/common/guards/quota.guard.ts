import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { QuotaService, QuotaFeature } from '../services/quota.service';
import { QUOTA_FEATURE_KEY } from '../decorators/check-quota.decorator';

@Injectable()
export class QuotaGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private quotaService: QuotaService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const feature = this.reflector.get<QuotaFeature>(
      QUOTA_FEATURE_KEY,
      context.getHandler()
    );

    if (!feature) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id;

    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }

    await this.quotaService.checkQuota(userId, feature);

    return true;
  }
}
