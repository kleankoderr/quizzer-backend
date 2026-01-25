import { Injectable, Logger } from '@nestjs/common';
import { ModelConfigService } from './model-config.service';
import { z } from 'zod';

export interface InvokeContext {
  userId?: string;
  jobId?: string;
  task?: string;
}

@Injectable()
export class LangChainService {
  private readonly logger = new Logger(LangChainService.name);
  private readonly DEFAULT_TIMEOUT_MS = 60000; // 60 seconds
  private readonly JSON_PARSER_TIMEOUT_MS = 60000; // 60 seconds

  constructor(private readonly modelConfig: ModelConfigService) {}

  /**
   * Invoke with structured output (Zod schema validation)
   * Includes performance tracking and timeout handling
   */
  async invokeWithStructure<T>(
    schema: z.ZodType<T>,
    prompt: string,
    context?: InvokeContext
  ): Promise<Record<string, any>> {
    const startTime = Date.now();
    const contextStr = context ? `[${context.task || 'unknown'}]` : '';

    this.logger.log(`${contextStr} Starting structured model invocation`);

    try {
      const model = this.modelConfig.getModel();

      // Create structured model with explicit options
      const structuredModel = model.withStructuredOutput(schema);

      // Invoke with timeout
      const response = await this.withTimeout(
        structuredModel.invoke(prompt),
        this.DEFAULT_TIMEOUT_MS,
        'Model invocation timed out. Please try again.'
      );

      const latency = Date.now() - startTime;
      this.logger.log(
        `${contextStr} Model invocation successful (${latency}ms)`
      );

      return response;
    } catch (err) {
      const latency = Date.now() - startTime;
      this.logger.error(
        `${contextStr} Model invocation failed after ${latency}ms: ${err.message}`,
        err.stack
      );

      // Provide user-friendly error message
      if (err.message?.includes('timeout')) {
        throw new Error(
          'The AI is taking too long to respond. Please try again with a shorter prompt or fewer items.'
        );
      }

      throw new Error('Failed to generate content. Please try again.');
    }
  }

  /**
   * Invoke without structure (returns string)
   */
  async invoke(prompt: string, context?: InvokeContext): Promise<string> {
    const startTime = Date.now();
    const contextStr = context ? `[${context.task || 'unknown'}]` : '';

    this.logger.log(`${contextStr} Starting text model invocation`);

    try {
      const model = this.modelConfig.getModel();
      const response = await this.withTimeout(
        model.invoke(prompt),
        this.DEFAULT_TIMEOUT_MS,
        'Model invocation timed out. Please try again.'
      );

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
   * Stream responses
   */
  async *stream(
    prompt: string,
    context?: InvokeContext
  ): AsyncIterable<string> {
    const contextStr = context ? `[${context.task || 'unknown'}]` : '';
    this.logger.log(`${contextStr} Starting streaming invocation`);

    const model = this.modelConfig.getModel();
    const stream = await model.stream(prompt);

    for await (const chunk of stream) {
      yield chunk.content as string;
    }
  }

  /**
   * Invoke with JSON parser fallback (for models that don't support structured output well)
   * Includes retry logic with exponential backoff
   */
  async invokeWithJsonParser(
    prompt: string,
    context?: InvokeContext,
    maxRetries = 3
  ): Promise<Record<string, any>> {
    const contextStr = context ? `[${context.task || 'unknown'}]` : '';

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const startTime = Date.now();

      try {
        this.logger.log(
          `${contextStr} JSON parser attempt ${attempt}/${maxRetries}`
        );

        const model = this.modelConfig.getModel();
        const response = await this.withTimeout(
          model.invoke(prompt),
          this.JSON_PARSER_TIMEOUT_MS,
          'Model invocation timed out during JSON parsing.'
        );
        const content = response.content as string;

        const jsonData = this.extractJSON(content);
        const latency = Date.now() - startTime;

        this.logger.log(
          `${contextStr} JSON parsing successful on attempt ${attempt} (${latency}ms)`
        );

        return jsonData as Record<string, any>;
      } catch (error) {
        const latency = Date.now() - startTime;
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        this.logger.error(
          `${contextStr} Attempt ${attempt}/${maxRetries} failed after ${latency}ms: ${errorMessage}`
        );

        if (attempt === maxRetries) {
          throw new Error(
            'Failed to generate valid content. Please try again or simplify your request.'
          );
        }

        // Exponential backoff: 2^attempt * 1000ms
        const backoffMs = Math.pow(2, attempt) * 1000;
        await this.delay(backoffMs);
      }
    }

    throw new Error('Unexpected end of retry loop');
  }

  /**
   * Timeout wrapper for promises
   */
  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    errorMessage: string
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
      ),
    ]);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private extractJSON(text: string): any {
    // Try extraction strategies in order of likelihood
    const strategies = [
      () => this.parseDirectly(text),
      () => this.extractFromCodeBlock(text),
      () => this.extractBalancedJson(text),
      () => this.parseRepairedJson(text),
    ];

    for (const strategy of strategies) {
      try {
        const result = strategy();
        if (result !== null) {
          return result;
        }
      } catch (error) {
        const strategyName = strategy.name || 'unknown';
        this.logger.debug(
          `Strategy ${strategyName} failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    const textSample = text.substring(0, 500);
    this.logger.error(
      `All JSON extraction strategies failed. Text sample: ${textSample}`
    );
    throw new Error('Could not extract valid JSON from response');
  }

  /**
   * Strategy 1: Parse text directly as JSON
   */
  private parseDirectly(text: string): any {
    return JSON.parse(text);
  }

  /**
   * Strategy 2: Extract JSON from markdown code blocks
   */
  private extractFromCodeBlock(text: string): any | null {
    const codeBlockPattern = /```(?:json)?\s*\n?([\s\S]*?)\n?```/;
    const match = codeBlockPattern.exec(text);

    if (match?.[1]) {
      return JSON.parse(match[1].trim());
    }

    return null;
  }

  /**
   * Strategy 3: Find and parse balanced JSON structure
   */
  private extractBalancedJson(text: string): any | null {
    const jsonText = this.findBalancedJson(text);
    return jsonText ? JSON.parse(jsonText) : null;
  }

  /**
   * Strategy 4: Repair and parse malformed JSON
   */
  private parseRepairedJson(text: string): any {
    const repaired = this.repairJSON(text);
    return JSON.parse(repaired);
  }

  /**
   * Find properly balanced JSON object or array
   */
  private findBalancedJson(text: string): string | null {
    const jsonStarters = [
      { start: '{', end: '}' },
      { start: '[', end: ']' },
    ];

    for (const { start, end } of jsonStarters) {
      const result = this.extractBalancedStructure(text, start, end);
      if (result) {
        return result;
      }
    }

    return null;
  }

  /**
   * Extract balanced structure between start and end characters
   */
  private extractBalancedStructure(
    text: string,
    startChar: string,
    endChar: string
  ): string | null {
    const startIndex = text.indexOf(startChar);
    if (startIndex === -1) {
      return null;
    }

    const state = {
      depth: 0,
      inString: false,
      escapeNext: false,
    };

    for (let i = startIndex; i < text.length; i++) {
      const char = text[i];

      if (this.updateParseState(state, char, startChar, endChar)) {
        return text.substring(startIndex, i + 1);
      }
    }

    return null;
  }

  /**
   * Update parsing state and return true if structure is complete
   */
  private updateParseState(
    state: { depth: number; inString: boolean; escapeNext: boolean },
    char: string,
    startChar: string,
    endChar: string
  ): boolean {
    if (state.escapeNext) {
      state.escapeNext = false;
      return false;
    }

    if (char === '\\') {
      state.escapeNext = true;
      return false;
    }

    if (char === '"') {
      state.inString = !state.inString;
      return false;
    }

    if (state.inString) {
      return false;
    }

    if (char === startChar) {
      state.depth++;
    } else if (char === endChar) {
      state.depth--;
    }

    return state.depth === 0;
  }

  /**
   * Repair common JSON formatting issues
   */
  private repairJSON(text: string): string {
    let json = text.trim();

    // Apply repair operations in sequence
    json = this.removeMarkdownCodeBlocks(json);
    json = this.extractJsonContent(json);
    json = this.fixCommonJsonIssues(json);

    return json;
  }

  /**
   * Remove markdown code block formatting
   */
  private removeMarkdownCodeBlocks(text: string): string {
    return text
      .replaceAll(/```(?:json)?\s*\n?/g, '')
      .replaceAll(/```\s*$/g, '');
  }

  /**
   * Extract JSON-like content from text
   */
  private extractJsonContent(text: string): string {
    const jsonMatch = new RegExp(/[\\{\\[][\s\S]*[\\}\]]/).exec(text);
    return jsonMatch ? jsonMatch[0] : text;
  }

  /**
   * Fix common JSON syntax issues
   */
  private fixCommonJsonIssues(json: string): string {
    return (
      json
        // Remove trailing commas before closing braces/brackets
        .replaceAll(/,(\s*[}\]])/g, '$1')
        // Fix unescaped newlines in strings (basic attempt)
        .replaceAll(/("|":\s*"[^"]*)\n([^"]*")/g, String.raw`$1\n$2`)
        // Remove control characters
        .replaceAll(/[\x00-\x1F\x7F]/g, '')
    );
  }
}
