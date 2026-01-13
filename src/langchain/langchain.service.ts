import { Injectable } from '@nestjs/common';
import { ModelConfigService } from './model-config.service';
import { z } from 'zod';

export interface ChainInvokeOptions {
  task: string; // 'quiz', 'flashcard', 'learning-guide', etc.
  hasFiles?: boolean; // For multimodal routing
  complexity?: 'simple' | 'medium' | 'complex';
}

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
    // Get routing configuration
    const routingConfig = this.modelConfig.getRoutingConfig(options);

    // Get the appropriate model
    const model = this.modelConfig.getModel(routingConfig);

    // Create structured model
    const structuredModel = model.withStructuredOutput(schema);

    // Invoke
    return await structuredModel.invoke(prompt);
  }

  /**
   * Invoke without structure (returns string)
   */
  async invoke(prompt: string, options: ChainInvokeOptions): Promise<string> {
    const routingConfig = this.modelConfig.getRoutingConfig(options);
    const model = this.modelConfig.getModel(routingConfig);

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
    const routingConfig = this.modelConfig.getRoutingConfig(options);
    const model = this.modelConfig.getModel(routingConfig);

    const stream = await model.stream(prompt);

    for await (const chunk of stream) {
      yield chunk.content as string;
    }
  }
}
