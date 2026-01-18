import { Injectable, Logger } from '@nestjs/common';
import { ModelConfigService } from './model-config.service';
import { z } from 'zod';
import { ModelRoutingOptions } from './types';

export type ChainInvokeOptions = ModelRoutingOptions;

@Injectable()
export class LangChainService {
  private readonly logger = new Logger(LangChainService.name);
  constructor(private readonly modelConfig: ModelConfigService) {}

  /**
   * Invoke with structured output (Zod schema validation)
   * Model is automatically selected based on task metadata
   */
  async invokeWithStructure<T>(
    schema: z.ZodType<T>,
    prompt: string,
    options: ChainInvokeOptions
  ): Promise<T> {
    // Get the appropriate model (now async and handles routing)
    const model = await this.modelConfig.getModel(options);

    // Create structured model with explicit options
    const structuredModel = model.withStructuredOutput(schema);

    // Invoke
    const response = await structuredModel.invoke(prompt).catch((err) => {
      this.logger.error(`Error during model invocation: ${err.message}`);
      throw new Error('Failed to invoke model with structured output.');
    });
    this.logger.log('Model invocation successful.');
    return response;
  }

  /**
   * Invoke without structure (returns string)
   */
  async invoke(prompt: string, options: ChainInvokeOptions): Promise<string> {
    const model = await this.modelConfig.getModel(options);

    const response = await model.invoke(prompt);

    return response.content as string;
  }

  /**
   * Stream responses
   */
  async *stream(
    prompt: string,
    options: ChainInvokeOptions
  ): AsyncIterable<string> {
    const model = await this.modelConfig.getModel(options);

    const stream = await model.stream(prompt);

    for await (const chunk of stream) {
      yield chunk.content as string;
    }
  }
}
