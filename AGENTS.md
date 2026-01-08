# ICS Lunch Money Sync Bot

This project contains a Telegram bot that syncs ICS Bank (ABN AMRO) transactions to Lunch Money.

## Project Structure

- `telegram-bot/` - Main bot application
  - `bot.js` - Telegram bot handler
  - `scripts/sync-transactions.js` - ICS bank login and transaction sync script
  - `Dockerfile` - Docker image with Chromium for Puppeteer
  - `package.json` - Dependencies

## Environment Variables

All configuration is done via `.env` file (see `.env.example`):

- `TOKEN` - Telegram bot token
- `USER_ID` - Authorized Telegram user ID
- `ICS_EMAIL` - ICS bank email
- `ICS_PASSWORD` - ICS bank password (use quotes if contains special chars)
- `ICS_ACCOUNT_NUMBER` - Optional, auto-detected if only one account
- `LUNCHMONEY_TOKEN` - Lunch Money API token
- `LUNCHMONEY_ASSET_ID` - Lunch Money asset ID
- `SYNC_DAYS` - Number of days to sync (default: 30)

## Docker Setup

1. Copy `.env.example` to `.env` and fill in your credentials
2. Run `docker-compose up -d` to start the bot
3. Send a message to your Telegram bot
4. Click "GO" button to sync transactions

## Local Development

1. Install dependencies: `cd telegram-bot && bun install`
2. Set environment variables from `.env`
3. Run: `bun run telegram-bot/bot.js`

## How It Works

1. User clicks "GO" button in Telegram
2. Bot launches headless browser (Puppeteer)
3. Logs into ICS bank website
4. Waits for 2FA confirmation (user approves on phone)
5. Fetches transactions for configured period
6. Transforms and syncs to Lunch Money API
7. Reports success/failure back to Telegram

## Notes

- Runs in headless mode by default (no visible browser)
- Uses Puppeteer for browser automation (required for ICS bank login)
- Transactions are deduplicated using `external_id` (batchNr-batchSequenceNr)
