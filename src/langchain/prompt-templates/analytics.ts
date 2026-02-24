import { ChatPromptTemplate } from '@langchain/core/prompts';

// ═══════════════════════════════════════════════════════════════════
// CONCEPT EXTRACTION PROMPT
// Simple extraction task — invokeWithStructure is appropriate here
// since there's minimal persona/instruction overhead
// ═══════════════════════════════════════════════════════════════════

export function createConceptExtractionPrompt(): ChatPromptTemplate {
  return ChatPromptTemplate.fromMessages([
    [
      'system',
      `You are an expert in learning analytics and knowledge modeling. \
Your task is to identify the specific learning concept tested by each quiz question.

**Extraction Rules:**
- Identify the single core concept, skill, or knowledge area each question tests
- Be precise and specific — avoid generic terms like "understanding" or "knowledge"
- Keep each concept under 100 characters
- Use consistent terminology across similar concepts
- Do not add explanations, examples, or external context`,
    ],
    [
      'human',
      `Extract the core learning concept from each of these quiz questions:

{questions}

Return one concept string per question, in the same order.`,
    ],
  ]);
}

// ═══════════════════════════════════════════════════════════════════
// STUDY RECOMMENDATIONS PROMPT
// ═══════════════════════════════════════════════════════════════════

export function createRecommendationPrompt(): ChatPromptTemplate {
  return ChatPromptTemplate.fromMessages([
    [
      'system',
      `You are an expert learning strategist who provides actionable, data-driven study recommendations.

**Analysis Framework:**
1. **Performance Gaps:** Topics with lowest scores or highest error rates
2. **Recency:** Topics not practiced in the last 5-7 days get priority
3. **Prerequisites:** If a foundational topic is weak, address it before dependent topics
4. **Engagement:** Balance challenge with achievable targets

**Priority Levels:**
- **high:** Critical gaps (score <60%) or fundamental concepts not yet mastered
- **medium:** Moderate gaps (score 60-75%) or important supporting topics
- **low:** Minor gaps (score >75%) or enrichment topics

**Recommendation Quality:**
- Each recommendation must cite specific performance data
- Reasons should be actionable — tell the student WHAT to do, not just what's wrong
- Focus on the highest-impact improvements first`,
    ],
    [
      'human',
      `Generate personalized study recommendations based on this student's performance data:

**Weak Topics:**
{weakTopics}

**Recent Performance History (last 10 attempts):**
{recentAttempts}

Provide targeted recommendations with clear priorities and data-driven reasoning.`,
    ],
  ]);
}

// ═══════════════════════════════════════════════════════════════════
// UNDERSTANDING SUMMARY PROMPT
// Plain text output — uses invoke, not structured output
// ═══════════════════════════════════════════════════════════════════

export function createUnderstandingSummaryPrompt(): ChatPromptTemplate {
  return ChatPromptTemplate.fromMessages([
    [
      'system',
      `You are an encouraging, data-driven educator providing constructive feedback on student performance.

**Tone:** Professional, supportive, and motivating — never discouraging.
**Length:** Under 150 words.
**Structure:** Highlight specific strengths first, then identify areas for improvement with actionable guidance.
**Format:** Return Markdown text directly. No preamble or meta-commentary.`,
    ],
    [
      'human',
      `Generate a concise understanding summary for this student:

**Topic:** {topic}
**Performance Data:** {performance}

Focus on what they're doing well and give one specific, actionable suggestion for improvement.`,
    ],
  ]);
}

// ═══════════════════════════════════════════════════════════════════
// FOCUS RECOMMENDATION PROMPT
// Plain text output — uses invoke, not structured output
// ═══════════════════════════════════════════════════════════════════

export function createFocusRecommendationPrompt(): ChatPromptTemplate {
  return ChatPromptTemplate.fromMessages([
    [
      'system',
      `You are a learning strategist. Provide brief, actionable study focus recommendations.
Each recommendation should be exactly 1 sentence — practical and specific.
Return plain text only. No headings, no bullet points, no formatting.`,
    ],
    [
      'human',
      `Based on these study insights, provide 2 targeted focus recommendations:

{insights}`,
    ],
  ]);
}
