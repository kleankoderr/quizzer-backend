import { Injectable } from '@nestjs/common';
import { CacheService } from './cache.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PlatformSettings } from '@prisma/client';

// Since we removed multi-provider support, this is now a stub type
export type AiProviderConfig = Record<string, any>;

export interface AiOption {
  value: string;
  label: string;
}

export interface AiOptionsResponse {
  providers: AiOption[];
  tasks: AiOption[];
  complexities: AiOption[];
}

@Injectable()
export class PlatformSettingsService {
  private readonly CACHE_KEY = 'platform_settings';
  private readonly AI_OPTIONS_CACHE_KEY = 'ai_options';
  private readonly CACHE_TTL = 3600 * 1000; // 1 hour

  // Provider label mapping (no longer used with single provider)
  // private readonly PROVIDER_LABELS: Record<string, string> = {
  //   gemini: 'Google Gemini',
  // };

  // Task label mapping (can be customized)
  private readonly TASK_LABELS: Record<string, string> = {
    quiz: 'Quiz',
    flashcard: 'Flashcard',
    summary: 'Summary',
    recommendation: 'Recommendation',
    'study-material': 'Study Material',
    explanation: 'Explanation',
    learningGuide: 'Learning Guide',
  };

  // Complexity label mapping (no longer used)
  // private readonly COMPLEXITY_LABELS: Record<string, string> = {
  //   simple: 'Simple',
  //   medium: 'Medium',
  //   complex: 'Complex',
  // };

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

    // Invalidate both platform settings and AI options cache
    await this.invalidateCache();

    // Re-cache immediately
    await this.cacheService.set(this.CACHE_KEY, updated, this.CACHE_TTL);

    return updated;
  }

  async invalidateCache(): Promise<void> {
    await this.cacheService.invalidate(this.CACHE_KEY);
    await this.cacheService.invalidate(this.AI_OPTIONS_CACHE_KEY);
  }

  async getPublicSettings() {
    const settings = await this.getSettings();
    return {
      allowRegistration: settings.allowRegistration,
      maintenanceMode: settings.maintenanceMode,
      supportEmail: settings.supportEmail,
    };
  }

  async getAiProviderConfig(): Promise<AiProviderConfig | null> {
    const settings = await this.getSettings();
    return settings.aiProviderConfig as unknown as AiProviderConfig;
  }

  async getAiOptions(): Promise<AiOptionsResponse> {
    // Check cache first
    const cached = await this.cacheService.get<AiOptionsResponse>(
      this.AI_OPTIONS_CACHE_KEY
    );
    if (cached) {
      return cached;
    }

    const config = await this.getAiProviderConfig();

    if (!config) {
      // Return empty options if no config exists
      return {
        providers: [],
        tasks: [],
        complexities: [],
      };
    }

    // Extract providers from config
    const providers: AiOption[] = Object.keys(config.providers).map(
      (provider) => ({
        value: provider,
        label: this.formatLabel(provider),
      })
    );

    // Extract tasks from routing configuration
    const taskSet = new Set<string>();
    if (config.routing.taskRouting) {
      for (const task of Object.keys(config.routing.taskRouting)) {
        taskSet.add(task);
      }
    }
    const tasks: AiOption[] = Array.from(taskSet).map((task) => ({
      value: task,
      label: this.TASK_LABELS[task] || this.formatLabel(task),
    }));

    // Extract complexity levels from routing configuration
    const complexitySet = new Set<string>();
    if (config.routing.complexityRouting) {
      for (const complexity of Object.keys(config.routing.complexityRouting)) {
        complexitySet.add(complexity);
      }
    }
    const complexities: AiOption[] = Array.from(complexitySet).map(
      (complexity) => ({
        value: complexity,
        label: this.formatLabel(complexity),
      })
    );

    const options: AiOptionsResponse = {
      providers,
      tasks,
      complexities,
    };

    // Cache the derived options
    await this.cacheService.set(
      this.AI_OPTIONS_CACHE_KEY,
      options,
      this.CACHE_TTL
    );

    return options;
  }

  /**
   * Utility function to format a string into a readable label
   * e.g., 'study-material' -> 'Study Material'
   */
  private formatLabel(value: string): string {
    return value
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}
