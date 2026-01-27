# ---- Base Image ----
FROM node:20-alpine AS base

WORKDIR /app

# Install Ghostscript and required dependencies
RUN apk add --no-cache \
    ghostscript \
    ghostscript-fonts

# Copy package files and prisma schema first for caching
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma/

# Install pnpm and dependencies
RUN corepack enable && pnpm install --frozen-lockfile

# Copy the full project
COPY . .

# Build the NestJS project
RUN pnpm run build

# Verify the build output
RUN ls -la dist/ && test -f dist/main.js && echo "✅ Build successful: dist/main.js exists"


# ---- Production Image ----
FROM node:20-alpine

WORKDIR /app

# Install Ghostscript in production image (IMPORTANT!)
RUN apk add --no-cache \
    ghostscript \
    ghostscript-fonts

# Install pnpm
RUN corepack enable

# Copy build artifacts and node_modules from the build stage
COPY --from=base /app/dist ./dist
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/prisma ./prisma
COPY package.json pnpm-lock.yaml ./

# Copy and set up the entrypoint script
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Expose the application's port
EXPOSE 3000

# Start the application using exec form
CMD ["./docker-entrypoint.sh"]