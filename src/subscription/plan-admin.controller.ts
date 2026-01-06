import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/guards/admin.guard';
import { PlanManagementService } from './domain/services/plan-management.service';
import { CreatePlanDto, UpdatePlanDto } from './dto/plan-management.dto';

@ApiTags('Admin Subscriptions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/subscriptions/plans')
export class PlanAdminController {
  constructor(private readonly planService: PlanManagementService) {}

  @Get()
  @ApiOperation({ summary: 'Get all subscription plans' })
  async getPlans() {
    return this.planService.getAllPlans();
  }

  @Post()
  @ApiOperation({ summary: 'Create a new subscription plan' })
  async createPlan(@Body() dto: CreatePlanDto) {
    return this.planService.createPlan(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a subscription plan' })
  async updatePlan(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.planService.updatePlan(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete or deactivate a subscription plan' })
  async deletePlan(@Param('id') id: string) {
    return this.planService.deletePlan(id);
  }
}
