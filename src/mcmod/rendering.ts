import { BASE_URL } from './constants';
import { fetchWithTimeout, getImageHeaders } from './http';

const fs = require('fs');
const path = require('path');

export let createCanvas;
export let loadImage;
let registerFont;
let RENDER_DEBUG = false;
let RENDER_TWEMOJI = true;
let RENDER_TWEMOJI_CDN = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72';
let RENDER_IMAGE_FETCH_WITH_HEADERS = true;
export let GLOBAL_FONT_FAMILY = 'sans-serif';

const imageBufferCache = new Map();
const twemojiImageCache = new Map();

export function configureRenderer(canvasService, config, logger) {
  RENDER_DEBUG = !!config?.debug;
  RENDER_TWEMOJI = config?.render?.emoji?.twemoji !== false;
  RENDER_TWEMOJI_CDN = String(config?.render?.emoji?.cdn || RENDER_TWEMOJI_CDN).replace(/\/+$/, '');
  RENDER_IMAGE_FETCH_WITH_HEADERS = config?.render?.image?.fetchWithHeaders !== false;

  if (!canvasService?.createCanvas || !canvasService?.loadImage) {
    logger.warn('缺少 @napi-rs/canvas，cnmc 指令图片功能已禁用。请在 Koishi 实例目录执行: npm i @napi-rs/canvas');
    return false;
  }

  createCanvas = (w, h) => {
    const width = Math.max(1, Number(w) || 1);
    const height = Math.max(1, Number(h) || 1);
    const canvas = canvasService.createCanvas(width, height);
    if (!canvas || typeof canvas.getContext !== 'function') {
      throw new Error('canvas 服务异常：Canvas 无效');
    }
    return canvas;
  };
  loadImage = canvasService.loadImage;
  registerFont = (fontPath, options) => {
    const family = options?.family || 'MCModFont';
    if (typeof canvasService.registerFont === 'function') {
      return canvasService.registerFont(fontPath, family);
    }
    return canvasService.GlobalFonts?.registerFromPath?.(fontPath, family);
  };

  initFont(config?.fontPath, logger, registerFont);
  try {
    const families = Array.from(canvasService?.GlobalFonts?.families || []);
    if (families.length) {
      const names = families.slice(0, 10).map((family: any) => String(family?.family || family?.name || family));
      logger.info(`[Font] 当前可用字体: ${names.join(', ')}`);
    }
  } catch {}

  return true;
}

export async function loadImageWithHeaders(url, referer = BASE_URL, timeout = 15000) {
  if (!url) throw new Error('empty image url');
  if (!RENDER_IMAGE_FETCH_WITH_HEADERS) return loadImage(url);
  const cacheKey = `${url}::${referer}`;
  const cached = imageBufferCache.get(cacheKey);
  if (cached) return loadImage(cached);

  const tried = [];
  const tryUrls = [url];
  const lower = String(url).toLowerCase();
  if (lower.includes('.webp') || lower.includes('format=webp')) {
    tryUrls.push(`https://wsrv.nl/?url=${encodeURIComponent(url)}&output=png`);
  }
  if (!tryUrls.some(candidate => candidate.includes('wsrv.nl'))) {
    tryUrls.push(`https://wsrv.nl/?url=${encodeURIComponent(url)}`);
  }

  let lastErr = null;
  for (const attemptUrl of tryUrls) {
    if (tried.includes(attemptUrl)) continue;
    tried.push(attemptUrl);
    for (let i = 0; i < 2; i++) {
      const fetchModes = [
        { name: 'direct', opts: { agent: false } },
        { name: 'default', opts: {} },
      ];
      for (const mode of fetchModes) {
        try {
          const res = await fetchWithTimeout(
            attemptUrl,
            { headers: getImageHeaders(attemptUrl, referer), ...(mode.opts as any) },
            timeout
          );
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const buf = await res.buffer();
          const img = await loadImage(buf);
          imageBufferCache.set(cacheKey, buf);
          return img;
        } catch (e) {
          lastErr = e;
          if (RENDER_DEBUG) console.warn(`[mcmod] image fail (${i + 1}/2, ${mode.name}): ${attemptUrl} -> ${e.message}`);
        }
      }
    }
  }
  throw lastErr || new Error('loadImageWithHeaders failed');
}

function emojiToTwemojiUrl(emoji) {
  const codepoints = [];
  for (const ch of Array.from(String(emoji || '')) as string[]) {
    const cp = ch.codePointAt(0);
    if (!cp) continue;
    if (cp === 0xfe0f) continue;
    codepoints.push(cp.toString(16));
  }
  if (!codepoints.length) return null;
  return `${RENDER_TWEMOJI_CDN}/${codepoints.join('-')}.png`;
}

async function loadTwemojiImage(emoji) {
  if (!RENDER_TWEMOJI) return null;
  const key = String(emoji || '');
  if (!key) return null;
  if (twemojiImageCache.has(key)) return twemojiImageCache.get(key);
  const promise = (async () => {
    const url = emojiToTwemojiUrl(key);
    if (!url) return null;
    try {
      return await loadImageWithHeaders(url, RENDER_TWEMOJI_CDN, 12000);
    } catch {
      return null;
    }
  })();
  twemojiImageCache.set(key, promise);
  return promise;
}

function splitTextUnits(text) {
  const emojiRegex = /\p{Extended_Pictographic}/u;
  const IntlAny = globalThis.Intl as any;
  const seg = IntlAny?.Segmenter ? new IntlAny.Segmenter('zh', { granularity: 'grapheme' }) : null;
  const graphemes = seg ? Array.from((seg as any).segment(String(text || '')), (s: any) => s.segment) : Array.from(String(text || ''));
  return graphemes.map((grapheme) => ({ type: emojiRegex.test(grapheme) ? 'emoji' : 'text', val: grapheme }));
}

export async function drawTextWithTwemoji(ctx, text, x, y, maxWidth, lineHeight, maxLines = 1000, draw = true) {
  if (!text) return y;
  const paragraphs = String(text).replace(/\r/g, '').split('\n');
  const emojiSize = Math.max(14, Math.floor(lineHeight * 0.9));
  let currentY = y;
  let lines = 0;

  const drawLine = async (units) => {
    let cx = x;
    for (const unit of units) {
      if (unit.type === 'emoji') {
        if (draw) {
          const img = await loadTwemojiImage(unit.val);
          if (img) ctx.drawImage(img, cx, currentY + Math.max(0, Math.floor((lineHeight - emojiSize) / 2)), emojiSize, emojiSize);
          else ctx.fillText(unit.val, cx, currentY);
        }
        cx += emojiSize;
      } else {
        if (draw) ctx.fillText(unit.val, cx, currentY);
        cx += ctx.measureText(unit.val).width;
      }
    }
    currentY += lineHeight;
    lines++;
  };

  for (const paragraph of paragraphs) {
    const units = splitTextUnits(paragraph);
    let line = [];
    let lineW = 0;
    for (const unit of units) {
      const w = unit.type === 'emoji' ? emojiSize : ctx.measureText(unit.val).width;
      if (lineW + w > maxWidth && line.length) {
        await drawLine(line);
        if (lines >= maxLines) return currentY;
        line = [];
        lineW = 0;
      }
      line.push(unit);
      lineW += w;
    }
    if (line.length) {
      await drawLine(line);
      if (lines >= maxLines) return currentY;
    } else {
      currentY += lineHeight;
      lines++;
    }
  }
  return currentY;
}

export function roundRect(ctx, x, y, w, h, r) {
  if (w < 2 * r) r = w / 2;
  if (h < 2 * r) r = h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 1000, draw = true) {
  if (!text) return y;
  const IntlAny = globalThis.Intl as any;
  const seg = IntlAny?.Segmenter ? new IntlAny.Segmenter('zh', { granularity: 'grapheme' }) : null;
  const splitGraphemes = (value) => {
    if (!value) return [];
    if (seg) return Array.from((seg as any).segment(value), (item: any) => item.segment);
    return Array.from(value);
  };
  const paragraphs = String(text).replace(/\r/g, '').split('\n');
  let linesCount = 0;
  let currentY = y;

  const flush = (line) => {
    if (draw && line) ctx.fillText(line, x, currentY);
    currentY += lineHeight;
    linesCount++;
  };

  for (const paragraph of paragraphs) {
    const tokens = paragraph.match(/https?:\/\/\S+|\s+|[^\s]/gu) || [];
    let line = '';
    for (const token of tokens) {
      const next = line + token;
      if (ctx.measureText(next).width <= maxWidth || !line) {
        line = next;
        continue;
      }

      flush(line.trimEnd());
      if (linesCount >= maxLines) return currentY;

      line = token.trimStart();
      while (line && ctx.measureText(line).width > maxWidth) {
        const glyphs = splitGraphemes(line);
        const head = glyphs.shift();
        let chunk = head || '';
        while (glyphs.length && ctx.measureText(chunk + glyphs[0]).width <= maxWidth) chunk += glyphs.shift();
        flush(chunk);
        if (linesCount >= maxLines) return currentY;
        line = glyphs.join('');
      }
    }
    if (line) {
      flush(line.trimEnd());
      if (linesCount >= maxLines) return currentY;
    } else {
      currentY += lineHeight;
    }
  }
  return currentY;
}

export function measureTableLayout(ctx, table, maxWidth, lineHeight, font, headerFont) {
  const rows = Array.isArray(table?.rows) ? table.rows : [];
  if (!rows.length) return null;
  const colCount = Math.max(...rows.map(row => row.length), 1);
  const padX = 10;
  const padY = 8;
  const minCol = 80;
  const maxCol = 320;
  const colWidths = Array(colCount).fill(minCol);

  for (let col = 0; col < colCount; col++) {
    let maxW = minCol;
    rows.forEach((row, rowIndex) => {
      const text = String(row[col] ?? '');
      ctx.font = rowIndex === 0 ? headerFont : font;
      maxW = Math.max(maxW, Math.min(maxCol, ctx.measureText(text).width + padX * 2));
    });
    colWidths[col] = maxW;
  }

  const rawW = colWidths.reduce((sum, width) => sum + width, 0);
  if (rawW > maxWidth) {
    const scale = maxWidth / rawW;
    for (let i = 0; i < colWidths.length; i++) colWidths[i] = Math.max(60, Math.floor(colWidths[i] * scale));
  }

  const rowHeights = rows.map((row, rowIndex) => {
    let rowH = lineHeight + padY * 2;
    for (let col = 0; col < colCount; col++) {
      const text = String(row[col] ?? '');
      const colWidth = Math.max(20, colWidths[col] - padX * 2);
      ctx.font = rowIndex === 0 ? headerFont : font;
      const height = wrapText(ctx, text, 0, 0, colWidth, lineHeight, 1000, false);
      rowH = Math.max(rowH, height + padY * 2);
    }
    return rowH;
  });

  return {
    colWidths,
    rowHeights,
    totalW: colWidths.reduce((sum, width) => sum + width, 0),
    totalH: rowHeights.reduce((sum, height) => sum + height, 0),
    padX,
    padY,
  };
}

export function drawTable(ctx, table, x, y, maxWidth, lineHeight, font, headerFont, colors) {
  const layout = measureTableLayout(ctx, table, maxWidth, lineHeight, font, headerFont);
  if (!layout) return 0;
  const { colWidths, rowHeights, padX, padY } = layout;
  const rows = table.rows;
  let cy = y;
  for (let row = 0; row < rows.length; row++) {
    let cx = x;
    const rowHeight = rowHeights[row];
    for (let col = 0; col < colWidths.length; col++) {
      const colWidth = colWidths[col];
      ctx.fillStyle = row === 0 ? colors.headerBg : colors.cellBg;
      ctx.fillRect(cx, cy, colWidth, rowHeight);
      ctx.strokeStyle = colors.border;
      ctx.lineWidth = 1;
      ctx.strokeRect(cx, cy, colWidth, rowHeight);
      ctx.fillStyle = colors.text;
      ctx.font = row === 0 ? headerFont : font;
      wrapText(ctx, String(rows[row][col] ?? ''), cx + padX, cy + padY, colWidth - padX * 2, lineHeight, 1000, true);
      cx += colWidth;
    }
    cy += rowHeight;
  }
  return layout.totalH;
}

function initFont(preferredPath, logger, registerFontFn) {
  const fontName = 'MCModFont';
  const tryRegister = (filePath, source) => {
    if (!fs.existsSync(filePath)) return false;
    try {
      if (registerFontFn) {
        registerFontFn(filePath, { family: fontName });
        GLOBAL_FONT_FAMILY = fontName;
        logger.info(`[Font] 成功加载${source}: ${filePath}`);
        return true;
      }
    } catch (e) {}
    return false;
  };

  if (preferredPath) {
    const abs = path.isAbsolute(preferredPath) ? preferredPath : path.resolve(process.cwd(), preferredPath);
    if (tryRegister(abs, '配置字体')) return true;
  }

  const candidates = [
    'C:\\Windows\\Fonts\\msyh.ttc', 'C:\\Windows\\Fonts\\msyh.ttf', 'C:\\Windows\\Fonts\\simhei.ttf',
    'C:\\Windows\\Fonts\\seguiemj.ttf',
    '/usr/share/fonts/truetype/noto/NotoSansSC-Regular.otf', '/usr/share/fonts/noto/NotoSansSC-Regular.otf',
    '/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf', '/usr/share/fonts/noto/NotoColorEmoji.ttf',
    '/usr/share/fonts/wqy-zenhei/wqy-zenhei.ttc', '/System/Library/Fonts/PingFang.ttc',
    '/System/Library/Fonts/Apple Color Emoji.ttc',
  ];
  for (const candidate of candidates) {
    if (tryRegister(candidate, '系统字体')) return true;
  }
  return false;
}
