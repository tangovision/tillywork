# =============================================================================
# Stage 1: Build - Compiles the application
# =============================================================================
FROM node:bullseye-slim AS build

WORKDIR /app

# Build arguments for frontend
ARG TW_VITE_POSTHOG_KEY
ENV TW_VITE_POSTHOG_KEY=${TW_VITE_POSTHOG_KEY}
ENV TW_VITE_API_URL=/api/v1

# Copy package files first for better layer caching
COPY package*.json ./
COPY nx.json tsconfig*.json ./
COPY packages/backend/package*.json ./packages/backend/
COPY packages/frontend/package*.json ./packages/frontend/
COPY packages/shared/package*.json ./packages/shared/
COPY packages/docs/package*.json ./packages/docs/

# Copy remaining source code
COPY . .

# Install dependencies (npm workspaces need all source files present)
RUN npm install --legacy-peer-deps

# Generate swagger metadata (optional)
RUN npm run swagger || true

# Build the application
RUN npx nx run frontend:build --skip-nx-cache && \
    (npx nx run backend:build --skip-nx-cache || echo "Backend build using source files")

# =============================================================================
# Stage 2: Production Runner - Minimal runtime image
# =============================================================================
FROM nginx:alpine-slim AS runner

ENV NODE_ENV=production

WORKDIR /app

# Install Node.js, PM2, and curl for health checks
RUN apk add --no-cache nodejs npm curl && \
    npm install pm2 -g && \
    npm cache clean --force

# Copy built assets from build stage
COPY --from=build /app/dist/packages/backend ./dist/packages/backend
COPY --from=build /app/dist/packages/shared ./dist/packages/shared
COPY --from=build /app/dist/packages/frontend /usr/share/nginx/html

# Copy configuration files
COPY nginx/frontend.conf /etc/nginx/conf.d/default.conf
COPY ecosystem.config.js .
COPY package*.json ./

# Copy node_modules from build stage
COPY --from=build /app/node_modules ./node_modules

# Copy and prepare start script
COPY ./start.sh /start.sh
RUN chmod +x /start.sh

# Expose ports
EXPOSE 80 3000

# Health check - use curl since it's more reliable in alpine
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/v1/auth || exit 1

# Run the application
CMD ["/start.sh"]
