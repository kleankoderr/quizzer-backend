import { Injectable } from '@nestjs/common';
import { CacheService } from '../common/services/cache.service';

export interface OtpCacheData {
  hashedOtp: string;
  attempts: number;
}

@Injectable()
export class OtpCacheService {
  constructor(private readonly cacheService: CacheService) {}

  private getOtpKey(email: string): string {
    return `otp:${email}`;
  }

  private getLockKey(email: string): string {
    return `otp:lock:${email}`;
  }

  private getRateLimitGenKey(email: string): string {
    return `otp:ratelimit:gen:${email}`;
  }

  private getRateLimitResendKey(email: string): string {
    return `otp:ratelimit:resend:${email}`;
  }

  private getVerifiedKey(email: string): string {
    return `user:verified:${email}`;
  }

  private getPasswordResetOtpKey(email: string): string {
    return `otp:password-reset:${email}`;
  }

  /**
   * Caches the OTP with basic metadata
   */
  async cacheOtp(
    email: string,
    hashedOtp: string,
    ttlSeconds: number
  ): Promise<void> {
    const key = this.getOtpKey(email);
    const data: OtpCacheData = {
      hashedOtp,
      attempts: 0,
    };
    // cache-manager v5 set method takes ttl in milliseconds
    await this.cacheService.set(key, data, ttlSeconds * 1000);
  }

  /**
   * Retrieves the cached OTP data
   */
  async getCachedOtp(email: string): Promise<OtpCacheData | null> {
    const key = this.getOtpKey(email);
    // Use generics if available, otherwise cast
    return await this.cacheService.get<OtpCacheData>(key);
  }

  /**
   * Deletes the cached OTP (e.g., after successful verification)
   */
  async deleteCachedOtp(email: string): Promise<void> {
    const key = this.getOtpKey(email);
    await this.cacheService.invalidate(key);
  }

  /**
   * Increments the failed attempts counter.
   * Note: This might reset TTL if not carefully handled.
   * Ideally, we want to preserve the remaining TTL.
   * cache-manager doesn't easily return remaining TTL.
   * Strategy: We just use a fixed short TTL (e.g., 10 mins) for the update
   * which matches the OTP lifetime anyway.
   */
  async incrementFailedAttempts(email: string): Promise<number> {
    const key = this.getOtpKey(email);
    const data = await this.getCachedOtp(email);

    if (!data) return 0;

    data.attempts += 1;
    // Reset TTL to 10 mins (or original logic). keeping it simple.
    await this.cacheService.set(key, data, 600 * 1000);
    return data.attempts;
  }

  /**
   * Locks the account for a duration
   */
  async lockAccount(email: string, durationSeconds: number): Promise<void> {
    const key = this.getLockKey(email);
    await this.cacheService.set(key, true, durationSeconds * 1000);
  }

  /**
   * Checks if account is locked
   */
  async isAccountLocked(email: string): Promise<boolean> {
    const key = this.getLockKey(email);
    const value = await this.cacheService.get(key);
    return !!value;
  }

  /**
   * Rate Limit: Max 3 OTP generations per hour
   */
  async checkOtpGenerationRateLimit(
    email: string
  ): Promise<{ allowed: boolean; remaining: number }> {
    const key = this.getRateLimitGenKey(email);
    const count = (await this.cacheService.get<number>(key)) || 0;
    const maxAttempts = 3;
    const windowMs = 3600 * 1000; // 1 hour

    if (count >= maxAttempts) {
      return { allowed: false, remaining: 0 };
    }

    // Increment
    // Note: This logic resets the window on every request if we just set new TTL.
    // To properly do fixed window, we need to only set TTL if key doesn't exist.
    // But cache-manager simplistically:
    const newCount = count + 1;
    // If it's the first one, set TTL. If not, try to keep it?
    // cache-manager `set` usually overwrites.
    // Simple approach: Always set 1 hour TTL from *last* attempt.
    // This is "Sliding Window" of sorts, safer against spam.
    await this.cacheService.set(key, newCount, windowMs);

    return { allowed: true, remaining: maxAttempts - newCount };
  }

  /**
   * Rate Limit: Resend cooldown (60 seconds)
   */
  async checkOtpResendRateLimit(
    email: string
  ): Promise<{ allowed: boolean; retryAfter: number }> {
    const key = this.getRateLimitResendKey(email);
    const lastSent = await this.cacheService.get<number>(key);
    const cooldownMs = 60 * 1000;
    const now = Date.now();

    if (lastSent && now - lastSent < cooldownMs) {
      const remainingSeconds = Math.ceil(
        (cooldownMs - (now - lastSent)) / 1000
      );
      return { allowed: false, retryAfter: remainingSeconds };
    }

    // Allow and update timestamp
    await this.cacheService.set(key, now, cooldownMs); // TTL matches cooldown so it auto-expires
    return { allowed: true, retryAfter: 0 };
  }

  /**
   * Caches verification status for quick AuthGuard checks
   */
  async cacheVerificationStatus(
    email: string,
    isVerified: boolean
  ): Promise<void> {
    const key = this.getVerifiedKey(email);
    await this.cacheService.set(key, isVerified, 24 * 3600 * 1000); // 24 hours
  }

  /**
   * Gets cached verification status
   */
  async getVerificationStatus(email: string): Promise<boolean | null> {
    const key = this.getVerifiedKey(email);
    const val = await this.cacheService.get(key);
    // Explicit check because val could be false (which is valid)
    if (val === undefined || val === null) return null;
    return val as boolean;
  }

  /**
   * Caches password reset OTP
   */
  async cachePasswordResetOtp(
    email: string,
    hashedOtp: string,
    ttlSeconds: number
  ): Promise<void> {
    const key = this.getPasswordResetOtpKey(email);
    const data: OtpCacheData = {
      hashedOtp,
      attempts: 0,
    };
    await this.cacheService.set(key, data, ttlSeconds * 1000);
  }

  /**
   * Gets cached password reset OTP
   */
  async getCachedPasswordResetOtp(email: string): Promise<OtpCacheData | null> {
    const key = this.getPasswordResetOtpKey(email);
    return await this.cacheService.get<OtpCacheData>(key);
  }

  /**
   * Deletes cached password reset OTP
   */
  async deleteCachedPasswordResetOtp(email: string): Promise<void> {
    const key = this.getPasswordResetOtpKey(email);
    await this.cacheService.invalidate(key);
  }

  /**
   * Increments failed attempts for password reset
   */
  async incrementPasswordResetFailedAttempts(email: string): Promise<number> {
    const key = this.getPasswordResetOtpKey(email);
    const data = await this.getCachedPasswordResetOtp(email);
    if (!data) return 0;
    data.attempts += 1;
    await this.cacheService.set(key, data, 600 * 1000);
    return data.attempts;
  }
}
