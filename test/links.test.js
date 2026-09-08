'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  apiError,
  buttonRows,
  channelPostLink,
  extractUrl,
  httpUrl,
  isAdmin,
  isCommand,
  millsToUsd,
  normalizeLinks,
  parseAdminIds,
  renderPost,
  titleFrom,
  tutorialLink,
} = require('../lib/links');

const config = {
  tutorialUrl: 'https://t.me/linktaintutorail',
  tutorialChatId: '-1003495156964',
  vipUrl: 'https://buy.stripe.com/28E5kE0hGc7n4a14Hn5AQ01',
  discordUrl: 'https://discord.gg/bgnQtMeucK',
  tutorialLabel: 'Tutorial',
  discordLabel: 'Discord',
  vipLabel: 'VIP',
};

test('httpUrl accepts http(s) and rejects anything else', () => {
  assert.equal(httpUrl('https://example.com/a'), 'https://example.com/a');
  assert.equal(httpUrl('  https://example.com/a  '), 'https://example.com/a');
  assert.equal(httpUrl('javascript:alert(1)'), null);
  assert.equal(httpUrl('ftp://example.com'), null);
  assert.equal(httpUrl('example.com'), null);
  assert.equal(httpUrl(''), null);
  assert.equal(httpUrl(undefined), null);
});

test('extractUrl strips trailing punctuation but reports the raw match', () => {
  const found = extractUrl('Check this (https://example.com/a).');
  assert.equal(found.url, 'https://example.com/a');
  assert.equal(found.raw, 'https://example.com/a).');
});

test('title does not inherit the punctuation the url match swallowed', () => {
  const text = 'Check this (https://example.com/a).';
  const found = extractUrl(text);
  assert.equal(titleFrom(found.url, text.split(found.raw).join(' ')), 'Check this');
});

test('extractUrl returns null when there is no usable url', () => {
  assert.equal(extractUrl('no link here'), null);
  assert.equal(extractUrl(''), null);
  assert.equal(extractUrl(undefined), null);
});

test('titleFrom falls back to the hostname', () => {
  assert.equal(titleFrom('https://www.example.com/a/b', ''), 'example.com');
  assert.equal(titleFrom('https://example.com', '   '), 'example.com');
  assert.equal(titleFrom('not a url', ''), 'Link');
});

test('titleFrom caps length at 120 characters', () => {
  assert.equal(titleFrom('https://example.com', 'x'.repeat(500)).length, 120);
});

test('isAdmin is open when unconfigured and closed for unknown users', () => {
  const open = parseAdminIds('');
  const locked = parseAdminIds(' 111 , 222 ,');
  assert.equal(isAdmin(open, 999), true);
  assert.equal(isAdmin(open, undefined), false, 'no user id is never an admin');
  assert.equal(isAdmin(locked, 111), true);
  assert.equal(isAdmin(locked, '222'), true);
  assert.equal(isAdmin(locked, 333), false);
  assert.equal(locked.size, 2);
});

test('the shipped default admin id is the only admin', () => {
  const shipped = parseAdminIds('7739393155');
  assert.equal(shipped.size, 1);
  assert.equal(isAdmin(shipped, 7739393155), true);
  assert.equal(isAdmin(shipped, '7739393155'), true);
  assert.equal(isAdmin(shipped, 12345), false);
  assert.equal(isAdmin(shipped, undefined), false);
});

test('isCommand matches only real command syntax', () => {
  assert.equal(isCommand('/start'), true);
  assert.equal(isCommand('/stats@linktain_bot'), true);
  assert.equal(isCommand('/help me'), true);
  assert.equal(isCommand('/'), false);
  assert.equal(isCommand('and/or https://example.com'), false);
  assert.equal(isCommand('/path/to https://example.com'), false);
});

test('millsToUsd converts thousandths of a dollar', () => {
  assert.equal(millsToUsd(12345), '12.35');
  assert.equal(millsToUsd(0), '0.00');
  assert.equal(millsToUsd(undefined), '0.00');
});

test('normalizeLinks handles every shape the API might return', () => {
  assert.deepEqual(normalizeLinks({ links: [1] }), [1]);
  assert.deepEqual(normalizeLinks([1, 2]), [1, 2]);
  assert.deepEqual(normalizeLinks({ data: [3] }), [3]);
  assert.deepEqual(normalizeLinks(null), []);
  assert.deepEqual(normalizeLinks({ links: 'nope' }), []);
});

test('tutorialLink prefers the public invite over the private chat id', () => {
  assert.equal(tutorialLink(config), 'https://t.me/linktaintutorail');
  assert.equal(
    tutorialLink({ tutorialUrl: '', tutorialChatId: '-1003495156964' }),
    'https://t.me/c/3495156964'
  );
  assert.equal(tutorialLink({}), 'https://t.me');
});

test('buttonRows puts Tutorial and Discord side by side with VIP underneath', () => {
  assert.deepEqual(buttonRows(config), [
    [
      { label: 'Tutorial', url: 'https://t.me/linktaintutorail' },
      { label: 'Discord', url: 'https://discord.gg/bgnQtMeucK' },
    ],
    [{ label: 'VIP', url: 'https://buy.stripe.com/28E5kE0hGc7n4a14Hn5AQ01' }],
  ]);
});

test('buttonRows drops a malformed url without breaking the keyboard', () => {
  const rows = buttonRows({ ...config, discordUrl: 'not-a-url' });
  assert.deepEqual(
    rows.map((r) => r.map((b) => b.label)),
    [['Tutorial'], ['VIP']]
  );
});

test('buttonRows drops a row that ends up empty', () => {
  const rows = buttonRows({ ...config, vipUrl: 'javascript:alert(1)' });
  assert.deepEqual(
    rows.map((r) => r.map((b) => b.label)),
    [['Tutorial', 'Discord']]
  );
});

test('renderPost fills the template', () => {
  assert.equal(
    renderPost('\u{1F334} NAME: {name}\n\u{1F4E6} Mega: {url}', {
      name: 'Vixenp',
      url: 'https://lktn.co/abc',
    }),
    '\u{1F334} NAME: Vixenp\n\u{1F4E6} Mega: https://lktn.co/abc'
  );
});

test('renderPost does not treat $& in a value as a replacement pattern', () => {
  assert.equal(renderPost('{name}|{url}', { name: 'a$&b', url: 'https://x.test/$`' }), 'a$&b|https://x.test/$`');
});

test('renderPost tolerates missing values', () => {
  assert.equal(renderPost('{name}|{url}', {}), '|');
});

test('channelPostLink builds permalinks for public and private channels', () => {
  assert.equal(channelPostLink('@mychannel', 42), 'https://t.me/mychannel/42');
  assert.equal(channelPostLink('-1003495156964', 42), 'https://t.me/c/3495156964/42');
  assert.equal(channelPostLink('', 42), null);
  assert.equal(channelPostLink('-1003495156964', null), null);
  assert.equal(channelPostLink('not-an-id', 42), null);
});

test('apiError prefers the API message and names timeouts', () => {
  assert.equal(apiError({ response: { data: { error: 'bad input' } } }, 20000), 'bad input');
  assert.equal(apiError({ response: { data: { message: 'nope' } } }, 20000), 'nope');
  assert.equal(apiError({ response: { status: 401, data: {} } }, 20000), 'Linktain API key rejected');
  assert.equal(apiError({ response: { status: 403, data: {} } }, 20000), 'Linktain account not allowed yet');
  assert.equal(apiError({ code: 'ECONNABORTED' }, 20000), 'Linktain timed out after 20000ms');
  assert.equal(apiError({}, 20000), 'unknown error');
});
