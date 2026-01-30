import { EVENTS } from './events.constants';

export { EVENTS };
export type { EventType } from './events.constants';

// ==================== BASE EVENT INTERFACES ====================

/**
 * Base event that all events must extend
 */
export interface BaseEvent {
  userId: string;
  eventType: string;
  timestamp?: number;
}

/**
 * Progress event for long-running operations
 */
export interface ProgressEvent extends BaseEvent {
  jobId: string;
  step: string;
  percentage: number;
  message?: string;
  metadata?: Record<string, any>;
}

/**
 * Completion event for successful operations
 */
export interface CompletionEvent extends BaseEvent {
  resourceId: string;
  resourceType: string;
  message?: string;
  metadata?: Record<string, any>;
}

/**
 * Error event for failed operations
 */
export interface ErrorEvent extends BaseEvent {
  error: string;
  errorCode?: string;
  details?: string;
  metadata?: Record<string, any>;
}

// ==================== FLASHCARD EVENTS ====================

export interface FlashcardProgressEvent extends ProgressEvent {
  eventType: typeof EVENTS.FLASHCARD.PROGRESS;
}

export interface FlashcardCompletedEvent extends CompletionEvent {
  eventType: typeof EVENTS.FLASHCARD.COMPLETED;
  resourceType: 'flashcard';
  jobId: string;
  flashcardSetId: string;
  cardCount: number;
}

export interface FlashcardFailedEvent extends ErrorEvent {
  eventType: typeof EVENTS.FLASHCARD.FAILED;
  jobId: string;
}

// ==================== QUIZ EVENTS ====================

export interface QuizProgressEvent extends ProgressEvent {
  eventType: typeof EVENTS.QUIZ.PROGRESS;
}

export interface QuizCompletedEvent extends CompletionEvent {
  eventType: typeof EVENTS.QUIZ.COMPLETED;
  resourceType: 'quiz';
  jobId: string;
  quizId: string;
  questionCount: number;
}

export interface QuizFailedEvent extends ErrorEvent {
  eventType: typeof EVENTS.QUIZ.FAILED;
  jobId: string;
}

// ==================== CONTENT EVENTS ====================

export interface ContentProgressEvent extends ProgressEvent {
  eventType: typeof EVENTS.CONTENT.PROGRESS;
}

export interface ContentSectionEvent extends BaseEvent {
  eventType: typeof EVENTS.CONTENT.SECTION;
  jobId: string;
  sectionIndex: number;
  sectionTitle: string;
  sectionContent: string;
  totalSections?: number;
}

export interface ContentCompletedEvent extends CompletionEvent {
  eventType: typeof EVENTS.CONTENT.COMPLETED;
  resourceType: 'content';
  jobId: string;
  contentId: string;
  topic: string;
}

export interface ContentFailedEvent extends ErrorEvent {
  eventType: typeof EVENTS.CONTENT.FAILED;
  jobId: string;
}

// ==================== NOTIFICATION EVENTS ====================

export interface NotificationNewEvent extends BaseEvent {
  eventType: typeof EVENTS.NOTIFICATION.NEW;
  notificationId: string;
  title: string;
  message: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  category?: string;
}

export interface NotificationReadEvent extends BaseEvent {
  eventType: typeof EVENTS.NOTIFICATION.READ;
  notificationId: string;
}

export interface NotificationDeletedEvent extends BaseEvent {
  eventType: typeof EVENTS.NOTIFICATION.DELETED;
  notificationId: string;
}

// ==================== STUDY EVENTS ====================

export interface StudySessionStartedEvent extends BaseEvent {
  eventType: typeof EVENTS.STUDY.SESSION_STARTED;
  sessionId: string;
  topic: string;
  resourceType: 'flashcard' | 'quiz';
  resourceId: string;
}

export interface StudySessionCompletedEvent extends BaseEvent {
  eventType: typeof EVENTS.STUDY.SESSION_COMPLETED;
  sessionId: string;
  topic: string;
  score: number;
  totalQuestions: number;
  correctAnswers: number;
  durationMs: number;
}

export interface StudyProgressUpdatedEvent extends BaseEvent {
  eventType: typeof EVENTS.STUDY.PROGRESS_UPDATED;
  topic: string;
  progressPercentage: number;
  masteryLevel: 'beginner' | 'intermediate' | 'advanced' | 'expert';
}

// ==================== USER EVENTS ====================

export interface UserStreakUpdatedEvent extends BaseEvent {
  eventType: typeof EVENTS.USER.STREAK_UPDATED;
  currentStreak: number;
  longestStreak: number;
  xpEarned: number;
}

export interface UserAchievementUnlockedEvent extends BaseEvent {
  eventType: typeof EVENTS.USER.ACHIEVEMENT_UNLOCKED;
  achievementId: string;
  achievementName: string;
  achievementDescription: string;
  xpReward: number;
  iconUrl?: string;
}

export interface UserLevelUpEvent extends BaseEvent {
  eventType: typeof EVENTS.USER.LEVEL_UP;
  newLevel: number;
  totalXp: number;
  xpToNextLevel: number;
  rewardsUnlocked?: string[];
}

// ==================== SUMMARY EVENTS ====================

export interface SummaryProgressEvent extends ProgressEvent {
  eventType: typeof EVENTS.SUMMARY.PROGRESS;
}

export interface SummaryChunkEvent extends BaseEvent {
  eventType: typeof EVENTS.SUMMARY.CHUNK;
  jobId: string;
  chunk: string;
}

export interface SummaryCompletedEvent extends CompletionEvent {
  eventType: typeof EVENTS.SUMMARY.COMPLETED;
  resourceType: 'summary';
  jobId: string;
  summaryId: string;
  shortCode: string;
}

export interface SummaryFailedEvent extends ErrorEvent {
  eventType: typeof EVENTS.SUMMARY.FAILED;
  studyMaterialId: string;
}

// ==================== LEARNING GUIDE EVENTS ====================

export interface LearningGuideOutlineCompletedEvent extends BaseEvent {
  eventType: typeof EVENTS.LEARNING_GUIDE.OUTLINE_COMPLETED;
  contentId: string;
  sections: Array<{ title: string; keywords?: string[] }>;
}

export interface LearningGuideSectionStartedEvent extends BaseEvent {
  eventType: typeof EVENTS.LEARNING_GUIDE.SECTION_STARTED;
  contentId: string;
  sectionIndex: number;
  sectionTitle: string;
}

export interface LearningGuideSectionChunkEvent extends BaseEvent {
  eventType: typeof EVENTS.LEARNING_GUIDE.SECTION_CHUNK;
  contentId: string;
  sectionIndex: number;
  chunk: string;
}

export interface LearningGuideSectionCompletedEvent extends BaseEvent {
  eventType: typeof EVENTS.LEARNING_GUIDE.SECTION_COMPLETED;
  contentId: string;
  sectionIndex: number;
}

export interface LearningGuideAllSectionsCompletedEvent extends BaseEvent {
  eventType: typeof EVENTS.LEARNING_GUIDE.ALL_SECTIONS_COMPLETED;
  contentId: string;
  totalSections: number;
}

// ==================== UNION TYPE ====================

/**
 * Union type for all possible application events
 * This ensures type safety when handling events
 */
export type AppEvent =
  // Flashcard events
  | FlashcardProgressEvent
  | FlashcardCompletedEvent
  | FlashcardFailedEvent
  // Quiz events
  | QuizProgressEvent
  | QuizCompletedEvent
  | QuizFailedEvent
  // Content events
  | ContentProgressEvent
  | ContentSectionEvent
  | ContentCompletedEvent
  | ContentFailedEvent
  // Notification events
  | NotificationNewEvent
  | NotificationReadEvent
  | NotificationDeletedEvent
  // Study events
  | StudySessionStartedEvent
  | StudySessionCompletedEvent
  | StudyProgressUpdatedEvent
  // User events
  | UserStreakUpdatedEvent
  | UserAchievementUnlockedEvent
  | UserLevelUpEvent
  // Summary events
  | SummaryProgressEvent
  | SummaryChunkEvent
  | SummaryCompletedEvent
  | SummaryFailedEvent
  // Learning Guide events
  | LearningGuideOutlineCompletedEvent
  | LearningGuideSectionStartedEvent
  | LearningGuideSectionChunkEvent
  | LearningGuideSectionCompletedEvent
  | LearningGuideAllSectionsCompletedEvent;

// ==================== EVENT FACTORIES ====================

/**
 * Factory functions to create well-typed events
 */
export const EventFactory = {
  flashcardProgress: (
    userId: string,
    jobId: string,
    step: string,
    percentage: number,
    message?: string,
    metadata?: Record<string, any>
  ): FlashcardProgressEvent => ({
    eventType: EVENTS.FLASHCARD.PROGRESS,
    userId,
    jobId,
    step,
    percentage,
    message,
    metadata,
    timestamp: Date.now(),
  }),

  flashcardCompleted: (
    userId: string,
    jobId: string,
    flashcardSetId: string,
    cardCount: number,
    metadata?: Record<string, any>
  ): FlashcardCompletedEvent => ({
    eventType: EVENTS.FLASHCARD.COMPLETED,
    userId,
    jobId,
    resourceId: flashcardSetId,
    resourceType: 'flashcard',
    flashcardSetId,
    cardCount,
    metadata,
    timestamp: Date.now(),
  }),

  flashcardFailed: (
    userId: string,
    jobId: string,
    error: string,
    details?: string
  ): FlashcardFailedEvent => ({
    eventType: EVENTS.FLASHCARD.FAILED,
    userId,
    jobId,
    error,
    details,
    timestamp: Date.now(),
  }),

  quizProgress: (
    userId: string,
    jobId: string,
    step: string,
    percentage: number,
    message?: string,
    metadata?: any
  ): QuizProgressEvent => ({
    eventType: EVENTS.QUIZ.PROGRESS,
    userId,
    jobId,
    step,
    percentage,
    message,
    metadata,
    timestamp: Date.now(),
  }),

  quizCompleted: (
    userId: string,
    jobId: string,
    quizId: string,
    questionCount: number,
    metadata?: Record<string, any>
  ): QuizCompletedEvent => ({
    eventType: EVENTS.QUIZ.COMPLETED,
    userId,
    jobId,
    resourceId: quizId,
    resourceType: 'quiz',
    quizId,
    questionCount,
    metadata,
    timestamp: Date.now(),
  }),

  quizFailed: (
    userId: string,
    jobId: string,
    error: string,
    details?: string
  ): QuizFailedEvent => ({
    eventType: EVENTS.QUIZ.FAILED,
    userId,
    jobId,
    error,
    details,
    timestamp: Date.now(),
  }),

  contentProgress: (
    userId: string,
    jobId: string,
    step: string,
    percentage: number,
    message?: string
  ): ContentProgressEvent => ({
    eventType: EVENTS.CONTENT.PROGRESS,
    userId,
    jobId,
    step,
    percentage,
    message,
    timestamp: Date.now(),
  }),

  contentSection: (
    userId: string,
    jobId: string,
    sectionIndex: number,
    sectionTitle: string,
    sectionContent: string,
    totalSections?: number
  ): ContentSectionEvent => ({
    eventType: EVENTS.CONTENT.SECTION,
    userId,
    jobId,
    sectionIndex,
    sectionTitle,
    sectionContent,
    totalSections,
    timestamp: Date.now(),
  }),

  contentCompleted: (
    userId: string,
    jobId: string,
    contentId: string,
    metadata?: Record<string, any>
  ): ContentCompletedEvent => ({
    eventType: EVENTS.CONTENT.COMPLETED,
    userId,
    jobId,
    resourceId: contentId,
    resourceType: 'content',
    contentId,
    topic: metadata?.topic || '',
    metadata,
    timestamp: Date.now(),
  }),

  contentFailed: (
    userId: string,
    jobId: string,
    error: string,
    details?: string
  ): ContentFailedEvent => ({
    eventType: EVENTS.CONTENT.FAILED,
    userId,
    jobId,
    error,
    details,
    timestamp: Date.now(),
  }),

  notificationNew: (
    userId: string,
    notificationId: string,
    title: string,
    message: string,
    priority: 'low' | 'normal' | 'high' | 'urgent' = 'normal',
    category?: string
  ): NotificationNewEvent => ({
    eventType: EVENTS.NOTIFICATION.NEW,
    userId,
    notificationId,
    title,
    message,
    priority,
    category,
    timestamp: Date.now(),
  }),

  streakUpdated: (
    userId: string,
    currentStreak: number,
    longestStreak: number,
    xpEarned: number
  ): UserStreakUpdatedEvent => ({
    eventType: EVENTS.USER.STREAK_UPDATED,
    userId,
    currentStreak,
    longestStreak,
    xpEarned,
    timestamp: Date.now(),
  }),

  achievementUnlocked: (
    userId: string,
    achievementId: string,
    achievementName: string,
    achievementDescription: string,
    xpReward: number,
    iconUrl?: string
  ): UserAchievementUnlockedEvent => ({
    eventType: EVENTS.USER.ACHIEVEMENT_UNLOCKED,
    userId,
    achievementId,
    achievementName,
    achievementDescription,
    xpReward,
    iconUrl,
    timestamp: Date.now(),
  }),

  levelUp: (
    userId: string,
    newLevel: number,
    totalXp: number,
    xpToNextLevel: number,
    rewardsUnlocked?: string[]
  ): UserLevelUpEvent => ({
    eventType: EVENTS.USER.LEVEL_UP,
    userId,
    newLevel,
    totalXp,
    xpToNextLevel,
    rewardsUnlocked,
    timestamp: Date.now(),
  }),

  summaryProgress: (
    userId: string,
    jobId: string,
    step: string,
    percentage: number,
    message?: string
  ): SummaryProgressEvent => ({
    eventType: EVENTS.SUMMARY.PROGRESS,
    userId,
    jobId,
    step,
    percentage,
    message,
    timestamp: Date.now(),
  }),

  summaryChunk: (
    userId: string,
    jobId: string,
    chunk: string
  ): SummaryChunkEvent => ({
    eventType: EVENTS.SUMMARY.CHUNK,
    userId,
    jobId,
    chunk,
    timestamp: Date.now(),
  }),

  summaryCompleted: (
    userId: string,
    jobId: string,
    summaryId: string,
    metadata?: Record<string, any>
  ): SummaryCompletedEvent => ({
    eventType: EVENTS.SUMMARY.COMPLETED,
    userId,
    jobId,
    resourceId: summaryId,
    resourceType: 'summary',
    summaryId,
    shortCode: metadata?.shortCode || '',
    metadata,
    timestamp: Date.now(),
  }),

  summaryFailed: (
    userId: string,
    studyMaterialId: string,
    error: string,
    details?: string
  ): SummaryFailedEvent => ({
    eventType: EVENTS.SUMMARY.FAILED,
    userId,
    studyMaterialId,
    error,
    details,
    timestamp: Date.now(),
  }),

  learningGuideOutlineCompleted: (
    userId: string,
    contentId: string,
    sections: Array<{ title: string; keywords?: string[] }>
  ): LearningGuideOutlineCompletedEvent => ({
    eventType: EVENTS.LEARNING_GUIDE.OUTLINE_COMPLETED,
    userId,
    contentId,
    sections,
    timestamp: Date.now(),
  }),

  learningGuideSectionStarted: (
    userId: string,
    contentId: string,
    sectionIndex: number,
    sectionTitle: string
  ): LearningGuideSectionStartedEvent => ({
    eventType: EVENTS.LEARNING_GUIDE.SECTION_STARTED,
    userId,
    contentId,
    sectionIndex,
    sectionTitle,
    timestamp: Date.now(),
  }),

  learningGuideSectionChunk: (
    userId: string,
    contentId: string,
    sectionIndex: number,
    chunk: string
  ): LearningGuideSectionChunkEvent => ({
    eventType: EVENTS.LEARNING_GUIDE.SECTION_CHUNK,
    userId,
    contentId,
    sectionIndex,
    chunk,
    timestamp: Date.now(),
  }),

  learningGuideSectionCompleted: (
    userId: string,
    contentId: string,
    sectionIndex: number
  ): LearningGuideSectionCompletedEvent => ({
    eventType: EVENTS.LEARNING_GUIDE.SECTION_COMPLETED,
    userId,
    contentId,
    sectionIndex,
    timestamp: Date.now(),
  }),

  learningGuideAllSectionsCompleted: (
    userId: string,
    contentId: string,
    totalSections: number
  ): LearningGuideAllSectionsCompletedEvent => ({
    eventType: EVENTS.LEARNING_GUIDE.ALL_SECTIONS_COMPLETED,
    userId,
    contentId,
    totalSections,
    timestamp: Date.now(),
  }),
};
