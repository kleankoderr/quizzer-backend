import { Injectable, Inject, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '../prisma/prisma.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class SchoolService {
  private readonly logger = new Logger(SchoolService.name);
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private readonly httpService: HttpService
  ) {}

  async searchSchools(query: string) {
    if (!query || query.length < 2) {
      return [];
    }

    const cacheKey = `schools:search:${query.toLowerCase()}`;
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) {
      return cached;
    }

    // 1. Search in local DB
    let results = await this.prisma.school.findMany({
      where: {
        name: {
          contains: query,
          mode: 'insensitive',
        },
      },
      take: 10,
      orderBy: {
        name: 'asc',
      },
    });

    // 2. If not enough results, search external API
    if (results.length < 5) {
      try {
        const { data } = await firstValueFrom(
          this.httpService.get(
            `http://universities.hipolabs.com/search?name=${encodeURIComponent(
              query
            )}`
          )
        );

        // 3. Save new schools to DB
        const externalSchools = data.slice(0, 10); // Limit to top 10 from API

        for (const school of externalSchools) {
          // Check if already exists in our results (to avoid unnecessary DB calls)
          const exists = results.some(
            (r) => r.name.toLowerCase() === school.name.toLowerCase()
          );

          if (!exists) {
            // Save to DB (handles duplicates internally)
            const saved = await this.findOrCreate(school.name);
            // Only add to results if it wasn't there (findOrCreate returns the school object)
            if (!results.some((r) => r.id === saved.id)) {
              results.push(saved);
            }
          }
        }

        // Sort combined results
        results.sort((a, b) => a.name.localeCompare(b.name));
        results = results.slice(0, 10); // Limit total to 10
      } catch (_error) {
        // Continue with local results if external fails
      }
    }

    // Cache for 24 hours (in milliseconds)
    await this.cacheManager.set(cacheKey, results, 24 * 60 * 60 * 1000);

    return results;
  }

  async findOrCreate(name: string) {
    const normalizedName = name.trim();

    const existing = await this.prisma.school.findFirst({
      where: {
        name: {
          equals: normalizedName,
          mode: 'insensitive',
        },
      },
    });

    if (existing) {
      return existing;
    }

    const newSchool = await this.prisma.school.create({
      data: {
        name: normalizedName,
      },
    });

    await this.invalidateSchoolCache();

    return newSchool;
  }

  private async invalidateSchoolCache() {
    try {
      const store = (this.cacheManager as any).store;
      // Check if we have access to the redis client directly
      if ('client' in store) {
        const client = (store as any).client;
        // In node-redis v4+, keys returns an array of keys
        // We need to handle the prefix if the store adds one, but usually it doesn't unless configured
        const keys = await client.keys('schools:search:*');
        if (keys && keys.length > 0) {
          await client.del(keys);
        }
      }
    } catch (error) {
      this.logger.error('Failed to invalidate school cache:', error);
    }
  }
}
