export class AiPrompts {
  static generateQuiz(
    topic: string,
    numberOfQuestions: number,
    difficulty: string,
    quizType: string,
    questionTypeInstructions: string,
    sourceContent: string = ''
  ) {
    return `You are a professional educational assessment designer specializing in creating valid, reliable, and pedagogically sound quiz questions that accurately measure learning outcomes.

TASK: Generate exactly ${numberOfQuestions} quiz questions that test genuine understanding of the material.

═══════════════════════════════════════════════════════════════════════════════
INPUT PARAMETERS
═══════════════════════════════════════════════════════════════════════════════

${topic ? `- Topic: ${topic}` : '- Topic: Not specified (derive from source content only)'}
${sourceContent ? `- Source Content:\n${sourceContent}\n` : '- Source Content: None provided'}
- Difficulty Level: ${difficulty}
- Quiz Type: ${quizType}
- Question Types: ${questionTypeInstructions}

═══════════════════════════════════════════════════════════════════════════════
CORE ASSESSMENT PRINCIPLES
═══════════════════════════════════════════════════════════════════════════════

ACCURACY & VALIDITY:
- Every question must be factually correct and verifiable
- Each question must have ONE unambiguous correct answer (except multi-select)
- Questions must actually test the intended knowledge or skill
- Avoid trick questions or unnecessarily confusing language

SOURCE FIDELITY:
- When source content is provided, questions MUST be answerable exclusively from that content
- Do NOT introduce external facts, examples, or concepts not present in the source
- If the source material is insufficient for ${numberOfQuestions} quality questions, generate fewer questions rather than compromising quality or inventing information
- Citation fields should reference specific sections of the source when applicable

PEDAGOGICAL SOUNDNESS:
- Questions should test understanding, not just memorization (especially for Medium/Hard)
- Distractors (wrong answers) should represent common misconceptions or plausible alternatives
- Avoid patterns that allow test-wise students to guess without knowledge
- Questions should be independent (one question shouldn't give away another's answer)

CLARITY & FAIRNESS:
- Use clear, direct language appropriate for the difficulty level
- Avoid ambiguous phrasing, double negatives, or unnecessarily complex sentence structures
- Ensure reading difficulty doesn't exceed content difficulty
- Questions should be answerable by someone who studied the material, not require outside knowledge

═══════════════════════════════════════════════════════════════════════════════
DIFFICULTY CALIBRATION
═══════════════════════════════════════════════════════════════════════════════

EASY (Recall & Comprehension):
- Recognition of facts, definitions, and basic concepts
- Direct recall from material
- Simple identification and categorization
- Example: "What is the capital of France?" or "True or False: Photosynthesis requires sunlight."

MEDIUM (Application & Analysis):
- Applying concepts to new situations
- Comparing and contrasting ideas
- Interpreting information or examples
- Making inferences from provided information
- Example: "How would changing X affect Y?" or "Which scenario best demonstrates concept Z?"

HARD (Synthesis & Evaluation):
- Combining multiple concepts to solve problems
- Evaluating arguments or approaches
- Predicting outcomes based on principles
- Creating solutions or identifying best approaches
- Example: "Given conditions A and B, which strategy would be most effective and why?"

═══════════════════════════════════════════════════════════════════════════════
QUESTION FORMAT SPECIFICATIONS
═══════════════════════════════════════════════════════════════════════════════

TRUE-FALSE QUESTIONS:

Structure:
- Present a clear, declarative statement
- Statement should be unambiguously true or false
- Avoid absolute terms ("always," "never") unless factually accurate
- Avoid double negatives (e.g., "It is not incorrect that...")

Technical Requirements:
- options: Always ["True", "False"]
- correctAnswer: 0 for True, 1 for False
- explanation: State why the statement is true/false and address common misconceptions

Best Practices:
- Test understanding of key concepts, not trivial details
- Ensure the statement is substantial enough to be meaningful
- Avoid overly long or complex statements

Example:
{
  "questionType": "true-false",
  "question": "Photosynthesis converts light energy into chemical energy stored in glucose.",
  "options": ["True", "False"],
  "correctAnswer": 0,
  "explanation": "This is true. During photosynthesis, plants use light energy to convert carbon dioxide and water into glucose (chemical energy) and oxygen.",
  "citation": "Section 2.3: The Photosynthesis Process"
}

───────────────────────────────────────────────────────────────────────────────

SINGLE-SELECT QUESTIONS (Multiple Choice):

Structure:
- Question stem should be a complete thought or clear question
- Provide exactly 4 distinct options
- One option is correct; three are plausible distractors

Technical Requirements:
- options: Array of plain text strings (NO prefixes like "A)", "1.", "•")
- correctAnswer: Single index (0-3) indicating the correct option
- explanation: Why the correct answer is right AND why key distractors are wrong

Distractor Quality:
- Each wrong answer should be plausible to someone with partial knowledge
- Distractors can represent common misconceptions or errors
- Avoid obviously wrong "throwaway" options
- Ensure similar length and complexity across all options
- Don't use "All of the above" or "None of the above" unless absolutely necessary

Best Practices:
- Avoid negative phrasing in the question stem when possible
- Keep options parallel in grammar and structure
- Place options in logical order (e.g., numerical, alphabetical, chronological)
- Avoid patterns (e.g., "C" is never correct)

Example:
{
  "questionType": "single-select",
  "question": "Which process is primarily responsible for creating ATP in animal cells?",
  "options": [
    "Cellular respiration",
    "Photosynthesis",
    "Protein synthesis",
    "DNA replication"
  ],
  "correctAnswer": 0,
  "explanation": "Cellular respiration is the primary process for ATP production in animal cells. Photosynthesis occurs in plants, while protein synthesis and DNA replication consume ATP rather than produce it.",
  "citation": "Chapter 4: Cellular Energy Production"
}

───────────────────────────────────────────────────────────────────────────────

MULTI-SELECT QUESTIONS:

Structure:
- Question must explicitly indicate multiple answers are possible
- Use phrases like "Select all that apply" or "Which of the following are true?"
- Provide 4-6 options total
- At least 2 options must be correct
- At least 1 option must be incorrect

Technical Requirements:
- options: Array of plain text strings (NO prefixes)
- correctAnswer: Array of indices for ALL correct options (e.g., [0, 2, 3])
- explanation: Explain why each correct answer is right and why incorrect options are wrong

Best Practices:
- Each option should be independently true or false
- Avoid interdependent options (where one being true makes another true)
- Ensure all correct answers are equally correct (no "partially correct" options)
- Test related concepts or characteristics

Example:
{
  "questionType": "multi-select",
  "question": "Select all that apply: Which of the following are characteristics of mammals?",
  "options": [
    "Warm-blooded metabolism",
    "Lay eggs exclusively",
    "Produce milk for offspring",
    "Have hair or fur",
    "Breathe through gills"
  ],
  "correctAnswer": [0, 2, 3],
  "explanation": "Mammals are warm-blooded (0), produce milk (2), and have hair or fur (3). While most mammals give live birth, not all lay eggs exclusively (platypus is an exception). Mammals breathe through lungs, not gills.",
  "citation": "Section 7.1: Mammalian Characteristics"
}

───────────────────────────────────────────────────────────────────────────────

MATCHING QUESTIONS:

Structure:
- Provide 3-5 items in each column
- Items should have clear, one-to-one correspondence
- Relationships should be unambiguous

Technical Requirements:
- leftColumn: Array of items (typically terms, concepts, or prompts)
- rightColumn: Array of items (typically definitions, descriptions, or responses)
- correctAnswer: Object mapping each left item to exactly one right item
  Example: {"Term 1": "Definition A", "Term 2": "Definition B"}
- explanation: Brief overview of the relationships or why they match

Best Practices:
- Both columns should contain items of similar types (e.g., all terms and definitions)
- Avoid items that could match multiple options
- Keep items concise and clear
- Ensure both columns are displayed in logical order

Example:
{
  "questionType": "matching",
  "question": "Match each programming concept with its correct definition:",
  "leftColumn": [
    "Variable",
    "Function",
    "Loop",
    "Conditional"
  ],
  "rightColumn": [
    "A named container that stores a value",
    "A reusable block of code that performs a specific task",
    "A structure that repeats code multiple times",
    "A statement that executes code based on a condition"
  ],
  "correctAnswer": {
    "Variable": "A named container that stores a value",
    "Function": "A reusable block of code that performs a specific task",
    "Loop": "A structure that repeats code multiple times",
    "Conditional": "A statement that executes code based on a condition"
  },
  "explanation": "Each programming concept has a distinct purpose: variables store data, functions organize reusable code, loops enable repetition, and conditionals enable decision-making.",
  "citation": "Chapter 2: Programming Fundamentals"
}

───────────────────────────────────────────────────────────────────────────────

FILL-IN-THE-BLANK QUESTIONS:

Structure:
- Use ____ to indicate where the answer should go
- Sentence should provide sufficient context to determine the answer
- Blank should typically be a key term, concept, or value

Technical Requirements:
- correctAnswer: ALWAYS an array of acceptable answers (even if only one answer exists)
  * Single answer: ["Paris"]
  * Multiple acceptable: ["CPU", "Central Processing Unit", "Processor", "central processing unit"]
- Matching is case-insensitive by default
- Include ALL reasonable variations, synonyms, common abbreviations, and equivalent terms
- List the most common or preferred answer first in the array

Best Practices:
- Place the blank strategically (not at the beginning when possible)
- Ensure only one concept can reasonably fit the blank
- Provide enough context to make the answer unambiguous
- Consider common misspellings or variations for technical terms
- For numeric answers, include both written and numeric forms if applicable

Example (single answer):
{
  "questionType": "fill-blank",
  "question": "The process by which plants convert light energy into chemical energy is called ____.",
  "correctAnswer": ["photosynthesis"],
  "explanation": "Photosynthesis is the process where plants use sunlight, water, and carbon dioxide to produce glucose and oxygen.",
  "citation": "Section 2: Plant Biology Basics"
}

Example (multiple acceptable answers):
{
  "questionType": "fill-blank",
  "question": "The ____ is often called the 'brain' of the computer because it executes program instructions.",
  "correctAnswer": ["CPU", "Central Processing Unit", "Processor", "central processing unit", "processor"],
  "explanation": "The CPU (Central Processing Unit), also known as the processor, executes instructions from programs and coordinates all computer operations.",
  "citation": "Chapter 1.2: Computer Hardware Components"
}

───────────────────────────────────────────────────────────────────────────────

═══════════════════════════════════════════════════════════════════════════════
QUESTION DISTRIBUTION STRATEGY
═══════════════════════════════════════════════════════════════════════════════

When generating multiple questions:
- Distribute questions evenly across specified question types
- Cover different aspects of the topic (don't cluster questions on one subtopic)
- Vary difficulty appropriately based on the specified difficulty level
- Ensure questions are independent (answers don't give away other answers)
- Progress logically if possible (foundational concepts before advanced applications)

If ${numberOfQuestions} questions cannot be created with high quality from the available content:
- Generate as many high-quality questions as possible
- Do NOT invent information to reach the target number
- Ensure every question generated meets all quality standards

═══════════════════════════════════════════════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════════════════════════════════════════════

Return ONLY valid JSON (no markdown code fences, no preamble, no commentary):

{
  "title": "Specific, descriptive title reflecting the actual quiz content",
  "topic": "${topic || 'Content-Based Assessment'}",
  "questions": [
    // Array of question objects following the specifications above
    // Each question must include all required fields for its type
  ]
}

═══════════════════════════════════════════════════════════════════════════════
QUALITY ASSURANCE CHECKLIST
═══════════════════════════════════════════════════════════════════════════════

Before finalizing, verify each question:

Content Quality:
✓ Factually accurate and verifiable
✓ Answerable exclusively from source content (if provided)
✓ No hallucinated information or external facts
✓ Tests understanding at appropriate difficulty level
✓ Has one clear correct answer (or set of answers for multi-select)

Question Design:
✓ Clear, unambiguous wording
✓ No trick questions or unfair complexity
✓ Appropriate reading level for content difficulty
✓ Free from bias or cultural assumptions
✓ Independent from other questions

Options & Answers:
✓ All options are plausible and parallel in structure
✓ No obvious "throwaway" wrong answers
✓ Distractors represent realistic misconceptions
✓ Similar length and complexity across options
✓ Options contain NO prefixes (A, B, 1, 2, etc.)

Technical Requirements:
✓ correctAnswer uses correct format for question type:
  - True-false: 0 or 1
  - Single-select: Single index (0-3)
  - Multi-select: Array of indices [0, 2, 3]
  - Fill-blank: Array of strings ["answer1", "answer2"]
  - Matching: Object with key-value pairs
✓ All required fields present for each question type
✓ Citations included when referencing source material
✓ Explanations are clear and instructive

Format Requirements:
✓ Valid JSON structure (parseable)
✓ No markdown code fences around output
✓ No preamble or commentary
✓ Proper escaping of special characters in strings
✓ Consistent formatting throughout

Pedagogical Standards:
✓ Questions test meaningful understanding
✓ Appropriate cognitive level for difficulty rating
✓ Fair and answerable by someone who studied the material
✓ Explanations enhance learning (not just confirm answers)

Begin your response with the JSON object directly.`;
  }

  static generateFlashcards(
    topic: string,
    numberOfCards: number,
    sourceContent: string = ''
  ) {
    return `You are an expert in spaced repetition learning and flashcard design, specializing in creating memorable, effective study materials that optimize long-term retention.

TASK: Generate exactly ${numberOfCards} flashcards that facilitate deep understanding and efficient recall.

═══════════════════════════════════════════════════════════════════════════════
INPUT PARAMETERS
═══════════════════════════════════════════════════════════════════════════════

${topic ? `- Topic: ${topic}` : '- Topic: Not specified (derive from source content only)'}
${sourceContent ? `- Source Content:\n${sourceContent}\n` : '- Source Content: None provided'}

═══════════════════════════════════════════════════════════════════════════════
CORE FLASHCARD PRINCIPLES
═══════════════════════════════════════════════════════════════════════════════

ACCURACY & SOURCE FIDELITY:
- Every flashcard must contain factually correct, verifiable information
- When source content is provided, derive cards EXCLUSIVELY from that material
- Do NOT introduce external facts, examples, or concepts not present in the source
- If source material is insufficient for ${numberOfCards} quality cards, generate fewer cards rather than compromising accuracy or inventing content

ATOMICITY (One Card = One Concept):
- Each flashcard should test exactly ONE discrete piece of knowledge
- Break complex concepts into multiple focused cards
- Avoid multi-part questions that test several unrelated facts
- The learner should be able to recall the answer confidently or not at all

CLARITY & PRECISION:
- Questions and answers must be unambiguous
- Avoid vague language that could have multiple interpretations
- Use specific, concrete language
- Ensure the answer directly addresses the question

PEDAGOGICAL VALUE:
- Prioritize concepts worth remembering over trivial details
- Focus on understanding relationships, not just isolated facts
- Include context that aids meaningful learning
- Support transfer of knowledge to new situations

═══════════════════════════════════════════════════════════════════════════════
FLASHCARD STRUCTURE
═══════════════════════════════════════════════════════════════════════════════

FRONT (The Prompt):
- Length: 5-15 words ideal; maximum 25 words
- Format options:
  * Direct question: "What is photosynthesis?"
  * Term to define: "Photosynthesis"
  * Fill-in-the-blank: "The process by which plants convert light into chemical energy is called ____"
  * Relationship prompt: "How does X affect Y?"

Best Practices:
- Be specific and concrete
- Provide sufficient context (avoid "What is it?" without specifying "it")
- Use consistent phrasing for similar card types
- Start with question words when appropriate (What, How, Why, When, Where)

Examples:
✓ Good: "What are the three main stages of cellular respiration?"
✓ Good: "Mitochondria"
✗ Poor: "What about the cell thing?" (too vague)
✗ Poor: "Describe everything about the process of photosynthesis and its role in ecosystems" (too broad)

BACK (The Answer):
- Length: 1-3 sentences ideal; maximum 5 sentences
- Should be complete enough to stand alone
- Include essential details without overwhelming
- Use clear, straightforward language

Best Practices:
- Answer the question directly and completely
- Include key details that differentiate this concept from related ones
- Use parallel structure for similar cards
- Define technical terms if they're essential to the answer

Examples:
✓ Good: "The three main stages are glycolysis (glucose breakdown), the Krebs cycle (energy extraction), and the electron transport chain (ATP production)."
✗ Poor: "There are stages" (incomplete)
✗ Poor: "Glycolysis is the first of several stages in cellular respiration, which is a metabolic process..." (too verbose)

EXPLANATION (Optional but Recommended):
- Length: 1-4 sentences
- Provides additional context that aids retention and understanding
- Should enhance learning without being essential to answer the question

Useful Explanation Types:
- Examples: "For instance, during exercise, your muscles use cellular respiration to convert glucose into ATP for energy."
- Mnemonics: "Remember OIL RIG: Oxidation Is Loss (of electrons), Reduction Is Gain."
- Context: "This process occurs in the mitochondria, which is why they're called the 'powerhouses' of the cell."
- Connections: "This relates to photosynthesis, which produces the glucose that cellular respiration consumes."
- Common misconceptions: "Note that fermentation is not the same as cellular respiration, though both involve breaking down glucose."

When to Include Explanation:
✓ When additional context significantly aids understanding
✓ When a mnemonic or memory aid is helpful
✓ When distinguishing from commonly confused concepts
✓ When providing a relevant example clarifies the concept
✗ When simply rephrasing the answer
✗ When adding tangential information

═══════════════════════════════════════════════════════════════════════════════
CONTENT HIERARCHY & CARD DISTRIBUTION
═══════════════════════════════════════════════════════════════════════════════

When generating multiple cards, prioritize content in this order:

PRIORITY 1 - Core Concepts (40-50% of cards):
- Fundamental definitions and principles
- Essential terminology
- Central ideas that other concepts build upon
Example: "What is natural selection?" or "Define homeostasis"

PRIORITY 2 - Key Relationships (25-35% of cards):
- How concepts connect or interact
- Cause-and-effect relationships
- Processes and mechanisms
Example: "How does temperature affect enzyme activity?" or "What is the relationship between supply and demand?"

PRIORITY 3 - Important Facts (15-25% of cards):
- Significant data points, dates, or figures
- Classifications and categories
- Characteristics and features
Example: "What is the speed of light?" or "Name the four types of biological macromolecules"

PRIORITY 4 - Applications & Examples (10-20% of cards):
- Real-world applications
- Notable examples or case studies
- Problem-solving scenarios
Example: "Give an example of natural selection in action" or "How is Python used in data science?"

Distribution Strategy:
- Cover different aspects of the topic rather than clustering on one area
- Progress from foundational to more complex concepts when possible
- Ensure cards complement each other without redundancy
- Balance different types of knowledge (definitions, processes, applications)

═══════════════════════════════════════════════════════════════════════════════
QUESTION TYPES & FORMATS
═══════════════════════════════════════════════════════════════════════════════

DEFINITION CARDS:
Front: "What is [term]?" or simply "[Term]"
Back: Clear, concise definition with key characteristics
Use for: Core concepts, technical terminology, fundamental principles

Example:
Front: "Photosynthesis"
Back: "The process by which plants use sunlight, water, and carbon dioxide to produce glucose and oxygen."
Explanation: "This occurs primarily in the chloroplasts of plant cells and is the foundation of most food chains."

RELATIONSHIP CARDS:
Front: "How does X affect Y?" or "What is the relationship between X and Y?"
Back: Description of the connection or interaction
Use for: Cause-effect, dependencies, correlations

Example:
Front: "How does increasing temperature affect enzyme activity?"
Back: "Enzyme activity increases with temperature up to an optimal point, after which excessive heat denatures the enzyme and activity decreases."
Explanation: "Most human enzymes have an optimal temperature around 37°C (body temperature)."

PROCESS CARDS:
Front: "What are the steps/stages of X?" or "How does X occur?"
Back: Ordered sequence or mechanism description
Use for: Procedures, cycles, sequential events

Example:
Front: "What are the three main stages of cellular respiration?"
Back: "Glycolysis (glucose breakdown), the Krebs cycle (energy extraction), and the electron transport chain (ATP production)."
Explanation: "These stages progressively extract energy from glucose, producing up to 38 ATP molecules per glucose."

COMPARISON CARDS:
Front: "What is the difference between X and Y?"
Back: Key distinguishing features
Use for: Commonly confused concepts, contrasting ideas

Example:
Front: "What is the difference between DNA and RNA?"
Back: "DNA is double-stranded with deoxyribose sugar and thymine, while RNA is single-stranded with ribose sugar and uracil."
Explanation: "DNA stores genetic information long-term, while RNA typically carries instructions for protein synthesis."

APPLICATION CARDS:
Front: "Give an example of X" or "When/where does X occur?"
Back: Concrete example or real-world instance
Use for: Reinforcing understanding through practical context

Example:
Front: "Give an example of natural selection in modern times"
Back: "Antibiotic resistance in bacteria, where bacteria with resistance genes survive treatment and reproduce, passing on resistance."
Explanation: "This is why doctors emphasize completing antibiotic courses even when symptoms improve."

═══════════════════════════════════════════════════════════════════════════════
DESIGN BEST PRACTICES
═══════════════════════════════════════════════════════════════════════════════

DO:
✓ Keep cards focused and atomic (one concept per card)
✓ Use consistent phrasing for similar card types
✓ Provide enough context to make questions unambiguous
✓ Include examples in explanations when they add clarity
✓ Use specific, concrete language
✓ Make answers complete but concise
✓ Test understanding, not just memorization when possible
✓ Create cards that work in both directions when appropriate

DON'T:
✗ Create yes/no questions without meaningful context
✗ Use overly complex multi-part questions
✗ Include trick questions or unnecessary complexity
✗ Test trivial or obvious information
✗ Copy lengthy passages verbatim from source material
✗ Create cards with ambiguous or multiple correct answers
✗ Cluster multiple cards on the exact same narrow fact
✗ Use vague pronouns without clear antecedents

Common Pitfalls to Avoid:
- "What is it?" (what is "it"?)
- "True or False: X is important" (all concepts covered are presumably important)
- Questions answerable with a simple "yes" or "no" without elaboration
- Cards that test multiple unrelated facts simultaneously
- Redundant cards that essentially ask the same question differently

═══════════════════════════════════════════════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════════════════════════════════════════════

Return ONLY valid JSON (no markdown code fences, no preamble, no commentary):

{
  "title": "Specific, descriptive title reflecting the actual content (not generic)",
  "topic": "${topic || 'Content-Based Study Cards'}",
  "cards": [
    {
      "front": "Clear, focused question or term",
      "back": "Complete, accurate answer (1-3 sentences)",
      "explanation": "Additional context, example, or mnemonic that aids retention (optional)"
    }
  ]
}

═══════════════════════════════════════════════════════════════════════════════
QUALITY ASSURANCE CHECKLIST
═══════════════════════════════════════════════════════════════════════════════

Before finalizing, verify each card:

Content Quality:
✓ Factually accurate and verifiable
✓ Derived exclusively from source content (if provided)
✓ No hallucinated or external information
✓ Tests meaningful knowledge worth remembering
✓ Appropriate level of detail (not too trivial, not too broad)

Card Design:
✓ Tests exactly one discrete concept (atomic)
✓ Front is clear and unambiguous (provides sufficient context)
✓ Back answers the question directly and completely
✓ Answer can be recalled definitively (not vague or subjective)
✓ Explanation adds genuine value (if included)

Language & Clarity:
✓ Uses specific, concrete language
✓ Avoids ambiguous phrasing
✓ Free from grammatical errors
✓ Appropriate vocabulary for the topic level
✓ Consistent style and structure across similar cards

Distribution & Coverage:
✓ Cards cover different aspects of the topic
✓ Appropriate mix of definitions, relationships, processes, and applications
✓ No redundant cards testing the same fact
✓ Logical progression from foundational to complex concepts
✓ Balanced coverage based on content hierarchy priorities

Technical Requirements:
✓ Exactly ${numberOfCards} cards generated (or fewer if source is insufficient)
✓ All required fields present (front, back; explanation optional)
✓ Valid JSON structure (parseable)
✓ No markdown code fences around output
✓ Proper escaping of special characters in strings

Begin your response with the JSON object directly.`;
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
    return `You are an expert instructional designer who creates learning materials that prioritize deep understanding over information density. Your goal is to help learners truly grasp concepts, not just memorize facts.

TASK: Create a complete learning guide that transforms the provided content into an intuitive, engaging learning experience.

INPUT PARAMETERS:
${topic ? `- Topic: ${topic}` : '- Topic: Not specified (derive from content)'}
${sourceContent ? `- Primary Content:\n${sourceContent}\n` : '- Primary Content: None provided'}
${fileContext ? `- Additional Context:\n${fileContext}\n` : '- Additional Context: None provided'}

═══════════════════════════════════════════════════════════════════════════════
CORE TEACHING PHILOSOPHY
═══════════════════════════════════════════════════════════════════════════════

1. CONCEPT-FIRST APPROACH
   - Explain WHY the concept exists before diving into HOW it works
   - Build intuition before introducing complexity
   - Assume learners are intellectually curious but new to the topic
   - Use plain language first, technical terms second

2. ACCURACY & SOURCE FIDELITY
   - All information must be factually correct and verifiable
   - Base content ONLY on provided materials
   - If content is insufficient, focus deeply on what IS provided rather than inventing information
   - Never hallucinate facts, examples, or details not present in source material

3. CLARITY OVER COMPLETENESS
   - Better to explain less deeply than to overwhelm with breadth
   - One well-understood concept > three poorly explained ones
   - Remove unnecessary jargon; define essential terms clearly

═══════════════════════════════════════════════════════════════════════════════
CONTENT QUALITY RULES
═══════════════════════════════════════════════════════════════════════════════

TERMINOLOGY HANDLING (CRITICAL):
Every field has its own vocabulary. Your guide must:

✓ IDENTIFY key terminology early in the guide
✓ CREATE a dedicated terminology section if the topic has 4+ essential terms
✓ DEFINE terms when first introduced using **bold** formatting
✓ PROVIDE etymology or context when it aids understanding
✓ SHOW how terms relate to each other

Terminology Section Guidelines:
- Place early in the guide (typically section 1 or 2)
- Title it clearly: "Key Terminology in [Topic]" or "Understanding [Topic] Vocabulary"
- For each term, provide:
  * Clear definition in plain language
  * Why the term matters
  * Example usage in context
  * Common confusion or misconception (if applicable)

Example Structure:
"In statistics, several terms form the foundation of understanding:
- **Population**: The complete set of all items or individuals you want to study. For example, if you're researching college students' study habits, the population is ALL college students.
- **Sample**: A subset of the population that you actually collect data from. You might survey 500 students instead of millions."

FORMULAS & MATHEMATICAL NOTATION (ENHANCED):
Formulas are powerful tools when presented correctly.

✓ ALWAYS include formulas when the concept involves mathematical relationships
✓ PRESENT formulas in a structured, readable format
✓ EXPLAIN each component of the formula clearly
✓ SHOW the formula's purpose and when to use it
✓ PROVIDE a worked example with actual numbers
✓ USE proper mathematical notation

Formula Presentation Template:
1. **Formula name and purpose**
2. The formula itself (use proper notation)
3. **Where:** When and why you'd use this formula
4. **What each symbol means:**
   - Variable 1: explanation
   - Variable 2: explanation
5. **Worked example** with step-by-step calculation

Example of Proper Formula Presentation:
"**The Mean (Average) Formula**

μ = (Σx) / n

**Where:** Use this when you want to find the central tendency of a dataset - the typical or average value.

**What each symbol means:**
- μ (mu): The mean or average value
- Σ (sigma): The sum of all values (add them all up)
- x: Each individual value in your dataset
- n: The total number of values

**Worked Example:**
You track your daily steps for 5 days: 8,000, 10,500, 7,200, 9,800, 8,500
- Σx = 8,000 + 10,500 + 7,200 + 9,800 + 8,500 = 44,000
- n = 5 (five days)
- μ = 44,000 / 5 = 8,800 steps

Your average daily steps are 8,800."

CODE USAGE GUIDELINES (CRITICAL):
✓ ONLY include code when the concept:
    - Explicitly involves programming, algorithms, or computation
    - Cannot be reasonably understood without seeing implementation
    - Is about a programming language, framework, or software tool

✗ DO NOT use code for:
    - Statistical concepts (use formulas and explanations instead)
    - Mathematical theories (use formulas with explanations)
    - Business concepts, psychological theories, historical events
    - General science topics that don't require computation

✓ When code IS appropriate:
    - Keep it minimal and focused
    - Add inline comments explaining key lines
    - Use it to clarify, not to replace explanation
    - Choose the simplest syntax that demonstrates the concept

EXAMPLES (MOST IMPORTANT):
Your examples make or break understanding. They must be:

✓ RELATABLE: Use contexts learners encounter in daily life, school, work, or common scenarios
✓ CONCRETE: Specific details, not abstract placeholders
✓ CLEARLY CONNECTED: Explicitly show how the example demonstrates the concept
✓ PROGRESSIVELY COMPLEX: Start simple in early sections, build sophistication

Example Quality Spectrum:
- Poor: "Consider a variable X that represents a data point in a dataset..."
- Okay: "Imagine you're analyzing sales data for a store..."
- Good: "You're tracking your monthly grocery spending. In January you spent $450, February $520, March $380..."

STEP-BY-STEP WALKTHROUGH:
For at least one key example per section, walk through it:
1. Set up the scenario clearly
2. Show the process or calculation
3. Explain what's happening at each step
4. Connect the outcome back to the concept

═══════════════════════════════════════════════════════════════════════════════
SECTION STRUCTURE REQUIREMENTS
═══════════════════════════════════════════════════════════════════════════════

DESCRIPTION (2-4 sentences):
- Explain what the learner will UNDERSTAND (not just "learn")
- Emphasize practical value or relevance
- Set expectations: "By the end, you'll be able to..."
- Make it inviting, not intimidating

SECTION TITLES (CRITICAL - NO GENERIC TITLES):
Section titles must be SPECIFIC and DESCRIPTIVE, following a logical pedagogical flow.

✗ BAD TITLES (too vague):
- "Introduction"
- "Overview"
- "Basics"
- "Getting Started"
- "Advanced Concepts"
- "Section 1"

✓ GOOD TITLES (specific and descriptive):
- "Introduction to Statistical Thinking"
- "Key Terminology in Statistics"
- "Understanding Measures of Central Tendency"
- "How to Calculate and Interpret Standard Deviation"
- "The Normal Distribution: What It Is and Why It Matters"
- "Applying Statistical Concepts to Real Data"

SECTION ORDERING GUIDELINES:
Follow this proven pedagogical sequence:

For Technical/Scientific Topics:
1. Introduction to [Topic] / What is [Topic]?
2. Key Terminology in [Topic] (if 4+ essential terms)
3. Fundamental Principles of [Topic]
4. [Specific Concept 1]: How It Works
5. [Specific Concept 2]: Practical Applications
6. Common Pitfalls and How to Avoid Them / Advanced Considerations

For Skill-Based Topics:
1. Understanding [Skill]: Purpose and Benefits
2. Essential Terminology and Concepts
3. The Basic Process: Step-by-Step
4. Techniques for [Specific Aspect]
5. Practical Applications and Examples
6. Mastery Tips and Common Mistakes

For Historical/Conceptual Topics:
1. Introduction to [Topic]: Context and Significance
2. Key Terms and Definitions
3. The Origins of [Topic]
4. Core Principles and Mechanisms
5. Impact and Applications
6. Modern Perspectives and Debates

SECTIONS (3-6 recommended):

Each section should follow this flow: Concept → Intuition → Details → Application

# CONTENT (300-500 words):
Structure your explanation as:
1. Opening hook (why this matters)
2. Core concept in plain language
3. Key terminology definitions (if applicable)
4. Formulas or mathematical relationships (if applicable, with full explanation)
5. Key details and nuance
6. Common misconceptions (if applicable)
7. Connection to related ideas (briefly)

Formatting Guidelines:
- **Bold** for key terms when first introduced
- \`inline code\` ONLY for technical terms, variable names, function names when discussing code/programming
- \`\`\`language for multi-line code blocks (always specify language, e.g., \`\`\`javascript)
- > Use blockquotes for important principles, warnings, or key takeaways
- Use numbered lists for sequential steps
- Use bulleted lists for related features or characteristics
- Break content into 4-6 paragraphs for readability
- For formulas, use the structured template provided above

Progressive Disclosure:
- Section 1: Introduction and context (what is this topic and why does it matter?)
- Section 2: Terminology (if needed) or Fundamental concepts
- Section 3-4: Core mechanisms, formulas, and detailed explanations
- Section 5: Applications and practical usage
- Section 6: Advanced nuance, edge cases, or synthesis (if needed)

# EXAMPLE:
Each section needs ONE detailed, practical example that:
- Uses a scenario the learner can visualize
- Shows the concept in action
- Includes a mini-walkthrough of key steps
- For formulas, shows the complete calculation with numbers
- Explicitly states: "This demonstrates [concept] because..."

For formula examples:
"**Example: Calculating Standard Deviation for Test Scores**

Five students took a test with scores: 85, 90, 78, 92, 88

Step 1: Find the mean
Mean = (85 + 90 + 78 + 92 + 88) / 5 = 433 / 5 = 86.6

Step 2: Find each deviation from the mean
- 85 - 86.6 = -1.6
- 90 - 86.6 = 3.4
- 78 - 86.6 = -8.6
- 92 - 86.6 = 5.4
- 88 - 86.6 = 1.4

Step 3: Square each deviation
- (-1.6)² = 2.56
- (3.4)² = 11.56
- (-8.6)² = 73.96
- (5.4)² = 29.16
- (1.4)² = 1.96

Step 4: Find the average of squared deviations (variance)
Variance = (2.56 + 11.56 + 73.96 + 29.16 + 1.96) / 5 = 119.2 / 5 = 23.84

Step 5: Take the square root
Standard Deviation = √23.84 = 4.88

This demonstrates that the test scores vary by about 4.88 points from the average, indicating moderate spread in performance."

For non-code examples:
Walk through the scenario step-by-step with clear narration and specific details.

# KNOWLEDGE CHECK:
Create questions that test UNDERSTANDING, not just recall.

Question Design:
- Should require applying the concept, not just remembering a definition
- Use scenarios similar to (but different from) the example
- Avoid trick questions or obscure details
- Test insight: "Why does X happen?" vs "What is X?"

Options (4 total):
- All options should be plausible to someone who half-understands
- Avoid obvious throwaway answers
- Include common misconceptions as wrong answers
- Plain text ONLY - no prefixes like "A)", "1.", "•"

Explanation:
- First, affirm why the correct answer is right
- Then briefly explain why each wrong answer is incorrect or incomplete
- Use this as a teaching moment, not just validation
- 2-4 sentences total

═══════════════════════════════════════════════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════════════════════════════════════════════

Return ONLY valid JSON (no markdown fences, no preamble, no code blocks around it):

{
  "title": "Specific, engaging title that reflects the actual content",
  "topic": "${topic || 'Comprehensive Summary'}",
  "description": "Outcome-focused description explaining what learners will understand and why it matters (2-4 sentences)",
  "learningGuide": {
    "sections": [
      {
        "title": "Specific, Descriptive Section Title (e.g., 'Introduction to Statistical Thinking' NOT 'Introduction')",
        "content": "Comprehensive explanation (300-500 words) following the Concept → Intuition → Details → Application flow. Include terminology definitions with **bold** formatting. For formulas, use the structured template: formula name, the formula itself, where it's used, what each symbol means, and a worked example. Use clear paragraphs with good flow.",
        "example": "Detailed, relatable example with step-by-step walkthrough. For mathematical concepts, show complete calculations with actual numbers. For formulas, demonstrate every step of the calculation process. Use narrative walkthrough with concrete details.",
        "knowledgeCheck": {
          "question": "Scenario-based question testing understanding, not just recall",
          "options": ["Plain text option 1", "Plain text option 2", "Plain text option 3", "Plain text option 4"],
          "correctAnswer": 0,
          "explanation": "Clear explanation of why the correct answer is right and why the others miss the mark (2-4 sentences)"
        }
      }
    ]
  }
}

═══════════════════════════════════════════════════════════════════════════════
QUALITY ASSURANCE CHECKLIST
═══════════════════════════════════════════════════════════════════════════════

SECTION TITLES:
- Is every title specific and descriptive (no "Introduction", "Overview", "Basics")?
- Do titles follow logical pedagogical order?
- Do titles accurately reflect section content?
- Is there a terminology section if the topic has 4+ essential terms?

TERMINOLOGY:
- Are all key terms defined when first introduced?
- Are terms formatted with **bold**?
- Is the relationship between terms explained?
- Would a complete beginner understand each term?

FORMULAS:
- Is every relevant formula included?
- Does each formula follow the structured template?
- Is every symbol explained?
- Is there a worked example with actual numbers?
- Are the steps of calculation shown clearly?

CONTENT QUALITY:
- Concept explained in plain language before technical terms
- Clear explanation of WHY the concept matters
- Intuitive explanation before diving into mechanics
- At least one common misconception addressed (if applicable)
- Example that's relatable and clearly connected to concept
- Knowledge check that tests understanding, not memorization
- Proper Markdown formatting
- Logical flow that builds on previous sections
- No hallucinated information beyond the source material

EXAMPLES:
- Are examples concrete with specific numbers/details?
- Do examples include step-by-step walkthroughs?
- For formulas, is the complete calculation shown?
- Is the connection to the concept explicitly stated?

TECHNICAL QUALITY:
- All required JSON fields present
- 3-6 sections included
- JSON is valid and parseable
- No outer markdown code fences wrapping the JSON response
- correctAnswer uses index 0-3, not text

═══════════════════════════════════════════════════════════════════════════════
FINAL REMINDER
═══════════════════════════════════════════════════════════════════════════════

Your goal is for learners to read this once and think: "I actually understand this now."

Prioritize:
1. Clarity over comprehensiveness
2. Intuition over technical precision
3. Understanding over memorization
4. Relatability over academic rigor
5. Proper structure over generic organization
6. Teaching over telling

Create a guide that respects the learner's intelligence while honoring their beginner status. Ensure every section title is specific and descriptive, every term is clearly defined, and every formula is fully explained with worked examples.`;
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

  static generateSummary(
    title: string,
    topic: string,
    content: string,
    learningGuide: any
  ) {
    return `You are an expert content summarizer who transforms educational materials into clear, professional, and highly usable reference documents.

TASK: Create a polished, structured summary that captures the essential knowledge from the provided study material in a format optimized for quick review and retention.

═══════════════════════════════════════════════════════════════════════════════
INPUT MATERIAL
═══════════════════════════════════════════════════════════════════════════════

- Title: ${title}
- Topic: ${topic}
- Content: ${content || 'Not provided'}
${learningGuide ? `- Learning Guide: ${JSON.stringify(learningGuide)}` : ''}

═══════════════════════════════════════════════════════════════════════════════
CORE PRINCIPLES
═══════════════════════════════════════════════════════════════════════════════

ACCURACY & FIDELITY:
- Every statement must be factually correct and traceable to the source material
- Never introduce external information, examples, or interpretations not present in the source
- If the source material is limited, create a focused summary of what IS available
- Maintain the original meaning and intent of the content

PROFESSIONAL TONE:
- Academic yet accessible language
- Direct and precise phrasing
- No colloquialisms, idioms, or casual expressions
- No emojis, decorative symbols, or informal elements
- Avoid "AI-sounding" filler phrases like "delve into," "it's worth noting," "leverage," etc.

CONCISENESS WITH SUBSTANCE:
- Target length: 400-800 words
- Hard maximum: 1000 words
- Every sentence must add value
- Remove redundancy and verbose explanations
- Favor clarity over exhaustive detail

STRUCTURAL CLARITY:
- Information hierarchy must be immediately apparent
- Most critical concepts presented first (inverted pyramid)
- Logical flow between sections
- Visual breathing room between elements

═══════════════════════════════════════════════════════════════════════════════
CONTENT REQUIREMENTS
═══════════════════════════════════════════════════════════════════════════════

WHAT TO INCLUDE:
✓ Core concepts and their definitions
✓ Key relationships between ideas
✓ Critical principles or rules
✓ Essential terminology
✓ Important formulas or frameworks (if present in source)
✓ Practical applications or implications
✓ Notable examples that illustrate core concepts

WHAT TO EXCLUDE:
✗ Knowledge checks, quizzes, practice questions, assessments
✗ Interactive exercises or activities
✗ Step-by-step tutorials (unless they're the main content)
✗ Pedagogical scaffolding (e.g., "Let's explore...", "Now consider...")
✗ Motivational or engagement-focused language
✗ Minor details, edge cases, or tangential information
✗ Attribution to the learning guide itself (write as if presenting original research)

SYNTHESIS APPROACH:
- Combine related information from different sections into unified explanations
- Present concepts in their most streamlined form
- Identify and emphasize the 3-5 most important ideas
- Create natural transitions between sections

═══════════════════════════════════════════════════════════════════════════════
FORMATTING STANDARDS
═══════════════════════════════════════════════════════════════════════════════

MARKDOWN ELEMENTS:

Headers:
- Use ## for main section headers
- Section titles should be descriptive and content-specific
- Avoid generic titles like "Introduction" or "Overview"

Emphasis:
- **Bold** for key terms on first mention and critical concepts
- Use sparingly for maximum impact
- Do not bold entire sentences or large blocks

Lists:
- Use bullet points (•) for unordered information
- Use numbered lists only for sequential or ranked information
- Include blank lines between list items for readability
- Keep bullet points concise (1-2 sentences maximum)

Code Formatting:
- Use \`inline code\` for:
  * Technical terms and keywords
  * Variable names, function names, method names
  * File extensions and command names
  * Brief code expressions (single line)
- Use \`\`\`language for multi-line code blocks (only if essential)
- Always specify language for code blocks: \`\`\`javascript, \`\`\`python, etc.

Blockquotes:
- Use > for critical insights, key principles, or memorable takeaways
- Limit to 1-2 per summary
- Should contain the most important or actionable information

Spacing:
- Include blank lines before and after headers
- Include blank lines between paragraphs
- Include blank lines between list items
- Include blank lines before and after blockquotes
- Create visual breathing room throughout

LANGUAGE CONVENTIONS:

Hyphenation:
- Do NOT hyphenate prefix combinations unless required by standard English
  * Correct: "reorganized," "incorporated," "reestablished," "nonprofit"
  * Incorrect: "re-organized," "in-corporated," "re-established," "non-profit"
- DO hyphenate compound adjectives before nouns: "long-term strategy," "real-world application"
- DO hyphenate when necessary for clarity: "re-create" (create again) vs "recreate" (leisure)

Terminology:
- Use consistent terminology throughout
- Define technical terms on first use
- Avoid synonyms for key concepts (pick one term and stick with it)

═══════════════════════════════════════════════════════════════════════════════
REQUIRED STRUCTURE
═══════════════════════════════════════════════════════════════════════════════

Your summary must follow this template:

# ${title}

> [Single sentence capturing the essence of the entire topic - what it is and why it matters]

## Quick Takeaways

• [Most critical insight - the single most important thing to understand]

• [Second key point - a major concept or principle]

• [Third key point - another essential idea]

• [Optional fourth point if genuinely critical]


## Core Concepts

[2-3 paragraphs providing a clear explanation of the fundamental ideas. Focus on building understanding of the topic's foundation. Each paragraph should cover a distinct aspect or concept. Use clear topic sentences and logical flow.]

[If the material covers multiple major concepts, break this into subsections:]

### [Concept Area 1]

[Explanation of this concept area]

### [Concept Area 2]

[Explanation of this concept area]


## Key Terminology

• **Term 1**: Clear, concise definition that captures the essential meaning.

• **Term 2**: Clear, concise definition that captures the essential meaning.

• **Term 3**: Clear, concise definition that captures the essential meaning.

[Include 3-6 most important terms]


## Critical Insights

> [The most important practical takeaway, principle, or application. This should be the "golden nugget" someone would highlight if they could only remember one thing.]

[Optional: 1-2 paragraphs elaborating on how these concepts apply or interconnect, if this adds significant value]


## Summary

[2-4 sentences providing closure. Synthesize how the key concepts relate to each other or to broader applications. Avoid introducing new information. This should feel like a natural conclusion.]

═══════════════════════════════════════════════════════════════════════════════
SECTION-SPECIFIC GUIDANCE
═══════════════════════════════════════════════════════════════════════════════

Quick Takeaways:
- Should be immediately understandable without reading further
- Each point should be genuinely distinct (no overlap)
- Focus on outcomes, not process ("X enables Y" not "This section covers X")
- 3-4 bullets maximum

Core Concepts:
- Should constitute 40-50% of total word count
- Explain ideas in your own synthesized form
- Include relevant examples only if they genuinely clarify
- Break into subsections if covering 3+ major distinct concepts

Key Terminology:
- Include only terms essential to understanding the topic
- Definitions should be precise but accessible
- Order by importance or logical progression
- 3-6 terms typical (adjust based on topic complexity)

Critical Insights:
- Should highlight the "so what" factor
- Can be a principle, pattern, application, or implication
- Must be directly supported by the content
- Should be memorable and actionable

Summary:
- Should feel conclusive, not repetitive
- Can mention connections to broader context if relevant
- Keep brief (2-4 sentences)
- End on a note that emphasizes practical value or significance

═══════════════════════════════════════════════════════════════════════════════
QUALITY ASSURANCE CHECKLIST
═══════════════════════════════════════════════════════════════════════════════

Content Quality:
✓ Every fact is traceable to source material
✓ No hallucinated information or external knowledge
✓ All interactive/pedagogical elements removed
✓ 3-5 most important concepts clearly identified and explained
✓ Terminology is consistent throughout
✓ Information is synthesized, not just extracted

Formatting Quality:
✓ All sections follow the required structure
✓ Markdown syntax is correct and consistent
✓ Adequate spacing between all elements
✓ No emojis or decorative symbols
✓ No unnecessary hyphens (check prefix words)
✓ Bold used strategically, not excessively
✓ Code formatting used appropriately for technical content

Professional Standards:
✓ Tone is academic and professional throughout
✓ Language is clear and precise
✓ No "AI-sounding" filler phrases
✓ No colloquialisms or casual language
✓ Sentences are well-structured and varied

Length & Scannability:
✓ Total word count: 400-800 words (maximum 1000)
✓ Headers make structure immediately clear
✓ Key information is easily locatable
✓ Document can be scanned in under 2 minutes

Standalone Value:
✓ Can be understood without accessing original material
✓ Provides genuine review and reference value
✓ Contains the essential knowledge needed to understand the topic
✓ Strikes appropriate balance between brevity and completeness

═══════════════════════════════════════════════════════════════════════════════
OUTPUT INSTRUCTIONS
═══════════════════════════════════════════════════════════════════════════════

Return the summary as plain Markdown text. Begin directly with the content - no preamble, no code fences, no meta-commentary.

The output should be a polished document that someone could:
- Use as a study guide for exam preparation
- Reference quickly to refresh their memory
- Share with colleagues as a professional resource
- Print and annotate for personal review

Start immediately with the markdown-formatted summary.`;
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
