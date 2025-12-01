# ---- Dependencies Stage ----
FROM node:20-alpine AS dependencies

WORKDIR /app

# Copy package files (including package-lock.json)
COPY package.json package-lock.json ./
COPY prisma ./prisma/

# Install all dependencies (including dev dependencies for build)
RUN npm ci && \
    npm cache clean --force

# Store all dependencies
RUN cp -R node_modules /all_node_modules

# Install only production dependencies
RUN npm ci --omit=dev && \
    npm cache clean --force

# Store production dependencies
RUN cp -R node_modules /prod_node_modules

# Restore all dependencies for the build stage
RUN rm -rf node_modules && \
    cp -R /all_node_modules node_modules


# ---- Build Stage ----
FROM node:20-alpine AS build

WORKDIR /app

# Copy dependencies from previous stage
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/prisma ./prisma

# Copy source code
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Build the application
RUN npm run build


# ---- Production Stage ----
FROM node:20-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

WORKDIR /app

# Copy production dependencies
COPY --from=dependencies /prod_node_modules ./node_modules

# Copy Prisma files (needed for migrations)
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma

# Copy built application
COPY --from=build /app/dist ./dist
COPY --from=build /app/package*.json ./

# Change ownership to non-root user
RUN chown -R nestjs:nodejs /app

# Switch to non-root user
USER nestjs

# Expose port
EXPOSE 3000

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Run migrations and start the application
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]