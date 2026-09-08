require('dotenv').config();

const http = require('http');
const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');

const {
  apiError: describeApiError,
  buttonRows,
  channelPostLink,
  extractUrl,
  isAdmin,
  isCommand,
  millsToUsd,
  normalizeLinks,
  parseAdminIds,
  renderPost,
  titleFrom,
} = require('./lib/links');

const {
  TELEGRAM_TOKEN,
  LINKTAIN_API_KEY,
  ADMIN_USER_IDS = '7739393155',
  VIP_URL = 'https://buy.stripe.com/28E5kE0hGc7n4a14Hn5AQ01',
  DISCORD_URL = 'https://discord.gg/bgnQtMeucK',
  TUTORIAL_URL = 'https://t.me/linktaintutorail',
  TUTORIAL_CHAT_ID = '-1003495156964',
  POST_CHAT_ID,
  POST_TEMPLATE = '\u{1F334} NAME: {name}\n\u{1F4E6} Mega: {url}',
  TUTORIAL_LABEL = '\u2139\uFE0F Tutorial',
  DISCORD_LABEL = '\u{1F4AC} Discord',
  VIP_LABEL = '\u2B50 VIP \u2B50',
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
const apiBase = LINKTAIN_API_URL.replace(/\/+$/, '');
const adminIds = parseAdminIds(ADMIN_USER_IDS);

// An explicitly blank ADMIN_USER_IDS overrides the default and opens link
// creation to anyone who can message the bot, spending our Linktain key.
if (!adminIds.size) {
  console.warn(
    'WARNING: ADMIN_USER_IDS is empty — anyone who can message this bot can create links on your Linktain account.'
  );
}

const buttonConfig = {
  tutorialUrl: TUTORIAL_URL,
  tutorialChatId: TUTORIAL_CHAT_ID,
  vipUrl: VIP_URL,
  discordUrl: DISCORD_URL,
  tutorialLabel: TUTORIAL_LABEL,
  discordLabel: DISCORD_LABEL,
  vipLabel: VIP_LABEL,
};

const postChatId = String(POST_CHAT_ID || '').trim();

// The same keyboard is used for /start and for the channel post, so the buttons
// people see in the channel are the ones the operator sees when testing.
function startKeyboard() {
  return Markup.inlineKeyboard(
    buttonRows(buttonConfig).map((row) => row.map((b) => Markup.button.url(b.label, b.url)))
  );
}

if (!postChatId) {
  console.warn(
    'POST_CHAT_ID is not set — created links are previewed back in the chat instead of posted to a channel.'
  );
}

function apiError(err) {
  return describeApiError(err, timeoutMs);
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

// Prune on write: without it this map grows for the life of the process.
function startCooldown(userId) {
  const now = Date.now();
  for (const [key, at] of cooldowns) {
    if (now - at >= cooldownMs) cooldowns.delete(key);
  }
  cooldowns.set(String(userId), now);
}

async function createLink(destinationUrl, title) {
  const { data } = await axios.post(
    `${apiBase}/links`,
    { title, destinationUrl },
    {
      headers: {
        Authorization: `Bearer ${LINKTAIN_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: timeoutMs,
    }
  );
  return data || {};
}

async function listLinks() {
  const { data } = await axios.get(`${apiBase}/links`, {
    headers: { Authorization: `Bearer ${LINKTAIN_API_KEY}` },
    timeout: timeoutMs,
  });
  return normalizeLinks(data);
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
  if (!isAdmin(adminIds, ctx.from && ctx.from.id)) return ctx.reply('Admins only.');
  try {
    const links = await listLinks();
    if (!links.length) return ctx.reply('No links on this Linktain account yet.');
    const lines = links.slice(0, 10).map((link, i) => {
      const earned = millsToUsd(link.earnedMills);
      const title = link.title || 'Untitled';
      const shortUrl = link.shortUrl || '(no short url)';
      return `${i + 1}. ${title}\n${shortUrl}\nviews ${link.views || 0} · unlocks ${link.unlocks || 0} · $${earned}`;
    });
    await ctx.reply(lines.join('\n\n'));
  } catch (err) {
    console.error('[stats]', apiError(err));
    await ctx.reply(`Stats failed: ${apiError(err)}`);
  }
});

bot.on('message', async (ctx) => {
  const text = (ctx.message && (ctx.message.text || ctx.message.caption)) || '';
  const isPrivate = Boolean(ctx.chat && ctx.chat.type === 'private');

  // Only skip real command syntax — a forwarded post can start with a slash
  // and still carry the URL we want.
  if (isCommand(text)) {
    if (isPrivate) await ctx.reply('Unknown command. Try /help.', startKeyboard());
    return;
  }

  const found = extractUrl(text);
  if (!found) {
    if (isPrivate) {
      await ctx.reply('Send a destination URL, or use the buttons.', startKeyboard());
    }
    return;
  }

  const userId = ctx.from && ctx.from.id;
  if (!isAdmin(adminIds, userId)) {
    // Quiet in groups: a refusal on every posted link is spam.
    if (isPrivate) await ctx.reply('You are not allowed to create links with this bot.');
    return;
  }

  const wait = remainingCooldown(userId);
  if (wait > 0) {
    return ctx.reply(`Slow down. Try again in ${Math.ceil(wait / 1000)}s.`);
  }

  const title = titleFrom(found.url, text.split(found.raw).join(' '));
  startCooldown(userId);

  let status;
  try {
    status = await ctx.reply('Creating Linktain link…');
  } catch (err) {
    console.error('[telegram]', err.message);
    return;
  }

  try {
    const created = await createLink(found.url, title);
    const shortUrl = created.shortUrl || (created.link && created.link.shortUrl);
    if (!shortUrl) throw new Error('Linktain returned no shortUrl');

    const postText = renderPost(POST_TEMPLATE, { name: title, url: shortUrl });

    if (!postChatId) {
      // No channel configured: show the operator exactly what would be posted.
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        status.message_id,
        undefined,
        postText,
        startKeyboard()
      );
      return;
    }

    let posted;
    try {
      posted = await ctx.telegram.sendMessage(postChatId, postText, startKeyboard());
    } catch (err) {
      // The link exists and must not be lost just because posting failed.
      console.error('[telegram] channel post failed:', apiError(err));
      await ctx.telegram
        .editMessageText(
          ctx.chat.id,
          status.message_id,
          undefined,
          [
            `Link created, but posting to ${postChatId} failed:`,
            apiError(err),
            '',
            'Is the bot an admin of that channel with permission to post?',
            '',
            shortUrl,
          ].join('\n')
        )
        .catch(() => {});
      return;
    }

    const permalink = channelPostLink(postChatId, posted.message_id);
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      status.message_id,
      undefined,
      ['Posted.', '', shortUrl, permalink].filter(Boolean).join('\n')
    );
  } catch (err) {
    console.error('[linktain]', apiError(err));
    // Don't hold a user in cooldown for our own failure.
    cooldowns.delete(String(userId));
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

bot.catch((err, ctx) => {
  console.error(`[bot] ${ctx && ctx.updateType} handler failed:`, err);
});

const health = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('ok');
});

health.on('error', (err) => {
  console.error('[health]', err.message);
  process.exit(1);
});

health.listen(port, () => console.log(`healthcheck on :${port}`));

let running = false;

// launch() settles only once polling stops, so the "started" log and the
// command registration have to run from the onLaunch callback, not .then().
bot
  .launch(() => {
    running = true;
    console.log('linktain-post-bot running');
    bot.telegram
      .setMyCommands([
        { command: 'start', description: 'Menu and buttons' },
        { command: 'help', description: 'How to use the bot' },
        { command: 'stats', description: 'Recent link totals' },
      ])
      .catch((err) => console.error('[telegram] setMyCommands:', err.message));
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

function shutdown(signal) {
  console.log(`shutting down (${signal})`);
  // stop() throws if the bot never finished launching.
  if (running) {
    try {
      bot.stop(signal);
    } catch (err) {
      console.error('[bot] stop:', err.message);
    }
    running = false;
  }
  health.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
