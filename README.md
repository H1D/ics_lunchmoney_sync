# ICS Bank to Lunch Money Sync Bot

A Telegram bot that automatically syncs your ICS Bank (ABN AMRO) credit card transactions to [Lunch Money](https://lunchmoney.app/).

## Features

- 🔐 Secure login with 2FA support
- 💳 Automatic transaction fetching
- 📊 Sync to Lunch Money with deduplication
- 🤖 Simple Telegram interface
- 🐳 Docker-ready deployment
- 🚀 Automated CI/CD with GitHub Actions
- 📦 Pre-built Docker images from GHCR
- 🔖 Browser bookmarklet for manual syncing

## Bookmarklet

In addition to the Telegram bot, this project includes a browser bookmarklet for manual syncing. See [bookmarklet/README.md](./bookmarklet/README.md) for details.

**Quick start:**

```bash
cd bookmarklet
bun install
bun run watch  # Edit src/bookmarklet.js and auto-build
```

📹 **Demo Video:** See the bookmarklet in action: [usage.mp4](./bookmarklet/usage.mp4)

## Quick Start

### Deploy with Docker

**Using Portainer (Recommended):**

1. In Portainer, go to **Stacks** → **Add stack**
2. **Upload from git**: `https://github.com/H1D/ics_lunchmoney_sync.git`
3. In Portainer's **Environment variables** section, add:
   - `TOKEN` = your Telegram bot token
   - `USER_ID` = your Telegram user ID
   - `ICS_EMAIL` = your ICS email
   - `ICS_PASSWORD` = your ICS password
   - `ICS_ACCOUNT_NUMBER` = your account number (optional)
   - `LUNCHMONEY_TOKEN` = your Lunch Money token
   - `LUNCHMONEY_ASSET_ID` = your asset ID
   - `SYNC_DAYS` = `30` (or your preferred number of days)
4. **Deploy the stack**

The `docker-compose.yml` uses `${VARIABLE}` syntax and will automatically pull values from Portainer's environment variables.

**Using docker-compose directly:**

```bash
# Clone the repository
git clone https://github.com/H1D/ics_lunchmoney_sync.git
cd ics_lunchmoney_sync

# Edit docker-compose.yml and replace YOUR_*_HERE placeholders
# Then run:
docker-compose up -d
```

### Using Pre-built Docker Image

```bash
docker pull ghcr.io/temasus/ics_lunchmoney_sync:latest
docker run -d \
  -e TOKEN=your_token \
  -e USER_ID=your_user_id \
  -e ICS_EMAIL=your@email.com \
  -e ICS_PASSWORD=your_password \
  -e LUNCHMONEY_TOKEN=your_lm_token \
  -e LUNCHMONEY_ASSET_ID=your_asset_id \
  ghcr.io/temasus/ics_lunchmoney_sync:latest
```

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

| Variable              | Required | Description                                        |
| --------------------- | -------- | -------------------------------------------------- |
| `TOKEN`               | Yes      | Telegram bot token from @BotFather                 |
| `USER_ID`             | Yes      | Your Telegram user ID (bot only responds to you)   |
| `ICS_EMAIL`           | Yes      | ICS bank login email                               |
| `ICS_PASSWORD`        | Yes      | ICS bank password (use quotes if contains `#`)     |
| `ICS_ACCOUNT_NUMBER`  | No       | Account number (auto-detected if only one account) |
| `LUNCHMONEY_TOKEN`    | Yes      | Lunch Money API token                              |
| `LUNCHMONEY_ASSET_ID` | Yes      | Lunch Money asset ID for this account              |
| `SYNC_DAYS`           | Yes      | Number of days to sync (default: 30)               |

### Finding Your Telegram User ID

Send a message to [@userinfobot](https://t.me/userinfobot) on Telegram to get your user ID.

### Finding Your Lunch Money Asset ID

1. Go to [Lunch Money](https://my.lunchmoney.app/)
2. Click on your ICS/ABN AMRO asset/account
3. **The asset ID is in the URL**: `https://my.lunchmoney.app/transactions/2026/01?asset=12345&match=any&time=year`
   - Use `12345` as your `LUNCHMONEY_ASSET_ID`

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

## Secret Scanning

This repository uses [gitleaks](https://github.com/gitleaks/gitleaks) to prevent secrets from being committed.

### Local Protection (Pre-commit Hook)

Install pre-commit hooks to scan for secrets before each commit:

```bash
# Install pre-commit (if not already installed)
pip install pre-commit
# or
brew install pre-commit

# Install the hooks
pre-commit install

# Test the hook
pre-commit run --all-files
```

The hook will automatically run before each commit. To skip it for a specific commit:

```bash
SKIP=gitleaks git commit -m "your message"
```

### CI/CD Protection

GitHub Actions automatically scans all pushes and pull requests using gitleaks. If secrets are detected, the workflow will fail and results will be uploaded to the GitHub Security tab.

## Docker Images

### Available Tags

Docker images are automatically built and pushed to GitHub Container Registry on every push to `main`:

- `latest` - Latest build from main branch
- `main` - Build from main branch
- `vX.Y.Z` - Version tags (when releases are created)
- `sha-<commit>` - Build from specific commit

### Building Locally

If you prefer to build the image yourself:

```bash
cd telegram-bot
docker build -t ics-lunchmoney-sync .
```

### CI/CD Pipeline

This repository uses GitHub Actions to:

1. **Build** Docker image on every push to `main`
2. **Push** to GitHub Container Registry (ghcr.io)
3. **Tag** with branch name, commit SHA, and version tags
4. **Cache** layers for faster builds

View available packages at: https://github.com/temasus/ics_lunchmoney_sync/pkgs/container/ics_lunchmoney_sync

## License

MIT
