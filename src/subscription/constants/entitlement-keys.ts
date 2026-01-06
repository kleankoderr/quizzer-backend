export const EntitlementKeys = {
  // Content Creation
  QUIZ: 'quiz',
  FLASHCARD: 'flashcard',
  STUDY_MATERIAL: 'studyMaterial',

  // AI Features
  AI_TUTOR: 'aiTutor',
  AI_REQUESTS: 'aiRequests',
  AI_QUIZ_GENERATION: 'aiQuizGeneration',

  // File Management
  FILE_UPLOAD: 'fileUpload',
  FILE_STORAGE: 'fileStorage',

  // Analytics
  ANALYTICS_ACCESS: 'analyticsAccess',
  EXPORT_DATA: 'exportData',

  // Rate Limiting
  API_RATE_LIMIT: 'apiRateLimit',

  // Access Levels
  ACCESS_LEVEL: 'accessLevel',

  // Weak Area
  WEAK_AREA_ANALYSIS: 'weakAreaAnalysis',

  // Advanced AI
  SMART_RECOMMENDATION: 'smartRecommendation',
  SMART_COMPANION: 'smartCompanion',
  CONCEPT_EXPLANATION: 'conceptExplanation',
} as const;

// Type-safe entitlement key type
export type EntitlementKey =
  (typeof EntitlementKeys)[keyof typeof EntitlementKeys];
