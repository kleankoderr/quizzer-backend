import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import * as crypto from 'node:crypto';

@Injectable()
export class OtpService {
  /**
   * Generates a 6-digit numeric OTP
   */
  generateOtp(): string {
    // Generate a random number between 0 and 999999
    const otp = crypto.randomInt(0, 1000000);
    // Pad with leading zeros to ensure 6 digits
    return otp.toString().padStart(6, '0');
  }

  /**
   * Hashes the OTP for secure storage
   */
  async hashOtp(otp: string): Promise<string> {
    const saltRounds = 10;
    return bcrypt.hash(otp, saltRounds);
  }

  /**
   * Validates a plain OTP against a hashed OTP
   */
  async validateOtp(plainOtp: string, hashedOtp: string): Promise<boolean> {
    return bcrypt.compare(plainOtp, hashedOtp);
  }
}
