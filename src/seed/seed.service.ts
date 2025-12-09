import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { UserRole } from '@prisma/client';

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap() {
    await this.seedSuperAdmin();
  }

  async seedSuperAdmin() {
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminEmail || !adminPassword) {
      this.logger.warn(
        'Super Admin credentials not found in environment variables. Skipping seeding.'
      );
      return;
    }

    try {
      // Check if database is ready
      await this.prisma.$queryRaw`SELECT 1`;

      const existingAdmin = await this.prisma.user.findUnique({
        where: { email: adminEmail },
      });

      if (existingAdmin) {
        this.logger.log('Super Admin account already exists.');

        // Ensure role is SUPER_ADMIN if it exists but has wrong role
        if (existingAdmin.role !== UserRole.SUPER_ADMIN) {
          await this.prisma.user.update({
            where: { id: existingAdmin.id },
            data: { role: UserRole.SUPER_ADMIN },
          });
          this.logger.log(
            'Updated existing admin account to SUPER_ADMIN role.'
          );
        }
        return;
      }

      const hashedPassword = await bcrypt.hash(adminPassword, 10);

      await this.prisma.user.create({
        data: {
          email: adminEmail,
          password: hashedPassword,
          name: 'Super Admin',
          role: UserRole.SUPER_ADMIN,
          schoolName: 'Quizzer HQ',
          grade: 'Admin',
        },
      });

      this.logger.log(
        `Super Admin account created successfully: ${adminEmail}`
      );
    } catch (error) {
      if (error.code === 'P2021') {
        this.logger.error(
          "Database tables do not exist. Please run 'npx prisma migrate deploy' before starting the application."
        );
      } else {
        this.logger.error('Failed to seed Super Admin account', error.message);
      }
      // Don't throw - let the app start so migrations can be run
    }
  }
}
