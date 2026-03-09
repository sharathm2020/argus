# ── Stage 1: build the React app ─────────────────────────────────────────────
FROM node:18-slim AS builder

WORKDIR /app

# Install dependencies (cached unless package*.json changes)
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# ── Stage 2: serve with nginx ─────────────────────────────────────────────────
FROM nginx:alpine

# Copy built assets from the builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Replace the default nginx config with our custom one
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
