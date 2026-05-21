import { BASE_URL } from './constants';

export async function toImageSrc(input) {
  const value = (input && typeof input.then === 'function') ? await input : input;
  if (!value) return '';
  if (typeof value === 'string') return value;
  const buf = Buffer.isBuffer(value) ? value : (value instanceof Uint8Array ? Buffer.from(value) : null);
  if (buf) return `data:image/png;base64,${buf.toString('base64')}`;
  return String(value);
}

export function cleanText(text) {
  if (!text) return '';
  return text.replace(/[\r\n\t]+/g, '').trim();
}

export function fixUrl(url) {
  if (!url) return null;
  if (url.startsWith('//')) return 'https:' + url;
  if (url.startsWith('/')) return BASE_URL + url;
  if (!url.startsWith('http')) return BASE_URL + '/' + url;
  return url;
}

export function compactUrlText(url) {
  if (!url) return '';
  const limit = 60;
  let text = String(url).trim();
  try {
    const parsed = new URL(text.startsWith('//') ? `https:${text}` : text);
    const host = parsed.hostname.replace(/^www\./, '');
    const path = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/$/, '');
    text = `${host}${path}`;
  } catch {
    text = text.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
  }
  return text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
}

export function extractImageUrl(node) {
  if (!node || !node.attribs) return null;
  const attrs = node.attribs;
  const candidates = [
    attrs['data-original'],
    attrs['data-lazy-src'],
    attrs['data-src'],
    attrs['src'],
  ].filter(Boolean);
  if (attrs['srcset']) {
    const first = String(attrs['srcset']).split(',')[0]?.trim().split(' ')[0];
    if (first) candidates.push(first);
  }
  if (attrs['style']) {
    const match = String(attrs['style']).match(/background-image:\s*url\((['"]?)([^'")]+)\1\)/i);
    if (match?.[2]) candidates.push(match[2]);
  }
  for (const candidate of candidates) {
    const url = fixUrl(String(candidate).trim());
    if (url) return url;
  }
  return null;
}

export function parseGalleryFromTable($, tableNode) {
  const items = [];
  $(tableNode).find('td').each((_, td) => {
    const imgNode = $(td).find('img').first()[0];
    if (!imgNode) return;
    const src = extractImageUrl(imgNode);
    if (!src) return;
    const caption =
      cleanText($(td).find('.figcaption, figcaption').first().text()) ||
      cleanText($(td).find('[class*="caption"]').first().text()) ||
      cleanText($(imgNode).attr('alt')) ||
      '';
    items.push({ src: fixUrl(src), caption });
  });
  return items;
}
