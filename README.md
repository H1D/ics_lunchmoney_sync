# ICS Bank to Lunch Money Sync Bot

A Telegram bot that automatically syncs your ICS Bank (ABN AMRO) credit card transactions to [Lunch Money](https://lunchmoney.app/).

## Features

- 🔐 Secure login with 2FA support
- 💳 Automatic transaction fetching
- 📊 Sync to Lunch Money with deduplication
- 🤖 Simple Telegram interface
- 🐳 Docker-ready deployment

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Telegram bot token (get from [@BotFather](https://t.me/botfather))
- ICS Bank account credentials
- Lunch Money API token and asset ID

### Setup

1. **Clone or copy this project**

2. **Create `.env` file:**
   ```bash
   cp .env.example .env
   ```

3. **Edit `.env` with your credentials:**
   ```env
   TOKEN=your_telegram_bot_token
   USER_ID=your_telegram_user_id
   ICS_EMAIL=your_email@example.com
   ICS_PASSWORD="your_password"
   LUNCHMONEY_TOKEN=your_lunchmoney_token
   LUNCHMONEY_ASSET_ID=your_asset_id
   SYNC_DAYS=60
   ```

4. **Start the bot:**
   ```bash
   docker-compose up -d
   ```

5. **Test it:**
   - Send any message to your Telegram bot
   - Click the "GO" button
   - Approve 2FA on your phone when prompted
   - Wait for sync to complete

## How It Works

1. You send a message to the bot in Telegram
2. Bot responds with a "GO" button
3. When clicked, the bot:
   - Launches a headless browser
   - Logs into ICS bank website
   - Waits for your 2FA approval (check your phone!)
   - Fetches transactions for the configured period
   - Transforms and syncs them to Lunch Money
   - Reports back the results

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TOKEN` | Yes | Telegram bot token from @BotFather |
| `USER_ID` | Yes | Your Telegram user ID (bot only responds to you) |
| `ICS_EMAIL` | Yes | ICS bank login email |
| `ICS_PASSWORD` | Yes | ICS bank password (use quotes if contains `#`) |
| `ICS_ACCOUNT_NUMBER` | No | Account number (auto-detected if only one account) |
| `LUNCHMONEY_TOKEN` | Yes | Lunch Money API token |
| `LUNCHMONEY_ASSET_ID` | Yes | Lunch Money asset ID for this account |
| `SYNC_DAYS` | Yes | Number of days to sync (default: 30) |

### Finding Your Telegram User ID

Send a message to [@userinfobot](https://t.me/userinfobot) on Telegram to get your user ID.

### Finding Your Lunch Money Asset ID

1. Go to [Lunch Money](https://lunchmoney.app/)
2. Navigate to Settings → Assets
3. Find your ICS/ABN AMRO account
4. The asset ID is in the URL or account details

## Local Development

```bash
# Install dependencies
cd telegram-bot
bun install

# Set environment variables
export $(cat ../.env | grep -v '^#' | xargs)

# Run bot
bun run bot.js

# Run sync script directly (for testing)
bun run scripts/sync-transactions.js
```

## Troubleshooting

### Password contains special characters

If your password contains `#` or other special characters, make sure to quote it in `.env`:
```env
ICS_PASSWORD="your#password"
```

### 2FA timeout

If you see a 2FA timeout error:
- Make sure to approve the login on your phone quickly
- The timeout is 2 minutes
- Try clicking "GO" again

### Multiple accounts

If you have multiple ICS accounts, the bot will show you account details and ask you to set `ICS_ACCOUNT_NUMBER` in `.env`.

### Docker issues

If Chromium fails to launch in Docker:
- Make sure the Dockerfile includes all Chromium dependencies
- Check container logs: `docker-compose logs telegram-bot`

## Security Notes

- Never commit your `.env` file
- Keep your Telegram bot token secure
- The bot only responds to messages from your `USER_ID`
- All sensitive data is stored in environment variables

## License

MIT
