import {
  extractBalancedJson,
  extractFromCodeBlock,
  isValidJson,
  parseJsonOrThrow,
  repairJson,
  safeJsonParse,
  stripMarkdownCodeBlocks,
} from './json-parser.helper';

describe('json-parser.helper', () => {
  describe('safeJsonParse', () => {
    it('should parse valid JSON directly', () => {
      const result = safeJsonParse('{"name": "test", "value": 123}');
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ name: 'test', value: 123 });
      expect(result.strategy).toBe('direct');
    });

    it('should parse JSON with leading/trailing whitespace', () => {
      const result = safeJsonParse('  {"name": "test"}  \n');
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ name: 'test' });
    });

    it('should parse JSON arrays', () => {
      const result = safeJsonParse('[1, 2, 3]');
      expect(result.success).toBe(true);
      expect(result.data).toEqual([1, 2, 3]);
    });

    it('should extract JSON from markdown code blocks', () => {
      const text = '```json\n{"name": "test"}\n```';
      const result = safeJsonParse(text);
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ name: 'test' });
      expect(result.strategy).toBe('codeBlock');
    });

    it('should extract JSON from code blocks without language specifier', () => {
      const text = '```\n{"items": [1, 2]}\n```';
      const result = safeJsonParse(text);
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ items: [1, 2] });
    });

    it('should handle JSON with text before and after', () => {
      const text = 'Here is the result:\n{"data": "value"}\nEnd of response';
      const result = safeJsonParse(text);
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ data: 'value' });
      expect(result.strategy).toBe('balanced');
    });

    it('should repair JSON with trailing commas', () => {
      const text = '{"name": "test",}';
      const result = safeJsonParse(text);
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ name: 'test' });
    });

    it('should repair JSON with single quotes', () => {
      const text = "{'name': 'test'}";
      const result = safeJsonParse(text);
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ name: 'test' });
    });

    it('should repair JSON with unquoted keys', () => {
      const text = '{name: "test"}';
      const result = safeJsonParse(text);
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ name: 'test' });
    });

    it('should handle nested objects', () => {
      const text = '{"outer": {"inner": {"deep": "value"}}}';
      const result = safeJsonParse(text);
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ outer: { inner: { deep: 'value' } } });
    });

    it('should handle empty input', () => {
      const result = safeJsonParse('');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Input must be a non-empty string');
    });

    it('should handle null input', () => {
      const result = safeJsonParse(null as unknown as string);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Input must be a non-empty string');
    });

    it('should enforce maximum length', () => {
      const longText = '{"a": "' + 'x'.repeat(100) + '"}';
      const result = safeJsonParse(longText, { maxLength: 50 });
      expect(result.success).toBe(false);
      expect(result.error).toContain('exceeds maximum length');
    });

    it('should handle LLM response with code block', () => {
      const llmResponse = `Here's your JSON data:

\`\`\`json
{
  "title": "Elementary Set Theory",
  "topic": "Mathematics",
  "questions": [
    {"q": "What is a set?", "a": "A collection of distinct objects"}
  ]
}
\`\`\`

Let me know if you need anything else!`;

      const result = safeJsonParse(llmResponse);
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('title', 'Elementary Set Theory');
    });

    it('should handle truncated JSON by using repair', () => {
      // This simulates a truncated LLM response
      const truncated = '{"title": "Test", "items": [1, 2, 3';
      const result = safeJsonParse(truncated);
      // jsonrepair should fix this
      expect(result.success).toBe(true);
    });

    it('should handle JSON with comments (via repair)', () => {
      const withComments = `{
        // This is a comment
        "name": "test",
        /* multi-line
           comment */
        "value": 123
      }`;
      const result = safeJsonParse(withComments);
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ name: 'test', value: 123 });
    });

    it('should disable repair when option is false', () => {
      const malformed = '{"name": "test",}';
      const result = safeJsonParse(malformed, { attemptRepair: false });
      // Without repair, trailing comma should fail
      // But balanced extraction might work
      expect(result.strategy).not.toBe('jsonrepair');
    });
  });

  describe('parseJsonOrThrow', () => {
    it('should return parsed data for valid JSON', () => {
      const data = parseJsonOrThrow<{ name: string }>('{"name": "test"}');
      expect(data).toEqual({ name: 'test' });
    });

    it('should throw for empty input', () => {
      expect(() => parseJsonOrThrow('')).toThrow('Failed to parse JSON');
    });

    it('should include error message for empty input', () => {
      expect(() => parseJsonOrThrow('')).toThrow(
        'Input must be a non-empty string'
      );
    });

    it('should throw for null input', () => {
      expect(() => parseJsonOrThrow(null as unknown as string)).toThrow(
        'Failed to parse JSON'
      );
    });
  });

  describe('isValidJson', () => {
    it('should return true for valid JSON', () => {
      expect(isValidJson('{"valid": true}')).toBe(true);
      expect(isValidJson('[1,2,3]')).toBe(true);
      expect(isValidJson('"string"')).toBe(true);
      expect(isValidJson('123')).toBe(true);
      expect(isValidJson('null')).toBe(true);
    });

    it('should return false for invalid JSON', () => {
      expect(isValidJson('not json')).toBe(false);
      expect(isValidJson('{invalid}')).toBe(false);
      expect(isValidJson('')).toBe(false);
    });
  });

  describe('extractFromCodeBlock', () => {
    it('should extract from json code block', () => {
      const text = '```json\n{"test": true}\n```';
      expect(extractFromCodeBlock(text)).toBe('{"test": true}');
    });

    it('should extract from plain code block', () => {
      const text = '```\n[1, 2, 3]\n```';
      expect(extractFromCodeBlock(text)).toBe('[1, 2, 3]');
    });

    it('should return null if no code block', () => {
      expect(extractFromCodeBlock('no code block here')).toBeNull();
    });

    it('should return null if code block contains non-JSON', () => {
      const text = '```\nconsole.log("hello")\n```';
      expect(extractFromCodeBlock(text)).toBeNull();
    });
  });

  describe('extractBalancedJson', () => {
    it('should extract object from text', () => {
      const text = 'prefix {"key": "value"} suffix';
      expect(extractBalancedJson(text)).toBe('{"key": "value"}');
    });

    it('should extract array from text', () => {
      const text = 'result: [1, 2, 3] done';
      expect(extractBalancedJson(text)).toBe('[1, 2, 3]');
    });

    it('should handle nested structures', () => {
      const text = 'data: {"outer": {"inner": [1, 2]}} end';
      expect(extractBalancedJson(text)).toBe('{"outer": {"inner": [1, 2]}}');
    });

    it('should handle strings with braces', () => {
      const text = '{"message": "Hello {name}!"}';
      expect(extractBalancedJson(text)).toBe('{"message": "Hello {name}!"}');
    });

    it('should return null if no JSON structure', () => {
      expect(extractBalancedJson('no json here')).toBeNull();
    });
  });

  describe('stripMarkdownCodeBlocks', () => {
    it('should remove json code block markers', () => {
      const text = '```json\n{"test": true}\n```';
      expect(stripMarkdownCodeBlocks(text)).toBe('{"test": true}');
    });

    it('should remove plain code block markers', () => {
      const text = '```\n{"test": true}\n```';
      expect(stripMarkdownCodeBlocks(text)).toBe('{"test": true}');
    });

    it('should handle text without code blocks', () => {
      const text = '{"test": true}';
      expect(stripMarkdownCodeBlocks(text)).toBe('{"test": true}');
    });
  });

  describe('repairJson', () => {
    it('should fix trailing commas', () => {
      const repaired = repairJson('{"a": 1,}');
      expect(JSON.parse(repaired)).toEqual({ a: 1 });
    });

    it('should fix single quotes', () => {
      const repaired = repairJson("{'a': 'b'}");
      expect(JSON.parse(repaired)).toEqual({ a: 'b' });
    });

    it('should fix unquoted keys', () => {
      const repaired = repairJson('{a: 1}');
      expect(JSON.parse(repaired)).toEqual({ a: 1 });
    });
  });

  describe('real-world LLM response scenarios', () => {
    it('should handle Claude-style response with explanation', () => {
      const response = `I'll create the study material for you. Here's the JSON:

\`\`\`json
{
  "title": "Introduction to Calculus",
  "sections": [
    {
      "name": "Limits",
      "content": "A limit describes the value a function approaches..."
    }
  ]
}
\`\`\`

This covers the basics of limits in calculus.`;

      const result = safeJsonParse(response);
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('title', 'Introduction to Calculus');
    });

    it('should handle GPT-style response with direct JSON', () => {
      const response = `{
  "quiz": {
    "title": "Math Quiz",
    "questions": [
      {
        "question": "What is 2+2?",
        "options": ["3", "4", "5"],
        "correct": 1
      }
    ]
  }
}`;

      const result = safeJsonParse(response);
      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('quiz');
    });

    it('should handle response with smart quotes', () => {
      const response =
        '{"title": "Hello World", "description": "A "quoted" value"}';
      const result = safeJsonParse(response);
      expect(result.success).toBe(true);
    });
  });
});
