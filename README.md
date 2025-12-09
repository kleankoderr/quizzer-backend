
# Quizzer Backend

NestJS + TypeScript + PostgreSQL + Prisma + LangChain + Google Gemini backend for the Quizzer application.

## Tech Stack

- **NestJS** - Progressive Node.js framework
- **TypeScript** - Type safety
- **PostgreSQL** - Database
- **Prisma** - ORM
- **Passport** - Authentication
- **Google OAuth 2.0** - Social login
- **LangChain** - AI orchestration
- **Google Gemini** - AI model for quiz/flashcard generation
- **Multer** - File upload handling

## Features

- Google OAuth Authentication
- AI-Powered Quiz Generation (from topic, text, or uploaded files)
- AI-Powered Flashcard Generation (from topic, text, or uploaded files)
- Learning Streak Tracking
- Global Leaderboard System
- Daily/Weekly/Monthly Challenges
- Personalized Recommendations
- File Upload Support (text files for content-based generation)
- Attempt History & Analytics

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Google Cloud Project with Gemini API access
- Google OAuth credentials

### Installation

```bash
# Install dependencies
npm install

```

### Environment Setup

Edit `.env` with your actual credentials:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/quizzer"

# JWT
JWT_SECRET="your-secret-key"
JWT_EXPIRES_IN="7d"

# Google OAuth
GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-client-secret"
GOOGLE_CALLBACK_URL="http://localhost:3000/api/auth/google/callback"

# Google Gemini AI
GOOGLE_API_KEY="your-gemini-api-key"

# App
FRONTEND_URL="http://localhost:5173"
PORT=3000
```

### Database Setup

```bash
# Generate Prisma client
npm run prisma:generate

# Run migrations
npm run prisma:migrate

# (Optional) Open Prisma Studio to view database
npm run prisma:studio
```

### Development

```bash
# Start development server
npm run start:dev

# Build for production
npm run build

# Start production server
npm run start:prod
```

The API will be available at `http://localhost:3000/api`

## Project Structure

```
src/
├── ai/                    # AI service (LangChain + Gemini)
│   ├── ai.service.ts
│   └── ai.module.ts
├── auth/                  # Authentication module
│   ├── decorators/
│   ├── guards/
│   ├── strategies/
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   └── auth.module.ts
├── quiz/                  # Quiz generation & management
│   ├── dto/
│   ├── quiz.controller.ts
│   ├── quiz.service.ts
│   └── quiz.module.ts
├── flashcard/             # Flashcard generation & management
│   ├── dto/
│   ├── flashcard.controller.ts
│   ├── flashcard.service.ts
│   └── flashcard.module.ts
├── streak/                # User streak tracking
│   ├── streak.controller.ts
│   ├── streak.service.ts
│   └── streak.module.ts
├── leaderboard/           # Global & friend leaderboards
│   ├── leaderboard.controller.ts
│   ├── leaderboard.service.ts
│   └── leaderboard.module.ts
├── challenge/             # Challenge system
│   ├── challenge.controller.ts
│   ├── challenge.service.ts
│   └── challenge.module.ts
├── recommendation/        # AI-powered recommendations
│   ├── recommendation.controller.ts
│   ├── recommendation.service.ts
│   └── recommendation.module.ts
├── attempt/               # Attempt history & analytics
│   ├── attempt.controller.ts
│   ├── attempt.service.ts
│   └── attempt.module.ts
├── prisma/                # Prisma ORM module
│   ├── prisma.service.ts
│   └── prisma.module.ts
├── app.module.ts          # Main application module
├── app.controller.ts
├── app.service.ts
└── main.ts                # Application entry point
```

## API Endpoints

### Authentication
- `GET /api/auth/google` - Initiate Google OAuth
- `GET /api/auth/google/callback` - OAuth callback
- `GET /api/auth/me` - Get current user (protected)
- `GET /api/auth/logout` - Logout (protected)

### Quiz
- `POST /api/quiz/generate` - Generate quiz (supports file upload)
- `GET /api/quiz` - Get all user quizzes
- `GET /api/quiz/:id` - Get quiz by ID
- `POST /api/quiz/:id/submit` - Submit quiz answers

### Flashcards
- `POST /api/flashcards/generate` - Generate flashcards (supports file upload)
- `GET /api/flashcards` - Get all flashcard sets
- `GET /api/flashcards/:id` - Get flashcard set by ID

### Streak
- `GET /api/streak` - Get current streak
- `POST /api/streak/update` - Update streak

### Leaderboard
- `GET /api/leaderboard/global` - Get global leaderboard
- `GET /api/leaderboard/friends` - Get friends leaderboard

### Challenges
- `GET /api/challenge` - Get all challenges with progress
- `POST /api/challenge/:id/complete` - Complete a challenge

### Recommendations
- `GET /api/recommendations` - Get personalized recommendations

### Attempts
- `GET /api/attempts` - Get all attempts
- `GET /api/attempts/:id` - Get attempt by ID

## File Upload Support

Both quiz and flashcard generation support file uploads:

### Supported File Types
- Text files (`.txt`, `.md`, etc.)
- Maximum 5 files per request
- Maximum 10MB per file

### Example: Generate Quiz from Files

```bash
curl -X POST http://localhost:3000/api/quiz/generate \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "files=@document1.txt" \
  -F "files=@document2.txt" \
  -F "numberOfQuestions=10" \
  -F "difficulty=medium"
```

### Example: Generate Flashcards from Text

```bash
curl -X POST http://localhost:3000/api/flashcards/generate \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Your text content here...",
    "numberOfCards": 15
  }'
```

## Database Schema

Key models:
- **User** - User authentication & profile
- **Quiz** - Generated quizzes with questions
- **FlashcardSet** - Generated flashcard sets
- **Streak** - User learning streaks
- **LeaderboardEntry** - User rankings
- **Challenge** - System challenges
- **ChallengeCompletion** - User challenge progress
- **Attempt** - Quiz/flashcard attempt history
- **Recommendation** - Personalized study recommendations

## AI Integration

The app uses Google's Gemini model via LangChain for:

1. **Quiz Generation**: Creates multiple-choice questions with explanations
2. **Flashcard Generation**: Generates front/back flashcard pairs
3. **Recommendations**: Analyzes user performance for personalized suggestions

### Content Sources

All AI generation methods accept multiple input sources:
- **Topic**: Generate from a topic name
- **Text**: Generate from text content
- **Files**: Generate from uploaded text files

## Development Scripts

```bash
# Generate Prisma client
npm run prisma:generate

# Create migration
npm run prisma:migrate

# View database in Prisma Studio
npm run prisma:studio

# Format code
npm run format

# Lint code
npm run lint

# Run tests
npm run test
```

## Production Deployment

1. Set up PostgreSQL database
2. Configure environment variables
3. Run migrations: `npm run prisma:migrate`
4. Build: `npm run build`
5. Start: `npm run start:prod`

## Security Features

- JWT authentication
- Google OAuth 2.0
- Rate limiting (100 requests/minute)
- Input validation with class-validator
- CORS configuration
- Secure file upload validation

## Contributing

1. Create a feature branch
2. Make your changes
3. Run linter and tests
4. Submit a pull request

## License

MIT
# quizzer-backend
