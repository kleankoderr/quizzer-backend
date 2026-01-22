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
  ): Promise<Record<string, any>> {
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

  /**
 * Invoke with structured output (Zod schema validation)
 * Model is automatically selected based on task metadata
 */
async invokeWithJsonParser(
  prompt: string,
  options: ChainInvokeOptions,
  maxRetries = 3
): Promise<Record<string, any>> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const model = await this.modelConfig.getModel(options);
      const response = await model.invoke(prompt);
      const content = response.content as string;
      
      const jsonData = this.extractJSON(content);
      this.logger.log('Model invocation successful');
      return jsonData as Record<string, any>;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Attempt ${attempt}/${maxRetries} failed: ${errorMessage}`);
      
      if (attempt === maxRetries) {
        throw new Error(`Failed to generate content after ${maxRetries} attempts: ${errorMessage}`);
      }
      
      // Wait before retrying with exponential backoff
      await this.delay(1000 * attempt);
    }
  }
  
  throw new Error('Unexpected end of retry loop');
}

private delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
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
      this.logger.debug(`Strategy ${strategyName} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const textSample = text.substring(0, 500);
  this.logger.error(`All JSON extraction strategies failed. Text sample: ${textSample}`);
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
  return json
    // Remove trailing commas before closing braces/brackets
    .replaceAll(/,(\s*[}\]])/g, '$1')
    // Fix unescaped newlines in strings (basic attempt)
    .replaceAll(/("|":\s*"[^"]*)\n([^"]*")/g, String.raw`$1\n$2`)
    // Remove control characters
    .replaceAll(/[\x00-\x1F\x7F]/g, '');
}
}