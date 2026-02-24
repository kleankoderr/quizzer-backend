import { Injectable, Logger } from '@nestjs/common';
import { ModelConfigService } from './model-config.service';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { z } from 'zod';

export interface InvokeContext {
  userId?: string;
  jobId?: string;
  task?: string;
}

@Injectable()
export class LangChainService {
  private readonly logger = new Logger(LangChainService.name);
  private readonly TIMEOUT_MS = 60_000; // 1 minute

  constructor(private readonly modelConfig: ModelConfigService) {}

  /**
   * Invoke a ChatPromptTemplate → StructuredOutput chain.
   * Uses LangChain's pipe composition: prompt.pipe(model.withStructuredOutput(schema))
   * This properly separates system/human messages for better model performance.
   */
  async invokeChain<T>(
    prompt: ChatPromptTemplate,
    schema: z.ZodType<T>,
    variables: Record<string, string>,
    context?: InvokeContext,
  ): Promise<T> {
    const startTime = Date.now();
    const contextStr = context ? `[${context.task || 'unknown'}]` : '';

    this.logger.log(`${contextStr} Starting chain invocation`);

    try {
      const model = this.modelConfig.getModel();
      const structuredModel = model.withStructuredOutput(schema, {
        method: 'functionCalling',
        name: context?.task ?? 'extract',
      });

      const chain = prompt.pipe(structuredModel);

      const response = await chain.invoke(variables, {
        timeout: this.TIMEOUT_MS,
      });

      const latency = Date.now() - startTime;
      this.logger.log(`${contextStr} Chain invocation successful (${latency}ms)`);

      return response as T;
    } catch (err) {
      const latency = Date.now() - startTime;
      this.logger.error(
        `${contextStr} Chain invocation failed after ${latency}ms: ${err.message}`,
        err.stack,
      );

      if (
        err.message?.includes('timeout') ||
        err.message?.includes('timed out') ||
        err.message?.includes('aborted')
      ) {
        throw new Error(
          'The AI is taking too long to respond. Please try again with a shorter prompt or fewer items.',
        );
      }

      throw new Error('Failed to generate content. Please try again.');
    }
  }

  /**
   * Invoke with structured output using Zod schema (legacy — raw string prompt).
   * Uses model.withStructuredOutput() which enforces the schema at the API level
   * (Gemini's native structured output) — guaranteed valid JSON matching the schema.
   */
  async invokeWithStructure<T>(
    schema: z.ZodType<T>,
    prompt: string,
    context?: InvokeContext
  ): Promise<T> {
    const startTime = Date.now();
    const contextStr = context ? `[${context.task || 'unknown'}]` : '';

    this.logger.log(`${contextStr} Starting structured output invocation`);

    try {
      const model = this.modelConfig.getModel();
      const structuredModel = model.withStructuredOutput(schema, {
        method: 'functionCalling',
        name: context?.task ?? 'extract',
      });

      const response = await structuredModel.invoke(prompt, {
        timeout: this.TIMEOUT_MS,
      });

      const latency = Date.now() - startTime;
      this.logger.log(
        `${contextStr} Structured output successful (${latency}ms)`
      );

      return response as T;
    } catch (err) {
      const latency = Date.now() - startTime;
      this.logger.error(
        `${contextStr} Structured output failed after ${latency}ms: ${err.message}`,
        err.stack
      );

      if (
        err.message?.includes('timeout') ||
        err.message?.includes('timed out') ||
        err.message?.includes('aborted')
      ) {
        throw new Error(
          'The AI is taking too long to respond. Please try again with a shorter prompt or fewer items.'
        );
      }

      throw new Error('Failed to generate content. Please try again.');
    }
  }

  /**
   * Invoke a ChatPromptTemplate chain that returns plain text (no structured output).
   * Uses prompt.pipe(model) for proper system/human message separation.
   */
  async invokeChainText(
    prompt: ChatPromptTemplate,
    variables: Record<string, string>,
    context?: InvokeContext,
  ): Promise<string> {
    const startTime = Date.now();
    const contextStr = context ? `[${context.task || 'unknown'}]` : '';

    this.logger.log(`${contextStr} Starting text chain invocation`);

    try {
      const model = this.modelConfig.getModel();
      const chain = prompt.pipe(model);

      const response = await chain.invoke(variables, {
        timeout: this.TIMEOUT_MS,
      });

      const latency = Date.now() - startTime;
      this.logger.log(`${contextStr} Text chain invocation successful (${latency}ms)`);

      return response.content as string;
    } catch (err) {
      const latency = Date.now() - startTime;
      this.logger.error(
        `${contextStr} Text chain invocation failed after ${latency}ms: ${err.message}`,
      );
      throw new Error('Failed to generate text. Please try again.');
    }
  }

  /**
   * Stream a ChatPromptTemplate chain for real-time output.
   * Uses prompt.pipe(model) with streaming for proper message separation.
   */
  async *streamChain(
    prompt: ChatPromptTemplate,
    variables: Record<string, string>,
    context?: InvokeContext,
  ): AsyncIterable<string> {
    const contextStr = context ? `[${context.task || 'unknown'}]` : '';
    this.logger.log(`${contextStr} Starting streaming chain invocation`);

    const model = this.modelConfig.getModel();
    const chain = prompt.pipe(model);

    const stream = await chain.stream(variables, {
      timeout: this.TIMEOUT_MS,
    });

    for await (const chunk of stream) {
      yield chunk.content as string;
    }
  }

  /**
   * Invoke without structure (returns string) — legacy raw string version
   */
  async invoke(prompt: string, context?: InvokeContext): Promise<string> {
    const startTime = Date.now();
    const contextStr = context ? `[${context.task || 'unknown'}]` : '';

    this.logger.log(`${contextStr} Starting text model invocation`);

    try {
      const model = this.modelConfig.getModel();
      const response = await model.invoke(prompt, {
        timeout: this.TIMEOUT_MS,
      });

      const latency = Date.now() - startTime;
      this.logger.log(
        `${contextStr} Text invocation successful (${latency}ms)`
      );

      return response.content as string;
    } catch (err) {
      const latency = Date.now() - startTime;
      this.logger.error(
        `${contextStr} Text invocation failed after ${latency}ms: ${err.message}`
      );
      throw new Error('Failed to generate text. Please try again.');
    }
  }

  /**
   * Stream responses — legacy raw string version
   */
  async *stream(
    prompt: string,
    context?: InvokeContext
  ): AsyncIterable<string> {
    const contextStr = context ? `[${context.task || 'unknown'}]` : '';
    this.logger.log(`${contextStr} Starting streaming invocation`);

    const model = this.modelConfig.getModel();
    const stream = await model.stream(prompt, {
      timeout: this.TIMEOUT_MS,
    });

    for await (const chunk of stream) {
      yield chunk.content as string;
    }
  }

}
