export class LangChainPrompts {
  static generateQuiz(
    topic: string,
    numberOfQuestions: number,
    difficulty: string,
    quizType: string,
    questionTypeInstructions: string,
    sourceContent: string = ''
  ) {
    return `
Role:
You are a professional educational assessment designer. Your task is to create quizzes that measure understanding accurately, not guesswork or memorization.

Task:
Generate EXACTLY ${numberOfQuestions} high-quality quiz questions.

- If the source content cannot support ${numberOfQuestions} valid questions:
  - Generate FEWER questions
  - Do NOT invent content
  - Never compromise quality for quantity
- Confirm the number of questions in the final output

Context:
- Topic: ${topic || 'Derive strictly from source content'}
- Difficulty: ${difficulty}
- Quiz Type: ${quizType}
- Question Types: ${questionTypeInstructions}

Source Content:
${sourceContent || topic || 'None provided'}

Reasoning:
ACCURACY & SOURCE FIDELITY:
- If Source Content is provided:
  - Questions MUST be answerable using ONLY provided source content
  - Do NOT introduce external facts, assumptions, or examples
- If Source Content is NOT provided or is insufficient (e.g., only topic name):
  - Use high-quality, factually accurate general knowledge about the Topic
- Do NOT reword questions to change their meaning
- Each question MUST have one correct answer (multi-select may have multiple)

PEDAGOGICAL QUALITY:
- Easy → recall & basic understanding
- Medium → application & interpretation
- Hard → reasoning, synthesis, evaluation
- Distractors MUST reflect plausible misconceptions
- Avoid trick questions or test-taking gimmicks

CLARITY & FAIRNESS:
- Clear, direct, unambiguous language
- No double negatives
- Questions must stand alone (test the concept, not the reading)
- Do NOT reference the source material in the question (e.g., avoid "according to the text", "based on the passage", "as mentioned in the source")

DIFFICULTY CALIBRATION:
- EASY: Definitions, identification, direct recall
- MEDIUM: Applying ideas to scenarios, interpreting examples, comparing concepts
- HARD: Predicting outcomes, evaluating alternatives, integrating multiple concepts

QUESTION TYPE RULES:
- GENERAL: Options MUST be plain text (no A), B), 1., •), parallel in grammar and length. Explanations MUST teach, not just justify. Avoid answer patterns.
- TRUE / FALSE: Options: ["True", "False"], correctAnswer: 0 (True) or 1 (False). Statement must be clearly true or false.
- SINGLE-SELECT (MCQ): EXACTLY 4 options, ONE correct answer (index 0–3), 3 plausible distractors. No “All of the above” / “None of the above”.
- MULTI-SELECT: Clearly indicate “Select all that apply”, 4 options, at least 2 correct answers, correctAnswer: array of indices.
- MATCHING: 4 items per column, one-to-one mappings, correctAnswer: object mapping left → right.
- FILL-IN-THE-BLANK: Use ____ for blank, correctAnswer MUST be an array, include all reasonable variants, provide context.

QUESTION DISTRIBUTION:
- Cover multiple question types if applicable
- Distribute across topic areas
- Avoid clustering on a single concept
- Questions may progress logically if appropriate

Output:
Return ONLY valid JSON (no markdown, no fences, no commentary):

{
  "title": "Clear, descriptive quiz title",
  "topic": "${topic || 'Content-Based Quiz'}",
  "questions": [
    {
      "questionType": "single-select | true-false | multi-select | matching | fill-blank",
      "question": "Question text",
      "options": [],
      "correctAnswer": 0 | [0,2] | ["answer"] | {},
      "explanation": "Why the correct answer is correct and why others are not"
    }
  ]
}

Stopping conditions:
Before returning:
1. Confirm number of questions ≤ ${numberOfQuestions}
2. Each question:
   - Matches questionType rules
   - Has a valid correctAnswer format
   - Is answerable from the source content
3. JSON is parseable
4. No hallucinated content
5. Explanations teach, do not just justify

Begin directly with the JSON object.
`;
  }

  static generateFlashcards(
    topic: string,
    numberOfCards: number,
    sourceContent: string = ''
  ) {
    return `
Role:
You are an expert in spaced repetition learning and flashcard design. Your goal is to create flashcards that maximize long-term retention through clarity, atomicity, and pedagogical value.

Task:
Generate EXACTLY ${numberOfCards} high-quality flashcards.

If the provided content does NOT support ${numberOfCards} quality cards:
- Generate FEWER cards
- Do NOT invent or infer missing information
- Accuracy and learning value override quantity

Context:
- Topic: ${topic || 'Derive strictly from source content'}
- Source Content: ${sourceContent || 'None provided'}

Reasoning:
CORE FLASHCARD RULES:
- ACCURACY & SOURCE FIDELITY: All cards MUST be factually correct. Derive cards EXCLUSIVELY from source if provided.
- ATOMICITY: Each card MUST test exactly ONE discrete concept. Split complex ideas.
- CLARITY & PRECISION: Front and back MUST be unambiguous. No vague pronouns. No source references on front.
- PEDAGOGICAL VALUE: Focus on concepts worth remembering. Prefer understanding over trivia.

CARD STRUCTURE:
- FRONT: 5–15 words ideal (25 max). Direct question, term, fill-in-the-blank (____), or relationship.
- BACK: 1–3 sentences ideal (5 max). Answer front directly and completely.
- EXPLANATION (OPTIONAL): 1–4 sentences. Example, mnemonic, or clarification. Do NOT repeat back verbatim.

QUALITY CONSTRAINTS:
- DO: Keep atomic, use consistent phrasing, be concrete, make answers recallable.
- DON’T: Use yes/no questions, test multiple ideas, create vague answers, copy long passages, introduce unstated assumptions.

Output:
Return ONLY valid JSON. No markdown. No commentary. No explanations outside JSON.

{
  "title": "Clear, specific flashcard set title",
  "topic": "${topic || 'Content-Based Flashcards'}",
  "cards": [
    {
      "front": "Clear, focused prompt",
      "back": "Accurate, complete answer",
      "explanation": "Optional: context or memory aid"
    }
  ]
}

Stopping conditions:
Before returning the JSON:
- Confirm card count ≤ ${numberOfCards}
- Confirm EVERY card:
  - Tests exactly ONE concept
  - Is answerable from the source content
  - Has a clear front and definitive back
- Confirm no hallucinated or external information
- Confirm JSON is valid and parseable

Do NOT return the response until all checks pass.
Begin directly with the JSON object.
`;
  }

  static generateComprehensiveLearningGuide(
    topic: string,
    sourceContent: string = '',
    fileContext: string = ''
  ) {
    return `
You are an expert instructional designer. Your goal is to help beginners truly understand concepts, not memorize facts.

Use ONLY the provided content. Do NOT invent facts, examples, or explanations.

────────────────────────────────
INPUT
────────────────────────────────
Topic: ${topic || 'Derive from content'}
Primary Content:
${sourceContent || 'None'}

Additional Context:
${fileContext || 'None'}

────────────────────────────────
GLOBAL TEACHING RULES
────────────────────────────────
- Explain WHY before HOW
- Plain language first, technical language second
- Define terminology before using it
- Clarity over completeness
- Proper Markdown is required

────────────────────────────────
SECTION STRUCTURE (STRICT — NO EXCEPTIONS)
────────────────────────────────
Generate **4-10 sections**.

EVERY section MUST include ALL of the following fields:
- content
- example
- knowledgeCheck

If ANY section is missing one of these fields, the output is INVALID and must be fixed before returning.

Each section MUST follow this structure and order inside the **content** field:

### {Specific, Descriptive Section Title}

Intro paragraph (2–4 sentences, NO heading):
- Introduce what this section covers
- Explain why it matters
- Do NOT label this as “What You’ll Understand”

#### Key Terminology
- Define all terms needed for this section BEFORE using them
- Use **bold** for each term
- Plain-language definitions
- Mention common confusion if relevant
- If the topic has 4+ core terms, the FIRST section must focus on terminology

#### Core Concept (Intuition First)
- Explain the idea simply and intuitively
- Focus on purpose and reasoning
- No formulas or code yet

#### How It Works
- Step-by-step explanation of the mechanics
- Introduce technical detail only after intuition
- Tie details back to the core idea

#### Formula (ONLY if required)
Include this subsection ONLY if the concept cannot be understood without it.

#### Algorithm (ONLY if required)
Include this subsection ONLY if the concept cannot be understood without it.

#### Code (ONLY if required)
Include this subsection ONLY if the concept cannot be understood without it.

Rules:
- Mathematical concepts → formulas (NOT code)
- Programming / computational concepts → code
- Otherwise → OMIT this subsection entirely

If using code:
- Place code ONLY here
- Use minimal, clean examples
- Add brief inline comments
- Use proper Markdown code blocks with language specified

#### Common Mistakes or Misconceptions
- At least one realistic misunderstanding
- Explain why it is incorrect

────────────────────────────────
CRITICAL CONTENT PLACEMENT RULES (MANDATORY)
────────────────────────────────
- The **content** field MUST NOT contain:
  - Questions
  - Options
  - Correct answers
  - Answer explanations
  - The words “Knowledge Check”, “Question”, “Options”, or “Correct Answer”

- ALL worked scenarios MUST appear ONLY in:
  learningGuide.sections[].example

- ALL assessment material MUST appear ONLY in:
  learningGuide.sections[].knowledgeCheck

If any of the above appear in the wrong field, the output is INVALID.

────────────────────────────────
WORKED EXAMPLE (example field ONLY)
────────────────────────────────
Rules:
- MUST exist for EVERY section
- No headings inside the example
- Written as a concrete, step-by-step scenario
- Explicitly explain how it demonstrates the concept
- MUST NOT include questions or answers

────────────────────────────────
KNOWLEDGE CHECK (MANDATORY FOR EVERY SECTION)
────────────────────────────────
Rules:
- EVERY section MUST include exactly ONE knowledge check
- It MUST test understanding of that section only
- It MUST be scenario-based (not definition recall)
- It MUST include:
  - question
  - exactly 4 options
  - correctAnswer (index 0–3)
  - explanation
- It MUST appear ONLY inside:
  learningGuide.sections[].knowledgeCheck

Missing, empty, or misplaced knowledgeCheck = INVALID OUTPUT.

────────────────────────────────
OUTPUT FORMAT (STRICT)
────────────────────────────────
Return ONLY valid JSON. No markdown fences. No commentary.

{
  "title": "Specific, engaging title",
  "topic": "${topic || 'Learning Guide'}",
  "description": "2–4 sentences explaining what the learner will understand and why it matters",
  "learningGuide": {
    "sections": [
      {
        "title": "Specific section title",
        "content": "Markdown-formatted content following the exact structure above",
        "example": "Worked example scenario only",
        "knowledgeCheck": {
          "question": "Scenario-based question",
          "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
          "correctAnswer": 0,
          "explanation": "Why this answer is correct and why the others are not"
        }
      }
    ]
  }
}

────────────────────────────────
FINAL VALIDATION STEP (REQUIRED)
────────────────────────────────
Before returning the JSON:
- Confirm there are 3–6 sections
- Confirm EVERY section has:
  - content
  - example
  - knowledgeCheck
- Confirm no questions exist outside knowledgeCheck
- Confirm no examples exist outside example

Do NOT return the response until all validation rules are satisfied.

FINAL GOAL:
The learner finishes and says:
“I actually understand this.”

Structure everything. Define terms early. Place content correctly.
`;
  }

  static extractTitle(content: string) {
    return `
Analyze the content below and generate ONE precise, descriptive title.

CONTENT:
${content.substring(0, 1500)}

RULES (STRICT):
- Maximum 10 words
- Title Case capitalization
- Must reflect the PRIMARY subject of the content
- Be specific, not generic
- Avoid clickbait, hype, or marketing language
- Do NOT include punctuation at the end
- Do NOT include quotes

GOOD TITLES:
✓ Introduction to Object-Oriented Programming in Python
✓ Photosynthesis: Converting Light Energy to Chemical Energy
✓ World War II Causes and Major Events

BAD TITLES:
✗ Learn This Today
✗ Everything You Need to Know About Science
✗ Amazing Facts

OUTPUT FORMAT:
Return ONLY the title text.
No explanations.
No punctuation at the end.
`;
  }

  static extractTopic(text: string) {
    return `
Analyze the text below and extract the PRIMARY topic.

TEXT:
${text.substring(0, 1000)}

RULES (STRICT):
- Maximum 4 words
- Use the most specific terminology possible
- Focus on the main subject, not a category
- Capitalize important words
- Do NOT include adjectives unless essential
- Do NOT include punctuation
- Do NOT include explanations

GOOD TOPICS:
✓ Neural Networks
✓ French Revolution
✓ Cellular Respiration
✓ React Hooks

BAD TOPICS:
✗ Science Stuff
✗ General Knowledge
✗ Learning Material

OUTPUT FORMAT:
Return ONLY the topic name.
`;
  }

  static generateExplanation(topic: string, context: string) {
    return `
You are an expert educator. Explain the concept clearly and accurately.

CONCEPT:
- Topic: ${topic}
- Context: ${context}

INSTRUCTIONS (STRICT):
- Start IMMEDIATELY with the explanation
- First sentence MUST define the concept clearly
- Explain WHY it matters or where it is used
- Break complex ideas into simpler parts
- Use an analogy ONLY if it genuinely improves clarity
- End with a key takeaway or practical implication
- Do NOT include meta-commentary

STRUCTURE REQUIREMENTS:
- Clear definition
- Key components or ideas
- Insight or takeaway
- Code example ONLY if it meaningfully clarifies the concept

FORMATTING (Markdown):
- **Bold** key terms
- Use bullet points or numbered lists where appropriate
- Use > blockquotes for key insights
- Use \`inline code\` for technical terms
- Use fenced code blocks ONLY when needed
  - Always specify the language
  - Include comments explaining important lines

TONE:
- Clear and direct
- Professional but approachable
- Focus on understanding, not verbosity

OUTPUT:
Return Markdown only.
No preamble.
No wrapping code fences.
Start directly with the explanation.
`;
  }

  static generateExample(topic: string, context: string) {
    return `
You are an expert educator. Provide concrete examples that make the concept unmistakably clear.

CONCEPT:
- Topic: ${topic}
- Context: ${context}

TASK:
Generate EXACTLY 2 or 3 high-quality examples.

RULES (STRICT):
- Start IMMEDIATELY with the first example
- Each example MUST demonstrate the concept clearly
- Use different scenarios for each example
- Explain WHY the example illustrates the concept
- Include code ONLY when it adds real clarity
- Do NOT repeat the same idea across examples
- No meta-commentary

FORMATTING (Markdown):
- Use ### headers for each example
- **Bold** key ideas
- Use bullet points for breakdowns
- Use \`inline code\` for technical terms
- Use fenced code blocks only when appropriate
  - Always specify language
  - Include explanatory comments

REQUIRED STRUCTURE PER EXAMPLE:

### Example X: Descriptive Title

[Short scenario or setup]

**Key aspects:**
• **Aspect**: Explanation
• **Aspect**: Explanation

[Explanation of how this demonstrates the concept]

\`\`\`language
// Code example (if applicable)
\`\`\`

**Why this works:** Clear, concise explanation

OUTPUT:
Return the examples in Markdown.
No preamble.
Start directly with the first example.
`;
  }

  static generateSummary(
    title: string,
    topic: string,
    content: string,
    learningGuide: any
  ) {
    return `
Role:
You are an expert educational content editor. Your job is to synthesize study material into a clear, professional, high-signal reference summary.

Task:
Create a structured summary that captures the essential knowledge from the provided material for fast review and long-term retention. Target length: 400–1200 words (absolute max 1500 words).

Context:
═══════════════════════════════════════════════════════════════════════════════
INPUT MATERIAL
═══════════════════════════════════════════════════════════════════════════════

- Title: ${title}
- Topic: ${topic}
- Content: ${content || 'Not provided'}
${learningGuide ? `- Learning Guide: ${JSON.stringify(learningGuide)}` : ''}

Reasoning:
═══════════════════════════════════════════════════════════════════════════════
SYNTHESIS APPROACH
═══════════════════════════════════════════════════════════════════════════════

- Identify the 3–5 most important ideas.
- Merge overlapping explanations into a single clear narrative.
- Present concepts in their most distilled, high-signal form.
- Use examples ONLY if they materially improve understanding.
- Prioritize conceptual clarity over exhaustive detail.
- Every sentence must add informational value.

Output:
═══════════════════════════════════════════════════════════════════════════════
OUTPUT FORMAT & STRUCTURE (MARKDOWN)
═══════════════════════════════════════════════════════════════════════════════

Return ONLY the Markdown summary following this structure below (do NOT include preamble, code fences, or meta-commentary):

# ${title}

> One sentence stating what this topic is and why it matters.

## Quick Takeaways

• Insight 1

• Insight 2

• Insight 3

• Optional insight 4

## Core Concepts

Break this down into logical sections using ## and ###.
Explain foundational ideas clearly. Focus on distinct areas.
Include code blocks if they were present in the source and are essential to explaining concepts.

## Key Terminology

• **Term**: Clear, precise definition

• **Term**: Clear, precise definition

• **Term**: Clear, precise definition

(Include 3–8 essential terms only. Each MUST be on a new line with a blank line between them.)

## Critical Insight

> The most important principle, implication, or takeaway.

## Summary

Write a cohesive, professional synthesis (4-6 sentences).
- Start by framing the topic within its broader context.
- Summarize how the core concepts and tools discussed relate to each other.
- Conclude with the practical or conceptual significance of mastering this material.
- Avoid a "choked" or overly dense presentation; ensure the narrative flows logically.

FORMATTING RULES (STRICT):
- Use hierarchy (##, ###).
- Use **bold** for key terms on first mention.
- Use bullet points (•) for lists.
- EVERY list item MUST be on its own line.
- Use a **blank line** between every list item to ensure they do not merge.
- Use fenced code blocks with language for snippets.
- Use > for the most important insight or principle.
- Blank lines before/after headers and between paragraphs.

Stopping conditions:
═══════════════════════════════════════════════════════════════════════════════
STOPPING CONDITIONS (NON-NEGOTIABLE)
═══════════════════════════════════════════════════════════════════════════════

- If a statement is NOT supported by provided material, do NOT include it.
- If the output contains quizzes, exercises, or pedagogical language ("let's explore"), it is REJECTED.
- If the output is purely "AI-sounding" (e.g., using "delve into"), it is REJECTED.
- Stop when all core concepts are covered and the summary is logically closed.
- Return ONLY the Markdown summary. No preamble, no postamble, no code fences.
`;
  }

  static scoreTheoryQuestion(
    question: string,
    studentAnswer: string,
    markingGuideline: any,
    sampleAnswer?: string
  ) {
    return `
You are an experienced educator and examiner specialized in fair and consistent evaluation of open-ended theory answers.

TASK:
Evaluate the student's answer based on the provided marking guidelines and, if available, the sample answer. Score fairly, provide constructive feedback, and identify strengths and improvement areas.

QUESTION:
${question}

STUDENT ANSWER:
${studentAnswer}

MARKING GUIDELINES:
${JSON.stringify(markingGuideline, null, 2)}

${sampleAnswer ? `SAMPLE ANSWER (reference only):\n${sampleAnswer}\n` : ''}

EVALUATION RULES:

1. **Content-focused:** Score only the substance of the answer, not style or grammar.
2. **Key points:** Identify which points from the marking guidelines are addressed.
3. **Accuracy:** Verify factual correctness of statements.
4. **Comprehension:** Assess depth of understanding.
5. **Partial credit:** Award proportional points for partially correct responses.
6. **Alternative valid perspectives:** Accept equivalent explanations and correct rewordings.
7. **No penalty for minor errors** unless they affect clarity.
8. **Context-aware:** Prioritize core concepts if the question focuses on fundamentals.

SCORING PROCESS:

1. Match student's statements to key points in the guidelines.
2. Evaluate each point for correctness and completeness.
3. Note any additional acceptable concepts not in the guidelines.
4. Assign scores to each key point and calculate total.
5. Determine overall quality level (excellent, good, adequate, poor).
6. Provide constructive feedback highlighting strengths and improvement areas.

OUTPUT FORMAT:
Return ONLY valid JSON (no markdown, no code fences, no preamble). Include all fields exactly as below:

{
  "totalScore": 0,
  "maxPoints": 0,
  "percentage": 0,
  "grade": "A/B/C/etc.",
  "pointsBreakdown": [
    {
      "keyPoint": "Description of key point",
      "maxValue": 0,
      "awarded": 0,
      "feedback": "Specific feedback on this point"
    }
  ],
  "qualityLevel": "excellent/good/adequate/poor",
  "strengths": [
    "List key strengths of the answer"
  ],
  "areasForImprovement": [
    "List actionable improvements"
  ],
  "additionalConceptsFound": [
    "Any valid concepts beyond the marking guideline"
  ],
  "overallFeedback": "Comprehensive summary feedback combining strengths and improvements",
  "encouragement": "Positive motivational note highlighting student's achievement"
}

VALIDATION CHECKLIST:
✓ All key points evaluated fairly  
✓ Partial credit applied correctly  
✓ Feedback is specific, constructive, and actionable  
✓ Tone is encouraging and professional  
✓ JSON is valid and parseable  
✓ No hallucinations or irrelevant content included  
`;
  }

  static generateTheoryQuestions(
    topic: string,
    numberOfQuestions: number,
    difficulty: string,
    sourceContent: string = ''
  ) {
    return `
Role:
You are an expert educational assessment designer specializing in open-ended theory questions that test deep understanding, critical thinking, and application.

Task:
Generate exactly ${numberOfQuestions} high-quality theory questions using the parameters below. Include comprehensive marking guidelines and sample answers. Follow JSON output strictly.

Context:
- Topic: ${topic || 'Not specified (derive from source content only)'}
- Difficulty Level: ${difficulty}
- Source Content: ${sourceContent || 'None provided'}

Reasoning:
DESIGN PRINCIPLES:
1. DEPTH: Require explanation, analysis, synthesis, or evaluation. Avoid simple recall.
2. CLARITY: Questions must be precise, unambiguous, and stand alone.
3. SCOPE: Expected answers: 100-300 words (adjust based on difficulty).
4. ACCURACY: Marking guidelines must be fair, comprehensive, and measurable.
5. SOURCE FIDELITY: If source content is provided, base questions strictly on it.
6. NO SOURCE REFERENCES: Do NOT reference source material in the question.
7. GENERAL KNOWLEDGE: If source is missing, use high-quality general knowledge.
8. NO HALLUCINATION: Generate fewer questions rather than inventing if source is limited.
9. DIVERSITY: Cover different aspects without redundancy.

DIFFICULTY GUIDELINES:
- EASY: Explain or describe core concepts; 2-4 key points.
- MEDIUM: Compare, analyze, or apply concepts; 4-6 key points.
- HARD: Synthesize, evaluate, or solve problems; 6-8 key points.

MARKING GUIDELINES:
- Key Points: Specific, measurable, and directly tied to the question.
- Point Values: 1-3 points per key point; total 10-20 points.
- Acceptable Concepts: Include related ideas or valid alternative explanations.
- Quality Criteria: Define excellent, good, adequate, or poor responses.

Output:
Return ONLY valid JSON (no markdown, no code fences, no preamble):

{
  "title": "Theory Questions: ${topic || 'Untitled'}",
  "topic": "${topic || 'General'}",
  "difficulty": "${difficulty}",
  "questions": [
    {
      "questionType": "theory",
      "question": "Open-ended question requiring detailed explanation",
      "markingGuideline": {
        "maxPoints": 10,
        "keyPoints": [
          {"point": "Specific concept or fact to mention", "value": 2},
          {"point": "Another critical concept", "value": 2}
        ],
        "acceptableConcepts": [
          "Related concept that adds value",
          "Alternative correct perspective"
        ],
        "qualityCriteria": {
          "excellent": "Detailed, comprehensive answer covering all key points",
          "good": "Mostly complete answer with minor gaps",
          "adequate": "Partial answer covering some key points",
          "poor": "Minimal or inaccurate answer"
        }
      },
      "sampleAnswer": "Concise model answer demonstrating expected coverage and depth",
      "explanation": "Brief note on what this question tests or why it is important",
      "citation": "Source reference if applicable"
    }
  ]
}

Stopping conditions:
✓ Exactly ${numberOfQuestions} questions generated (or fewer if source limited)  
✓ All required fields present and complete  
✓ No invented information if source content provided  
✓ No markdown or code fences in output  
✓ Questions test understanding, not recall  
✓ Marking guidelines are fair, detailed, and measurable  
✓ JSON is valid and parseable
`;
  }

  /**
   * Helper method to format source content section
   */
  static formatSourceContent(sourceContent?: string): string {
    if (!sourceContent) {
      return 'Source Content: Not provided. Generate questions based on high-quality, factually accurate general knowledge of the topic.';
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
   * Study Recommendations Prompt
   *
   * Generates personalized, data-driven study recommendations.
   */
  static studyRecommendations(weakTopics: string, recentAttempts: string) {
    return `
You are an expert learning strategist who provides actionable study recommendations based on student performance.

INPUT DATA:
- Weak Topics: ${weakTopics}
- Recent Performance History (last 10 attempts): ${recentAttempts}

ANALYSIS FRAMEWORK:
1. **Performance Gaps:** Identify topics with lowest scores or highest error rates
2. **Recency:** Prioritize topics not practiced in the last 5-7 days
3. **Learning Progression:** Consider prerequisite relationships
4. **Engagement:** Balance challenge with achievable targets

PRIORITY LEVELS:
- **HIGH:** Critical gaps (score <60%) or fundamental concepts not mastered
- **MEDIUM:** Moderate gaps (score 60-75%) or important supporting topics
- **LOW:** Minor gaps (score >75%) or enrichment topics

REQUIREMENTS:
✓ Provide clear rationale for each recommendation based on the data  
✓ Focus on actionable steps students can take immediately  
✓ Use constructive, encouraging language  
✓ Keep responses concise and structured

OUTPUT:
Return ONLY valid JSON (no markdown, no fences, no preamble):

{
  "recommendations": [
    {
      "topic": "Topic Name",
      "reason": "Clear explanation of why this is recommended",
      "priority": "high|medium|low"
    }
  ]
}
`;
  }

  /**
   * Concept Extraction Prompt
   *
   * Extracts core learning concepts from quiz questions for weak area tracking.
   */
  static conceptExtraction(questions: string) {
    return `
You are an expert in learning analytics and knowledge modeling.

TASK:
Extract the core learning concepts from each quiz question to track weak areas.

INPUT:
- Quiz Questions:
${questions}

REQUIREMENTS:
- Identify the specific concept, skill, or knowledge area tested by each question  
- Keep each concept concise (under 100 characters)  
- Avoid generic terms; be as precise as possible  
- Do not add explanations, examples, or external information

OUTPUT:
Return ONLY valid JSON (no markdown, no fences, no preamble):

{
  "concepts": ["Concept 1", "Concept 2", "..."]
}
`;
  }

  /**
   * Understanding Summary Prompt
   *
   * Generates encouraging summaries of student understanding based on performance data.
   */
  static understandingSummary(topic: string, performance: string) {
    return `
You are an encouraging and data-driven educator providing constructive feedback.

TASK:
Generate a concise summary of a student's understanding of "${topic}" based on performance data.

INPUT:
- Performance Data:
${performance}

REQUIREMENTS:
✓ Keep summary under 150 words  
✓ Highlight specific strengths and achievements  
✓ Identify areas for improvement with actionable guidance  
✓ Use professional, supportive, and encouraging tone  
✓ Present in clear, structured Markdown  
✓ Start directly with the summary; no preamble or extraneous commentary

OUTPUT:
Return only the summary text in Markdown format.
`;
  }
}
