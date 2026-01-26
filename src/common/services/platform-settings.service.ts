import { Injectable } from '@nestjs/common';
import { CacheService } from './cache.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PlatformSettings } from '@prisma/client';

@Injectable()
export class PlatformSettingsService {
  private readonly CACHE_KEY = 'platform_settings';
  private readonly CACHE_TTL = 3600 * 1000; // 1 hour

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService
  ) {}

  async getSettings(): Promise<PlatformSettings> {
    const cached = await this.cacheService.get<PlatformSettings>(
      this.CACHE_KEY
    );
    if (cached) {
      return cached;
    }

    let settings = await this.prisma.platformSettings.findFirst();
    if (!settings) {
      settings = await this.prisma.platformSettings.create({
        data: { allowRegistration: true, maintenanceMode: false },
      });
    }

    await this.cacheService.set(this.CACHE_KEY, settings, this.CACHE_TTL);
    return settings;
  }

  async updateSettings(
    data: Partial<PlatformSettings>
  ): Promise<PlatformSettings> {
    const settings = await this.getSettings();

    const updated = await this.prisma.platformSettings.update({
      where: { id: settings.id },
      data,
    });

    // Invalidate cache
    await this.invalidateCache();

    // Re-cache immediately
    await this.cacheService.set(this.CACHE_KEY, updated, this.CACHE_TTL);

    return updated;
  }

  async invalidateCache(): Promise<void> {
    await this.cacheService.invalidate(this.CACHE_KEY);
  }

  async getPublicSettings() {
    const settings = await this.getSettings();
    return {
      allowRegistration: settings.allowRegistration,
      maintenanceMode: settings.maintenanceMode,
      supportEmail: settings.supportEmail,
    };
  }
}
