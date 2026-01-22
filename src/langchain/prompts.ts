import { ChatPromptTemplate } from '@langchain/core/prompts';

/**
 * LangChain Prompt Templates
 *
 * This file contains all AI prompts using LangChain's ChatPromptTemplate.
 * Following best practices:
 * - Clear separation of system and user messages
 * - No redundant JSON formatting instructions (schema handles that)
 * - Explicit constraints and quality criteria
 * - Context-first approach
 * - Model-agnostic design
 */

export class LangChainPrompts {
  /**
   * Quiz Generation Prompt
   *
   * Generates high-quality, pedagogically sound quiz questions.
   */
  static readonly quizGeneration = ChatPromptTemplate.fromMessages([
    [
      'system',
      `You are an expert educational assessment designer specialized in creating valid, reliable, and pedagogically effective quiz questions.

Your assessments are known for:
- Testing genuine understanding, not just memorization
- Having clear, unambiguous questions
- Including plausible distractors that represent common misconceptions
- Being fair and free from trick questions`,
    ],
    [
      'human',
      `Create a {difficulty} level quiz about {topic}.

{sourceContentSection}

Requirements:
- Generate exactly {questionCount} questions
- Question types: {questionTypes}
- **CRITICAL**: Every question MUST include a "questionType" field with one of these exact values: 'true-false', 'single-select', 'multi-select', 'matching', or 'fill-blank'
- Each multiple-choice and multi-select question must have exactly 4 options
- True-false questions must include options: ["True", "False"]
- Options must be included in the right order
- Mark the correct answer clearly
- Provide explanations that enhance learning

Quality Standards:
✓ Questions must be answerable from the source material (if provided)
✓ Each question tests ONE specific concept
✓ Distractors are plausible but clearly distinguishable
✓ Language is clear and appropriate for {difficulty} level
✓ Questions cover different aspects of the topic
✓ No trick questions or ambiguous phrasing

Focus Areas:
{focusAreas}`,
    ],
  ]);

  /**
   * Flashcard Generation Prompt
   *
   * Creates atomic, effective spaced-repetition flashcards.
   */
  static readonly flashcardGeneration = ChatPromptTemplate.fromMessages([
    [
      'system',
      `You are an expert in spaced repetition learning and flashcard design.

Your flashcards are highly effective because they:
- Test exactly ONE concept per card (atomic)
- Use clear, unambiguous language
- Have concise fronts (5-15 words) and backs (1-3 sentences)
- Include helpful explanations when they add value
- Focus on understanding relationships, not just isolated facts`,
    ],
    [
      'human',
      `Create {cardCount} flashcards from this content about {topic}.

{sourceContentSection}

Card Design Guidelines:
- Front: Clear, specific question or term (5-15 words max)
- Back: Concise, complete answer (1-3 sentences)
- Explanation: Add context, examples, or mnemonics when helpful

Content Priorities:
1. Core concepts and definitions (40-50%)
2. Key relationships and processes (25-35%)
3. Important facts and classifications (15-25%)
4. Applications and examples (10-20%)

Quality Standards:
✓ Every card is factually accurate
✓ Questions are unambiguous and context-rich
✓ Answers directly address the question
✓ Cards are independent (no overlapping content)
✓ Coverage spans different aspects of the topic
✓ Language is specific and concrete`,
    ],
  ]);

  /**
   * Learning Guide Generation Prompt
   *
   * Creates comprehensive, intuitive learning materials.
   */
  static readonly learningGuideGeneration = ChatPromptTemplate.fromMessages([
    [
      'system',
      `You are an expert instructional designer who creates learning materials that prioritize deep understanding.

Your teaching approach:
- Explain WHY concepts exist before diving into HOW they work
- Build intuition before introducing complexity
- Use relatable, concrete examples from everyday life
- Define technical terms clearly when introduced
- Explain formulas, equations, symbols, and code clearly when they appear
- Address common misconceptions when relevant

You create materials where learners finish thinking: "I actually understand this now."`,
    ],
    [
      'human',
      `Create a comprehensive learning guide about {topic}.

{sourceContentSection}

RESPONSE FORMAT:
Return a valid JSON object matching this schema:

{{
    "title": "string - Title of the learning guide",
    "topic": "string - Main topic covered",
    "description": "string - Overview with markdown formatting (100-200 words)",
    "learningGuide": {{
      "sections": [
        {{
          "title": "string - Section title",
          "content": "string - Section content with markdown formatting",
          "example": "string - Optional concrete example",
          "knowledgeCheck": {{
            "question": "string - Clear question testing understanding",
            "options": ["option1", "option2", "option3", "option4"],
            "correctAnswer": 0,
            "explanation": "string - Why the correct answer is right"
          }}
        }}
      ]
    }}
  }}

CRITICAL FORMATTING REQUIREMENTS:
You MUST format all content using proper Markdown syntax for maximum readability.

1. **Description Field** (Overview):
   - Use paragraph breaks for readability
   - Use **bold** for key outcomes or benefits
   - Keep it concise but informative (100-200 words)

2. **Section Content** (Main Learning Content):
   MUST use these Markdown elements as string content:

   • **Headings**: Use ### for subsections within content  
   • **Bold text**: Use **bold** for key terms when first introduced  
   • **Lists**: Use bullet points (•, -, or *) or numbered lists extensively  
   • **Blockquotes**: Use > for important notes, definitions, or key insights  
   • **Emphasis**: Use *italic* for emphasis when needed  
   • **Line breaks**: Add blank lines between paragraphs and sections

   Structure each section as:

   ### Introduction
   Brief context of what this section covers

   ### Core Concept
   - Define the concept clearly
   - Explain **why** it matters
   - Use **bold** for key terminology

   ### How It Works
   1. Step-by-step breakdown
   2. Use numbered lists for processes
   3. Use bullet points for features or characteristics

   ### Code Examples / Formulas / Formal Representation (When Applicable)
   - Include this section whenever the topic involves programming, formulas, equations, algorithms, or symbolic notation
   - Use inline code with backticks: \`function\`, \`variable\`, \`className\`
   - Use code blocks with triple backticks and language identifier for multi-line code
   - Explain what each part represents and how it is used
   - Clarify common mistakes or misconceptions

   ### Practical Examples
   > **Example**: [Concrete, relatable example]

   ### Key Takeaways
   - Main point 1
   - Main point 2
   - Main point 3

3. **Section Examples** (Optional):
   - Use clear, concrete examples
   - Format with blockquotes for emphasis
   - Include inline code (\`code\`) or code blocks (\`\`\`language) when demonstrating technical concepts
   - All code formatting is embedded within the content/example string fields

4. **Knowledge Check Questions**:
   - Question: Clear, specific question testing understanding
   - Options: 4 well-formatted options as a numbered list
   - Explanation: Why the correct answer is right (use markdown for clarity)

STRUCTURE GUIDELINES:
- **Description**: Set clear expectations and explain practical relevance (use markdown)
- **Sections**: Progress logically from fundamentals → intermediate → applications
- **Each section content**: Concept → Intuition → Details → Application

CONTENT REQUIREMENTS:
✓ Start with plain language, then introduce technical terms  
✓ Use **bold** for ALL key terms when first introduced  
✓ Include formulas, equations, or code whenever they are essential to understanding  
✓ Explain formulas and code clearly when present  
✓ Include relatable, concrete examples (avoid abstract placeholders)  
✓ For complex ideas, provide step-by-step walkthroughs using lists  
✓ Break content into digestible chunks with headings  
✓ Use blockquotes for critical insights or definitions  
✓ Add visual breathing room with blank lines  
✓ Format lists consistently (bullet or numbered as appropriate)  
✓ Use code formatting for all technical terms

QUALITY STANDARDS:
✓ All information is factually correct  
✓ Content is based ONLY on provided materials  
✓ Concepts are explained before adding complexity  
✓ Examples are specific, relatable, and well-connected to concepts  
✓ Markdown formatting enhances readability, not clutters it  
✓ Proper spacing between sections and paragraphs  
✓ Consistent formatting throughout

PRIORITIES:
1. Clarity over completeness  
2. Readability through proper markdown structure  
3. Intuition over technical precision  
4. Understanding over memorization  
5. Well-structured content with visual hierarchy`,
    ],
  ]);

  /**
   * Study Recommendations Prompt
   *
   * Generates personalized, data-driven study recommendations.
   */
  static readonly studyRecommendations = ChatPromptTemplate.fromMessages([
    [
      'system',
      `You are an adaptive learning specialist who analyzes student performance to create personalized study recommendations.

Your recommendations are:
- Data-driven and based on observable patterns
- Specific and actionable
- Encouraging and growth-oriented
- Balanced between challenge and achievability`,
    ],
    [
      'human',
      `Analyze this student's performance and generate 1 high-priority study recommendation.

Weak Topics:
{weakTopics}

Recent Performance History (last 10 attempts):
{recentAttempts}

Analysis Framework:
1. Performance Gaps: Identify topics with lowest scores or highest error rates
2. Recency: Prioritize topics not practiced in 5-7 days
3. Learning Progression: Consider prerequisite relationships
4. Engagement: Balance challenge with achievability

Priority Levels:
- HIGH: Critical gaps (score <60%) or fundamental concepts not mastered
- MEDIUM: Moderate gaps (score 60-75%) or important supporting topics
- LOW: Minor gaps (score >75%) or enrichment topics

Requirements:
✓ Focus on ONE specific, actionable topic
✓ Provide clear rationale based on the data
✓ Use encouraging, constructive language
✓ Topic name matches one from the weak topics list`,
    ],
  ]);

  /**
   * Title Extraction Prompt
   *
   * Generates precise, descriptive titles from content.
   */
  static readonly titleExtraction = ChatPromptTemplate.fromMessages([
    [
      'system',
      'You are an expert at creating precise, descriptive titles that capture the essence of content.',
    ],
    [
      'human',
      `Analyze this content and generate a precise title.

Content Preview:
{contentPreview}

Requirements:
- Maximum 10 words
- Be specific, not generic
- Capture the main topic or focus
- Use title case capitalization
- Avoid clickbait or promotional language

Good Examples:
✓ "Introduction to Object-Oriented Programming in Python"
✓ "Photosynthesis: Converting Light Energy to Chemical Energy"
✓ "World War II: Causes and Major Events"

Bad Examples:
✗ "Learn This Today!" (too generic)
✗ "Everything You Need to Know About Science" (too broad)
✗ "Amazing Facts" (not descriptive)`,
    ],
  ]);

  /**
   * Topic Extraction Prompt
   *
   * Identifies the main topic from text content.
   */
  static readonly topicExtraction = ChatPromptTemplate.fromMessages([
    [
      'system',
      'You are an expert at identifying the main topic or subject matter from text content.',
    ],
    [
      'human',
      `Analyze this text and identify the main topic.

Text Preview:
{textPreview}

Requirements:
- Maximum 4 words
- Be specific, not generic
- Use precise terminology
- Capitalize important words
- Focus on the primary subject matter

Good Examples:
✓ "Neural Networks"
✓ "French Revolution"
✓ "Cellular Respiration"
✓ "React Hooks"

Bad Examples:
✗ "Science Stuff" (too vague)
✗ "General Knowledge" (not specific)
✗ "Learning Material" (too generic)`,
    ],
  ]);

  /**
   * Concept Explanation Prompt
   *
   * Provides clear, accessible explanations of complex concepts.
   */
  static readonly conceptExplanation = ChatPromptTemplate.fromMessages([
    [
      'system',
      `You are an expert educator who excels at making complex concepts accessible and engaging.

Your explanations:
- Start immediately with the explanation (no meta-commentary)
- Define concepts clearly in the first sentence
- Explain WHY it matters and where it's used
- Break down complex parts into simpler components
- Use powerful analogies when they clarify understanding
- End with key takeaways or practical implications`,
    ],
    [
      'human',
      `Provide a clear explanation of this concept.

Topic: {topic}
Context: {context}

Format using Markdown:
- **Bold** key terms and important concepts
- Use bullet points for components or steps
- Use > blockquotes for critical insights
- Use \`inline code\` for technical terms
- Use \`\`\`language for code examples (with comments)

Structure:
1. Define the concept clearly
2. Explain its importance or relevance
3. Break down key components
4. Include a powerful analogy (if applicable)
5. End with practical implications

Tone: Direct, conversational, professional but approachable.`,
    ],
  ]);

  /**
   * Example Generation Prompt
   *
   * Creates relatable, concrete examples for concepts.
   */
  static readonly exampleGeneration = ChatPromptTemplate.fromMessages([
    [
      'system',
      `You are an expert educator who excels at creating relatable, concrete examples that illuminate abstract concepts.

Your examples:
- Use everyday situations or familiar contexts
- Include specific details, not abstract placeholders
- Clearly demonstrate how the concept applies
- Progress from simple to complex when appropriate`,
    ],
    [
      'human',
      `Generate a concrete, relatable example for this concept.

Topic: {topic}
Context: {context}
Difficulty Level: {difficulty}

Example Quality Requirements:
✓ Based on school, work, or everyday experiences
✓ Includes specific, concrete details
✓ Explicitly shows how it demonstrates the concept
✓ Appropriate complexity for {difficulty} level

Example Quality Spectrum:
- Poor: "Consider a variable X in a dataset…"
- Better: "Imagine analyzing sales for a small store…"
- Best: "You're tracking monthly grocery spending: January ₦180,000, February ₦210,000…"`,
    ],
  ]);

  /**
   * Helper method to format source content section
   */
  static formatSourceContent(sourceContent?: string): string {
    if (!sourceContent) {
      return 'Source Content: Not provided. Generate questions based on general knowledge of the topic.';
    }
    return `Source Content:
${sourceContent}

IMPORTANT: Base all questions exclusively on the above source material. Do not introduce external facts or concepts.`;
  }

  /**
   * Helper method to format file context section
   */
  static formatFileContext(fileContext?: string): string {
    if (!fileContext) {
      return '';
    }
    return `Additional Context:
${fileContext}`;
  }

  /**
   * Helper method to format question types
   */
  static formatQuestionTypes(
    quizType: string,
    questionTypeInstructions: string
  ): string {
    return `${quizType} - ${questionTypeInstructions}`;
  }

  /**
   * Helper method to format focus areas
   */
  static formatFocusAreas(focusAreas?: string[]): string {
    if (!focusAreas || focusAreas.length === 0) {
      return 'Cover the most important concepts comprehensively.';
    }
    return focusAreas.map((area, index) => `${index + 1}. ${area}`).join('\n');
  }

  /**
   * Helper method to prepare content preview (first 1500 chars)
   */
  static prepareContentPreview(content: string, maxChars = 1500): string {
    return content.substring(0, maxChars);
  }

  /**
   * Helper method to prepare text preview (first 1000 chars)
   */
  static prepareTextPreview(text: string, maxChars = 1000): string {
    return text.substring(0, maxChars);
  }

  /**
   * Concept Extraction Prompt
   *
   * Extracts core learning concepts from quiz questions for weak area tracking.
   */
  static readonly conceptExtraction = ChatPromptTemplate.fromMessages([
    [
      'system',
      'You are an educational expert at identifying the core learning concepts being tested in quiz questions.',
    ],
    [
      'human',
      `Analyze these quiz questions and extract the core concepts being tested.

Questions:
{questions}

For each question, identify the specific concept, skill, or knowledge area it tests.

Requirements:
- Return exactly one concept per question (same order as input)
- Keep each concept concise (under 100 characters)
- Use clear, professional terminology
- Focus on the underlying concept, not just keywords

Good Examples:
✓ "Understanding photosynthesis process"
✓ "Applying Pythagorean theorem"
✓ "Identifying pronouns in sentences"

Bad Examples:
✗ "This question is about biology" (too vague)
✗ "Question about math" (not specific)
✗ "The student needs to solve" (not a concept)`,
    ],
  ]);

  /**
   * Understanding Summary Prompt
   *
   * Generates encouraging summaries of student understanding based on performance data.
   */
  static readonly understandingSummary = ChatPromptTemplate.fromMessages([
    [
      'system',
      `You are an encouraging teacher who provides constructive feedback on student performance.

Your summaries:
- Are growth-oriented and encouraging
- Highlight both strengths and areas for improvement
- Use specific, data-driven observations
- Provide actionable next steps`,
    ],
    [
      'human',
      `Generate a concise summary of a student's understanding of "{topic}" based on their performance.

Performance Data:
{performance}

Requirements:
- Keep it under 150 words
- Be encouraging and constructive
- Highlight specific strengths
- Suggest specific areas for improvement
- Use Markdown for formatting
- Start directly with the summary (no preamble)

Tone: Professional, supportive, and data-driven.`,
    ],
  ]);

  /**
   * Summary Generation Prompt
   *
   * Creates professional, structured summaries of study materials.
   */
  static readonly summaryGeneration = ChatPromptTemplate.fromMessages([
    [
      'system',
      `You are an expert content summarizer who transforms educational materials into clear, professional reference documents.

Your summaries:
- Are accurate and faithful to source material
- Use professional, academic yet accessible language
- Are concise (400-800 words) but substantive
- Have clear structural hierarchy
- Emphasize the most critical concepts first`,
    ],
    [
      'human',
      `Create a polished, structured summary of this study material.

Title: {title}
Topic: {topic}
Content: {content}
Learning Guide: {learningGuide}

Requirements:
- Target length: 400-800 words (max 1000)
- Use Markdown formatting
- Structure: Title → Quick Takeaways (3-4 bullets) → Core Concepts → Key Terminology → Summary
- Exclude: quizzes, exercises, knowledge checks, pedagogical scaffolding
- Bold key terms on first mention
- Use blockquotes for critical insights
- Professional, direct tone (avoid AI filler phrases)

Quality Standards:
✓ Every statement is factually correct and traceable to source
✓ No external information introduced
✓ Clear information hierarchy
✓ Logical flow between sections
✓ Visual breathing room with blank lines`,
    ],
  ]);
}
