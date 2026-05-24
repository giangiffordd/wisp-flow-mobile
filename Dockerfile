# Use Node 20 LTS as the base image
FROM node:20-alpine

# Set the working directory inside the container
WORKDIR /app

# Install system dependencies needed for compiling native npm modules (if any)
RUN apk add --no-cache bash libc6-compat python3 make g++

# Copy package management files first for efficient caching
COPY package.json package-lock.json ./

# Install npm dependencies
RUN npm ci

# Copy the rest of the application files
COPY . .

# Expose Metro bundler port (8081 is the default for Expo/React Native)
EXPOSE 8081

# Default command to start the dev server
# Using --tunnel is recommended inside Docker to allow physical phones to connect
CMD ["npx", "expo", "start"]
