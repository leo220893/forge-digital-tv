#!/usr/bin/env node
/**
 * Valida catalog.json: estructura, IDs únicos y (opcional) alcance de las URLs.
 *
 *   node scripts/validate-catalog.mjs            → valida estructura
 *   node scripts/validate-catalog.mjs --check-urls → además prueba cada URL (HEAD/GET)
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK_URLS = process.argv.includes('--check-urls');
const TYPES = new Set(['hls', 'dash', 'mp4', 'webm', 'audio']);

const errors = [];
const warnings = [];

const fail = m => errors.push(m);
const warn = m => warnings.push(m);

const raw = await readFile(join(ROOT, 'catalog.json'), 'utf8');

let data;
try {
  data = JSON.parse(raw);
} catch (err) {
  console.error(`✖ catalog.json no es JSON válido: ${err.message}`);
  process.exit(1);
}

if (typeof data.brand !== 'string' || !data.brand) fail('Falta "brand".');
if (!Array.isArray(data.categories) || !data.categories.length) fail('"categories" debe ser un array no vacío.');

const catIds = new Set();
const chIds = new Set();
const urls = [];
let channelCount = 0;

for (const [ci, cat] of (data.categories || []).entries()) {
  const where = `categories[${ci}]`;
  if (!cat.id) fail(`${where}: falta "id".`);
  else if (catIds.has(cat.id)) fail(`${where}: id duplicado "${cat.id}".`);
  else catIds.add(cat.id);

  if (!cat.name) fail(`${where}: falta "name".`);
  if (!Array.isArray(cat.channels) || !cat.channels.length) {
    fail(`${where} ("${cat.id}"): "channels" debe ser un array no vacío.`);
    continue;
  }

  for (const [chi, ch] of cat.channels.entries()) {
    const w = `${where}.channels[${chi}]`;
    channelCount++;

    if (!ch.id) fail(`${w}: falta "id".`);
    else if (chIds.has(ch.id)) fail(`${w}: id duplicado "${ch.id}".`);
    else chIds.add(ch.id);

    if (!ch.name) fail(`${w}: falta "name".`);
    if (!ch.url) { fail(`${w} ("${ch.id}"): falta "url".`); continue; }

    let u;
    try { u = new URL(ch.url); } catch { fail(`${w} ("${ch.id}"): URL inválida.`); continue; }
    if (u.protocol !== 'https:') warn(`${w} ("${ch.id}"): usa ${u.protocol} — en HTTPS los navegadores bloquean contenido mixto.`);
    if (ch.type && !TYPES.has(String(ch.type).toLowerCase()))
      warn(`${w} ("${ch.id}"): type "${ch.type}" no reconocido (${[...TYPES].join(', ')}).`);
    if (!ch.description) warn(`${w} ("${ch.id}"): sin "description".`);

    urls.push({ id: ch.id, url: ch.url });
  }
}

if (CHECK_URLS) {
  console.log(`→ Probando ${urls.length} URLs…\n`);
  await Promise.all(urls.map(async ({ id, url }) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    try {
      let res = await fetch(url, { method: 'HEAD', signal: ctrl.signal, redirect: 'follow' });
      if (res.status === 405 || res.status === 501) {
        res = await fetch(url, { method: 'GET', signal: ctrl.signal, headers: { Range: 'bytes=0-1024' } });
      }
      if (!res.ok) warn(`"${id}": respondió HTTP ${res.status}.`);
      else console.log(`  ✔ ${id} (${res.status})`);
    } catch (err) {
      warn(`"${id}": inalcanzable (${err.name === 'AbortError' ? 'timeout' : err.message}).`);
    } finally {
      clearTimeout(timer);
    }
  }));
  console.log('');
}

for (const w of warnings) console.warn(`⚠ ${w}`);
for (const e of errors)   console.error(`✖ ${e}`);

if (errors.length) {
  console.error(`\n✖ Validación fallida: ${errors.length} error(es), ${warnings.length} aviso(s).`);
  process.exit(1);
}

console.log(`✔ catalog.json válido — ${catIds.size} categorías, ${channelCount} canales, ${warnings.length} aviso(s).`);
