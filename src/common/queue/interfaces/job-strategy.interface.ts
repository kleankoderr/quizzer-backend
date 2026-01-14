import { Job } from 'bullmq';

export interface JobContext<TData = any> {
  userId: string;
  jobId: string;
  data: TData;
  startTime: number;
  [key: string]: any;
}

export interface JobResult<TResult = any> {
  success: boolean;
  data?: TResult;
  error?: string;
}

export interface JobStrategy<
  TData = any,
  TResult = any,
  TContext extends JobContext<TData> = JobContext<TData>,
> {
  /**
   * Pre-processing step: validation, data preparation, quota checking, etc.
   */
  preProcess(job: Job<TData>): Promise<TContext>;

  /**
   * Core execution step: AI generation, heavy processing, etc.
   */
  execute(context: TContext): Promise<TResult>;

  /**
   * Post-processing step: database persistence, linking, cache invalidation, etc.
   */
  postProcess(context: TContext, result: TResult): Promise<any>;

  /**
   * Data to be included in the COMPLETED event
   */
  getEventData(context: TContext, result: any): any;

  /**
   * Data to be included in the FAILED event
   */
  getFailureData(context: TContext, error: Error): any;

  /**
   * Cache patterns to invalidate on completion
   */
  getCachePatterns(context: TContext): string[];

  /**
   * Quota type to increment
   */
  getQuotaType(context: TContext): string;

  /**
   * Event names for completion and failure
   */
  getEventNames(): { completed: string; failed: string };
}
