/**
 * Application-wide event type definitions
 * Used for event-driven communication between services
 */
export const EVENTS = {
  FLASHCARD: {
    PROGRESS: 'flashcard.progress',
    COMPLETED: 'flashcard.completed',
    FAILED: 'flashcard.failed',
  },
  QUIZ: {
    PROGRESS: 'quiz.progress',
    COMPLETED: 'quiz.completed',
    FAILED: 'quiz.failed',
  },
  CONTENT: {
    PROGRESS: 'content.progress',
    SECTION: 'content.section',
    COMPLETED: 'content.completed',
    FAILED: 'content.failed',
  },
  NOTIFICATION: {
    NEW: 'notification.new',
    READ: 'notification.read',
    DELETED: 'notification.deleted',
  },
  STUDY: {
    SESSION_STARTED: 'study.session.started',
    SESSION_COMPLETED: 'study.session.completed',
    PROGRESS_UPDATED: 'study.progress.updated',
  },
  USER: {
    STREAK_UPDATED: 'user.streak.updated',
    ACHIEVEMENT_UNLOCKED: 'user.achievement.unlocked',
    LEVEL_UP: 'user.level.up',
  },
  SUMMARY: {
    PROGRESS: 'summary.progress',
    CHUNK: 'summary.chunk',
    COMPLETED: 'summary.completed',
    FAILED: 'summary.failed',
  },
  LEARNING_GUIDE: {
    OUTLINE_COMPLETED: 'learning-guide.outline.completed',
    SECTION_STARTED: 'learning-guide.section.started',
    SECTION_CHUNK: 'learning-guide.section.chunk',
    SECTION_COMPLETED: 'learning-guide.section.completed',
    ALL_SECTIONS_COMPLETED: 'learning-guide.all-sections.completed',
  },
} as const;

/**
 * Union type of all event types for type safety
 */
export type EventType =
  | (typeof EVENTS.FLASHCARD)[keyof typeof EVENTS.FLASHCARD]
  | (typeof EVENTS.QUIZ)[keyof typeof EVENTS.QUIZ]
  | (typeof EVENTS.CONTENT)[keyof typeof EVENTS.CONTENT]
  | (typeof EVENTS.NOTIFICATION)[keyof typeof EVENTS.NOTIFICATION]
  | (typeof EVENTS.STUDY)[keyof typeof EVENTS.STUDY]
  | (typeof EVENTS.USER)[keyof typeof EVENTS.USER]
  | (typeof EVENTS.SUMMARY)[keyof typeof EVENTS.SUMMARY]
  | (typeof EVENTS.LEARNING_GUIDE)[keyof typeof EVENTS.LEARNING_GUIDE];
