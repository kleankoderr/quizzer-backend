/**
 * Utility functions for quizzes and questions.
 */
export class QuizUtils {
  /**
   * Shuffles an array in place using Fisher-Yates algorithm.
   */
  static shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /**
   * Normalizes and shuffles questions, especially for matching types.
   * Ensures that matching questions have a Record format for correctAnswer
   * and that columns are appropriately shuffled.
   */
  static normalizeQuestions(questions: any[]): any[] {
    return questions.map((q) => {
      if (q.questionType === 'matching') {
        let normalizedCorrectAnswer = q.correctAnswer;

        // Transform correctAnswer from array of {key, value} to Record if needed
        if (Array.isArray(q.correctAnswer)) {
          normalizedCorrectAnswer = q.correctAnswer.reduce(
            (acc: Record<string, string>, pair: any) => {
              if (
                pair &&
                typeof pair === 'object' &&
                'key' in pair &&
                'value' in pair
              ) {
                acc[pair.key] = pair.value;
              }
              return acc;
            },
            {}
          );
        }

        // Ensure columns exist and are shuffled
        const leftColumn =
          q.leftColumn && q.leftColumn.length > 0
            ? q.leftColumn
            : Object.keys(normalizedCorrectAnswer || {});
        const rightColumn =
          q.rightColumn && q.rightColumn.length > 0
            ? q.rightColumn
            : Array.from(
                new Set(
                  Object.values(normalizedCorrectAnswer || {}) as string[]
                )
              );

        return {
          ...q,
          correctAnswer: normalizedCorrectAnswer,
          leftColumn: this.shuffleArray(leftColumn),
          rightColumn: this.shuffleArray(rightColumn),
          options: undefined, // Matching doesn't need standard options
        };
      }
      return q;
    });
  }
}
