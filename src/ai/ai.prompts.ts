export class AiPrompts {
  static generateQuiz(
    topic: string,
    numberOfQuestions: number,
    difficulty: string,
    quizType: string,
    questionTypeInstructions: string,
    sourceContent: string = ''
  ) {
    return `
You are an expert quiz generator. Generate ${numberOfQuestions} questions based on the following:

${topic ? `Topic: ${topic}` : ''}
${sourceContent ? `Content:\n${sourceContent}` : ''}

Difficulty Level: ${difficulty}
Quiz Type: ${quizType}

Question Types to Generate:
${questionTypeInstructions}

Requirements:
1. Distribute questions evenly across the specified question types
2. For each question, include the "questionType" field
3. Questions should be clear and unambiguous
4. Provide brief explanations for correct answers
5. Make questions appropriate for the quiz type and difficulty level
6. If content is provided, include a "citation" field indicating the source text or section for the answer
7. **Contextualize**: You may occasionally use examples and scenarios relevant to Nigeria to make it relatable, but ensure the content remains broadly applicable and balanced.

Return ONLY a valid JSON object in this exact format (no markdown, no code blocks):
{
  "title": "Generated quiz title",
  "topic": "Main topic covered",
  "questions": [
    // For true-false questions:
    {
      "questionType": "true-false",
      "question": "Statement here?",
      "options": ["True", "False"],
      "correctAnswer": 0,
      "explanation": "Brief explanation",
      "citation": "Source text reference (optional)"
    },
    // For single-select questions:
    {
      "questionType": "single-select",
      "question": "Question text?",
      "options": ["Option A", "Option B", "Option C", "Option D"], // Instruction for AI: List only the option text. Do NOT include labels like A), B), C), or D). Just provide the text of each option.
      "correctAnswer": 0,
      "explanation": "Brief explanation",
      "citation": "Source text reference (optional)"
    },
    // For multi-select questions:
    {
      "questionType": "multi-select",
      "question": "Select all that apply:",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": [0, 2],
      "explanation": "Brief explanation",
      "citation": "Source text reference (optional)"
    },
    // For matching questions:
    {
      "questionType": "matching",
      "question": "Match the following:",
      "leftColumn": ["Item 1", "Item 2", "Item 3"],
      "rightColumn": ["Match A", "Match B", "Match C"],
      "correctAnswer": {"Item 1": "Match A", "Item 2": "Match B", "Item 3": "Match C"},
      "explanation": "Brief explanation",
      "citation": "Source text reference (optional)"
    },
    // For fill-in-the-blank questions:
    {
      "questionType": "fill-blank",
      "question": "Complete the sentence: The capital of France is ____.",
      "correctAnswer": "Paris",
      "explanation": "Brief explanation",
      "citation": "Source text reference (optional)"
    }
  ]
}
`;
  }

  static generateFlashcards(
    topic: string,
    numberOfCards: number,
    sourceContent: string = ''
  ) {
    return `
You are an expert flashcard creator. Generate ${numberOfCards} flashcards based on the following:

${topic ? `Topic: ${topic}` : ''}
${sourceContent ? `Content:\n${sourceContent}` : ''}

Requirements:
1. Front side should be a concise question or term
2. Back side should be a clear, complete answer or definition
3. Add an optional explanation with additional context, examples, or mnemonics to help remember
4. Focus on key concepts, definitions, and important facts
5. Make cards clear and educational
6. Avoid overly complex or ambiguous cards
7. **Cultural Relevance**: You may use examples relevant to Nigerian students where it enhances understanding, but ensure the cards remain universally clear.

Return ONLY a valid JSON object in this exact format (no markdown, no code blocks):
{
  "title": "Specific, descriptive title that reflects the content (NOT generic like 'General Knowledge')",
  "topic": "Main topic covered",
  "cards": [
    {
      "front": "Question or term",
      "back": "Answer or definition",
      "explanation": "Additional context, examples, or memory aids (optional)"
    }
  ]
}
`;
  }

  static generateRecommendations(weakTopics: string[], recentAttempts: any[]) {
    return `
Analyze the following user learning data and generate exactly 1 prioritized, personalized study recommendation:

Weak Topics: ${JSON.stringify(weakTopics)}
Recent Performance: ${JSON.stringify(recentAttempts.slice(0, 10))}

Generate recommendations focusing on:
1. Topics where the user scored poorly
2. Topics not practiced recently
3. Progressive learning paths
4. Encouraging tone suitable for a motivated student.

Return ONLY a valid JSON array in this exact format (no markdown, no code blocks):
[
  {
    "topic": "Topic name",
    "reason": "Why this is recommended",
    "priority": "high|medium|low"
  }
]
`;
  }

  static generateComprehensiveLearningGuide(
    topic: string,
    sourceContent: string = '',
    fileContext: string = ''
  ) {
    return `
You are an expert educational content creator. Create a comprehensive learning guide based on the following inputs:

${topic ? `Topic: ${topic}` : ''}
${sourceContent ? `Content: ${sourceContent}` : ''}
${fileContext ? `File Context: ${fileContext}` : ''}

Requirements:
1. **Unified Source**: Synthesize all provided information (Topic, Content, Files) into one cohesive guide.
2. **Cultural Relevance**: Use diverse examples. You may include examples relevant to the Nigerian context where appropriate, but maintain a balanced approach.
3. **Structure**: Follow the exact JSON schema provided below.
4. **Content Quality**:
    - "description": A short, insightful summary of what the learner will gain.
    - "sections": Break down the topic into logical learning modules.
    - "content": Clear, explanatory text with Markdown support. IMPORTANT: Use triple backticks (\`\`\`language) for code blocks and single backticks (\`) for inline code variables or references.
    - "example": ONE strong, concrete example per section.
    - "assessment": ONE thought-provoking question or small task to check understanding per section.

Return ONLY a valid JSON object in this exact format (no markdown, no code blocks):
{
  "title": "Descriptive title",
  "topic": "Main topic",
  "description": "Short and insightful summary",
  "learningGuide": {
    "sections": [
      {
        "title": "Module/Section Title",
        "content": "Clear explanatory content (markdown allowed)",
        "example": "A strong, relevant example",
        "knowledgeCheck": {
          "question": "Multiple choice question text",
          "options": ["Option A", "Option B", "Option C", "Option D"],
          "answer": "Correct Option Text",
          "explanation": "Why this answer is correct"
        }
      }
    ]
  }
}
`;
  }

  static extractTitle(content: string) {
    return `Based on the following content, generate a concise, descriptive, and professional title (max 10 words). Return ONLY the title, nothing else.

Content:
${content.substring(0, 1500)}`;
  }

  static extractTopic(text: string) {
    return `Based on this text, provide a single concise topic name (max 3 words). Return ONLY the topic name, nothing else.

Text:
${text.substring(0, 1000)}`;
  }

  static generateExplanation(topic: string, context: string) {
    return `
You are an expert, friendly tutor who excels at making complex topics easy to understand. 
Provide a clearer, simpler explanation for the following concept:

Topic: ${topic}
Context: ${context}

Requirements:
1. Go STRAIGHT to the explanation. DO NOT use introductory phrases like "Here is an explanation" or "Let's break this down".
2. Use a conversational and encouraging tone, but keep it professional and direct.
3. Use **Markdown** formatting to structure your response:
   - Use **bold** for key terms.
   - Use lists (bullet points) to break down steps or features.
   - Use > blockquotes for important takeaways or analogies.
4. Break down complex ideas into digestible parts.
5. Use a powerful analogy if it helps clarify the concept. Nigerian context can be used if it simplifies the explanation, but avoid forced connections.
6. **Code Formatting**: If explaining code or technical concepts, ALWAYS use triple backticks (\`\`\`language) for code blocks and single backticks (\`) for inline references (e.g., variable names, functions).

Return the explanation in valid Markdown format.
`;
  }

  static generateExample(topic: string, context: string) {
    return `
You are an expert, practical tutor. Provide concrete, real-world examples for the following concept, with practical relevance:

Topic: ${topic}
Context: ${context}

Requirements:
1. Go STRAIGHT to the examples. DO NOT use introductory phrases like "Here are some examples" or "Let's look at this".
2. Provide 2-3 distinct, detailed examples.
3. Use **Markdown** formatting:
   - Use ### Headers for each example title.
   - Use **bold** for important parts.
   - Use lists to explain the breakdown of the example.
4. Explain *why* each example fits the concept.
5. Relate it to real-world scenarios. You may include examples relevant to Nigeria (e.g., local markets) if they fit naturally, but ensure a mix of contexts.
6. **Code Formatting**: If explaining code or technical concepts, ALWAYS use triple backticks (\`\`\`language) for code blocks and single backticks (\`) for inline references.

Return the examples in valid Markdown format.
`;
  }
}
