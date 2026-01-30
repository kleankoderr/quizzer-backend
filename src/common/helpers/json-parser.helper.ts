import { jsonrepair } from 'jsonrepair';

export interface JsonParseOptions {
  /**
   * Whether to attempt repair of malformed JSON
   * @default true
   */
  attemptRepair?: boolean;

  /**
   * Whether to strip markdown code blocks before parsing
   * @default true
   */
  stripCodeBlocks?: boolean;

  /**
   * Maximum text length to process (for security/performance)
   * @default 10MB
   */
  maxLength?: number;
}

export interface JsonParseResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  strategy?: string;
}

const DEFAULT_OPTIONS: Required<JsonParseOptions> = {
  attemptRepair: true,
  stripCodeBlocks: true,
  maxLength: 10 * 1024 * 1024, // 10MB
};

/**
 * Robust JSON parser that handles various edge cases commonly encountered
 * when parsing LLM responses, including:
 * - Markdown code blocks (```json ... ```)
 * - Truncated/incomplete JSON
 * - Trailing commas
 * - Control characters
 * - Unquoted keys
 * - Single quotes instead of double quotes
 * - Comments in JSON
 *
 * Uses the jsonrepair library (https://github.com/josdejong/jsonrepair)
 * which is widely used in production for repairing malformed JSON.
 *
 * @example
 * ```typescript
 * // Basic usage
 * const result = safeJsonParse('{"name": "test"}');
 * if (result.success) {
 *   console.log(result.data);
 * }
 *
 * // With type inference
 * const result = safeJsonParse<MyType>(jsonString);
 *
 * // Throws on failure
 * const data = parseJsonOrThrow<MyType>(jsonString);
 * ```
 */
export function safeJsonParse<T = unknown>(
  text: string,
  options: JsonParseOptions = {}
): JsonParseResult<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Input validation
  if (!text || typeof text !== 'string') {
    return {
      success: false,
      error: 'Input must be a non-empty string',
      strategy: 'validation',
    };
  }

  if (text.length > opts.maxLength) {
    return {
      success: false,
      error: `Input exceeds maximum length of ${opts.maxLength} characters`,
      strategy: 'validation',
    };
  }

  // Build strategies array based on options
  const strategies = buildParseStrategies<T>(text, opts);

  // Try each strategy
  for (const strategy of strategies) {
    try {
      const data = strategy.parse();
      return {
        success: true,
        data,
        strategy: strategy.name,
      };
    } catch {
      // Continue to next strategy
    }
  }

  return {
    success: false,
    error: 'All JSON parsing strategies failed',
    strategy: 'none',
  };
}

/**
 * Build parsing strategies based on options
 */
function buildParseStrategies<T>(
  text: string,
  opts: Required<JsonParseOptions>
): Array<{ name: string; parse: () => T }> {
  const strategies: Array<{ name: string; parse: () => T }> = [
    {
      name: 'direct',
      parse: () => JSON.parse(text),
    },
    {
      name: 'trimmed',
      parse: () => JSON.parse(text.trim()),
    },
    {
      name: 'codeBlock',
      parse: () => {
        if (!opts.stripCodeBlocks)
          throw new Error('Code block extraction disabled');
        const extracted = extractFromCodeBlock(text);
        if (!extracted) throw new Error('No code block found');
        return JSON.parse(extracted);
      },
    },
    {
      name: 'balanced',
      parse: () => {
        const extracted = extractBalancedJson(text);
        if (!extracted) throw new Error('No balanced JSON found');
        return JSON.parse(extracted);
      },
    },
  ];

  if (opts.attemptRepair) {
    strategies.push(
      {
        name: 'jsonrepair',
        parse: () => {
          const preprocessed = opts.stripCodeBlocks
            ? stripMarkdownCodeBlocks(text)
            : text;
          const repaired = jsonrepair(preprocessed);
          return JSON.parse(repaired);
        },
      },
      {
        name: 'aggressiveRepair',
        parse: () => {
          const cleaned = aggressiveCleanup(text);
          const repaired = jsonrepair(cleaned);
          return JSON.parse(repaired);
        },
      }
    );
  }

  return strategies;
}

/**
 * Parse JSON or throw an error with detailed information
 */
export function parseJsonOrThrow<T = unknown>(
  text: string,
  options: JsonParseOptions = {}
): T {
  const result = safeJsonParse<T>(text, options);

  if (!result.success) {
    const preview = text?.substring(0, 200) ?? '(no input)';
    throw new Error(
      `Failed to parse JSON: ${result.error}. Text preview: ${preview}...`
    );
  }

  return result.data!;
}

/**
 * Check if a string is valid JSON without throwing
 */
export function isValidJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract JSON from markdown code blocks
 * Handles both ```json and ``` blocks
 */
export function extractFromCodeBlock(text: string): string | null {
  // Match ```json ... ``` or ``` ... ``` blocks
  const patterns = [
    /```json\s*\n?([\s\S]*?)\n?```/i,
    /```\s*\n?([\s\S]*?)\n?```/,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match?.[1]) {
      const content = match[1].trim();
      // Verify it looks like JSON
      if (content.startsWith('{') || content.startsWith('[')) {
        return content;
      }
    }
  }

  return null;
}

/**
 * Strip markdown code block markers from text
 */
export function stripMarkdownCodeBlocks(text: string): string {
  return text
    .replaceAll(/```json\s*\n?/gi, '')
    .replaceAll(/```\s*\n?/g, '')
    .replaceAll(/```\s*$/g, '')
    .trim();
}

/**
 * Extract balanced JSON structure (object or array) from text
 * Handles nested structures correctly
 */
export function extractBalancedJson(text: string): string | null {
  // Try to find a JSON object first, then array
  const objectResult = extractBalancedStructure(text, '{', '}');
  if (objectResult) return objectResult;

  const arrayResult = extractBalancedStructure(text, '[', ']');
  if (arrayResult) return arrayResult;

  return null;
}

/**
 * Extract balanced structure between start and end characters
 * Properly handles nested structures and string escaping
 */
function extractBalancedStructure(
  text: string,
  startChar: string,
  endChar: string
): string | null {
  const startIndex = text.indexOf(startChar);
  if (startIndex === -1) return null;

  const state = { depth: 0, inString: false, escapeNext: false };

  for (let i = startIndex; i < text.length; i++) {
    const char = text[i];
    const isComplete = updateParseState(state, char, startChar, endChar);
    if (isComplete) {
      return text.substring(startIndex, i + 1);
    }
  }

  return null;
}

/**
 * Update parsing state and return true if structure is complete
 */
function updateParseState(
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

  if (state.inString) return false;

  if (char === startChar) state.depth++;
  else if (char === endChar) state.depth--;

  return state.depth === 0;
}

/**
 * Aggressive cleanup for heavily malformed text
 * Use as last resort before jsonrepair
 */
function aggressiveCleanup(text: string): string {
  let cleaned = stripMarkdownCodeBlocks(text);

  // Remove control characters except newlines and tabs using character codes

  cleaned = cleaned.replaceAll(
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,
    ''
  );

  // Try to extract just the JSON part
  const jsonPart = extractBalancedJson(cleaned);
  if (jsonPart) {
    cleaned = jsonPart;
  }

  // Remove trailing commas (common LLM error)
  cleaned = cleaned.replaceAll(/,(\s*[}\]])/g, '$1');

  // Fix common quote issues - smart quotes to regular quotes
  cleaned = cleaned
    .replaceAll(/[\u201C\u201D]/g, '"')
    .replaceAll(/[\u2018\u2019]/g, "'");

  return cleaned.trim();
}

/**
 * Repair JSON using the jsonrepair library
 * Exported for cases where you want direct access to repair functionality
 */
export function repairJson(text: string): string {
  return jsonrepair(text);
}
