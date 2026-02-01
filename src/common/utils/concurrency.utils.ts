import { Logger } from '@nestjs/common';

export interface ConcurrencyConfig {
  maxConcurrent: number; // Max parallel executions
  retryAttempts?: number; // Retry failed items
  retryDelayMs?: number; // Initial delay between retries (exponential backoff applied)
}

export interface BatchResult<T> {
  successful: T[];
  failed: Array<{
    index: number;
    error: Error;
    item: any;
  }>;
}

/**
 * Utility for executing tasks in parallel with concurrency control.
 *
 * Features:
 * - Configurable concurrency limits
 * - Error isolation (one failure doesn't block others)
 * - Automatic retry with exponential backoff
 * - Order preservation for successful results
 *
 * @example
 * ```typescript
 * const result = await ConcurrencyManager.executeBatch(
 *   sections,
 *   async (section, index) => generateSection(section),
 *   { maxConcurrent: 3, retryAttempts: 2, retryDelayMs: 2000 }
 * );
 *
 * console.log(`${result.successful.length} succeeded, ${result.failed.length} failed`);
 * ```
 */
export class ConcurrencyManager {
  private static readonly logger = new Logger(ConcurrencyManager.name);

  /**
   * Execute tasks in parallel with concurrency limit.
   * Uses a semaphore pattern to control the number of concurrent executions.
   *
   * @param items - Array of items to process
   * @param executor - Async function to execute for each item
   * @param config - Concurrency configuration
   * @returns Batch result with successful and failed items
   */
  static async executeBatch<TInput, TOutput>(
    items: TInput[],
    executor: (item: TInput, index: number) => Promise<TOutput>,
    config: ConcurrencyConfig
  ): Promise<BatchResult<TOutput>> {
    const { maxConcurrent, retryAttempts = 0, retryDelayMs = 1000 } = config;

    if (items.length === 0) {
      return { successful: [], failed: [] };
    }

    this.logger.debug(
      `Starting batch execution: ${items.length} items, max ${maxConcurrent} concurrent`
    );

    const successful: TOutput[] = [];
    const failed: Array<{ index: number; error: Error; item: TInput }> = [];

    // Semaphore for concurrency control
    let activeCount = 0;
    const queue: Array<() => void> = [];

    const acquireSlot = (): Promise<void> => {
      if (activeCount < maxConcurrent) {
        activeCount++;
        return Promise.resolve();
      }

      // Wait for a slot to become available
      return new Promise((resolve) => {
        queue.push(() => {
          activeCount++;
          resolve();
        });
      });
    };

    const releaseSlot = (): void => {
      activeCount--;
      const next = queue.shift();
      if (next) {
        next();
      }
    };

    /**
     * Execute with automatic retry and exponential backoff
     */
    const executeWithRetry = async (
      item: TInput,
      index: number,
      attempt: number = 0
    ): Promise<TOutput> => {
      try {
        return await executor(item, index);
      } catch (error) {
        // Retry logic
        if (attempt < retryAttempts) {
          const delay = retryDelayMs * Math.pow(2, attempt); // Exponential backoff
          this.logger.warn(
            `Item ${index} failed (attempt ${attempt + 1}/${retryAttempts + 1}), retrying in ${delay}ms: ${error.message}`
          );

          await new Promise((resolve) => setTimeout(resolve, delay));
          return executeWithRetry(item, index, attempt + 1);
        }

        // Max retries reached
        throw error;
      }
    };

    // Process all items in parallel (with concurrency limit)
    const promises = items.map(async (item, index) => {
      await acquireSlot();

      try {
        const result = await executeWithRetry(item, index);
        successful[index] = result; // Preserve order
      } catch (error) {
        this.logger.error(
          `Item ${index} failed after ${retryAttempts + 1} attempts: ${error.message}`
        );
        failed.push({
          index,
          error: error as Error,
          item,
        });
      } finally {
        releaseSlot();
      }
    });

    await Promise.all(promises);

    // Filter out undefined values (from failed items that didn't populate the array)
    const filteredSuccessful = successful.filter((r) => r !== undefined);

    this.logger.debug(
      `Batch execution completed: ${filteredSuccessful.length} successful, ${failed.length} failed`
    );

    return {
      successful: filteredSuccessful,
      failed,
    };
  }

  /**
   * Execute tasks in sequential batches.
   * Useful for very large datasets where you want to process in waves.
   *
   * Each batch is processed with concurrency control, but batches are sequential.
   *
   * @param items - Array of items to process
   * @param executor - Async function to execute for each item
   * @param config - Concurrency configuration with batch size
   * @returns Combined batch result
   */
  static async executeInBatches<TInput, TOutput>(
    items: TInput[],
    executor: (item: TInput, index: number) => Promise<TOutput>,
    config: ConcurrencyConfig & { batchSize: number }
  ): Promise<BatchResult<TOutput>> {
    const { batchSize, ...concurrencyConfig } = config;
    const allSuccessful: TOutput[] = [];
    const allFailed: Array<{ index: number; error: Error; item: TInput }> = [];

    this.logger.debug(
      `Starting batched execution: ${items.length} items in batches of ${batchSize}`
    );

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(items.length / batchSize);

      this.logger.debug(
        `Processing batch ${batchNumber}/${totalBatches} (${batch.length} items)`
      );

      const result = await this.executeBatch(
        batch,
        executor,
        concurrencyConfig
      );

      allSuccessful.push(...result.successful);

      // Adjust indices for global position
      result.failed.forEach((f) => {
        allFailed.push({
          ...f,
          index: i + f.index,
        });
      });
    }

    this.logger.debug(
      `Batched execution completed: ${allSuccessful.length} successful, ${allFailed.length} failed`
    );

    return {
      successful: allSuccessful,
      failed: allFailed,
    };
  }

  /**
   * Execute a single async operation with retry logic.
   * Useful for standalone operations that need retry capability.
   *
   * @param operation - Async operation to execute
   * @param config - Retry configuration
   * @returns Operation result
   */
  static async executeWithRetry<T>(
    operation: () => Promise<T>,
    config: { retryAttempts: number; retryDelayMs: number }
  ): Promise<T> {
    const { retryAttempts, retryDelayMs } = config;

    for (let attempt = 0; attempt <= retryAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        if (attempt < retryAttempts) {
          const delay = retryDelayMs * Math.pow(2, attempt);
          this.logger.warn(
            `Operation failed (attempt ${attempt + 1}/${retryAttempts + 1}), retrying in ${delay}ms: ${error.message}`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          throw error;
        }
      }
    }

    throw new Error('Should not reach here');
  }
}
