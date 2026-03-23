# ── Stage 1: build the React app ─────────────────────────────────────────
FROM node:20-slim AS builder
WORKDIR /app
# Install dependencies (cached unless package*.json changes)
COPY package*.json ./
RUN npm ci
# Copy source and build
COPY . .
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
RUN npm run build
# ── Stage 2: serve with nginx ─────────────────────────────────────────────
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80