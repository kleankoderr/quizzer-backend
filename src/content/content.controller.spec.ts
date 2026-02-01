import { Test, TestingModule } from '@nestjs/testing';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';
import { BadRequestException } from '@nestjs/common';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { CreateContentDto } from './dto/content.dto';
import { QuotaService } from '../common/services/quota.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { QuotaGuard } from '../common/guards/quota.guard';

describe('ContentController', () => {
  let controller: ContentController;
  let service: DeepMockProxy<ContentService>;

  const USER_ID = 'user-123';
  const CONTENT_ID = 'content-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ContentController],
      providers: [
        {
          provide: ContentService,
          useValue: mockDeep<ContentService>(),
        },
        {
          provide: QuotaService,
          useValue: mockDeep<QuotaService>(),
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(QuotaGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ContentController>(ContentController);
    service = module.get(ContentService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('generateContent', () => {
    it('should throw BadRequest if no inputs', async () => {
      const dto = {} as CreateContentDto;
      await expect(
        controller.generateContent(USER_ID, dto, [])
      ).rejects.toThrow(BadRequestException);
    });

    it('should call service with valid input', async () => {
      const dto = { topic: 'Physics' } as CreateContentDto;
      service.generate.mockResolvedValue({ jobId: 'job-1' } as any);

      const result = await controller.generateContent(USER_ID, dto, []);
      expect(service.generate).toHaveBeenCalledWith(USER_ID, dto, []);
      expect(result).toEqual({ jobId: 'job-1' });
    });
  });

  describe('explainSection', () => {
    const body = { sectionTitle: 'Atom', sectionContent: 'Matter' };

    it('should call generateExplanation', async () => {
      service.generateExplanation.mockResolvedValue('Explanation');

      const result = await controller.explainSection(USER_ID, CONTENT_ID, body);

      expect(service.generateExplanation).toHaveBeenCalledWith(
        USER_ID,
        CONTENT_ID,
        body.sectionTitle,
        body.sectionContent
      );
      expect(result).toEqual({ explanation: 'Explanation' });
    });
  });

  describe('exampleSection', () => {
    const body = { sectionTitle: 'Atom', sectionContent: 'Matter' };

    it('should call generateExample', async () => {
      service.generateExample.mockResolvedValue('Example');

      const result = await controller.exampleSection(USER_ID, CONTENT_ID, body);

      expect(service.generateExample).toHaveBeenCalledWith(
        USER_ID,
        CONTENT_ID,
        body.sectionTitle,
        body.sectionContent
      );
      expect(result).toEqual({ examples: 'Example' });
    });
  });
});
