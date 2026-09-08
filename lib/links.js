'use strict';

// Pure helpers, kept out of bot.js so they can be unit tested without
// starting a Telegram connection.

function httpUrl(value) {
  try {
    const parsed = new URL(String(value || '').trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.href;
  } catch {
    return null;
  }
}

function parseAdminIds(raw) {
  return new Set(
    String(raw || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

function isAdmin(adminIds, userId) {
  if (userId === undefined || userId === null) return false;
  if (!adminIds.size) return true;
  return adminIds.has(String(userId));
}

function tutorialLink({ tutorialUrl, tutorialChatId }) {
  const direct = httpUrl(tutorialUrl);
  if (direct) return direct;
  const raw = String(tutorialChatId || '').replace(/^-100/, '');
  return raw ? `https://t.me/c/${raw}` : 'https://t.me';
}

// Keyboard layout: Tutorial and Discord share the top row, VIP sits full-width
// underneath. Telegram rejects the entire keyboard if any url button is
// malformed, so a bad env value drops one button rather than breaking the post;
// a row left empty by that filtering is dropped too.
function buttonRows(config) {
  const rows = [
    [
      { label: config.tutorialLabel || 'Tutorial', url: tutorialLink(config) },
      { label: config.discordLabel || 'Discord', url: httpUrl(config.discordUrl) },
    ],
    [{ label: config.vipLabel || 'VIP', url: httpUrl(config.vipUrl) }],
  ];
  return rows
    .map((row) => row.filter((b) => Boolean(b.url)))
    .filter((row) => row.length > 0);
}

// Placeholders are substituted with split/join rather than String.replace so a
// '$&' in a title or url cannot be read as a replacement pattern.
function renderPost(template, { name, url }) {
  return String(template)
    .split('{name}')
    .join(String(name == null ? '' : name))
    .split('{url}')
    .join(String(url == null ? '' : url));
}

// One or more post targets, comma separated. Each entry is a chat id (@name for
// a public channel, -100... for a private one) with an optional ":<topicId>"
// suffix naming a forum topic inside a group.
function parsePostTargets(raw) {
  return String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const withTopic = entry.match(/^(.+):(\d+)$/);
      if (withTopic) {
        return { chatId: withTopic[1].trim(), threadId: Number(withTopic[2]), raw: entry };
      }
      return { chatId: entry, threadId: null, raw: entry };
    })
    .filter((t) => t.chatId.length > 0);
}

// Telegram caps photo captions at 1024 characters (plain messages get 4096),
// so a long title must be trimmed rather than rejected by the API.
function captionSafe(text, limit = 1024) {
  const str = String(text == null ? '' : text);
  if (str.length <= limit) return str;
  return str.slice(0, limit - 1) + '\u2026';
}

// A t.me permalink for a post, so the operator can jump straight to it.
// Public chats are addressed by @name, private ones by -100<internal id>; a
// post inside a forum topic carries the topic id as an extra path segment.
function channelPostLink(chatId, messageId, threadId) {
  const id = String(chatId || '').trim();
  if (!id || messageId == null) return null;
  const tail = threadId ? `${threadId}/${messageId}` : `${messageId}`;
  if (id.startsWith('@')) return `https://t.me/${id.slice(1)}/${tail}`;
  const numeric = id.match(/^-100(\d+)$/);
  if (numeric) return `https://t.me/c/${numeric[1]}/${tail}`;
  return null;
}

// Returns { url, raw }: the cleaned url is shorter than the raw match whenever
// trailing punctuation is stripped, and callers need the raw text to remove.
function extractUrl(text) {
  const match = String(text || '').match(/https?:\/\/[^\s<>"']+/i);
  if (!match) return null;
  const url = httpUrl(match[0].replace(/[),.\]]+$/, ''));
  if (!url) return null;
  return { url, raw: match[0] };
}

function titleFrom(url, extra) {
  const cleaned = String(extra || '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s()[\]<>"'\u2014-]+/, '')
    .replace(/[\s()[\]<>"'\u2014-]+$/, '')
    .trim();
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

function normalizeLinks(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.links)) return data.links;
  if (data && Array.isArray(data.data)) return data.data;
  return [];
}

function isCommand(text) {
  return /^\/[A-Za-z0-9_]+(@[A-Za-z0-9_]+)?(\s|$)/.test(String(text || ''));
}

function apiError(err, timeoutMs) {
  const body = err.response && err.response.data;
  if (body && body.error) return String(body.error);
  if (body && body.message) return String(body.message);
  if (err.response && err.response.status === 401) return 'Linktain API key rejected';
  if (err.response && err.response.status === 403) return 'Linktain account not allowed yet';
  if (err.code === 'ECONNABORTED') return `Linktain timed out after ${timeoutMs}ms`;
  return err.message || 'unknown error';
}

module.exports = {
  apiError,
  buttonRows,
  captionSafe,
  channelPostLink,
  renderPost,
  extractUrl,
  httpUrl,
  isAdmin,
  isCommand,
  millsToUsd,
  normalizeLinks,
  parseAdminIds,
  parsePostTargets,
  titleFrom,
  tutorialLink,
};
