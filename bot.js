require('dotenv').config();

const http = require('http');
const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');

const {
  TELEGRAM_TOKEN,
  LINKTAIN_API_KEY,
  ADMIN_USER_IDS,
  VIP_URL = 'https://buy.stripe.com/eVq6oIc0o0oF5e51vb5AQ00',
  DISCORD_URL = 'https://discord.gg/MxmBsxYVWM',
  TUTORIAL_URL,
  TUTORIAL_CHAT_ID = '-1003495156964',
  LINKTAIN_API_URL = 'https://linktain.com/api/v1',
  API_TIMEOUT = '20000',
  COOLDOWN_MS = '5000',
  PORT = '3000',
  WELCOME_TEXT,
} = process.env;

if (!TELEGRAM_TOKEN) {
  console.error('Missing TELEGRAM_TOKEN');
  process.exit(1);
}

if (!LINKTAIN_API_KEY) {
  console.error('Missing LINKTAIN_API_KEY');
  process.exit(1);
}

const timeoutMs = parseInt(API_TIMEOUT, 10) || 20000;
const cooldownMs = parseInt(COOLDOWN_MS, 10) || 5000;
const port = parseInt(PORT, 10) || 3000;

const adminIds = new Set(
  String(ADMIN_USER_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
);

function isAdmin(userId) {
  if (!adminIds.size) return true;
  return adminIds.has(String(userId));
}

function tutorialLink() {
  if (TUTORIAL_URL) return TUTORIAL_URL;
  const raw = String(TUTORIAL_CHAT_ID || '').replace(/^-100/, '');
  return raw ? `https://t.me/c/${raw}` : 'https://t.me';
}

function startKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.url('Tutorial', tutorialLink())],
    [Markup.button.url('VIP', VIP_URL)],
    [Markup.button.url('Official Discord', DISCORD_URL)],
  ]);
}

const welcome =
  WELCOME_TEXT ||
  [
    'Linktain post bot',
    '',
    'Send a destination URL. I wrap it with a locked Linktain link and send back the short URL.',
    '',
    '/start — menu',
    '/help — commands',
    '/stats — recent link totals',
  ].join('\n');

const bot = new Telegraf(TELEGRAM_TOKEN);
const cooldowns = new Map();

function remainingCooldown(userId) {
  const last = cooldowns.get(String(userId));
  if (!last) return 0;
  const left = cooldownMs - (Date.now() - last);
  return left > 0 ? left : 0;
}

function extractUrl(text) {
  const match = String(text || '').match(/https?:\/\/[^\s<>"']+/i);
  if (!match) return null;
  return match[0].replace(/[),.]+$/, '');
}

function titleFrom(url, extra) {
  const cleaned = String(extra || '').trim();
  if (cleaned) return cleaned.slice(0, 120);
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return host.slice(0, 120) || 'Link';
  } catch {
    return 'Link';
  }
}

function millsToUsd(mills) {
  return (Number(mills || 0) / 1000).toFixed(2);
}

async function createLink(destinationUrl, title) {
  const { data } = await axios.post(
    `${LINKTAIN_API_URL.replace(/\/$/, '')}/links`,
    { title, destinationUrl },
    {
      headers: {
        Authorization: `Bearer ${LINKTAIN_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: timeoutMs,
    }
  );
  return data;
}

async function listLinks() {
  const { data } = await axios.get(
    `${LINKTAIN_API_URL.replace(/\/$/, '')}/links`,
    {
      headers: { Authorization: `Bearer ${LINKTAIN_API_KEY}` },
      timeout: timeoutMs,
    }
  );
  return (data && data.links) || [];
}

function apiError(err) {
  const body = err.response && err.response.data;
  if (body && body.error) return String(body.error);
  if (err.response && err.response.status === 401) return 'Linktain API key rejected';
  if (err.response && err.response.status === 403) return 'Linktain account not allowed yet';
  return err.message || 'unknown error';
}

bot.start(async (ctx) => {
  await ctx.reply(welcome, startKeyboard());
});

bot.command('help', async (ctx) => {
  await ctx.reply(
    [
      'Send or forward a message that contains an http(s) URL.',
      'Optional text in front of the URL becomes the dashboard title.',
      '',
      '/start — buttons',
      '/stats — latest Linktain totals',
    ].join('\n'),
    startKeyboard()
  );
});

bot.command('stats', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.reply('Admins only.');
  try {
    const links = await listLinks();
    if (!links.length) return ctx.reply('No links on this Linktain account yet.');
    const lines = links.slice(0, 10).map((link, i) => {
      const earned = millsToUsd(link.earnedMills);
      return `${i + 1}. ${link.title}\n${link.shortUrl}\nviews ${link.views || 0} · unlocks ${link.unlocks || 0} · $${earned}`;
    });
    await ctx.reply(lines.join('\n\n'));
  } catch (err) {
    await ctx.reply(`Stats failed: ${apiError(err)}`);
  }
});

bot.on('message', async (ctx) => {
  const text = (ctx.message && (ctx.message.text || ctx.message.caption)) || '';
  if (text.startsWith('/')) return;

  const url = extractUrl(text);
  if (!url) {
    if (ctx.chat && ctx.chat.type === 'private') {
      await ctx.reply('Send a destination URL, or use the buttons.', startKeyboard());
    }
    return;
  }

  if (!isAdmin(ctx.from.id)) {
    return ctx.reply('You are not allowed to create links with this bot.');
  }

  const wait = remainingCooldown(ctx.from.id);
  if (wait > 0) {
    return ctx.reply(`Slow down. Try again in ${Math.ceil(wait / 1000)}s.`);
  }

  const extra = text.replace(url, '').trim();
  const title = titleFrom(url, extra);
  const status = await ctx.reply('Creating Linktain link…');
  cooldowns.set(String(ctx.from.id), Date.now());

  try {
    const created = await createLink(url, title);
    const shortUrl = created.shortUrl;
    if (!shortUrl) throw new Error('Linktain returned no shortUrl');
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      status.message_id,
      undefined,
      [`${title}`, '', shortUrl].join('\n')
    );
  } catch (err) {
    console.error('[linktain]', apiError(err));
    await ctx.telegram
      .editMessageText(
        ctx.chat.id,
        status.message_id,
        undefined,
        `Failed: ${apiError(err)}`
      )
      .catch(() => {});
  }
});

http
  .createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
  })
  .listen(port, () => console.log(`healthcheck on :${port}`));

bot.launch()
  .then(() => console.log('linktain-post-bot running'))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
