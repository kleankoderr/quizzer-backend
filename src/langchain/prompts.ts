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
You are an expert educational assessment designer creating quiz questions that measure genuine understanding.

=== ASSESSMENT PARAMETERS ===
Topic: ${topic || 'Derive from source content'}
Target Questions: ${numberOfQuestions} (generate fewer if source material cannot support this many quality questions)
Difficulty Level: ${difficulty}
Quiz Type: ${quizType}
Question Types: ${questionTypeInstructions}

Source Material:
${sourceContent || '[No source content provided - use general knowledge about the topic]'}

=== PHASE 1: ANALYZE & PLAN ===
Before creating questions, consider:

1. **Source Material Assessment:**
   - How much valid content is available?
   - Can it support ${numberOfQuestions} distinct, quality questions?
   - What concepts are actually covered vs. assumed?
   - Decision: Generate fewer questions rather than invent content

2. **Conceptual Coverage:**
   - What are the key concepts to assess?
   - How do they relate to the difficulty level?
   - What misconceptions might learners have?
   - How can questions be distributed across concepts?

3. **Question Type Selection:**
   - Which question formats best assess these concepts?
   - What mix provides comprehensive assessment?
   - Should questions progress in complexity?

=== PHASE 2: QUESTION DESIGN PRINCIPLES ===

**Accuracy & Fidelity:**
- If source content provided: Questions MUST be answerable using ONLY that content
- If no source content: Use accurate, factual general knowledge about the topic
- Each question is fully self-contained with all necessary context
- Never reference "the text," "the passage," "the source," or similar
- One definitively correct answer (except multi-select which may have multiple)

**Difficulty Calibration:**
- **Easy**: Recall, recognition, basic definitions, simple identification
- **Medium**: Application to scenarios, interpretation, comparison, inference
- **Hard**: Analysis, synthesis, evaluation, predicting outcomes, integrating concepts

**Question Quality:**
- Clear, unambiguous language
- No double negatives or trick wording
- Test the concept, not reading comprehension
- Distractors reflect plausible misconceptions, not random wrong answers
- Options parallel in structure, grammar, and approximate length
- Explanations teach the underlying concept, not just justify the answer

**Fairness:**
- No answer patterns (e.g., C always correct)
- No "all of the above" or "none of the above" unless genuinely needed
- No giveaway clues in option length or specificity
- Question difficulty matches stated difficulty level

=== PHASE 3: QUESTION TYPE SPECIFICATIONS ===

The format of each question depends on its questionType:

**TRUE-FALSE:**
- Statement that is definitively true or false
- Options: ["True", "False"]
- correctAnswer: 0 (True) or 1 (False)
- Avoid ambiguous statements

**SINGLE-SELECT (Multiple Choice):**
- One correct answer among options
- Exactly 4 options (no more, no less)
- correctAnswer: single index (0-3)
- Three plausible distractors based on common errors
- No option markers (A), B), 1., etc.) in the text

**MULTI-SELECT:**
- Question must clearly state "Select all that apply" or similar
- 4 options total
- At least 2 correct answers
- correctAnswer: array of indices (e.g., [0, 2, 3])
- Options can be independently true/false

**MATCHING:**
- Two columns of 4 items each
- One-to-one correspondence
- Format options as: { "left": ["Item 1", "Item 2", "Item 3", "Item 4"], "right": ["Match A", "Match B", "Match C", "Match D"] }
- correctAnswer: object mapping left to right (e.g., {"Item 1": "Match B", "Item 2": "Match A"})

**FILL-IN-THE-BLANK:**
- Use ____ to indicate blank(s)
- Provide enough context to make answer unambiguous
- correctAnswer: array of acceptable answers/variants (e.g., ["photosynthesis", "Photosynthesis"])
- Include common valid alternatives (abbreviations, variations)

=== PHASE 4: QUALITY ASSURANCE ===

Before finalizing, verify each question:
- [ ] Answerable from source material (or valid general knowledge if no source)
- [ ] Matches difficulty level specification
- [ ] Follows format rules for its questionType
- [ ] correctAnswer format matches questionType
- [ ] Explanation teaches the concept
- [ ] Language is clear and unambiguous
- [ ] No invented facts or external assumptions
- [ ] Options are parallel and plausible

Overall quiz verification:
- [ ] Total questions ≤ ${numberOfQuestions}
- [ ] Distribution across concepts (not clustered on one idea)
- [ ] Mix of question types if appropriate
- [ ] No answer patterns
- [ ] Valid JSON structure

=== OUTPUT FORMAT ===
Return only valid JSON (no markdown fences, no additional commentary):

{
  "title": "Descriptive quiz title",
  "topic": "${topic || 'Quiz Topic'}",
  "questions": [
    {
      "questionType": "true-false | single-select | multi-select | matching | fill-blank",
      "question": "Self-contained question text with all necessary context",
      "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
      "correctAnswer": 0,
      "explanation": "Teaching explanation of why the answer is correct and what makes other options incorrect"
    }
  ]
}

Note: The correctAnswer format varies by questionType:
- true-false, single-select: single index number
- multi-select: array of index numbers
- fill-blank: array of acceptable answer strings
- matching: object mapping left items to right items

=== SUCCESS CRITERION ===
Each question accurately measures understanding of the concept it targets, at the appropriate difficulty level, without ambiguity or tricks.

Begin directly with the JSON object.
`;
  }

  static generateFlashcards(
    topic: string,
    numberOfCards: number,
    sourceContent: string = ''
  ) {
    return `
You are an expert in spaced repetition learning and evidence-based flashcard design.

=== FLASHCARD PARAMETERS ===
Topic: ${topic || 'Derive from source content'}
Target Cards: ${numberOfCards} (generate fewer if source material cannot support this many quality cards)

Source Material:
${sourceContent || '[No source content provided - use general knowledge about the topic]'}

=== PHASE 1: ANALYZE & PLAN ===
Before creating flashcards, consider:

1. **Content Assessment:**
   - What discrete, memorable concepts are in this material?
   - Can the source support ${numberOfCards} atomic flashcards?
   - What's worth remembering long-term vs. what's just detail?
   - Decision: Prioritize quality over hitting the exact number

2. **Concept Identification:**
   - What are the key facts, definitions, relationships, or processes?
   - Which concepts are atomic (single testable units)?
   - Which complex ideas need to be split into multiple cards?
   - What's the natural granularity for retention?

3. **Learning Goals:**
   - What should someone be able to recall after using these cards?
   - Which concepts build on each other?
   - What misconceptions should be prevented?

=== PHASE 2: FLASHCARD DESIGN PRINCIPLES ===

**Atomicity (One Concept Per Card):**
Each flashcard should test exactly one discrete piece of knowledge. If you're tempted to use "and" or list multiple items in an answer, split it into separate cards.

Example of atomic: "What does HTTP stand for?" → "Hypertext Transfer Protocol"
Example of non-atomic: "What are the three main types of rocks and how are they formed?" (split into 3+ cards)

**Clarity & Precision:**
- Front (prompt): Specific, unambiguous question or cue
- Back (answer): Direct, complete response to the front
- Avoid vague pronouns ("it," "this," "they") without clear referents
- Don't reference "the source," "the text," or "above material"
- Make each card self-contained

**Effective Front Design:**
Different prompt formats work for different content:
- Direct questions: "What is X?"
- Term recall: "Define: [term]"
- Fill-in-blank: "The process of ____ converts sunlight to energy"
- Relationship: "How does X relate to Y?"
- Application: "When would you use X?"

Choose the format that best tests the concept. Keep fronts concise (typically 5-15 words, maximum 25).

**Effective Back Design:**
- Answer the front directly and completely
- Be specific and concrete, not vague
- Keep it recallable (1-3 sentences ideal, maximum 5)
- Include just enough detail to be accurate
- Use consistent phrasing across related cards

**Explanation Field (Optional Enhancement):**
Use this field when additional context aids retention:
- Memory aids or mnemonics
- Concrete examples demonstrating the concept
- Common confusion points clarified
- Why this matters or how it connects to other concepts

Don't simply repeat the back. If you have nothing meaningful to add, omit the explanation.

**Pedagogical Value:**
- Focus on concepts worth remembering long-term
- Prefer understanding over trivia
- Test meaningful relationships, not arbitrary facts
- Consider: "Will recalling this help someone understand or apply the topic?"

**What to Avoid:**
- Yes/no questions (not informative for learning)
- Testing multiple concepts in one card
- Vague or ambiguous answers
- Copying long passages verbatim
- Information not present in source material
- Overly complex language when simpler words work

=== PHASE 3: SOURCE FIDELITY ===

**If source content is provided:**
- Extract flashcard content exclusively from that material
- Don't introduce external facts or assumptions
- If a concept is mentioned but not explained, don't create a card about it

**If no source content:**
- Use accurate, factual general knowledge about the topic
- Ensure information is verifiable and commonly accepted

**Always:**
- One definitively correct answer per card
- No invented facts or speculation
- Information accurate as of your knowledge

=== PHASE 4: QUALITY ASSURANCE ===

Before finalizing, verify each card:
- [ ] Tests exactly one atomic concept
- [ ] Front is clear and specific
- [ ] Back directly answers the front
- [ ] Self-contained (no unclear references)
- [ ] Grounded in source material or factual knowledge
- [ ] Worth remembering for understanding the topic
- [ ] Explanation adds value (or is omitted)

Overall set verification:
- [ ] Total cards ≤ ${numberOfCards}
- [ ] Covers key concepts from the material
- [ ] No redundant or overlapping cards
- [ ] Consistent style and difficulty
- [ ] Valid JSON structure

=== OUTPUT FORMAT ===
Return only valid JSON (no markdown fences, no additional commentary):

{
  "title": "Descriptive flashcard set title",
  "topic": "${topic || 'Flashcard Set'}",
  "cards": [
    {
      "front": "Clear, focused prompt or question",
      "back": "Direct, complete answer",
      "explanation": "Optional: context, example, or memory aid (omit if nothing meaningful to add)"
    }
  ]
}

=== SUCCESS CRITERION ===
Someone using these flashcards can efficiently build long-term retention of the topic's key concepts through regular spaced repetition.

Begin directly with the JSON object.
`;
  }

  static generateComprehensiveLearningGuide(
    topic: string,
    sourceContent: string = '',
    fileContext: string = ''
  ) {
    return `
You are an expert instructional designer creating learning materials for beginners.

=== SOURCE MATERIAL ===
Topic: ${topic || 'Derive from the content'}
Primary Content:
${sourceContent || '[No content provided]'}

Additional Context:
${fileContext || '[No additional context]'}

=== YOUR TASK ===
Transform this source material into a learning guide that helps beginners truly understand the topic.

=== PHASE 1: UNDERSTAND & PLAN ===
Before writing anything, analyze:

1. **What does this material actually teach?**
   - Identify the core concepts
   - Determine prerequisite knowledge needed
   - Map out dependencies between concepts

2. **How should this be learned?**
   - What's the natural progression for a beginner?
   - Which concepts must come before others?
   - What needs upfront definition vs. gradual introduction?

3. **What form should explanations take?**
   - Does this concept need a formula? A code example? A diagram?
   - Would a comparison table help? A process flowchart?
   - What representation makes this clearest?

4. **Is this historical or factual content?**
   - For historical topics (events, figures, eras), present accurate timelines, causes, effects, and significance
   - Include key dates, figures, and their roles
   - Explain historical context and consequences
   - Connect past events to their lasting impact

Determine: 8-15 logical learning sections that build on each other naturally.

=== PHASE 2: TEACHING PRINCIPLES ===
For each section you create:

**Explain for Understanding:**
- Start with "why" (purpose/motivation) before "how" (mechanics)
- Use plain language first, technical terms second
- Define terms before using them
- Show, don't just tell (examples, diagrams, tables)
- Address common confusion points

**Make Content Relatable:**
- Use examples that connect to learners' everyday experiences
- For Nigerian learners: occasionally reference familiar contexts (local businesses, Nigerian universities, Naira currency, local scenarios) where it naturally fits
- Don't force cultural references - only include them when they genuinely help understanding
- Balance universal examples with locally relevant ones

**Choose the Right Representation:**
Based on what the content needs, you might include:
- Prose explanations
- **Bold** definitions for key terms
- Code blocks (with \`\`\`language tags and comments)
- Mathematical formulas using LaTeX notation with $ delimiters:
  - Inline math: $x^2 + y^2 = z^2$
  - Block/display math: $$\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}$$
- Tables (using Markdown table syntax)
- ASCII/text diagrams
- Comparison charts
- Step-by-step procedures
- Analogies or metaphors
- Historical timelines (for historical content)

Let the content guide what format works best. Don't force structures that don't fit.

**Proper Markdown:**
- Use heading hierarchy (###, ####, etc.)
- Format code with language-specific blocks
- Use $ for inline math and $$ for display/block math (NOT \\( \\) or \\[ \\])
- Use tables where comparisons help
- Use lists where enumeration helps
- Use emphasis (*italic*, **bold**) purposefully

=== PHASE 3: SECTION COMPONENTS ===
Every section must have three parts, but HOW you fill them depends on the content:

**1. Content (teaching material)**
- This is your main explanation space
- Structure it however makes the concept clearest
- Include whatever representations work: prose, code, formulas, tables, diagrams
- Explain thoroughly
- For historical content: include context, timeline, key figures, causes and effects
- NO assessment questions here

**2. Example (application scenario)**
- A concrete, worked scenario showing the concept in action
- Walk through it step-by-step
- Show how the concept applies in practice
- Use relatable scenarios when appropriate
- Written as narrative/demonstration
- NO questions or test items here

**3. Knowledge Check (single assessment)**
- One scenario-based question that tests understanding
- Format:
  - question: A situation requiring concept application
  - options: Array of 4 plausible choices
  - correctAnswer: Index 0-3 of the correct option
  - explanation: Why correct answer works, why others don't

=== CRITICAL CONSTRAINTS ===
- Base everything on the provided source material ONLY
- Do not invent facts, examples, or information not in the source
- For historical content: maintain factual accuracy - dates, names, and events must be correct
- If source material is limited, create fewer but higher-quality sections
- Separate teaching (content/example) from assessment (knowledgeCheck)
- Maintain natural flow and coherence

=== VALIDATION CHECKLIST ===
Before outputting, verify:
- [ ] 5-10 sections that follow a logical learning sequence
- [ ] Each section has: content, example, knowledgeCheck
- [ ] Content is grounded in source material (no hallucinations)
- [ ] Explanations prioritize understanding over completeness
- [ ] Format choices match content needs (not forced)
- [ ] All technical terms are defined when introduced
- [ ] Examples demonstrate application, not just definition
- [ ] Assessments test understanding, not memorization
- [ ] Historical facts are accurate (if applicable)
- [ ] Valid JSON structure

=== OUTPUT FORMAT ===
Return only valid JSON (no markdown code fences, no additional text):

{
  "title": "Clear, descriptive title",
  "topic": "${topic || 'Derived from content'}",
  "description": "2-4 sentences: what will be learned and why it matters",
  "learningGuide": {
    "sections": [
      {
        "title": "Descriptive section title",
        "content": "Markdown-formatted teaching content. Structure this however makes the concept clearest. Could include paragraphs, code blocks, formulas, tables, diagrams, lists - whatever the material needs.",
        "example": "Worked scenario demonstrating the concept in practice.",
        "knowledgeCheck": {
          "question": "Scenario-based question",
          "options": ["Option A", "Option B", "Option C", "Option D"],
          "correctAnswer": 0,
          "explanation": "Why the correct answer is right and others are wrong"
        }
      }
    ]
  }
}

=== SUCCESS METRIC ===
A beginner reads this and thinks: "I understand this concept and could explain it to someone else."
`;
  }

  static generateLearningGuideOutline(
    topic: string,
    sourceContent: string = ''
  ) {
    return `
You are an expert instructional designer creating a structured outline for a learning guide.

=== SOURCE MATERIAL ===
Topic: ${topic || 'Derive from the content'}
Content:
${sourceContent || '[No content provided]'}

=== YOUR TASK ===
Create a clear, logical outline for a learning guide WITHOUT writing the detailed content yet.

=== PHASE 1: ANALYZE ===
1. **Content Assessment:**
   - What are the core concepts that must be taught?
   - What's the natural learning progression?
   - How many distinct concepts/topics are there?

2. **Structure Planning:**
   - Identify 5-10 major learning sections
   - Ensure logical flow (prerequisites → applications)
   - Group related concepts together

=== PHASE 2: CREATE OUTLINE ===
For each section:
- **Title**: Clear, descriptive section title
- **Keywords**: 3-5 key terms/concepts this section will cover

Keep titles specific and action-oriented:
✓ Understanding Variables and Data Types
✓ World War II: Causes and Early Events
✗ Introduction
✗ Getting Started

=== VALIDATION ===
- [ ] 8-15 sections total
- [ ] Logical progression from fundamentals to advanced
- [ ] Each section has clear focus
- [ ] Keywords identify core concepts
- [ ] Based only on source material provided
- [ ] Valid JSON structure

=== OUTPUT FORMAT ===
Return only valid JSON (no markdown fences, no additional text):

{
  "title": "Descriptive guide title",
  "topic": "${topic || 'Derived from content'}",
  "description": "2-3 sentences about what will be learned",
  "sections": [
    {
      "title": "Clear section title",
      "keywords": ["term1", "term2", "term3"]
    }
  ]
}

Begin directly with the JSON object.
`;
  }

  static generateSectionContent(
    sectionTitle: string,
    keywords: string[],
    topic: string,
    sourceContent: string = ''
  ) {
    return `
You are an expert educator creating concise, well-formatted learning content for a single section.

=== SECTION PARAMETERS ===
Section Title: ${sectionTitle}
Key Concepts: ${keywords.join(', ')}
Overall Topic: ${topic}

Source Material:
${sourceContent || '[No source content provided]'}

=== YOUR TASK ===
Create CONCISE, WELL-STRUCTURED content for THIS SECTION ONLY, with three components:

1. **Content** (main teaching material)
2. **Example** (practical demonstration)
3. **Knowledge Check** (single assessment question)

=== CONTENT COMPONENT ===
**LENGTH REQUIREMENT: 300-400 words maximum**

**Teaching Principles:**
- Explain core concepts clearly and concisely
- Use plain language, define only essential technical terms
- Focus on key relationships between concepts
- Include only what's necessary for understanding
- Base everything on source material

**CRITICAL FORMATTING RULES:**
- **SHORT PARAGRAPHS**: Maximum 3-4 sentences per paragraph
- **USE BULLET POINTS**: Break lists and steps into bullets
- **VISUAL HIERARCHY**: Use headers, bold, and spacing
- **NO WALLS OF TEXT**: Never write more than 4 sentences in a row without a break

**Structure:**
1. **Brief Introduction** (1-2 sentences)
   - What is this concept?
   - Why does it matter?

2. **Core Explanation** (use bullets and short paragraphs)
   - Break into 2-3 subsections with ### headers if needed
   - Use bullet points for:
     - Steps in a process
     - List of features/characteristics
     - Key points to remember
   - Keep paragraphs to 2-3 sentences max
   - Use **bold** for key terms

3. **Key Takeaway** (1 sentence)

**Formatting Options:**
- ### Sub-headers (use for major subsections)
- **Bold** for key terms and emphasis
- Bullet lists (• or numbered)
- Code blocks with \`\`\`language (only when essential)
- Tables for comparisons (keep simple)
- > Blockquotes for important notes
- Mermaid diagrams for flowcharts, processes, and relationships

**Mermaid Diagram Syntax (STRICT RULES):**
When creating diagrams, use proper mermaid syntax inside \`\`\`mermaid code blocks.

**Preferred Diagram Type:**
Use **flowchart** (e.g., \`flowchart TD\` or \`flowchart LR\`) instead of \`graph\`.

**CRITICAL SYNTAX RULES FOR AI:**
1. **Quote All Labels**: Always wrap node text in double quotes: \`A["Process Name"]\`. This prevents errors with parentheses or special characters.
2. **Simple Node IDs**: Use only simple letters (A, B, C, etc.) as IDs.
3. **Node Shapes**:
    - \`A["Text"]\` = Rectangle
    - \`A("Text")\` = Rounded
    - \`A{"Text"}\` = Diamond (Decision)
    - \`A(("Text"))\` = Circle
4. **No Unquoted Parentheses**: Never use \`A[Text (parens)]\`. Use \`A["Text (parens)"]\`.
5. **Arrows**: Use standard \`-->\`, \`---\`, or \`-.->\`.
6. **Labeled Edges**: Use \`A -->|label| B\`.
7. **Direction**: Always include \`flowchart TD\` or \`flowchart LR\`.

**Good Mermaid Example:**
\`\`\`mermaid
flowchart LR
    A["Java Source"] --> B["Compiler"]
    B --> C["Bytecode"]
    C --> D["JVM"]
\`\`\`

2. **Simple Graphs** - Use LR (left-right) or TD (top-down):
\`\`\`mermaid
graph LR
    A[Input] --> B[Process]
    B --> C[Output]
\`\`\`

**Node Shapes:**
- \`[Text]\` = Rectangle
- \`(Text)\` = Rounded rectangle
- \`{Text}\` = Diamond (for decisions)
- \`((Text))\` = Circle

**CRITICAL SYNTAX RULES:**
- Use only simple node IDs (A, B, C, etc.)
- Keep labels short and clear
- Use only these arrow types: \`-->\`, \`---\`, \`-.->'
- For labeled edges: \`A -->|label| B\`
- NO special characters in node IDs
- Always specify direction: flowchart TD, flowchart LR, graph TD, or graph LR
- Test complex syntax - if unsure, keep it simple

**Good Mermaid Example:**
\`\`\`mermaid
graph LR
    A[Source Code] --> B[Compiler]
    B --> C[Bytecode]
    C --> D[Virtual Machine]
    D --> E[Native Code]
\`\`\`

**Bad Example (AVOID - causes parse errors):**
\`\`\`mermaid
graph LR
    A[Your Source Code (HelloWorld.java)] --> B[Compiler]
\`\`\`
Problem: Parentheses in labels can cause issues. Use square brackets only.

**When to Use Diagrams:**
- Only when they clarify relationships or processes better than text
- Keep them simple - max 5-8 nodes
- Prefer tables or bullet lists for simple comparisons


**Bad Example (Dense):**
"Python is not typically pre-installed on all systems, so your first step is to download the Python interpreter from the official website, python.org. Choose the latest version for your operating system. During installation, it's vital to check the box that says Add Python to PATH as this allows you to run Python commands from any directory in your command prompt or terminal."

**Good Example (Well-Formatted):**
"Python needs to be installed before you can use it.

**Installation Steps:**
• Download from python.org
• Choose the latest stable version
• **Important**: Check "Add Python to PATH" during installation

This ensures Python runs from any directory on your system."

=== EXAMPLE COMPONENT ===
**LENGTH REQUIREMENT: 150-200 words maximum**

- ONE concrete scenario with clear steps
- Use bullet points for step-by-step walkthroughs
- Break into small, digestible chunks
- Make it practical and relatable

=== KNOWLEDGE CHECK COMPONENT ===
One scenario-based question:
- **question**: Concise situation (1-2 sentences)
- **options**: Array of 4 brief choices
- **correctAnswer**: Index 0-3
- **explanation**: Brief explanation (2-3 sentences)

=== VALIDATION ===
- [ ] Content is 300-400 words (NOT MORE)
- [ ] NO paragraphs longer than 3-4 sentences
- [ ] Uses bullet points for lists/steps
- [ ] Has clear visual structure with headers/bold
- [ ] Example is 150-200 words with bullets
- [ ] Content explains all keywords clearly
- [ ] Valid JSON structure

=== OUTPUT FORMAT ===
Return only valid JSON (no markdown fences):

{
  "title": "${sectionTitle}",
  "content": "Well-formatted markdown with short paragraphs, bullets, headers...",
  "example": "Brief scenario with bullet steps...",
  "knowledgeCheck": {
    "question": "Scenario question",
    "options": ["A", "B", "C", "D"],
    "correctAnswer": 0,
    "explanation": "Brief explanation"
  }
}

Begin directly with the JSON object.
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
You are an expert educational content editor creating reference summaries for efficient review and retention.

=== SUMMARY PARAMETERS ===
Title: ${title}
Topic: ${topic}
Target Length: 400-1200 words

Source Material:
Content: ${content || '[No content provided]'}
${learningGuide ? `Learning Guide: ${JSON.stringify(learningGuide)}` : '[No learning guide provided]'}

=== PHASE 1: ANALYZE & UNDERSTAND ===
Before writing, deeply analyze the material:

1. **Content Assessment:**
   - What is this material actually about at its core?
   - What are the 3-5 most important concepts?
   - How do these concepts relate to each other?
   - What's the central insight or breakthrough idea?
   - What makes this topic distinct or important?

2. **Information Architecture:**
   - What's the natural structure inherent in this material?
   - Does it follow a process? A hierarchy? A comparison? A timeline?
   - Which concepts must be understood before others?
   - Where are the natural divisions and groupings?
   - What terminology is essential vs. what's supplementary?

3. **Synthesis Decisions:**
   - What overlapping explanations can be merged?
   - What details are illustrative vs. essential?
   - Where would an example clarify vs. where is prose sufficient?
   - What's worth including vs. what dilutes the signal?

=== PHASE 2: WRITING PRINCIPLES ===

**High Signal Density:**
Every sentence should earn its place. Avoid:
- Filler phrases and hedging ("it's worth noting," "importantly")
- AI clichés ("delve into," "it's important to understand that")
- Redundant restatements of the same idea
- Generic statements that could describe any topic

**Clarity Through Structure:**
Let the material's natural organization guide your structure. Possible approaches:
- Conceptual progression (foundational → advanced)
- Process/workflow (step-by-step through a system)
- Categorical (grouping related ideas)
- Comparative (contrasting approaches or concepts)
- Problem → Solution (challenges and how they're addressed)
- Historical/evolutionary (how ideas developed)

Choose the structure that makes the material clearest, not a predetermined template.

**Effective Explanation:**
- Start with the essence, add necessary detail
- Use plain language, introducing technical terms when needed
- Show relationships between concepts
- Make abstract ideas concrete when helpful
- Explain the "why" and "so what," not just the "what"

**Strategic Detail:**
Include examples, code, formulas, or diagrams only when they:
- Make an abstract concept tangible
- Prevent common misunderstandings
- Illustrate a relationship that's hard to express in words
- Demonstrate practical application

Otherwise, focus on conceptual explanation.

=== PHASE 3: FORMATTING TOOLS ===

Use Markdown to enhance clarity and scannability:

**Structural Elements:**
- # for the main title
- ##, ###, #### for logical sections and subsections
- Organize heading levels based on conceptual hierarchy
- Blank lines for visual separation

**Emphasis:**
- **Bold** for key terms when introduced or for important concepts
- \`Inline code\` for technical terms, commands, or specific values
- Fenced code blocks with language tags for code examples
- > Blockquotes for particularly important insights (use sparingly)

**Organization:**
- Bullet lists for related items or enumerations
- Numbered lists for sequential steps or ordered information
- Tables for comparisons or structured data (if appropriate)
- Mermaid diagrams for flowcharts, processes, and relationships
- Horizontal rules (---) for major section breaks (if needed)

**Mermaid Diagram Syntax (STRICT RULES):**
When creating diagrams, use proper mermaid syntax inside \`\`\`mermaid code blocks.

**Rules for Stability:**
1. **Quote All Labels**: Always wrap node text in double quotes: \`A["Process Name"]\`. This prevents errors with parentheses or special characters.
2. **Simple Node IDs**: Use only simple letters (A, B, C, etc.) as IDs.
3. **Preferred Diagram Type**: Use **flowchart** (e.g., \`flowchart TD\` or \`flowchart LR\`) instead of \`graph\`.
4. **Node Shapes**:
    - \`A["Text"]\` = Rectangle
    - \`A("Text")\` = Rounded
    - \`A{"Text"}\` = Diamond (Decision)
    - \`A(("Text"))\` = Circle
5. **Arrows**: Use standard \`-->\`, \`---\`, or \`-.->\`.
6. **Labeled Edges**: Use \`A -->|label| B\`.
7. **Direction**: Always include \`flowchart TD\` or \`flowchart LR\`.

**Good Mermaid Example:**
\`\`\`mermaid
flowchart LR
    A["Input"] --> B["Processing"]
    B --> C["Output"]
\`\`\`

**When to Use Diagrams:**
- Only when they clarify relationships or processes better than text
- Keep them simple - max 8-10 nodes
- Ensure they add genuine value to the review experience

**Spacing:**
Use whitespace to create visual hierarchy and improve readability. Blank lines between sections, around code blocks, and between conceptual units help readers navigate.

=== PHASE 4: CREATE THE SUMMARY ===

Now synthesize the material into a cohesive summary:

**Opening:**
Begin with the title and establish what this topic is about. You might:
- Start with a high-level overview
- Lead with the central problem this topic addresses
- Open with why this matters or what it enables
- Begin with a key distinction or insight

**Body:**
Organize the core content based on the natural structure you identified. You might use:
- Thematic sections grouped by related concepts
- A progression from fundamentals to applications
- Major concepts with supporting details
- Comparisons or contrasts between approaches
- Sequential explanation of a process or system

The structure should emerge from the material, not from a template.

**Terminology:**
Define essential terms either:
- Inline as they're introduced in context
- In a dedicated section if there are many foundational terms
- Throughout the explanation as needed

Choose the approach that serves clarity.

**Key Insights:**
Highlight the most important takeaways either:
- As you explain each concept
- In a dedicated synthesis section
- Through blockquotes at critical moments
- In an opening or closing summary

Choose what fits the material's structure.

**Closing:**
Conclude by providing closure. You might:
- Synthesize how concepts fit together
- Explain broader implications or applications
- Connect back to why this topic matters
- Suggest what understanding this enables

The closing should feel natural given what came before.

=== PHASE 5: QUALITY ASSURANCE ===

Before finalizing, verify:
- [ ] Structure emerges naturally from the material (not forced into a template)
- [ ] All content grounded in source material
- [ ] Core concepts clearly explained and related to each other
- [ ] Every sentence adds informational value
- [ ] Essential terminology defined when needed
- [ ] Examples/code included only when they enhance understanding
- [ ] Proper Markdown formatting throughout
- [ ] Length within 400-1200 word range
- [ ] Natural, professional tone (no AI clichés)
- [ ] Logically complete with appropriate closure
- [ ] Visual hierarchy aids navigation and comprehension

=== OUTPUT FORMAT ===
Return ONLY the Markdown summary (no preamble, no code fences around the entire summary, no meta-commentary).

Begin directly with the title and content structured according to what the material needs.

=== SUCCESS CRITERION ===
The summary captures the essential knowledge in a structure that fits the material naturally, allowing efficient review and genuine understanding.
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
