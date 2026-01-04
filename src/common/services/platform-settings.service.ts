import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { PrismaService } from '../../prisma/prisma.service';
import { PlatformSettings } from '@prisma/client';

export interface AiProviderConfig {
  files?: 'groq' | 'gemini';
  content?: 'groq' | 'gemini';
  [key: string]: string | undefined;
}

@Injectable()
export class PlatformSettingsService {
  private readonly CACHE_KEY = 'platform_settings';
  private readonly CACHE_TTL = 3600 * 1000; // 1 hour

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache
  ) {}

  async getSettings(): Promise<PlatformSettings> {
    const cached = await this.cacheManager.get<PlatformSettings>(
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

    await this.cacheManager.set(this.CACHE_KEY, settings, this.CACHE_TTL);
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

    await this.invalidateCache();
    // Re-cache immediately
    await this.cacheManager.set(this.CACHE_KEY, updated, this.CACHE_TTL);

    return updated;
  }

  async invalidateCache(): Promise<void> {
    await this.cacheManager.del(this.CACHE_KEY);
  }

  async getAiProviderConfig(): Promise<AiProviderConfig> {
    const settings = await this.getSettings();
    return (settings.aiProviderConfig as AiProviderConfig) || {};
  }
}
