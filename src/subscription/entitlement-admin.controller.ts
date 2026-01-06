import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/guards/admin.guard';
import { EntitlementService } from './domain/services/entitlement.service';
import { CreateEntitlementDto } from './dto/plan-management.dto';

@ApiTags('Admin Subscriptions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/subscriptions/entitlements')
export class EntitlementAdminController {
  constructor(private readonly entitlementService: EntitlementService) {}

  @Get()
  @ApiOperation({ summary: 'Get all feature entitlements' })
  async getEntitlements() {
    return this.entitlementService.getAll();
  }

  @Get(':key')
  @ApiOperation({ summary: 'Get a feature entitlement by key' })
  async getEntitlementByKey(@Body('key') key: string) {
    return this.entitlementService.getByKey(key);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new feature entitlement' })
  async createEntitlement(@Body() dto: CreateEntitlementDto) {
    return this.entitlementService.create(dto);
  }
}
