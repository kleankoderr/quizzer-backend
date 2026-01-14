import { Injectable } from '@nestjs/common';
import { ModelConfigService } from './model-config.service';
import { z } from 'zod';
import { ModelRoutingOptions } from './types';

export interface ChainInvokeOptions extends ModelRoutingOptions {}

@Injectable()
export class LangChainService {
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

    // Create structured model
    const structuredModel = model.withStructuredOutput(schema);

    // Invoke
    return await structuredModel.invoke(prompt);
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
