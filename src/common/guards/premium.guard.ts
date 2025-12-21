import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserPlan } from '@prisma/client';

@Injectable()
export class PremiumGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.sub || request.user?.id;

    if (!userId) {
      throw new UnauthorizedException('User not authenticated');
    }

    // Fetch user from database to check plan
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.plan !== UserPlan.PREMIUM) {
      throw new ForbiddenException(
        'This feature is only available for premium users. Please upgrade to premium to access this feature.'
      );
    }

    return true;
  }
}
