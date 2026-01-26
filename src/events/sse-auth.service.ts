import { Injectable } from '@nestjs/common';
import { CacheService } from '../common/services/cache.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class SseAuthService {
  private readonly TOKEN_PREFIX = 'sse_auth_token:';
  private readonly TOKEN_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(private readonly cacheService: CacheService) {}

  async generateToken(userId: string): Promise<string> {
    const token = uuidv4();
    const key = `${this.TOKEN_PREFIX}${token}`;
    await this.cacheService.set(key, userId, this.TOKEN_TTL);
    return token;
  }

  async validateToken(token: string): Promise<string | null> {
    const key = `${this.TOKEN_PREFIX}${token}`;
    const userId = await this.cacheService.get<string>(key);

    if (userId) {
      await this.cacheService.invalidate(key);
    }

    return userId;
  }
}
