import { EVENTS } from './events.constants';

export { EVENTS };

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
  resourceType: 'flashcard-set';
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

export interface ContentCompletedEvent extends CompletionEvent {
  eventType: typeof EVENTS.CONTENT.COMPLETED;
  resourceType: 'content';
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
  | UserLevelUpEvent;

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
    message?: string
  ): FlashcardProgressEvent => ({
    eventType: EVENTS.FLASHCARD.PROGRESS,
    userId,
    jobId,
    step,
    percentage,
    message,
    timestamp: Date.now(),
  }),

  flashcardCompleted: (
    userId: string,
    flashcardSetId: string,
    cardCount: number,
    metadata?: Record<string, any>
  ): FlashcardCompletedEvent => ({
    eventType: EVENTS.FLASHCARD.COMPLETED,
    userId,
    resourceId: flashcardSetId,
    resourceType: 'flashcard-set',
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
    message?: string
  ): QuizProgressEvent => ({
    eventType: EVENTS.QUIZ.PROGRESS,
    userId,
    jobId,
    step,
    percentage,
    message,
    timestamp: Date.now(),
  }),

  quizCompleted: (
    userId: string,
    quizId: string,
    questionCount: number,
    metadata?: Record<string, any>
  ): QuizCompletedEvent => ({
    eventType: EVENTS.QUIZ.COMPLETED,
    userId,
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

  contentCompleted: (
    userId: string,
    contentId: string,
    metadata?: Record<string, any>
  ): ContentCompletedEvent => ({
    eventType: EVENTS.CONTENT.COMPLETED,
    userId,
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
};
