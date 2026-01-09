FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source files
COPY index.js server.js ./
COPY src/ ./src/
COPY .env .env

# Create data directory
RUN mkdir -p data

# Expose port
EXPOSE 3169

# Start the server
CMD ["node", "index.js"]
