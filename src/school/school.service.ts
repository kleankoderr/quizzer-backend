import { Injectable, Inject } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { Cache } from "cache-manager";

@Injectable()
export class SchoolService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
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

    const results = await this.prisma.school.findMany({
      where: {
        name: {
          contains: query,
          mode: "insensitive",
        },
      },
      take: 10,
      orderBy: {
        name: "asc",
      },
    });

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
          mode: "insensitive",
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
      if ("client" in store) {
        const client = (store as any).client;
        // In node-redis v4+, keys returns an array of keys
        // We need to handle the prefix if the store adds one, but usually it doesn't unless configured
        const keys = await client.keys("schools:search:*");
        if (keys && keys.length > 0) {
          await client.del(keys);
        }
      }
    } catch (error) {
      console.error("Failed to invalidate school cache:", error);
    }
  }
}
