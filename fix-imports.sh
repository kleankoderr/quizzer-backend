#!/bin/bash

# Fix all AiModule imports in module files
for file in src/assessment/assessment.module.ts \
            src/challenge/challenge.module.ts \
            src/companion/companion.module.ts \
            src/content/content.module.ts \
            src/flashcard/flashcard.module.ts \
            src/insights/insights.module.ts \
            src/onboarding/onboarding.module.ts \
            src/recommendation/recommendation.module.ts \
            src/study/study.module.ts \
            src/summary/summary.module.ts \
            src/weak-area/weak-area.module.ts \
            src/app.module.ts; do
  if [ -f "$file" ]; then
    # Replace import statement
    sed -i '' "s/import { AiModule } from '.*ai\.module'/import { LangChainModule } from '.\/langchain\/langchain.module'/g" "$file"
    sed -i '' "s/import { AiModule } from '\.\.\/ai\/ai\.module'/import { LangChainModule } from '.\/langchain\/langchain.module'/g" "$file"
    # Replace in imports array
    sed -i '' 's/\bAiModule\b/LangChainModule/g' "$file"
    echo "Fixed $file"
  fi
done

# Fix app.module.ts specifically (has different path)
sed -i '' "s/import { LangChainModule } from '\.\/ai\/ai\.module'/import { LangChainModule } from '.\/langchain\/langchain.module'/g" src/app.module.ts

# Fix all AiService imports in service and processor files
for file in src/assessment/assessment.service.ts \
            src/challenge/challenge.service.ts \
            src/companion/companion.service.ts \
            src/content/content.service.ts \
            src/content/content.processor.ts \
            src/flashcard/flashcard.processor.ts \
            src/insights/insights.service.ts \
            src/onboarding/onboarding.service.ts \
            src/recommendation/recommendation.service.ts \
            src/summary/summary.processor.ts \
            src/weak-area/weak-area.service.ts; do
  if [ -f "$file" ]; then
    # Replace import statement
    sed -i '' "s/import { AiService } from '\.\.\/ai\/ai\.service'/import { LangChainService } from '.\/langchain\/langchain.service'/g" "$file"
    # Replace in constructor
    sed -i '' 's/aiService: AiService/langchainService: LangChainService/g' "$file"
    sed -i '' 's/readonly aiService: AiService/readonly langchainService: LangChainService/g' "$file"
    echo "Fixed $file"
  fi
done

echo "All files updated!"
