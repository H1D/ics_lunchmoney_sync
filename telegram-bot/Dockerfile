FROM oven/bun:latest

# Install Chromium and dependencies for Puppeteer
RUN apt-get update && apt-get install -y \
    chromium \
    chromium-sandbox \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Copy package files from telegram-bot directory
COPY telegram-bot/package.json ./package.json
COPY telegram-bot/bun.lockb* ./bun.lockb

# Install dependencies
RUN bun install

# Copy application files from telegram-bot directory
COPY telegram-bot/ ./

# Run the bot
CMD ["bun", "run", "bot.js"]
