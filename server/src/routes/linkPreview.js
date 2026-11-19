const express = require('express');
const https = require('node:https');
const http = require('node:http');
const dns = require('node:dns').promises;
const net = require('node:net');
const ipaddr = require('ipaddr.js');
const roomAccess = require('../middleware/roomAccess');
const router = express.Router();
const cache = new Map();
let active = 0;

async function preview(raw, signal) {
  const url = new URL(raw);
  if (!['https:', 'http:'].includes(url.protocol) || url.port || url.username || url.password) throw Error();
  const address = net.isIPv4(url.hostname) ? url.hostname : (await dns.resolve4(url.hostname))[0];
  if (!address || (ipaddr.parse(address).range() !== 'unicast' || ipaddr.parse(address).match(ipaddr.parseCIDR('198.18.0.0/15')))) throw Error();
  const transport = url.protocol === 'https:' ? https : http;
  const html = await new Promise((resolve, reject) => {
    const request = transport.get(url, {signal, agent: false, family: 4,
      lookup: (_host, opts, cb) => opts.all ? cb(null, [{address, family: 4}]) : cb(null, address, 4),
      headers: {Accept: 'text/html'}}, response => {
      if (response.statusCode !== 200 || !/^text\/html/i.test(response.headers['content-type'] || '')) {
        response.destroy(); reject(Error()); return;
      }
      const chunks = [];
      let size = 0;
      response.on('error', reject);
      response.on('data', chunk => {
        chunks.push(chunk.subarray(0, 131072 - size));
        size += chunk.length;
        if (size >= 131072) { resolve(Buffer.concat(chunks).toString()); response.destroy(); }
      });
      response.on('end', () => resolve(Buffer.concat(chunks).toString()));
    });
    request.on('error', reject);
  });
  const fields = {};
  for (const tag of html.match(/<meta\s+[^>]{1,4096}>/gi) || []) {
    const attrs = Object.fromEntries(Array.from(tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/gs), m => [m[1].toLowerCase(), m[3]]));
    fields[attrs.property || attrs.name] = attrs.content;
  }
  const clean = text => (text || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').slice(0, 320);
  const image = fields['og:image'] && new URL(fields['og:image'], url);
  return { title: clean(fields['og:title'] || html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]),
    description: clean(fields['og:description'] || fields.description),
    image: image?.origin === url.origin && !image.username && !image.password ? image.href : null };
}

router.get('/', roomAccess, async (req, res) => {
  const url = req.query.url;
  if (typeof url !== 'string' || url.length > 2048) return res.sendStatus(400);
  const item = cache.get(url);
  if (item && item.until > Date.now()) return res.json(item.data);
  if (active >= 8) return res.sendStatus(429);
  active++;
  try {
    const data = await preview(url, AbortSignal.timeout(4000));
    if (cache.size >= 256) cache.delete(cache.keys().next().value);
    cache.set(url, {data, until: Date.now() + 300000});
    res.json(data);
  } catch { res.json({}); } finally { active--; }
});
module.exports = router;
