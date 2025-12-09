import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings() {
    // Get or create settings
    let settings = await this.prisma.platformSettings.findFirst();

    if (!settings) {
      settings = await this.prisma.platformSettings.create({
        data: {
          allowRegistration: true,
          maintenanceMode: false,
          supportEmail: null,
        },
      });
    }

    return settings;
  }

  async getPublicSettings() {
    const settings = await this.getSettings();
    return {
      allowRegistration: settings.allowRegistration,
      maintenanceMode: settings.maintenanceMode,
      supportEmail: settings.supportEmail,
    };
  }

  async updateSettings(data: {
    allowRegistration?: boolean;
    maintenanceMode?: boolean;
    supportEmail?: string;
  }) {
    const settings = await this.getSettings();

    return this.prisma.platformSettings.update({
      where: { id: settings.id },
      data,
    });
  }
}
