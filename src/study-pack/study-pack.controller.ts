import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { StudyPackService } from './study-pack.service';
import {
  CreateStudyPackDto,
  UpdateStudyPackDto,
  MoveItemDto,
} from './dto/study-pack.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('study-packs')
@UseGuards(JwtAuthGuard)
export class StudyPackController {
  constructor(private readonly studyPackService: StudyPackService) {}
  @Post()
  create(
    @CurrentUser('sub') userId: string,
    @Body() createStudyPackDto: CreateStudyPackDto
  ) {
    return this.studyPackService.create(userId, createStudyPackDto);
  }

  @Get()
  findAll(
    @CurrentUser('sub') userId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number
  ) {
    return this.studyPackService.findAll(userId, page, limit);
  }

  @Get(':id')
  findOne(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.studyPackService.findOne(id, userId);
  }

  @Patch(':id')
  update(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
    @Body() updateStudyPackDto: UpdateStudyPackDto
  ) {
    return this.studyPackService.update(id, userId, updateStudyPackDto);
  }

  @Delete(':id')
  remove(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    return this.studyPackService.remove(id, userId);
  }

  @Post(':id/move')
  moveItem(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
    @Body() moveItemDto: MoveItemDto
  ) {
    return this.studyPackService.moveItem(id, userId, moveItemDto);
  }

  @Post(':id/remove-item')
  removeItem(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
    @Body() moveItemDto: MoveItemDto // reuse MoveItemDto as it has type and itemId
  ) {
    return this.studyPackService.removeItem(id, userId, moveItemDto);
  }
}
