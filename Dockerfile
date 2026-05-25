# ─────────────────────────────────────────────────────────────────────────────
# wisp-flow-mobile — unified single image
# Includes the Expo React Native app AND specimens_full_clean.txt
# (specimens data is bundled via COPY . . — no separate image needed)
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine

# System dependencies for native npm modules
RUN apk add --no-cache bash libc6-compat python3 make g++

WORKDIR /app

# Copy package files first for efficient layer caching
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy the entire project (includes specimens_full_clean.txt automatically)
COPY . .

# Metro bundler port
EXPOSE 8081

# Start Expo in LAN mode → prints QR code in terminal so phones can connect
CMD ["npx", "expo", "start", "--lan"]
