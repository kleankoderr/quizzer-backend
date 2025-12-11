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
