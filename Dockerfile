# Multi-stage build for minimal image size
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files first (better layer caching)
COPY package*.json ./

# Install all dependencies (including dev for build)
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Production stage
FROM node:22-alpine

WORKDIR /app

# Copy built files and dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev --ignore-scripts

# Run as non-root user (Cloud Run best practice)
USER node

# Cloud Run requires PORT 8080
ENV PORT=8080
EXPOSE 8080

# The container's memory limit (512Mi) is fixed by the platform and not
# configurable via mcpize.yaml. Parsing the ~25-30MB OFAC/EU government XML
# exports pushes V8's auto-detected heap ceiling too close to that limit -
# --max-old-space-size raises it explicitly to a value measured safe against
# real data (peak ~410MB RSS observed), and --expose-gc lets the cache
# (src/lib/cache.ts) force a collection between lists so one list's transient
# parse memory doesn't linger into the next list's allocations.
ENV NODE_OPTIONS="--max-old-space-size=350 --expose-gc"

# Health check for Cloud Run
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

CMD ["node", "dist/index.js"]
