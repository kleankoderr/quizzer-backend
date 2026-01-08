import { Injectable, Inject, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../common/services/cache.service';
import { REDIS_CLIENT } from '../cache/cache.module';
import { firstValueFrom } from 'rxjs';
import { createClient } from 'redis';

type RedisClientType = ReturnType<typeof createClient>;

@Injectable()
export class SchoolService {
  private readonly logger = new Logger(SchoolService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
    @Inject(REDIS_CLIENT) private readonly redisClient: RedisClientType,
    private readonly httpService: HttpService
  ) {}

  async getTopSchools() {
    const cacheKey = 'schools:top:10';
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    const schools = await this.prisma.school.findMany({
      take: 10,
      orderBy: {
        name: 'asc',
      },
    });

    // Cache for 24 hours
    await this.cacheService.set(cacheKey, schools, 24 * 60 * 60 * 1000);

    return schools;
  }

  async searchSchools(query: string) {
    if (!query || query.length < 2) {
      return [];
    }

    const cacheKey = `schools:search:${query.toLowerCase()}`;
    const cached = await this.cacheService.get(cacheKey);
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
      } catch (error) {
        // Log the error but continue with local results if external API fails
        this.logger.warn('External school API request failed', error);
      }
    }

    // Cache for 24 hours (in milliseconds)
    await this.cacheService.set(cacheKey, results, 24 * 60 * 60 * 1000);

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
      // Use the shared redis client directly
      const keys = await this.redisClient.keys('schools:search:*');
      if (keys && keys.length > 0) {
        await this.redisClient.del(keys);
      }
    } catch (error) {
      this.logger.error('Failed to invalidate school cache:', error);
    }
  }
}
