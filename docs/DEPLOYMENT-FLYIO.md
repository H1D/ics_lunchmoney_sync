# Deploy to Fly.io

This guide will help you deploy the ICS Bank to Lunch Money Sync Bot to Fly.io, which offers a generous free tier perfect for running this bot.

## Why Fly.io?

- ✅ **Free tier available** - Runs within Fly.io's free allowance
- ✅ **Fast startup** - Spins up in seconds
- ✅ **Auto-scaling** - Scales to zero when inactive
- ✅ **Global deployment** - Deploy close to your users
- ✅ **No public URL needed** - Perfect for Telegram bots

## Prerequisites

- Fly.io account (sign up at https://fly.io)
- `flyctl` CLI installed

## Quick Start

### 1. Install flyctl

```bash
curl -L https://fly.io/install.sh | sh
```

### 2. Authenticate

```bash
flyctl auth signup
```

This will open your browser for authentication.

### 3. Deploy the Bot

```bash
# Clone the repository
git clone https://github.com/H1D/ics_lunchmoney_sync.git
cd ics_lunchmoney_sync

# Launch the app
fly launch --from https://github.com/H1D/ics_lunchmoney_sync
```

The `fly launch` command will:
- Detect your `fly.toml` configuration
- Create a new app on Fly.io
- Build the Docker image
- Deploy to Fly.io infrastructure

Follow the prompts and accept the defaults.

### 4. Set Environment Variables

```bash
flyctl secrets set TOKEN=your_telegram_bot_token
flyctl secrets set USER_ID=your_telegram_user_id
flyctl secrets set ICS_EMAIL=your_email@example.com
flyctl secrets set ICS_PASSWORD=your_password
flyctl secrets set LUNCHMONEY_TOKEN=your_lunchmoney_token
flyctl secrets set LUNCHMONEY_ASSET_ID=your_asset_id
flyctl secrets set SYNC_DAYS=60
```

### 5. Your Bot is Live!

Your bot is now deployed and running on Fly.io!

## Managing Your Deployment

### View Logs

```bash
flyctl logs
```

### Check Status

```bash
flyctl status
```

### Open Dashboard

```bash
flyctl dashboard
```

This opens the Fly.io web dashboard for your app.

### Scale the App

**Stop the bot (scale to zero):**
```bash
flyctl scale count 0
```

**Start the bot (scale up):**
```bash
flyctl scale count 1
```

**Change resources:**
```bash
flyctl scale memory 512
flyctl scale vm shared-cpu-1x
```

### Update the Bot

When you push changes to the repository:

```bash
flyctl deploy
```

## Configuration

The `fly.toml` file in this repository is pre-configured with:

- **Region**: Amsterdam (`ams`) - Close to ICS/ABN AMRO servers
- **Dockerfile**: Uses `telegram-bot/Dockerfile`
- **Memory**: 1GB RAM
- **CPU**: Shared CPU
- **Auto-stop**: Scales to zero when inactive (saves costs)

### Changing the Region

To deploy to a different region:

```bash
flyctl regions set <region-code>
flyctl deploy
```

Common regions:
- `ams` - Amsterdam (default)
- `lhr` - London
- `fra` - Frankfurt
- `cdg` - Paris

## Troubleshooting

### Bot Not Responding

Check if the app is running:
```bash
flyctl status
```

If it's stopped, scale it up:
```bash
flyctl scale count 1
```

### View Recent Logs

```bash
flyctl logs --tail 50
```

### Restart the App

```bash
flyctl apps restart ics-lunchmoney-sync
```

### Connection Issues

If the bot has trouble connecting to ICS or Lunch Money:

1. Check logs for errors: `flyctl logs`
2. Verify secrets are set: `flyctl secrets list`
3. Try a different region closer to your bank: `flyctl regions set lhr`

## Cost Estimation

Fly.io's free tier includes:
- **3 VMs** of shared-cpu-1x (256MB RAM)
- **3GB** volume storage
- **160GB** egress bandwidth

This bot uses:
- **1 VM** of shared-cpu-1x (1GB RAM)
- Minimal bandwidth
- No storage

**Estimated cost**: **Free** (within free tier allowances)

If you exceed the free tier, estimated cost is **~$2-5/month** depending on usage.

## Advanced Configuration

### Custom Domain

Fly.io can provide a custom domain for your bot (though not needed for Telegram bots):

```bash
flyctl certs create your-domain.com
```

### Multiple Instances

For high availability:

```bash
flyctl scale count 2
```

### Health Checks

The app includes health checks configured in `fly.toml`:

```toml
[[http_service.checks]]
  interval = "15s"
  timeout = "10s"
  grace_period = "30s"
```

## Comparison with Other Platforms

| Feature | Fly.io | Render | Railway |
|---------|--------|--------|---------|
| Free Tier | ✅ Yes | ✅ Yes | ❌ Trial only |
| CLI Required | ✅ Yes | ❌ No | ❌ No |
| One-Click Deploy | ❌ No | ✅ Yes | ⚠️ Template only |
| Cold Starts | Fast (~2s) | Slow (~30s) | Fast (~2s) |
| Regions | Global | Limited | Limited |
| Auto-Scale | ✅ Yes | ✅ Yes | ✅ Yes |

## Getting Help

If you encounter issues:

1. **Check the logs**: `flyctl logs`
2. **Fly.io docs**: https://fly.io/docs/
3. **Fly.io community**: https://community.fly.io/
4. **Open an issue**: https://github.com/H1D/ics_lunchmoney_sync/issues

## Next Steps

- Test your bot by sending a message on Telegram
- Set up monitoring with `flyctl dashboard`
- Configure alerts for downtime
- Explore Fly.io's advanced features
