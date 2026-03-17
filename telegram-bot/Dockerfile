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
    curl \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Copy package files (context is already ./telegram-bot)
COPY package.json ./package.json

# Install dependencies
RUN bun install

# Copy application files (context is already ./telegram-bot)
COPY . ./

HEALTHCHECK --interval=60s --timeout=10s --start-period=10s --retries=3 \
  CMD curl -sf "https://api.telegram.org/bot${TOKEN}/getMe" || exit 1

# Run the bot
CMD ["bun", "run", "bot.js"]
