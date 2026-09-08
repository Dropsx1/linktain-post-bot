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
| Access Tutorial | https://t.me/linktaintutorail |
| VIP Access | https://buy.stripe.com/28E5kE0hGc7n4a14Hn5AQ01 |
| Discord | https://discord.gg/bgnQtMeucK |

All three are overridable with `TUTORIAL_URL`, `VIP_URL` and `DISCORD_URL`. A button
whose URL is malformed is dropped from the keyboard rather than failing the whole
`/start` reply.

If `TUTORIAL_URL` is left empty the bot falls back to `TUTORIAL_CHAT_ID` and builds a
`https://t.me/c/…` link, which only opens for people already in that chat.

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
| TELEGRAM_TOKEN | required, from [@BotFather](https://t.me/BotFather) |
| LINKTAIN_API_KEY | required, `lt_…` key from Linktain Settings |
| ADMIN_USER_IDS | comma-separated Telegram user IDs, default `7739393155`. **Blank means anyone can spend your API key** |
| TUTORIAL_URL | tutorial button target |
| VIP_URL | Stripe payment link |
| DISCORD_URL | Discord invite |
| TUTORIAL_CHAT_ID | fallback used only when `TUTORIAL_URL` is empty |
| LINKTAIN_API_URL | default `https://linktain.com/api/v1` |
| API_TIMEOUT | request timeout in ms, default `20000` |
| COOLDOWN_MS | per-user cooldown between links, default `5000` |
| PORT | healthcheck port, default `3000` |
| WELCOME_TEXT | optional override for the `/start` body |

API docs: https://linktain.com/developers

## Commands

- `/start` menu + buttons
- `/help`
- `/stats` recent Linktain views / unlocks / earnings (admins only)

## Access

Link creation and `/stats` are restricted to the IDs in `ADMIN_USER_IDS`, which
defaults to `7739393155`. Everyone else can still open `/start` and `/help` and use
the tutorial, VIP and Discord buttons; they just cannot spend the Linktain API key.
Setting the variable to an empty string removes that restriction entirely, and the
bot logs a warning at startup when it does.

## Tests

```bash
npm test
```

Pure helpers live in `lib/links.js` so they can be tested without opening a
Telegram connection; `bot.js` holds the wiring.

## Operations

`GET :$PORT/` returns `ok` for platform healthchecks. `SIGINT`/`SIGTERM` stop polling
and close the healthcheck server before exiting.

## Not implemented yet

- No persistence: the per-user cooldown lives in memory and resets on redeploy.
- No retry on a failed Linktain call — the user has to resend the URL.
- Long polling only; there is no webhook mode, so only one instance may run at a time.
- No CI workflow, linter, or container/Procfile definition.
