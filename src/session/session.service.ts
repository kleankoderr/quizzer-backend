import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from '../common/services/cache.service';
import { ConfigService } from '@nestjs/config';
import { SessionData, CreateSessionDto } from './interfaces/session.interface';
import { createHash } from 'crypto';

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private readonly sessionTTL: number;

  constructor(
    private readonly cacheService: CacheService,
    private readonly configService: ConfigService
  ) {
    // Default to 7 days (604800 seconds)
    this.sessionTTL = this.configService.get<number>('SESSION_TTL') || 604800;
  }

  /**
   * Create a new session in Redis
   */
  async createSession(dto: CreateSessionDto): Promise<string> {
    const sessionId = this.generateSessionId(dto.userId, dto.token);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.sessionTTL * 1000);

    const sessionData: SessionData = {
      userId: dto.userId,
      email: dto.email,
      token: dto.token,
      deviceInfo: dto.deviceInfo,
      ipAddress: dto.ipAddress,
      userAgent: dto.userAgent,
      createdAt: now,
      lastActivity: now,
      expiresAt,
    };

    // Store session in Redis with TTL
    await this.cacheService.set(
      `session:${sessionId}`,
      sessionData,
      this.sessionTTL * 1000 // Convert to milliseconds
    );

    // Track user's active sessions
    await this.addToUserSessions(dto.userId, sessionId);

    this.logger.log(`Session created: ${sessionId} for user ${dto.userId}`);
    return sessionId;
  }

  /**
   * Get session data by session ID
   */
  async getSession(sessionId: string): Promise<SessionData | null> {
    const session = await this.cacheService.get<SessionData>(
      `session:${sessionId}`
    );

    if (session) {
      // Update last activity timestamp
      session.lastActivity = new Date();
      await this.cacheService.set(
        `session:${sessionId}`,
        session,
        this.sessionTTL * 1000
      );
    }

    return session || null;
  }

  /**
   * Invalidate a specific session
   */
  async invalidateSession(sessionId: string): Promise<void> {
    const session = await this.cacheService.get<SessionData>(
      `session:${sessionId}`
    );

    if (session) {
      await this.removeFromUserSessions(session.userId, sessionId);
      await this.cacheService.invalidate(`session:${sessionId}`);
      this.logger.log(`Session invalidated: ${sessionId}`);
    }
  }

  /**
   * Invalidate all sessions for a user (logout all devices)
   */
  async invalidateAllUserSessions(userId: string): Promise<void> {
    const sessionIds = await this.getUserSessions(userId);

    for (const sessionId of sessionIds) {
      await this.cacheService.invalidate(`session:${sessionId}`);
    }

    await this.cacheService.invalidate(`user:sessions:${userId}`);
    this.logger.log(`All sessions invalidated for user ${userId}`);
  }

  /**
   * Check if token is blacklisted
   */
  async isTokenBlacklisted(token: string): Promise<boolean> {
    const tokenHash = this.hashToken(token);
    const blacklisted = await this.cacheService.get<boolean>(
      `blacklist:${tokenHash}`
    );
    return !!blacklisted;
  }

  /**
   * Blacklist a token (for logout or security)
   */
  async blacklistToken(token: string, expiresIn: number): Promise<void> {
    const tokenHash = this.hashToken(token);
    await this.cacheService.set(
      `blacklist:${tokenHash}`,
      true,
      expiresIn * 1000
    );
    this.logger.log('Token blacklisted');
  }

  /**
   * Get all active sessions for a user
   */
  async getUserSessions(userId: string): Promise<string[]> {
    const sessions = await this.cacheService.get<string[]>(
      `user:sessions:${userId}`
    );
    return sessions || [];
  }

  /**
   * Get detailed session information for all user sessions
   */
  async getUserSessionDetails(userId: string): Promise<SessionData[]> {
    const sessionIds = await this.getUserSessions(userId);
    const sessions: SessionData[] = [];

    for (const sessionId of sessionIds) {
      const session = await this.getSession(sessionId);
      if (session) {
        sessions.push(session);
      }
    }

    return sessions;
  }

  /**
   * Add session ID to user's active sessions list
   */
  private async addToUserSessions(
    userId: string,
    sessionId: string
  ): Promise<void> {
    const sessions = await this.getUserSessions(userId);
    sessions.push(sessionId);

    await this.cacheService.set(
      `user:sessions:${userId}`,
      sessions,
      this.sessionTTL * 1000
    );
  }

  /**
   * Remove session ID from user's active sessions list
   */
  private async removeFromUserSessions(
    userId: string,
    sessionId: string
  ): Promise<void> {
    const sessions = await this.getUserSessions(userId);
    const filtered = sessions.filter((id) => id !== sessionId);

    if (filtered.length > 0) {
      await this.cacheService.set(
        `user:sessions:${userId}`,
        filtered,
        this.sessionTTL * 1000
      );
    } else {
      await this.cacheService.invalidate(`user:sessions:${userId}`);
    }
  }

  /**
   * Generate a unique session ID
   */
  private generateSessionId(userId: string, token: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    return this.hashToken(`${userId}:${token}:${timestamp}:${random}`);
  }

  /**
   * Hash a token for storage
   */
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
