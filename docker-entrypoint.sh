#!/bin/sh
set -e

# Run database migrations first
npx prisma migrate deploy

# Generate Prisma Client AFTER migrations to ensure schema matches
npx prisma generate

# Seed the database with initial data
npm run db:seed

# Start the application
exec node dist/src/main
