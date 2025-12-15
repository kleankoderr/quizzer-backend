export class UserDocumentDto {
  id: string;
  displayName: string;
  uploadedAt: Date;
  document: {
    id: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    cloudinaryUrl: string;
    googleFileUrl?: string;
  };
}

export class CreateUserDocumentDto {
  documentId: string;
  displayName?: string;
}

export class FileSelectionDto {
  userDocumentIds: string[];
}

export class UserDocumentListItemDto {
  id: string;
  displayName: string;
  uploadedAt: Date;
  createdAt: Date;
  studyPack?: {
    id: string;
    title: string;
  };
  document: {
    id: string;
    cloudinaryUrl: string;
  };
}

export class UserDocumentDetailDto extends UserDocumentListItemDto {
  userId: string;
  studyPackId?: string;
  document: {
    id: string;
    cloudinaryUrl: string;
    googleFileUrl?: string;
    googleFileId?: string;
  };
}
