# linktain-post-bot

Public Telegram bot that wraps a destination URL with a [Linktain](https://linktain.com) locked link and replies with the `shortUrl`.

Repo: https://github.com/Dropsx1/linktain-post-bot

## What it does

1. User sends an `http(s)` URL (optional title text can sit next to it).
2. Bot calls `POST https://linktain.com/api/v1/links`.
3. Bot replies with the Linktain short URL.

`/start` buttons:

| Button | Target |
|---|---|
| Tutorial | Telegram chat `-1003495156964` |
| VIP | https://buy.stripe.com/eVq6oIc0o0oF5e51vb5AQ00 |
| Official Discord | https://discord.gg/MxmBsxYVWM |

`https://t.me/c/3495156964` only works for people already in that chat. Set `TUTORIAL_URL` to a `t.me/+` invite for new users.

## Setup

Do **not** commit `.env`, the BotFather token, or the Linktain API key.

```bash
git clone https://github.com/Dropsx1/linktain-post-bot.git
cd linktain-post-bot
cp .env.example .env
# set TELEGRAM_TOKEN and LINKTAIN_API_KEY
npm install
npm start
```

| Name | Notes |
|---|---|
| TELEGRAM_TOKEN | from [@BotFather](https://t.me/BotFather) |
| LINKTAIN_API_KEY | `lt_…` key from Linktain Settings |
| ADMIN_USER_IDS | optional comma-separated Telegram user IDs |
| VIP_URL | Stripe payment link |
| DISCORD_URL | Discord invite |
| TUTORIAL_CHAT_ID | `-1003495156964` |
| TUTORIAL_URL | optional invite URL |

API docs: https://linktain.com/developers

## Commands

- `/start` menu + buttons
- `/help`
- `/stats` recent Linktain views / unlocks / earnings
