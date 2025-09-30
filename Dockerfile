# Multi-stage build for Vite + React app
# ---- Build Stage ----
FROM node:20-alpine AS build

# Build arguments for telemetry (optional)
ARG VITE_APPINSIGHTS_KEY
ARG VITE_APPINSIGHTS_CONNECTION_STRING
ARG VITE_APPINSIGHTS_SAMPLE
ARG VITE_DISABLE_VITALS

# Set working directory
WORKDIR /app

# Install dependencies only (leverage layer cache)
COPY web/package.json web/package-lock.json* web/npm-shrinkwrap.json* ./web/
RUN cd web && npm ci --omit=dev && npm install --production=false

# Copy source
COPY web ./web

# Build (produces /web/dist)
RUN cd web && \
      VITE_APPINSIGHTS_KEY="$VITE_APPINSIGHTS_KEY" \
      VITE_APPINSIGHTS_CONNECTION_STRING="$VITE_APPINSIGHTS_CONNECTION_STRING" \
      VITE_APPINSIGHTS_SAMPLE="$VITE_APPINSIGHTS_SAMPLE" \
      VITE_DISABLE_VITALS="$VITE_DISABLE_VITALS" \
      npm run build

# ---- Runtime Stage ----
FROM nginx:1.27-alpine AS runtime
LABEL org.opencontainers.image.source="https://github.com/humanaiconvention/humanaiconvention" \
      org.opencontainers.image.description="HumanAI Convention Web UI" \
      org.opencontainers.image.licenses="MIT"

# Copy custom nginx config (added separately) or fall back to default if not present
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets
COPY --from=build /app/web/dist /usr/share/nginx/html

# Optional: static asset immutability headers baked by nginx.conf
# Expose port
EXPOSE 80

# Basic healthcheck (optional override in Azure)
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1

# Nginx runs as non-root user in some hardened variants; adjust if needed.
# Default CMD already provided by base image.
