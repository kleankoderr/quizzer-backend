import { Controller, Get, Query } from '@nestjs/common';
import { SchoolService } from './school.service';

@Controller('schools')
export class SchoolController {
  constructor(private readonly schoolService: SchoolService) {}

  @Get()
  async getSchools() {
    return this.schoolService.getTopSchools();
  }

  @Get('search')
  async search(@Query('q') query: string) {
    return this.schoolService.searchSchools(query);
  }
}
