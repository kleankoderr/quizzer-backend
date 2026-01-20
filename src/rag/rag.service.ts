import { Injectable } from '@nestjs/common';
import { VectorStoreService } from './vector-store.service';
import { ModelConfigService } from '../langchain/model-config.service';
import { z } from 'zod';

@Injectable()
export class RagService {
  constructor(
    private readonly vectorStore: VectorStoreService,
    private readonly modelConfig: ModelConfigService
  ) {}

  /**
   * Query with RAG context (returns text)
   */
  async query(
    question: string,
    options: {
      task: string;
      topK?: number;
      filter?: Record<string, any>;
    }
  ): Promise<{ answer: string; sources: any[] }> {
    const model = await this.modelConfig.getModel({
      task: options.task,
      complexity: 'medium',
    });

    // Get relevant documents
    const docs = await this.vectorStore.similaritySearch(
      question,
      options.topK || 5,
      options.filter
    );

    // Build context from documents
    const context = docs.map((doc) => doc.pageContent).join('\n\n');

    // Create prompt with context
    const prompt = `Use the following context to answer the question. If you cannot answer based on the context, say so.

Context:
${context}

Question: ${question}

Answer:`;

    // Get answer
    const response = await model.invoke(prompt);

    return {
      answer: response.content as string,
      sources: docs,
    };
  }

  /**
   * Query with structured output (RAG + Zod schema)
   */
  async queryWithStructure<T>(
    question: string,
    schema: z.ZodType<T>,
    options: {
      task: string;
      topK?: number;
      filter?: Record<string, any>;
    }
  ): Promise<Record<string, any>> {
    // Get relevant documents
    const docs = await this.vectorStore.similaritySearch(
      question,
      options.topK || 5,
      options.filter
    );

    // Build context from documents
    const context = docs.map((doc) => doc.pageContent).join('\n\n');

    // Get model with structured output
    const model = await this.modelConfig.getModel({
      task: options.task,
      complexity: 'medium',
    });
    const structuredModel = model.withStructuredOutput(schema);

    // Create prompt with context
    const prompt = `Based on the following context, ${question}

Context:
${context}`;

    return await structuredModel.invoke(prompt);
  }
}
