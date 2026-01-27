export const documentProcessingConfig = {
  directLoadThreshold: 10 * 1024 * 1024, // 10MB
  supportedDirectLoadTypes: [
    'application/pdf',
    'text/html',
    'text/plain',
    'text/markdown',
  ],
  chunkSize: 1000,
  chunkOverlap: 200,
};
