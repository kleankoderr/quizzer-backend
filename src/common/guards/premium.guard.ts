import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { SubscriptionHelperService } from '../services/subscription-helper.service';

@Injectable()
export class PremiumGuard implements CanActivate {
  constructor(private readonly subscriptionHelper: SubscriptionHelperService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.sub || request.user?.id;

    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }

    // Check premium status from subscription (single source of truth)
    const isPremium = await this.subscriptionHelper.isPremiumUser(userId);

    if (!isPremium) {
      throw new ForbiddenException(
        'This feature is only available for premium users. Please upgrade to premium to access this feature.'
      );
    }

    return true;
  }
}
