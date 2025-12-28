import { Test, TestingModule } from '@nestjs/testing';
import { UserDocumentController } from './user-document.controller';
import { UserDocumentService } from './user-document.service';
import { User } from '@prisma/client';

describe('UserDocumentController', () => {
  let controller: UserDocumentController;
  let service: UserDocumentService;

  const mockUserDocumentService = {
    getUserDocuments: jest.fn(),
    getUserDocumentById: jest.fn(),
    createUserDocument: jest.fn(),
    uploadFiles: jest.fn(),
    deleteUserDocument: jest.fn(),
    getCleanupSuggestions: jest.fn(),
  };

  const mockUser = {
    id: 'user-id',
    email: 'test@example.com',
  } as User;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserDocumentController],
      providers: [
        {
          provide: UserDocumentService,
          useValue: mockUserDocumentService,
        },
      ],
    }).compile();

    controller = module.get<UserDocumentController>(UserDocumentController);
    service = module.get<UserDocumentService>(UserDocumentService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getCleanupSuggestions', () => {
    it('should call service.getCleanupSuggestions', async () => {
      const suggestions = {
        needsCleanup: true,
        neededDeletion: 50,
        currentUsage: 100,
        limit: 50,
        suggestions: [],
      };

      mockUserDocumentService.getCleanupSuggestions.mockResolvedValue(
        suggestions
      );

      const result = await controller.getCleanupSuggestions(mockUser);

      expect(result).toEqual(suggestions);
      expect(service.getCleanupSuggestions).toHaveBeenCalledWith(mockUser.id);
    });
  });
});
