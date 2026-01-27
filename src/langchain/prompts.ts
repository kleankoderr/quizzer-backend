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
  - Each question must be fully self-contained, include all necessary context, 
    and must not reference any source text or external content (e.g., “based on the text” or “according to the source”). 
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
      "explanation": "context or memory aid"
    }
  ]
}

Stopping conditions:
1. Confirm card count ≤ ${numberOfCards}
2. Confirm EVERY card:
   - Tests exactly ONE concept
   - Is answerable from the source content
   - Has a clear front and definitive back
3. Confirm no hallucinated or external information
4. Confirm JSON is valid and parseable

Begin directly with the JSON object.
`;
  }

  static generateComprehensiveLearningGuide(
    topic: string,
    sourceContent: string = '',
    fileContext: string = ''
  ) {
    return `
Role:
You are an expert instructional designer. Your goal is to help beginners truly understand concepts, not memorize facts.

Task:
Generate a structured, high-quality learning guide using ONLY the provided content. Do NOT invent facts, examples, or explanations.

Context:
- Topic: ${topic || 'Derive from content'}
- Primary Content: ${sourceContent || 'None'}
- Additional Context: ${fileContext || 'None'}

Reasoning:
GLOBAL TEACHING RULES:
- Explain WHY before HOW
- Plain language first, technical language second
- Define terminology before using it
- Clarity over completeness
- Proper Markdown is required

SECTION STRUCTURE (STRICT — NO EXCEPTIONS):
Generate **4-10 sections**. EVERY section MUST include ALL of the following fields:
- content
- example
- knowledgeCheck

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

#### Formula | Algorithm | Code (ONLY if required)
- Mathematical concepts → formulas (NOT code)
- Programming / computational concepts → code
- Otherwise → OMIT this subsection entirely
- If using code: Place code ONLY here, use minimal clean examples, add brief inline comments, use proper Markdown code blocks.

#### Common Mistakes or Misconceptions
- At least one realistic misunderstanding
- Explain why it is incorrect

CRITICAL CONTENT PLACEMENT RULES (MANDATORY):
- The **content** field MUST NOT contain: Questions, Options, Correct answers, Answer explanations, or "Knowledge Check" labels.
- ALL worked scenarios MUST appear ONLY in: learningGuide.sections[].example
- ALL assessment material MUST appear ONLY in: learningGuide.sections[].knowledgeCheck

WORKED EXAMPLE (example field ONLY):
- MUST exist for EVERY section
- No headings inside the example
- Written as a concrete, step-by-step scenario
- Explicitly explain how it demonstrates the concept
- MUST NOT include questions or answers

KNOWLEDGE CHECK (MANDATORY FOR EVERY SECTION):
- EVERY section MUST include exactly ONE knowledge check testing understanding of that section only.
- MUST be scenario-based (not definition recall).
- MUST include: question, exactly 4 options, correctAnswer (index 0–3), and explanation.

Output:
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

Stopping conditions:
1. Confirm there are 4–10 sections
2. Confirm EVERY section has: content, example, knowledgeCheck
3. Confirm no questions exist outside knowledgeCheck
4. Confirm no examples exist outside example
5. Confirm no invented facts or external info included
6. Confirm JSON is valid and parseable

Final Goal: The learner finishes and says: “I actually understand this.”
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
Role:
You are an expert educator. Your goal is to explain concepts clearly and accurately to help students understand deeply.

Task:
Explain the concept defined below.

Context:
- Topic: ${topic}
- Context: ${context}

Reasoning:
INSTRUCTIONS:
- First sentence MUST define the concept clearly.
- Explain WHY it matters or where it is used.
- Break complex ideas into simpler parts.
- Use an analogy ONLY if it genuinely improves clarity.
- End with a key takeaway or practical implication.

FORMATTING (Markdown):
- **Bold** key terms.
- Use bullet points or numbered lists where appropriate.
- Use > blockquotes for key insights.
- Use \`inline code\` for technical terms.
- Use fenced code blocks ONLY when needed (specify language, add comments).

Output:
Return Markdown only. No preamble. No wrapping code fences. Start directly with the explanation.

Stopping conditions:
1. Concept is clearly defined in the first sentence.
2. Narrative flows logically from simple to complex.
3. Formatting rules are followed.
4. No meta-commentary included.
`;
  }

  static generateExample(topic: string, context: string) {
    return `
Role:
You are an expert educator. Your goal is to provide concrete examples that make abstract concepts unmistakably clear.

Task:
Generate EXACTLY 2 or 3 high-quality examples for the concept below.

Context:
- Topic: ${topic}
- Context: ${context}

Reasoning:
RULES:
- Each example MUST demonstrate the concept clearly.
- Use different scenarios for each example.
- Explain WHY the example illustrates the concept.
- Include code ONLY when it adds real clarity.
- Do NOT repeat the same idea across examples.

FORMATTING (Markdown):
- Use ### headers for each example.
- **Bold** key ideas.
- Use bullet points for breakdowns.
- Use \`inline code\` for technical terms.
- Use fenced code blocks with language and comments if applicable.

STRUCTURE PER EXAMPLE:
### Example X: Descriptive Title
[Short scenario or setup]
**Key aspects:**
• **Aspect**: Explanation
[Explanation of how this demonstrates the concept]
**Why this works:** Clear, concise explanation

Output:
Return the examples in Markdown. No preamble. Start directly with the first example.

Stopping conditions:
1. Exactly 2 or 3 examples are generated.
2. Each example follows the specified structure.
3. Scenarios are distinct and relevant.
4. No meta-commentary included.
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
Create a structured summary that captures the essential knowledge from the provided material for fast review and long-term retention. Target length: 400–1200 words.

Context:
- Title: ${title}
- Topic: ${topic}
- Content: ${content || 'Not provided'}
${learningGuide ? `- Learning Guide: ${JSON.stringify(learningGuide)}` : ''}

Reasoning:
SYNTHESIS APPROACH:
- Identify the 3–5 most important ideas.
- Merge overlapping explanations into a single clear narrative.
- Present concepts in their most distilled, high-signal form.
- Use examples ONLY if they materially improve understanding.
- Prioritize conceptual clarity over exhaustive detail.
- Every sentence must add informational value.

FORMATTING RULES (STRICT):
- Use hierarchy (##, ###).
- Use **bold** for key terms on first mention.
- Use bullet points (•) for lists.
- EVERY list item MUST be on its own line.
- Use a **blank line** between every list item to ensure they do not merge.
- Use fenced code blocks with language for snippets.
- Use > for the most important insight or principle.
- Blank lines before/after headers and between paragraphs.

Output:
Return ONLY the Markdown summary following this structure below (no preamble, code fences, or meta-commentary):

# ${title}
> One sentence stating what this topic is and why it matters.

## Quick Takeaways
• Insight 1
• Insight 2
• Insight 3

## Core Concepts
Break this down into logical sections using ## and ###.
Explain foundational ideas clearly. Focus on distinct areas.

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

Stopping conditions:
1. Summary is supported by provided material.
2. Output contains no quizzes or exercises.
3. No "AI-sounding" language (e.g., "delve into").
4. Summary is logically closed.
`;
  }

  static scoreTheoryQuestion(
    question: string,
    studentAnswer: string,
    markingGuideline: any,
    sampleAnswer?: string
  ) {
    return `
Role:
You are an experienced educator and examiner specialized in fair and consistent evaluation of open-ended theory answers.

Task:
Evaluate the student's answer based on the provided marking guidelines and sample answer.

Context:
- Question: ${question}
- Student Answer: ${studentAnswer}
- Marking Guidelines: ${JSON.stringify(markingGuideline, null, 2)}
${sampleAnswer ? `- Sample Answer: ${sampleAnswer}` : ''}

Reasoning:
EVALUATION RULES:
1. **Content-focused:** Score only the substance of the answer, not style or grammar.
2. **Key points:** Identify which points from the marking guidelines are addressed.
3. **Accuracy:** Verify factual correctness of statements.
4. **Comprehension:** Assess depth of understanding.
5. **Partial credit:** Award proportional points for partially correct responses.
6. **Alternative valid perspectives:** Accept equivalent explanations and correct rewordings.
7. **No penalty for minor errors** unless they affect clarity.

SCORING PROCESS:
1. Match student's statements to key points in the guidelines.
2. Evaluate each point for correctness and completeness.
3. Assign scores to each key point and calculate total.
4. Provide constructive feedback highlighting strengths and improvement areas.

Output:
Return ONLY valid JSON (no markdown, no code fences, no preamble).

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
  "strengths": ["List key strengths"],
  "areasForImprovement": ["List improvement areas"],
  "additionalConceptsFound": ["Any valid concepts beyond the guidelines"],
  "overallFeedback": "Summary feedback",
  "encouragement": "Positive motivational note"
}

Stopping conditions:
1. All key points are evaluated fairly.
2. Partial credit is applied correctly.
3. Feedback is specific and constructive.
4. JSON is valid and parseable.
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
You are an expert educational assessment designer specializing in open-ended theory questions that test deep understanding.

Task:
Generate exactly ${numberOfQuestions} high-quality theory questions.

Context:
- Topic: ${topic || 'Not specified'}
- Difficulty Level: ${difficulty}
- Source Content: ${sourceContent || 'None provided'}

Reasoning:
DESIGN PRINCIPLES:
1. DEPTH: Require explanation, analysis, synthesis, or evaluation. Avoid simple recall.
2. CLARITY: Questions must be precise, unambiguous, and stand alone.
3. SCOPE: Expected answers: 100-300 words.
4. ACCURACY: Marking guidelines must be fair, comprehensive, and measurable.
5. SOURCE FIDELITY: Base questions strictly on provided source (if any).
6. NO SOURCE REFERENCES: Do NOT reference source material in the question.

MARKING GUIDELINES:
- Key Points: Specific, measurable, and directly tied to the question.
- Point Values: 1-3 points per key point; total 10-20 points.
- Quality Criteria: Define levels (excellent, good, adequate, poor).

Output:
Return ONLY valid JSON (no markdown, no code fences, no preamble).

{
  "title": "Theory Questions: ${topic || 'Untitled'}",
  "topic": "${topic || 'General'}",
  "difficulty": "${difficulty}",
  "questions": [
    {
      "questionType": "theory",
      "question": "Open-ended question",
      "markingGuideline": {
        "maxPoints": 10,
        "keyPoints": [
          {"point": "Specific concept", "value": 2}
        ],
        "acceptableConcepts": ["Related concept"],
        "qualityCriteria": {
          "excellent": "Description",
          "good": "Description",
          "adequate": "Description",
          "poor": "Description"
        }
      },
      "sampleAnswer": "Model answer",
      "explanation": "Brief note",
      "citation": "Source reference if applicable"
    }
  ]
}

Stopping conditions:
1. Exactly ${numberOfQuestions} questions generated (or fewer if source limited).
2. All required fields are present and complete.
3. Questions test understanding, not recall.
4. Marking guidelines are fair, detailed, and measurable.
5. JSON is valid and parseable.
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
Role:
You are an expert learning strategist who provides actionable study recommendations based on student performance.

Task:
Analyze student performance and generate personalized study recommendations.

Context:
- Weak Topics: ${weakTopics}
- Recent Performance History (last 10 attempts): ${recentAttempts}

Reasoning:
ANALYSIS FRAMEWORK:
1. **Performance Gaps:** Identify topics with lowest scores or highest error rates.
2. **Recency:** Prioritize topics not practiced in the last 5-7 days.
3. **Learning Progression:** Consider prerequisite relationships.
4. **Engagement:** Balance challenge with achievable targets.

PRIORITY LEVELS:
- **HIGH:** Critical gaps (score <60%) or fundamental concepts not mastered.
- **MEDIUM:** Moderate gaps (score 60-75%) or important supporting topics.
- **LOW:** Minor gaps (score >75%) or enrichment topics.

Output:
Return ONLY valid JSON (no markdown, no fences, no preamble).

{
  "recommendations": [
    {
      "topic": "Topic Name",
      "reason": "Clear explanation of why this is recommended",
      "priority": "high|medium|low"
    }
  ]
}

Stopping conditions:
1. Recommendations are data-driven based on input.
2. Each recommendation has a clear rationale.
3. Priority levels are applied correctly.
4. JSON is valid and parseable.
`;
  }

  /**
   * Concept Extraction Prompt
   *
   * Extracts core learning concepts from quiz questions for weak area tracking.
   */
  static conceptExtraction(questions: string) {
    return `
Role:
You are an expert in learning analytics and knowledge modeling.

Task:
Extract the core learning concepts from each quiz question to track weak areas.

Context:
- Quiz Questions: ${questions}

Reasoning:
REQUIREMENTS:
- Identify the specific concept, skill, or knowledge area tested by each question.
- Keep each concept concise (under 100 characters).
- Avoid generic terms; be as precise as possible.
- Do not add explanations, examples, or external information.

Output:
Return ONLY valid JSON (no markdown, no fences, no preamble).

{
  "concepts": ["Concept 1", "Concept 2", "..."]
}

Stopping conditions:
1. Only the most relevant concepts are extracted.
2. Concepts are concise and precise.
3. JSON is valid and parseable.
`;
  }

  /**
   * Understanding Summary Prompt
   *
   * Generates encouraging summaries of student understanding based on performance data.
   */
  static understandingSummary(topic: string, performance: string) {
    return `
Role:
You are an encouraging and data-driven educator providing constructive feedback.

Task:
Generate a concise summary of a student's understanding based on performance data.

Context:
- Topic: ${topic}
- Performance Data: ${performance}

Reasoning:
REQUIREMENTS:
- Keep summary under 150 words.
- Highlight specific strengths and achievements.
- Identify areas for improvement with actionable guidance.
- Use professional, supportive, and encouraging tone.

Output:
Return only the summary text in Markdown format. Start directly with the summary; no preamble or meta-commentary.

Stopping conditions:
1. Summary is under 150 words.
2. Feedback is constructive and data-driven.
3. Tone is encouraging and professional.
`;
  }
}
