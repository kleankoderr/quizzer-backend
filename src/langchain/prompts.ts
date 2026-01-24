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
      `You are an expert quiz designer creating valid, pedagogically sound questions.

Core principles:
- Test understanding, not memorization
- Clear, unambiguous wording
- Plausible distractors
- No trick questions or meta-questions`,
    ],
    [
      'human',
      `Create a {difficulty} level quiz about {topic}.

{sourceContentSection}

Requirements:
- Generate exactly {questionCount} questions with a creative title
- Types: {questionTypes}
- Multiple-choice: exactly 4 options
- True-false: ["True", "False"], correctAnswer 0 or 1
- Matching: "leftColumn", "rightColumn" (4-5 each), "correctAnswer" array
- Include clear explanations

CRITICAL - Source Adherence:
✓ Base ALL content EXCLUSIVELY on provided source material
✓ Do NOT add information from external knowledge
✓ If source is insufficient, use ONLY {topic} fundamentals

CRITICAL - No Meta Questions:
✗ NO questions about document structure, word counts, or chapter numbers
✗ NO logic puzzles unrelated to {topic}
✓ ONLY questions testing {topic} knowledge directly

Quality:
- Each question tests ONE specific concept
- Language appropriate for {difficulty} level
- Distractors plausible but distinguishable
- Cover different aspects

Focus: {focusAreas}`,
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
      `You are a flashcard design expert creating atomic, effective spaced-repetition cards.

Principles:
- ONE concept per card
- Clear, concise language
- Front: 5-15 words | Back: 1-3 sentences
- Focus on understanding, not isolated facts`,
    ],
    [
      'human',
      `Create {cardCount} flashcards about {topic}.

{sourceContentSection}

CRITICAL - Source Adherence:
✓ Base ALL cards EXCLUSIVELY on provided source material
✓ Do NOT add external information

CRITICAL - No Meta Content:
✗ NO cards about document formatting, structure, or word counts
✓ ONLY cards about {topic} concepts, facts, and relationships

Format:
- Front: Specific question/term (5-15 words)
- Back: Complete answer (1-3 sentences)
- Explanation: Context or examples

Content Mix:
- Core concepts/definitions: 40-50%
- Relationships/processes: 25-35%
- Facts/classifications: 15-25%
- Applications: 10-20%

Quality:
- Factually accurate, unambiguous
- Independent cards, varied coverage
- Direct, concrete language`,
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
      `You are an expert instructional designer creating clear, engaging learning materials.

Principles:
- Explain WHY before HOW
- Build intuition, then add complexity
- Use relatable examples
- Define technical terms clearly
- Address common misconceptions`,
    ],
    [
      'human',
      `Create a comprehensive learning guide about {topic}.

{sourceContentSection}

CRITICAL - Source Adherence:
✓ Base ALL content EXCLUSIVELY on provided source material
✓ Do NOT add external information
✓ If source is insufficient, cover only {topic} fundamentals

Structure:
 **Description** (100-200 words):
 - Overview with practical relevance
 - Use **bold** for key outcomes
 - Paragraph breaks for readability

**Sections** (3-5 sections):
Each section should follow this flow:

### [Section Title]

#### Introduction  
Brief context of what this covers

#### Core Concept
- Clear definition
- Why it matters  
- **Bold** key terminology

#### How It Works
1. Step-by-step breakdown (numbered)
2. Features or characteristics (bullets)

#### Examples
> **Example**: [Concrete, relatable example]

*Include code/formulas when relevant*:
- Use \`inline code\` for terms/functions
- Use \`\`\`language blocks for multi-line code
- Explain what it does and common mistakes

#### Key Takeaways
- Main point 1
- Main point 2  
- Main point 3

**Knowledge Check** (per section):
- Clear question testing understanding
- 4 well-formatted options
- Correct answer index (0-3)
- Explanation with markdown

Formatting:
✓ Use markdown: **bold**, *italic*, > blockquotes, lists
✓ Blank lines between sections
✓ Code formatting (\` or \`\`\`) for technical content
✓ Clear hierarchy with headings (###, ####)

Quality:
✓ Factually correct, source-based only
✓ Plain language first, then technical terms
✓ Specific examples, not abstract placeholders
✓ Logical progression: fundamentals → applications
✓ Concepts explained before complexity`,
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
