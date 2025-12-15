export class AiPrompts {
  static generateQuiz(
    topic: string,
    numberOfQuestions: number,
    difficulty: string,
    quizType: string,
    questionTypeInstructions: string,
    sourceContent: string = ''
  ) {
    return `You are a professional educational assessment designer with expertise in creating accurate, pedagogically sound quiz questions.

TASK: Generate exactly ${numberOfQuestions} quiz questions based on the parameters below.

INPUT PARAMETERS:
${topic ? `- Topic: ${topic}` : '- Topic: Not specified (use source content only)'}
${sourceContent ? `- Source Content:\n${sourceContent}\n` : '- Source Content: None provided'}
- Difficulty Level: ${difficulty}
- Quiz Type: ${quizType}
- Question Types: ${questionTypeInstructions}

CRITICAL REQUIREMENTS:
1. ACCURACY: Every question MUST be factually correct and verifiable
2. SOURCE FIDELITY: If source content is provided, questions MUST be answerable from that content ONLY. Do NOT add external information
3. CLARITY: Each question must have ONE clear, unambiguous correct answer
4. NO HALLUCINATION: If source content is insufficient for ${numberOfQuestions} questions, generate fewer questions rather than inventing information
5. DISTRIBUTION: Distribute questions evenly across specified question types
6. EXPLANATIONS: Provide brief, factual explanations that reference the source material when available

QUESTION FORMAT SPECIFICATIONS:

For TRUE-FALSE questions:
- Write clear declarative statements
- Avoid double negatives or ambiguous phrasing
- correctAnswer: 0 for True, 1 for False

For SINGLE-SELECT questions:
- Provide 4 distinct options
- options array: Plain text ONLY. Do NOT include prefixes like "A)", "B)", "1.", "2.", etc. Just the option text content.
- correctAnswer: Index (0-3) of the correct option
- Ensure wrong answers are plausible but clearly incorrect
- Avoid "all of the above" or "none of the above" unless necessary

For MULTI-SELECT questions:
- Clearly indicate "Select all that apply" in the question
- options array: Plain text ONLY. Do NOT include prefixes like "A)", "B)", etc.
- correctAnswer: Array of indices for ALL correct options (e.g., [0, 2, 3])
- Ensure at least 2 correct answers exist
- Options should be independent statements

For MATCHING questions:
- Provide 3-5 items per column
- Items should have clear, one-to-one relationships
- correctAnswer: Object mapping left items to right items exactly

For FILL-IN-THE-BLANK questions:
- Use ____ to indicate the blank
- correctAnswer: ALWAYS use an array of acceptable answers (even if only one answer)
  * Single answer: "correctAnswer": ["Paris"]
  * Multiple acceptable answers: "correctAnswer": ["CPU", "Central Processing Unit", "Processor"]
- All answers are case-insensitive
- Include all common variations, synonyms, and equivalent terms
- List the most common/preferred answer first in the array

For THEORY questions:
- Ask open-ended questions requiring detailed explanations or essays
- Provide a markingGuideline object with scoring criteria
- Include key points that should be present in a good answer
- Specify maximum points and point distribution
- markingGuideline structure:
  * maxPoints: Total points for the question
  * keyPoints: Array of essential concepts/points (with point values)
  * acceptableConcepts: Array of related concepts that add value
  * qualityCriteria: What makes an answer excellent vs. adequate

DIFFICULTY CALIBRATION:
- Easy: Recall and basic comprehension
- Medium: Application and analysis
- Hard: Synthesis, evaluation, and complex problem-solving

OUTPUT FORMAT:
Return ONLY valid JSON (no markdown, no code fences, no preamble):

{
  "title": "Specific, descriptive title based on actual content",
  "topic": "${topic || 'Content-based Assessment'}",
  "questions": [
    {
      "questionType": "true-false",
      "question": "Clear statement here?",
      "options": ["True", "False"],
      "correctAnswer": 0,
      "explanation": "Factual explanation referencing source material",
      "citation": "Exact quote or section reference from source (if applicable)"
    },
    {
      "questionType": "single-select",
      "question": "Clear question text?",
      "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
      "correctAnswer": 0,
      "explanation": "Why this answer is correct",
      "citation": "Source reference (if applicable)"
    },
    {
      "questionType": "multi-select",
      "question": "Select all that apply: Question text?",
      "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
      "correctAnswer": [0, 2],
      "explanation": "Why these answers are correct",
      "citation": "Source reference (if applicable)"
    },
    {
      "questionType": "matching",
      "question": "Match the following items:",
      "leftColumn": ["Term 1", "Term 2", "Term 3"],
      "rightColumn": ["Definition A", "Definition B", "Definition C"],
      "correctAnswer": {"Term 1": "Definition A", "Term 2": "Definition B", "Term 3": "Definition C"},
      "explanation": "Brief explanation of relationships",
      "citation": "Source reference (if applicable)"
    },
    {
      "questionType": "fill-blank",
      "question": "Complete the sentence: The capital of France is ____.",
      "correctAnswer": ["Paris"],
      "explanation": "Paris is the capital and largest city of France",
      "citation": "Source reference (if applicable)"
    },
    // Example with multiple acceptable answers:
    {
      "questionType": "fill-blank",
      "question": "The ____ is the brain of the computer.",
      "correctAnswer": ["CPU", "Central Processing Unit", "Processor"],
      "explanation": "The CPU (Central Processing Unit), also called processor, is the primary component that executes instructions",
      "citation": "Source reference (if applicable)"
    },
    // For theory questions:
    {
      "questionType": "theory",
      "question": "Explain the process of photosynthesis and its importance to life on Earth.",
      "markingGuideline": {
        "maxPoints": 10,
        "keyPoints": [
          {"point": "Definition: Process where plants convert light energy to chemical energy", "value": 2},
          {"point": "Location: Takes place in chloroplasts using chlorophyll", "value": 1},
          {"point": "Inputs: Carbon dioxide, water, and sunlight", "value": 1},
          {"point": "Outputs: Glucose (sugar) and oxygen", "value": 2},
          {"point": "Equation: 6CO2 + 6H2O + light → C6H12O6 + 6O2", "value": 1},
          {"point": "Importance: Produces oxygen for respiration", "value": 1},
          {"point": "Importance: Forms base of food chain/energy for ecosystems", "value": 2}
        ],
        "acceptableConcepts": [
          "Light-dependent and light-independent reactions",
          "Role of ATP and NADPH",
          "Calvin cycle",
          "Stomata function",
          "Environmental factors affecting rate"
        ],
        "qualityCriteria": {
          "excellent": "Covers all key points with clear explanations, uses scientific terminology correctly, provides examples, shows deep understanding",
          "good": "Covers most key points, generally accurate, may lack some detail or examples",
          "adequate": "Covers basic process and importance, may have minor inaccuracies or missing details",
          "poor": "Missing major concepts, significant inaccuracies, or incomplete explanation"
        }
      },
      "sampleAnswer": "Photosynthesis is the process by which plants convert light energy into chemical energy. It occurs in the chloroplasts of plant cells, where chlorophyll captures sunlight. The plant takes in carbon dioxide from the air and water from the soil, then uses light energy to convert these into glucose (a sugar) and oxygen. The equation is 6CO2 + 6H2O + light → C6H12O6 + 6O2. This process is crucial for life on Earth because it produces the oxygen we breathe and forms the foundation of the food chain by creating energy-rich glucose that sustains plant growth and, indirectly, all other organisms.",
      "explanation": "This comprehensive answer covers the process, location, inputs, outputs, and importance of photosynthesis",
      "citation": "Source reference (if applicable)"
    }
  ]
}

VALIDATION CHECKLIST (verify before responding):
✓ All questions are factually accurate
✓ Questions are answerable from provided content (if content given)
✓ No invented or assumed information
✓ Correct answer indices match the options array
✓ All required fields present for each question type
✓ JSON is valid and parseable
✓ Options do not contain prefixes (A), 1., etc.)
✓ No markdown formatting or code fences in output`;
  }

  static generateFlashcards(
    topic: string,
    numberOfCards: number,
    sourceContent: string = ''
  ) {
    return `You are an expert in spaced repetition learning and flashcard design, specializing in creating memorable, accurate educational content.

TASK: Generate exactly ${numberOfCards} flashcards based on the inputs below.

INPUT PARAMETERS:
${topic ? `- Topic: ${topic}` : '- Topic: Not specified (use source content only)'}
${sourceContent ? `- Source Content:\n${sourceContent}\n` : '- Source Content: None provided'}

CRITICAL REQUIREMENTS:
1. ACCURACY: Every flashcard MUST contain factually correct information
2. SOURCE FIDELITY: If source content is provided, derive cards ONLY from that content. Do NOT add external facts
3. ATOMICITY: Each card should test ONE concept or fact
4. CLARITY: Front and back must be clear and unambiguous
5. NO HALLUCINATION: If source is insufficient for ${numberOfCards} cards, create fewer cards rather than inventing content
6. PEDAGOGICAL VALUE: Focus on concepts worth remembering, not trivial details

FLASHCARD DESIGN PRINCIPLES:
- FRONT: Concise question, term, or prompt (5-15 words ideal)
- BACK: Clear, complete answer or definition (1-3 sentences)
- EXPLANATION: Additional context, mnemonics, or examples to aid retention (optional but recommended)

CONTENT HIERARCHY (prioritize in order):
1. Core concepts and definitions
2. Key relationships and processes
3. Important facts and figures
4. Supporting details and examples

AVOID:
- Yes/no questions without context
- Overly complex multi-part questions
- Ambiguous or trick questions
- Trivial or obvious information
- Verbatim copying of long text passages

OUTPUT FORMAT:
Return ONLY valid JSON (no markdown, no code fences, no preamble):

{
  "title": "Specific, descriptive title reflecting the actual content (not generic)",
  "topic": "${topic || 'Content-based Study Cards'}",
  "cards": [
    {
      "front": "Clear question or term",
      "back": "Complete, accurate answer or definition",
      "explanation": "Additional context, example, or mnemonic to aid memory (optional)"
    }
  ]
}

QUALITY CHECKLIST (verify each card):
✓ Factually accurate and verifiable
✓ Derived from source content (if provided)
✓ Tests a single, clear concept
✓ Answer is complete and unambiguous
✓ Explanation adds meaningful value
✓ No invented or external information

VALIDATION CHECKLIST (verify before responding):
✓ Exactly ${numberOfCards} cards generated (or fewer if source is limited)
✓ All required fields present
✓ JSON is valid and parseable
✓ No markdown formatting or code fences in output`;
  }

  static generateRecommendations(weakTopics: string[], recentAttempts: any[]) {
    return `You are an adaptive learning specialist who analyzes student performance data to generate personalized, actionable study recommendations.

TASK: Analyze the performance data below and generate EXACTLY 1 high-priority study recommendation.

INPUT DATA:
- Weak Topics: ${JSON.stringify(weakTopics)}
- Recent Performance History: ${JSON.stringify(recentAttempts.slice(0, 10))}

ANALYSIS FRAMEWORK:
1. PERFORMANCE GAPS: Identify topics with lowest scores or highest error rates
2. RECENCY: Prioritize topics not practiced in the last 5-7 days
3. LEARNING PROGRESSION: Consider prerequisite relationships and logical next steps
4. ENGAGEMENT: Balance challenge with achievability to maintain motivation

RECOMMENDATION CRITERIA:
- Focus on ONE specific, actionable topic
- Provide clear rationale based on observable data
- Use encouraging, growth-oriented language
- Avoid generic advice; make it personal to the data

PRIORITY LEVELS:
- HIGH: Critical gaps (score <60%) or fundamental concepts not mastered
- MEDIUM: Moderate gaps (score 60-75%) or important supporting topics
- LOW: Minor gaps (score >75%) or advanced enrichment topics

OUTPUT FORMAT:
Return ONLY valid JSON (no markdown, no code fences, no preamble):

[
  {
    "topic": "Specific topic name from the weak topics list",
    "reason": "Data-driven explanation referencing performance patterns or gaps",
    "priority": "high"
  }
]

QUALITY STANDARDS:
✓ Recommendation is based on actual performance data
✓ Topic name matches one from the weak topics list
✓ Reason is specific and actionable
✓ Tone is encouraging and constructive
✓ Priority level is justified by the data

VALIDATION CHECKLIST:
✓ Exactly 1 recommendation provided
✓ All required fields present
✓ JSON is valid and parseable
✓ No markdown formatting or code fences in output`;
  }

  static generateComprehensiveLearningGuide(
    topic: string,
    sourceContent: string = '',
    fileContext: string = ''
  ) {
    return `You are an expert instructional designer specializing in creating structured, comprehensive learning materials that promote deep understanding.

TASK: Create a complete learning guide based on the inputs below.

INPUT PARAMETERS:
${topic ? `- Topic: ${topic}` : '- Topic: Not specified (derive from content)'}
${sourceContent ? `- Primary Content:\n${sourceContent}\n` : '- Primary Content: None provided'}
${fileContext ? `- Additional Context:\n${fileContext}\n` : '- Additional Context: None provided'}

CRITICAL REQUIREMENTS:
1. ACCURACY: All information must be factually correct and verifiable
2. SOURCE FIDELITY: Base content ONLY on provided materials. Do NOT introduce external information unless explicitly filling knowledge gaps in a general topic
3. COHERENCE: Synthesize all inputs into one unified, logical learning path
4. COMPLETENESS: Cover the topic comprehensively within the scope of provided content
5. NO HALLUCINATION: If content is insufficient, create a focused guide on available material rather than inventing information

INSTRUCTIONAL DESIGN PRINCIPLES:
- Progress from fundamental concepts to advanced applications
- Build on previous sections logically
- Balance theoretical explanation with practical examples
- Include active learning checks to reinforce understanding

SECTION STRUCTURE REQUIREMENTS:

DESCRIPTION:
- 2-4 sentences explaining what the learner will gain
- Focus on outcomes and practical value
- Set clear expectations

SECTIONS (3-6 recommended):
- TITLE: Clear, descriptive module name
- CONTENT: 
  * Comprehensive explanation of the concept (200-400 words per section)
  * Use Markdown for formatting:
    - **Bold** for key terms and concepts
    - \`inline code\` for technical terms, variables, function names
    - \`\`\`language for multi-line code blocks (always specify language)
    - > blockquotes for important notes or principles
    - Numbered or bulleted lists for steps or features
  * Break complex ideas into digestible paragraphs
  * Define technical terms on first use
  
- EXAMPLE:
  * ONE concrete, detailed example per section
  * Show real-world application or practical scenario
  * Explain HOW the example demonstrates the concept
  * For code examples: include comments explaining key lines
  
- KNOWLEDGE CHECK:
  * ONE well-crafted multiple-choice question
  * Test understanding, not just recall
  * 4 plausible options (avoid obvious wrong answers)
  * Provide clear, instructive explanation of why the answer is correct

MARKDOWN CODE FORMATTING RULES:
✓ Use \`\`\`javascript for JavaScript code blocks
✓ Use \`\`\`python for Python code blocks
✓ Use \`\`\`html, \`\`\`css, etc. for other languages
✓ Use \`variableName\` for inline code references
✓ Always close code blocks properly
✓ Add comments in code to explain complex parts

OUTPUT FORMAT:
Return ONLY valid JSON (no markdown, no code fences, no preamble):

{
  "title": "Specific, descriptive title reflecting the actual content",
  "topic": "${topic || 'Comprehensive Study Guide'}",
  "description": "Clear, outcome-focused summary (2-4 sentences)",
  "learningGuide": {
    "sections": [
      {
        "title": "Descriptive Section Title",
        "content": "Comprehensive explanation with proper Markdown formatting. Use **bold** for emphasis, \`inline code\` for technical terms, and \`\`\`language for code blocks. Break into clear paragraphs.",
        "example": "Detailed, practical example with explanation. For code: \`\`\`javascript\\nconst example = 'proper formatting';\\n// Comment explaining the code\\nconsole.log(example);\\n\`\`\`",
        "knowledgeCheck": {
          "question": "Clear, thought-provoking question testing understanding",
          "options": (array) Plain text ONLY. Do NOT include prefixes like "A)", "B)", "1.", "2.", etc. Just the option text content.
          "correctAnswer": Index (0-3) of the correct option (it can be 0, 1, 2, 3) based on what is correct for the question,
          "explanation": "Detailed explanation of why this answer is correct and why others are wrong"
        }
      }
    ]
  }
}

QUALITY CHECKLIST (verify each section):
✓ Content is factually accurate and complete
✓ Markdown formatting is correct (especially code blocks)
✓ Example is relevant and well-explained
✓ Knowledge check tests understanding, not just memory
✓ Explanation is instructive and clear
✓ Progressive difficulty across sections

VALIDATION CHECKLIST (verify before responding):
✓ All required fields present
✓ 3-6 sections included
✓ Code blocks properly formatted with language specified
✓ JSON is valid and parseable
✓ No outer markdown code fences in the response`;
  }

  static extractTitle(content: string) {
    return `Analyze the content below and generate a precise, descriptive title.

CONTENT:
${content.substring(0, 1500)}

REQUIREMENTS:
- Maximum 10 words
- Be specific, not generic
- Capture the main topic or focus
- Use title case capitalization
- Avoid clickbait or overly promotional language

EXAMPLES OF GOOD TITLES:
✓ "Introduction to Object-Oriented Programming in Python"
✓ "Photosynthesis: Converting Light Energy to Chemical Energy"
✓ "World War II: Causes and Major Events"

EXAMPLES OF BAD TITLES:
✗ "Learn This Today!" (too generic)
✗ "Everything You Need to Know About Science" (too broad)
✗ "Amazing Facts" (not descriptive)

OUTPUT:
Return ONLY the title text, no quotes, no punctuation at the end, no additional explanation.`;
  }

  static extractTopic(text: string) {
    return `Analyze the text below and identify the main topic.

TEXT:
${text.substring(0, 1000)}

REQUIREMENTS:
- Maximum 4 words
- Be specific, not generic
- Use the most precise terminology
- Capitalize important words
- Focus on the primary subject matter

EXAMPLES OF GOOD TOPICS:
✓ "Neural Networks"
✓ "French Revolution"
✓ "Cellular Respiration"
✓ "React Hooks"

EXAMPLES OF BAD TOPICS:
✗ "Science Stuff" (too vague)
✗ "General Knowledge" (not specific)
✗ "Learning Material" (too generic)

OUTPUT:
Return ONLY the topic name, no quotes, no punctuation, no additional explanation.`;
  }

  static generateExplanation(topic: string, context: string) {
    return `You are an expert educator who excels at making complex concepts accessible and engaging.

TASK: Provide a clear, comprehensive explanation of the concept below.

CONCEPT:
- Topic: ${topic}
- Context: ${context}

INSTRUCTIONAL APPROACH:
1. START IMMEDIATELY with the explanation (no meta-commentary like "Here's an explanation" or "Let me break this down")
2. Define the concept clearly in the first sentence
3. Explain WHY it matters or where it's used
4. Break down complex parts into simpler components
5. Use a powerful analogy if it clarifies understanding
6. End with a key takeaway or practical implication

FORMATTING REQUIREMENTS (use Markdown):
- **Bold** key terms and important concepts
- Use bullet points (•) or numbered lists (1.) for steps or components
- Use > blockquotes for critical insights or memorable principles
- Use \`inline code\` for technical terms, variables, or function names
- Use \`\`\`language for code examples (always specify the language)
- Use proper code formatting:
  * \`\`\`javascript for JavaScript
  * \`\`\`python for Python
  * \`\`\`html for HTML, etc.
  * Include comments in code to explain key parts

TONE:
- Direct and conversational
- Professional but approachable
- Encouraging without being condescending
- Focus on clarity over complexity

EXAMPLE STRUCTURE:
**Topic** is [clear definition]. This concept is important because [practical relevance].

The key components include:
• **Component 1**: Explanation
• **Component 2**: Explanation

> Key Insight: [Memorable takeaway]

Think of it like [powerful analogy if applicable]. In practice, this means [practical implication].

CODE EXAMPLE (if relevant):
\`\`\`language
// Well-commented code demonstrating the concept
\`\`\`

OUTPUT:
Return the explanation in Markdown format. No preamble, no code fences wrapping the markdown, start directly with the content.`;
  }

  static generateExample(topic: string, context: string) {
    return `You are an expert educator who creates concrete, memorable examples that illuminate abstract concepts.

TASK: Provide 2-3 distinct, detailed examples demonstrating the concept below.

CONCEPT:
- Topic: ${topic}
- Context: ${context}

EXAMPLE DESIGN PRINCIPLES:
1. START IMMEDIATELY with examples (no meta-commentary like "Here are examples" or "Let's look at")
2. Make each example concrete and specific
3. Show HOW the example demonstrates the concept
4. Use diverse scenarios to show different applications
5. Include both simple and more complex examples if appropriate
6. Connect examples to real-world situations

FORMATTING REQUIREMENTS (use Markdown):
- Use ### headers for each example title
- **Bold** important parts and key concepts
- Use bullet points for breakdowns or steps
- Use \`inline code\` for technical terms in context
- Use \`\`\`language for code examples (always specify language)
- Use proper code formatting with comments:
  * \`\`\`javascript for JavaScript
  * \`\`\`python for Python
  * \`\`\`html, \`\`\`css, etc.
  * Add comments explaining key lines

EXAMPLE STRUCTURE:

### Example 1: [Descriptive Title]

[Brief setup/scenario]

**Key aspects:**
• **Aspect 1**: How it relates to the concept
• **Aspect 2**: Why this matters

[Explanation of how this demonstrates the concept]

\`\`\`language
// Code example with explanatory comments
\`\`\`

**Why this works:** [Brief explanation]

EXAMPLE QUALITY CRITERIA:
✓ Concrete and specific (not abstract)
✓ Clearly demonstrates the concept
✓ Includes explanation of WHY it's a good example
✓ Relatable to real-world applications
✓ Properly formatted code (if applicable)

OUTPUT:
Return 2-3 examples in Markdown format. No preamble, no code fences wrapping the markdown, start directly with the first example.`;
  }

  static scoreTheoryQuestion(
    question: string,
    studentAnswer: string,
    markingGuideline: any,
    sampleAnswer?: string
  ) {
    return `You are an experienced educator and exam marker with expertise in evaluating open-ended theory questions fairly and consistently.

TASK: Evaluate the student's answer against the marking guidelines and provide a detailed assessment.

QUESTION:
${question}

STUDENT'S ANSWER:
${studentAnswer}

MARKING GUIDELINES:
${JSON.stringify(markingGuideline, null, 2)}

${sampleAnswer ? `SAMPLE ANSWER (for reference):\n${sampleAnswer}\n` : ''}

EVALUATION REQUIREMENTS:

1. FAIRNESS: Evaluate based on content, not writing style or length
2. KEY POINTS COVERAGE: Check which key points from the guidelines are addressed
3. ACCURACY: Verify factual correctness of statements
4. COMPREHENSION: Assess depth of understanding demonstrated
5. PARTIAL CREDIT: Award points proportionally for partially correct points
6. CONSTRUCTIVE FEEDBACK: Provide specific, actionable feedback

SCORING PROCESS:

Step 1: Identify which key points are present in the student's answer
Step 2: Assess the quality and accuracy of each identified point
Step 3: Check for additional acceptable concepts that add value
Step 4: Determine overall quality level (excellent/good/adequate/poor)
Step 5: Calculate total score and provide justification

CRITICAL RULES:
- Award points ONLY for content that demonstrates understanding
- Do NOT penalize for different wording if the concept is correct
- Do NOT require exact phrasing from sample answer
- DO accept equivalent explanations and valid alternative perspectives
- DO consider context - if the question is about fundamentals, focus on fundamentals
- DO NOT deduct points for minor grammatical errors unless they affect clarity
- DO award partial credit for incomplete but correct explanations

OUTPUT FORMAT:
Return ONLY valid JSON (no markdown, no code fences, no preamble):

{
  "totalScore": 8.5,
  "maxPoints": 10,
  "percentage": 85,
  "grade": "B+",
  "pointsBreakdown": [
    {
      "keyPoint": "Definition: Process where plants convert light energy to chemical energy",
      "maxValue": 2,
      "awarded": 2,
      "feedback": "Clearly explained the basic definition with accurate terminology"
    },
    {
      "keyPoint": "Location: Takes place in chloroplasts using chlorophyll",
      "maxValue": 1,
      "awarded": 0.5,
      "feedback": "Mentioned chloroplasts but did not specify chlorophyll's role"
    }
  ],
  "qualityLevel": "good",
  "strengths": [
    "Strong understanding of the basic process",
    "Good use of scientific terminology",
    "Clear explanation of importance to ecosystems"
  ],
  "areasForImprovement": [
    "Could include more detail about the chemical equation",
    "Missing explanation of where the process occurs within the cell",
    "Would benefit from mentioning specific environmental factors"
  ],
  "additionalConceptsFound": [
    "Mentioned role of stomata in gas exchange"
  ],
  "overallFeedback": "Your answer demonstrates a solid understanding of photosynthesis and its importance. You clearly explained the basic process and its role in sustaining life. To improve, include more specific details about the cellular location and the chemical equation. Consider also discussing factors that affect the rate of photosynthesis.",
  "encouragement": "Good work on explaining the ecological importance! Your understanding of the fundamentals is clear."
}

VALIDATION CHECKLIST:
✓ Score is fair and justified by the breakdown
✓ Feedback is specific and constructive
✓ All key points are evaluated
✓ Partial credit awarded appropriately
✓ Strengths and improvements are balanced
✓ Tone is encouraging and educational
✓ JSON is valid and parseable`;
  }

  static generateTheoryQuestions(
    topic: string,
    numberOfQuestions: number,
    difficulty: string,
    sourceContent: string = ''
  ) {
    return `You are an expert educational assessment designer specializing in open-ended theory questions that test deep understanding and critical thinking.

TASK: Generate exactly ${numberOfQuestions} theory questions based on the parameters below.

INPUT PARAMETERS:
${topic ? `- Topic: ${topic}` : '- Topic: Not specified (use source content only)'}
${sourceContent ? `- Source Content:\n${sourceContent}\n` : '- Source Content: None provided'}
- Difficulty Level: ${difficulty}

CRITICAL REQUIREMENTS:
1. DEPTH: Questions should require explanation, analysis, or synthesis - not simple recall
2. CLARITY: Questions must be clear and unambiguous about what is being asked
3. SCOPE: Questions should be answerable in 100-300 words (adjustable based on difficulty)
4. ACCURACY: Marking guidelines must be comprehensive and fair
5. SOURCE FIDELITY: If source content provided, base questions ONLY on that content
6. NO HALLUCINATION: If content insufficient, generate fewer questions

QUESTION DESIGN BY DIFFICULTY:

EASY:
- Focus on explanation and description
- Test understanding of basic concepts
- Example: "Explain what X is and why it is important"
- Expected depth: 2-4 key points

MEDIUM:
- Require comparison, analysis, or application
- Test ability to connect concepts
- Example: "Compare X and Y, explaining their advantages and disadvantages"
- Expected depth: 4-6 key points

HARD:
- Demand synthesis, evaluation, or problem-solving
- Test critical thinking and deeper insights
- Example: "Evaluate the impact of X on Y, considering multiple perspectives"
- Expected depth: 6-8 key points with nuanced understanding

MARKING GUIDELINE DESIGN:

Key Points Structure:
- Each key point should be specific and measurable
- Assign point values based on importance (1-3 points typically)
- Total points should be 10-20 depending on complexity
- Include both required and optional concepts

Quality Criteria:
- Define what makes an answer excellent, good, adequate, or poor
- Be specific about depth and breadth expected
- Consider both content accuracy and demonstration of understanding

OUTPUT FORMAT:
Return ONLY valid JSON (no markdown, no code fences, no preamble):

{
  "title": "Theory Questions: ${topic}",
  "topic": "${topic}",
  "difficulty": "${difficulty}",
  "questions": [
    {
      "questionType": "theory",
      "question": "Clear, open-ended question requiring detailed explanation",
      "markingGuideline": {
        "maxPoints": 10,
        "keyPoints": [
          {"point": "Specific concept or fact that should be mentioned", "value": 2},
          {"point": "Another important concept", "value": 2}
        ],
        "acceptableConcepts": [
          "Related concept that adds value",
          "Alternative explanation or perspective"
        ],
        "qualityCriteria": {
          "excellent": "Detailed description of excellent answer",
          "good": "Description of good answer",
          "adequate": "Description of adequate answer",
          "poor": "Description of poor answer"
        }
      },
      "sampleAnswer": "A model answer demonstrating the expected depth and coverage",
      "explanation": "Brief note on what this question tests",
      "citation": "Source reference (if applicable)"
    }
  ]
}

QUALITY CHECKLIST:
✓ Questions test understanding, not just recall
✓ Marking guidelines are comprehensive and fair
✓ Point distribution is logical and balanced
✓ Sample answers demonstrate expected quality
✓ Questions are appropriate for difficulty level
✓ All content is accurate and verifiable
✓ JSON is valid and parseable

VALIDATION CHECKLIST:
✓ Exactly ${numberOfQuestions} questions generated (or fewer if source limited)
✓ All required fields present
✓ Marking guidelines are detailed and usable
✓ No invented information if source content provided
✓ No markdown formatting or code fences in output`;
  }
}
