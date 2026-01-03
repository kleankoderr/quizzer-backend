# ---- Base Image ----
FROM node:20-alpine AS base

WORKDIR /app

# Install Ghostscript and required dependencies
RUN apk add --no-cache \
    ghostscript \
    ghostscript-fonts

# Copy package files first for caching
COPY package*.json ./

# Install all dependencies (dev + prod)
RUN npm install --production=false

# Copy the full project
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Build the NestJS project
RUN npm run build

# Verify the build output
RUN ls -la dist/ && test -f dist/src/main.js && echo "✅ Build successful: dist/src/main.js exists"


# ---- Production Image ----
FROM node:20-alpine

WORKDIR /app

# Install Ghostscript in production image (IMPORTANT!)
RUN apk add --no-cache \
    ghostscript \
    ghostscript-fonts

# Copy build artifacts and node_modules from the build stage
COPY --from=base /app/dist ./dist
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/prisma ./prisma
COPY package*.json ./

# Copy and set up the entrypoint script
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Expose the application's port
EXPOSE 3000

# Start the application using exec form
CMD ["./docker-entrypoint.sh"]