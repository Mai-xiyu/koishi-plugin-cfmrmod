const { Schema, h } = require('koishi');
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const { marked } = require('marked');
let createCanvas;
let loadImage;
let Path2DRef;
let registerFont;
let globalFontsRef;
let configuredFontPath = '';
let fontsChecked = false;
let warnLog = (msg) => console.warn(msg);
let RENDER_DEBUG = false;
let RENDER_IMAGE_FETCH_WITH_HEADERS = true;

async function toImageSrc(input) {
  const value = (input && typeof input.then === 'function') ? await input : input;
  if (!value) return '';
  if (typeof value === 'string') return value;
  const buf = Buffer.isBuffer(value) ? value : (value instanceof Uint8Array ? Buffer.from(value) : null);
  if (buf) return `data:image/png;base64,${buf.toString('base64')}`;
  return String(value);
}
const CF_LOADER_MAP = {
  1: 'Forge',
  2: 'Cauldron',
  3: 'LiteLoader',
  4: 'Fabric',
  5: 'Quilt',
  6: 'NeoForge'
};
const CF_LOGO_SVG = `
<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <path d="M7.766 6.844l-.953.375c-.328.14-.547.453-.547.812v6.922c0 2.25 1.125 4.313 3 5.516l.266.172v5.03c0 .36-.203.688-.532.86l-2.67 1.484c-.36.203-.814.156-1.126-.11l-3.344-2.812c-.22-.188-.344-.453-.344-.734V12.78c0-1.89 1.063-3.625 2.766-4.5l3.484-1.437z" fill="#f16436"/>
  <path d="M29.11 9.36l-3.328 2.812c-.313.265-.766.312-1.125.11l-2.672-1.485c-.328-.172-.53-.5-.53-.86v-5.03c1.875-1.203 3-3.266 3-5.516V.812c0-.36-.22-.672-.548-.813L20.423-.375c-1.687-.672-3.61.125-4.28 1.78l-1.048 2.548 4.797 2.656 2.156-1.078 2.734 1.516v6.203l4.625 2.578v10.53c0 .282-.125.548-.344.735z" fill="#f16436" transform="rotate(180 22.25 11.234)"/>
  <path d="M28.016 26.61l-10.75-5.97-1.39 1.11c-.516.406-1.235.406-1.75 0l-1.39-1.11-10.75 5.97c-.61.328-1.094.86-1.344 1.5l-.64 1.703c-.235.625.046 1.328.625 1.563l.625.265c.344.14.734.094 1.047-.14l11.5-8.626c.72-.547 1.703-.547 2.422 0l11.5 8.625c.313.234.703.28 1.047.14l.625-.265c.58-.235.86-.938.625-1.563l-.64-1.703c-.25-.64-.735-1.172-1.345-1.5z" fill="#f16436"/>
</svg>`;
const MR_LOGO_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" xml:space="preserve" fill-rule="evenodd" stroke-linejoin="round" stroke-miterlimit="2" clip-rule="evenodd" viewBox="0 0 3307 593">
<path fill="#2d3436" fill-rule="nonzero" d="M1053.02 205.51c35.59 0 64.27 10.1 84.98 30.81 20.72 21.25 31.34 52.05 31.34 93.48v162.53h-66.4V338.3c0-24.96-5.3-43.55-16.46-56.3-11.15-12.22-26.55-18.6-47.27-18.6-22.3 0-40.37 7.45-53.65 21.79-13.27 14.87-20.18 36.11-20.18 63.2v143.94h-66.4V338.3c0-24.96-5.3-43.55-16.46-56.3-11.15-12.22-26.56-18.6-47.27-18.6-22.84 0-40.37 7.45-53.65 21.79-13.27 14.34-20.18 35.58-20.18 63.2v143.94h-66.4V208.7h63.21v36.12c10.63-12.75 23.9-22.3 39.84-29.21 15.93-6.9 33.46-10.1 53.11-10.1 21.25 0 40.37 3.72 56.84 11.69 16.46 8.5 29.21 20.18 38.77 35.59 11.69-14.88 26.56-26.56 45.15-35.06 18.59-7.97 38.77-12.22 61.08-12.22Zm329.84 290.54c-28.68 0-54.7-6.37-77.54-18.59a133.19 133.19 0 0 1-53.65-52.05c-13.28-21.78-19.65-46.74-19.65-74.9 0-28.14 6.37-53.1 19.65-74.88a135.4 135.4 0 0 1 53.65-51.53c22.84-12.21 48.86-18.59 77.54-18.59 29.22 0 55.24 6.38 78.08 18.6 22.84 12.21 40.9 29.74 54.18 51.52 12.75 21.77 19.12 46.74 19.12 74.89s-6.37 53.11-19.12 74.89c-13.28 22.3-31.34 39.83-54.18 52.05-22.84 12.22-48.86 18.6-78.08 18.6Zm0-56.83c24.44 0 44.62-7.97 60.55-24.43 15.94-16.47 23.9-37.72 23.9-64.27 0-26.56-7.96-47.8-23.9-64.27-15.93-16.47-36.11-24.43-60.55-24.43-24.43 0-44.61 7.96-60.02 24.43-15.93 16.46-23.9 37.71-23.9 64.27 0 26.55 7.97 47.8 23.9 64.27 15.4 16.46 35.6 24.43 60.02 24.43Zm491.32-341v394.11h-63.74v-36.65a108.02 108.02 0 0 1-40.37 30.28c-16.46 6.9-34 10.1-53.65 10.1-27.08 0-51.52-5.85-73.3-18.07-21.77-12.21-39.3-29.21-51.52-51.52-12.21-21.78-18.59-47.27-18.59-75.95s6.38-54.18 18.6-75.96c12.21-21.77 29.74-38.77 51.52-50.99 21.77-12.21 46.2-18.06 73.3-18.06 18.59 0 36.11 3.2 51.52 9.56a106.35 106.35 0 0 1 39.83 28.69V98.22h66.4Zm-149.79 341c15.94 0 30.28-3.72 43.03-11.16 12.74-6.9 22.83-17.52 30.27-30.8 7.44-13.28 11.15-29.21 11.15-46.74s-3.71-33.46-11.15-46.74c-7.44-13.28-17.53-23.9-30.27-31.34-12.75-6.9-27.1-10.62-43.03-10.62s-30.27 3.71-43.02 10.62c-12.75 7.43-22.84 18.06-30.28 31.34-7.43 13.28-11.15 29.2-11.15 46.74 0 17.53 3.72 33.46 11.15 46.74 7.44 13.28 17.53 23.9 30.28 30.8 12.75 7.44 27.09 11.16 43.02 11.16Zm298.51-189.09c19.12-29.74 52.58-44.62 100.92-44.62v63.21a84.29 84.29 0 0 0-15.4-1.6c-26.03 0-46.22 7.44-60.56 22.32-14.34 15.4-21.78 37.18-21.78 65.33v137.56h-66.39V208.7h63.2v41.43Zm155.63-41.43h66.39v283.63h-66.4V208.7Zm33.46-46.74c-12.22 0-22.31-3.72-30.28-11.68a37.36 37.36 0 0 1-12.21-28.16c0-11.15 4.25-20.71 12.21-28.68 7.97-7.43 18.06-11.15 30.28-11.15 12.21 0 22.3 3.72 30.27 10.62 7.97 7.44 12.22 16.47 12.22 27.62 0 11.69-3.72 21.25-11.69 29.21-7.96 7.97-18.59 12.22-30.8 12.22Zm279.38 43.55c35.59 0 64.27 10.63 86.05 31.34 21.78 20.72 32.4 52.05 32.4 92.95v162.53h-66.4V338.3c0-24.96-5.84-43.55-17.52-56.3-11.69-12.22-28.15-18.6-49.93-18.6-24.43 0-43.55 7.45-57.9 21.79-14.34 14.87-21.24 36.11-21.24 63.73v143.41h-66.4V208.7h63.21v36.65c11.16-13.28 24.97-22.84 41.43-29.74 16.47-6.9 35.59-10.1 56.3-10.1Zm371.81 271.42a78.34 78.34 0 0 1-28.15 14.34 130.83 130.83 0 0 1-35.6 4.78c-31.33 0-55.23-7.97-72.23-24.43-17-16.47-25.5-39.84-25.5-71.17V263.94h-46.73v-53.11h46.74v-64.8h66.4v64.8h75.95v53.11h-75.96v134.91c0 13.81 3.19 24.43 10.1 31.34 6.9 7.44 16.46 11.15 29.2 11.15 14.88 0 27.1-3.71 37.19-11.68l18.59 47.27Zm214.05-271.42c35.59 0 64.27 10.63 86.05 31.34 21.77 20.72 32.4 52.05 32.4 92.95v162.53h-66.4V338.3c0-24.96-5.84-43.55-17.53-56.3-11.68-12.22-28.15-18.6-49.92-18.6-24.44 0-43.56 7.45-57.9 21.79-14.34 14.87-21.24 36.11-21.24 63.73v143.41h-66.4V98.23h66.4v143.4c11.15-11.68 24.43-20.71 40.9-27.09 15.93-5.84 33.99-9.03 53.64-9.03Z"></path>
<g fill="#1bd96a"><path d="m29 424.4 188.2-112.95-17.15-45.48 53.75-55.21 67.93-14.64 19.67 24.21-31.32 31.72-27.3 8.6-19.52 20.05 9.56 26.6 19.4 20.6 27.36-7.28 19.47-21.38 42.51-13.47 12.67 28.5-43.87 53.78-73.5 23.27-32.97-36.7L55.06 467.94C46.1 456.41 35.67 440.08 29 424.4Zm543.03-230.25-149.5 40.32c8.24 21.92 10.95 34.8 13.23 49l149.23-40.26c-2.38-15.94-6.65-32.17-12.96-49.06Z"></path>
<path d="M51.28 316.13c10.59 125 115.54 223.3 243.27 223.3 96.51 0 180.02-56.12 219.63-137.46l48.61 16.83c-46.78 101.34-149.35 171.75-268.24 171.75C138.6 590.55 10.71 469.38 0 316.13h51.28ZM.78 265.24C15.86 116.36 141.73 0 294.56 0c162.97 0 295.28 132.31 295.28 295.28 0 26.14-3.4 51.49-9.8 75.63l-48.48-16.78a244.28 244.28 0 0 0 7.15-58.85c0-134.75-109.4-244.15-244.15-244.15-124.58 0-227.49 93.5-242.32 214.11H.8Z" class="ring--large ring"></path>
<path d="M293.77 153.17c-78.49.07-142.2 63.83-142.2 142.34 0 78.56 63.79 142.34 142.35 142.34 3.98 0 7.93-.16 11.83-.49l14.22 49.76a194.65 194.65 0 0 1-26.05 1.74c-106.72 0-193.36-86.64-193.36-193.35 0-106.72 86.64-193.35 193.36-193.35 2.64 0 5.28.05 7.9.16l-8.05 50.85Zm58.2-42.13c78.39 24.67 135.3 97.98 135.3 184.47 0 80.07-48.77 148.83-118.2 178.18l-14.17-49.55c48.08-22.85 81.36-71.89 81.36-128.63 0-60.99-38.44-113.07-92.39-133.32l8.1-51.15Z" class="ring--small ring"></path></g></svg>`;
export const name = 'minecraft-project-search';

// ================= 配置定义 =================
export const Config = Schema.object({
  pageSize: Schema.number().default(10).description('每页显示数量'),
  cacheTtl: Schema.number().default(5 * 60 * 1000).description('缓存有效期(ms)'),
  requestTimeout: Schema.number().default(15000).description('请求超时(ms)'),
  sendLink: Schema.boolean().default(true).description('发送卡片后是否附带链接'),
  fontPath: Schema.string().role('path').description('可选：自定义字体文件路径'),
  debug: Schema.boolean().default(false).description('输出渲染调试日志'),
  render: Schema.object({
    emoji: Schema.object({
      twemoji: Schema.boolean().default(true).description('启用 Twemoji 图形兜底（预留）'),
      cdn: Schema.string().default('https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72').description('Twemoji CDN 前缀（预留）')
    }).default({}),
    image: Schema.object({
      fetchWithHeaders: Schema.boolean().default(true).description('图片先用 HTTP(带 Referer)抓取后解码')
    }).default({})
  }).default({})
});

// ================= 常量定义 =================
const MR_BASE = 'https://api.modrinth.com/v2';
const CF_BASE = 'https://api.curseforge.com/v1';
const CF_MIRROR_BASE = 'https://api.curse.tools/v1/cf';

const CF_CLASS_MAP = { mod: 6, pack: 4471, resource: 12, world: 17, plugin: 5, shader: 6552, datapack: 6945 };
const MR_FACET_MAP = {
  mod: 'project_type:mod', pack: 'project_type:modpack', resource: 'project_type:resourcepack',
  shader: 'categories:shader', plugin: 'categories:bukkit', datapack: 'categories:datapack'
};
const TYPE_LABELS = {
  mod: 'Mod', pack: 'Modpack', resource: 'Resource Pack', shader: 'Shader',
  plugin: 'Plugin', datapack: 'Datapack', world: 'World', author: 'Author'
};

// ================= 辅助工具 (Canvas & Utils) =================
let GLOBAL_FONT_FAMILY = 'sans-serif';

// 颜色定义 (Modrinth Light Theme)
function ensureFontsReady() {
  if (fontsChecked) return;
  fontsChecked = true;

  try {
    const families = Array.from(globalFontsRef?.families || []);
    if (families.length > 0) {
      GLOBAL_FONT_FAMILY = String(families[0]);
      warnLog(`[Font] 当前可用字体: ${families.slice(0, 8).join(', ')}`);
      return;
    }
  } catch {}

  const candidates = [];
  if (configuredFontPath) {
    candidates.push(configuredFontPath);
  }
  candidates.push(
    'C:\\Windows\\Fonts\\msyh.ttc',
    'C:\\Windows\\Fonts\\msyh.ttf',
    'C:\\Windows\\Fonts\\simhei.ttf',
    'C:\\Windows\\Fonts\\seguiemj.ttf',
    '/usr/share/fonts/truetype/noto/NotoSansSC-Regular.otf',
    '/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf',
    '/usr/share/fonts/noto/NotoSansSC-Regular.otf',
    '/usr/share/fonts/noto/NotoColorEmoji.ttf',
    '/usr/share/fonts/wqy-zenhei/wqy-zenhei.ttc',
    '/System/Library/Fonts/PingFang.ttc',
    '/System/Library/Fonts/Apple Color Emoji.ttc'
  );

  for (const filePath of candidates) {
    if (!filePath) continue;
    try {
      const family = 'CFMRModFont';
      registerFont(filePath, { family });
      GLOBAL_FONT_FAMILY = family;
      warnLog(`[Font] 已注册字体: ${filePath}`);
      return;
    } catch {}
  }

  warnLog('[Font] 未检测到可用字体，继续使用系统默认字体。');
}

const COLORS = {
  bg: '#ffffff',
  textMain: '#131c20', // text-contrast
  textSec: '#6e6e6e', // text-secondary
  divider: '#e2e2e2',
  badgeBg: '#e8e8e8', // button-bg
  badgeText: '#131c20',
  link: '#1bd96a', // primary (Modrinth Green)
  cardBg: '#ffffff',
  accent: '#1bd96a'
};

function roundRect(ctx, x, y, w, h, r) {
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

// 文本换行计算
function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 1000, draw = true) {
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
      if (linesCount >= maxLines) {
        if (draw) ctx.fillText('...', x, currentY - lineHeight);
        return currentY;
      }

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
    }
  }

  return currentY;
}

function measureTableLayout(ctx, table, maxWidth, lineHeight, font, headerFont) {
  const rows = Array.isArray(table?.rows) ? table.rows : [];
  if (!rows.length) return null;
  const colCount = Math.max(...rows.map(r => r.length), 1);
  const padX = 10;
  const padY = 8;
  const minCol = 80;
  const maxCol = 320;
  const colWidths = Array(colCount).fill(minCol);

  for (let c = 0; c < colCount; c++) {
    let maxW = minCol;
    rows.forEach((row, rIdx) => {
      const text = String(row[c] ?? '');
      ctx.font = rIdx === 0 ? headerFont : font;
      maxW = Math.max(maxW, Math.min(maxCol, ctx.measureText(text).width + padX * 2));
    });
    colWidths[c] = maxW;
  }

  const rawW = colWidths.reduce((a, b) => a + b, 0);
  if (rawW > maxWidth) {
    const scale = maxWidth / rawW;
    for (let i = 0; i < colWidths.length; i++) colWidths[i] = Math.max(60, Math.floor(colWidths[i] * scale));
  }

  const rowHeights = rows.map((row, rIdx) => {
    let rowH = lineHeight + padY * 2;
    for (let c = 0; c < colCount; c++) {
      const text = String(row[c] ?? '');
      const cw = Math.max(20, colWidths[c] - padX * 2);
      ctx.font = rIdx === 0 ? headerFont : font;
      const h = wrapText(ctx, text, 0, 0, cw, lineHeight, 1000, false);
      rowH = Math.max(rowH, h + padY * 2);
    }
    return rowH;
  });

  return {
    colWidths,
    rowHeights,
    totalW: colWidths.reduce((a, b) => a + b, 0),
    totalH: rowHeights.reduce((a, b) => a + b, 0),
    padX,
    padY
  };
}

function drawTable(ctx, table, x, y, maxWidth, lineHeight, font, headerFont, colors) {
  const layout = measureTableLayout(ctx, table, maxWidth, lineHeight, font, headerFont);
  if (!layout) return 0;
  const { colWidths, rowHeights, totalW, padX, padY } = layout;
  const rows = table.rows;
  let cy = y;

  for (let r = 0; r < rows.length; r++) {
    let cx = x;
    const rh = rowHeights[r];
    for (let c = 0; c < colWidths.length; c++) {
      const cw = colWidths[c];
      ctx.fillStyle = r === 0 ? colors.headerBg : colors.cellBg;
      ctx.fillRect(cx, cy, cw, rh);
      ctx.strokeStyle = colors.border;
      ctx.lineWidth = 1;
      ctx.strokeRect(cx, cy, cw, rh);
      ctx.fillStyle = colors.text;
      ctx.font = r === 0 ? headerFont : font;
      wrapText(ctx, String(rows[r][c] ?? ''), cx + padX, cy + padY, cw - padX * 2, lineHeight, 1000, true);
      cx += cw;
    }
    cy += rh;
  }

  return layout.totalH;
}

function formatNumber(num) {
  if (num === null || num === undefined) return '0';
  const n = Number(num) || 0;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace('.0','')}k`;
  return String(n);
}

function formatFileSize(bytes) {
  const n = Number(bytes) || 0;
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} MiB`;
  if (n >= 1024) return `${(n / 1024).toFixed(2)} KiB`;
  return `${n} B`;
}

function parseCompactNumber(text) {
  if (!text) return null;
  const raw = String(text).replace(/[,\s]/g, '').trim();
  const match = raw.match(/(\d+(?:\.\d+)?)([kKmM]?)/);
  if (!match) return null;
  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (unit === 'm') return Math.round(value * 1e6);
  if (unit === 'k') return Math.round(value * 1e3);
  return Math.round(value);
}

function fixUrl(url, base = '') {
  if (!url) return null;
  if (url.startsWith('//')) return `https:${url}`;
  if (url.startsWith('/')) return base ? `${base}${url}` : url;
  return url;
}

function extractImageUrl($, elem, base = '') {
  const attrs = [
    $(elem).attr('data-original'),
    $(elem).attr('data-lazy-src'),
    $(elem).attr('data-src'),
    $(elem).attr('src')
  ];
  const srcset = $(elem).attr('srcset');
  if (srcset) {
    const first = String(srcset).split(',')[0]?.trim().split(' ')[0];
    if (first) attrs.push(first);
  }
  const style = $(elem).attr('style');
  if (style) {
    const m = String(style).match(/background-image:\s*url\((['"]?)([^'")]+)\1\)/i);
    if (m?.[2]) attrs.push(m[2]);
  }
  for (const item of attrs) {
    const url = fixUrl(item, base);
    if (url) return url;
  }
  return null;
}

async function loadImageSafe(url, timeout = 15000, referer = '') {
  if (!url) return null;
  if (!RENDER_IMAGE_FETCH_WITH_HEADERS) return loadImage(url);
  const resolvedReferer = referer || (() => {
    try {
      const u = new URL(url);
      return `${u.protocol}//${u.host}/`;
    } catch {
      return 'https://www.curseforge.com/';
    }
  })();
  
  // 1. 尝试直接加载 (保留 User-Agent 以防万一，同时检查 res.ok)
  try {
    const res = await fetchWithTimeout(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': resolvedReferer
      }
    }, timeout);
    
    // 如果返回 404/403 等非 2xx 状态，直接抛出异常进入 catch
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    
    const buf = await res.buffer();
    return await loadImage(buf);
  } catch (bufferErr) {
    if (RENDER_DEBUG) warnLog(`[Image] 主加载失败: ${url} -> ${bufferErr.message}`);
    // 2. 加载失败 (如下载成功但 skia 无法解码 WebP)，尝试备用链接
    const tryUrls = []; // 清空之前的无效尝试
    
    if (url.includes('.webp')) {
      // 【关键修复】使用 wsrv.nl 代理将 WebP 转换为 PNG
      tryUrls.push(`https://wsrv.nl/?url=${encodeURIComponent(url)}&output=png`);
    } else {
       // 如果不是 webp 结尾，也尝试一下原链接 (应对网络波动)
       tryUrls.push(url);
    }

    let lastErr = bufferErr;
    for (const u of tryUrls) {
      try {
        // 备用链接也应当加 UA
        // 注意：loadImage(string) 内部通常会自动处理 fetch，但为了稳妥这里利用 skia 的远程加载能力
        // 或者也可以复用 fetchWithTimeout 下载 buffer，这里简化直接调 loadImage
        return await loadImage(u);
      } catch (e) {
        lastErr = e;
        warnLog(`[Image] 加载失败: ${u} -> ${e.message}`);
      }
    }
    // 如果都失败了，抛出异常（外部会捕获并绘制灰底）
    throw lastErr;
  }
}

// 简单的 Markdown 转 HTML 配置
marked.setOptions({ breaks: true, gfm: true });

// ================= 网络请求工具 =================

async function fetchWithTimeout(url, options = {}, timeout = 15000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

async function fetchJson(url, options = {}, timeout = 15000) {
  const res = await fetchWithTimeout(url, options, timeout);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

async function fetchCurseForgeHtml(url, timeout = 15000) {
  const res = await fetchWithTimeout(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    }
  }, timeout);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.text();
}

function getCurseForgeHeaders(apiKey) {
  if (!apiKey || !String(apiKey).trim()) {
    throw new Error('CurseForge API Key 不能为空，请在插件配置中填写 curseforgeApiKey');
  }
  return {
    'Accept': 'application/json',
    'x-api-key': String(apiKey).trim(),
  };
}

function extractFirstMarkdownImage(md = '') {
  const match = md.match(/!\[[^\]]*\]\(([^)]+)\)/);
  if (!match) return null;
  return match[1];
}

async function fetchModrinthPage(slug, timeout) {
  const url = `https://modrinth.com/mod/${slug}`;
  const res = await fetchWithTimeout(url, {}, timeout);
  const html = await res.text();
  const $ = cheerio.load(html);

  const icon = fixUrl(
    $('img[class*="avatar"]').first().attr('src') ||
    $('meta[property="og:image"]').attr('content'),
    'https://modrinth.com'
  );

  const overviewHtml = $('.markdown, article, .prose').first().html();
  return { icon, overviewHtml };
}

async function fetchCurseForgePage(url, timeout) {
  if (!url) return { icon: null, overviewHtml: null, baseUrl: null };
  const html = await fetchCurseForgeHtml(url, timeout);
  const $ = cheerio.load(html);

  const icon = fixUrl(
    $('img[class*="project-avatar"], img[class*="avatar"], img[alt][src*="thumbnail"]').first().attr('src') ||
    $('meta[property="og:image"]').attr('content'),
    'https://www.curseforge.com'
  );

  const overviewHtml = (
    $('.tab-content .description').first().html() ||
    $('.project-description').first().html() ||
    $('.description-content').first().html() ||
    $('.markdown').first().html()
  );

  return { icon, overviewHtml, baseUrl: 'https://www.curseforge.com' };
}

// ================= HTML 解析逻辑 =================
async function parseContentToNodes(htmlContent, maxWidth, baseUrl = '') {
  if (!htmlContent) return [];
  const $ = cheerio.load(htmlContent);
  const nodes = [];
  const BLOCK_TAGS = new Set(['p', 'div', 'section', 'article', 'blockquote', 'ul', 'ol', 'pre']);
  const SKIP_TAGS = new Set(['script', 'style', 'noscript', 'svg']);
  let buffer = '';
  let bufferTag = 'p';

  const normalizeText = (text) => String(text || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const pushTextNode = (text, tag = 'p') => {
    const normalized = normalizeText(text);
    if (!normalized) return;
    const last = nodes[nodes.length - 1];
    if (last?.type === 'text' && last.tag === tag && tag !== 'h') {
      last.val = `${last.val}\n${normalized}`;
      return;
    }
    nodes.push({ type: 'text', val: normalized, tag });
  };

  const flushBuffer = () => {
    if (!buffer) return;
    pushTextNode(buffer, bufferTag || 'p');
    buffer = '';
    bufferTag = 'p';
  };

  const appendBuffer = (text, tag = 'p') => {
    if (!text) return;
    if (buffer && bufferTag !== tag) flushBuffer();
    bufferTag = tag;
    buffer += text;
  };

  async function traverse(elem, preferredTag = 'p') {
    if (nodes.length > 160) return;
    if (!elem) return;

    if (elem.type === 'text') {
      appendBuffer(elem.data || '', preferredTag);
      return;
    }
    if (elem.type !== 'tag') return;

    const tagName = String(elem.tagName || elem.name || '').toLowerCase();
    if (!tagName || SKIP_TAGS.has(tagName)) return;

    if (tagName === 'img') {
      flushBuffer();
      const src = extractImageUrl($, elem, baseUrl);
      const alt = normalizeText($(elem).attr('alt') || '');
      const isEmojiLikeAlt = !!alt && /^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F|\p{Emoji}\u200D)+$/u.test(alt);
      const isEmojiLikeSrc = /emoji|smilies|twemoji|emot/i.test(src || '');
      if ((isEmojiLikeAlt || isEmojiLikeSrc) && alt) {
        appendBuffer(alt, preferredTag);
        return;
      }
      if (src) nodes.push({ type: 'img', src });
      return;
    }

    if (tagName === 'br') {
      appendBuffer('\n', preferredTag);
      return;
    }

    if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
      flushBuffer();
      pushTextNode($(elem).text(), 'h');
      return;
    }

    if (tagName === 'li') {
      flushBuffer();
      appendBuffer('', 'li');
      if (elem.children) {
        for (const child of elem.children) await traverse(child, 'li');
      }
      const text = normalizeText(buffer);
      buffer = '';
      bufferTag = 'p';
      if (text) nodes.push({ type: 'list-item', val: text });
      return;
    }

    if (tagName === 'table') {
      flushBuffer();
      const rows = [];
      $(elem).find('tr').each((_, tr) => {
        const row = [];
        $(tr).find('th,td').each((__, cell) => {
          row.push(normalizeText($(cell).text()));
        });
        if (row.some(Boolean)) rows.push(row);
      });
      if (rows.length) nodes.push({ type: 'table', rows });
      return;
    }

    if (tagName === 'a') {
      const linkText = normalizeText($(elem).text());
      const href = fixUrl($(elem).attr('href'), baseUrl);
      if (linkText) appendBuffer(linkText, preferredTag);
      if (href && (!linkText || !linkText.includes(href))) appendBuffer(` (${href})`, preferredTag);
      return;
    }

    if (tagName === 'td' || tagName === 'th') {
      appendBuffer(' ', preferredTag);
      if (elem.children) {
        for (const child of elem.children) await traverse(child, preferredTag);
      }
      appendBuffer(' | ', preferredTag);
      return;
    }

    const isBlock = BLOCK_TAGS.has(tagName);
    if (isBlock) flushBuffer();
    if (elem.children) {
      for (const child of elem.children) await traverse(child, preferredTag);
    }
    if (isBlock) flushBuffer();
  }

  const body = $('body').length ? $('body')[0] : $.root()[0];
  if (body.children) {
    for (const child of body.children) await traverse(child, 'p');
  }
  flushBuffer();

  await Promise.all(nodes.map(async (node) => {
    if (node.type === 'img') {
      try {
        const img = await loadImageSafe(node.src, 15000, baseUrl || 'https://www.curseforge.com/');
        node.imgObj = img;
        const scale = Math.min(maxWidth / img.width, 1);
        node.dw = img.width * scale;
        node.dh = img.height * scale;
      } catch (e) { node.error = true; }
    }
  }));
  return nodes;
}

// ================= 绘图核心 (Layout Engine) =================

// 文本翻译映射
const TRANSLATIONS = {
  zh: {
    compatibility: 'Compatibility',
    platforms: 'Platforms',
    environments: 'Supported environments',
    links: 'Links',
    creators: 'Creators',
    client: 'Client',
    server: 'Server',
    downloads: 'Downloads',
    updated: 'Updated',
    created: 'Created',
    license: 'License',
    published: 'Published'
  },
  en: {
    compatibility: 'Compatibility',
    platforms: 'Platforms',
    environments: 'Supported environments',
    links: 'Links',
    creators: 'Creators',
    client: 'Client',
    server: 'Server',
    downloads: 'Downloads',
    updated: 'Updated',
    created: 'Created',
    license: 'License',
    published: 'Published'
  }
};

const getTranslation = (lang, key) => TRANSLATIONS[lang || 'zh']?.[key] || TRANSLATIONS.zh[key];

export async function drawProjectCard(data) {
  ensureFontsReady();
  const margin = 24;
  const gap = 32;
  const font = GLOBAL_FONT_FAMILY;
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const maxCanvasHeight = data.maxCanvasHeight || 8000;
  const contentOnly = !!data._contentOnly;
  const lang = data._lang || 'zh';

  // 1. 预处理正文
  let rawBody = data.body;
  if (!rawBody && data.summary) rawBody = `<p>${data.summary}</p>`;
  if (!data.bodyIsHtml && data.source === 'Modrinth' && rawBody) rawBody = marked.parse(rawBody);

  // 2. 预计算高度
  const dummyC = createCanvas(200, 200);
  const dummy = dummyC.getContext('2d');

  // Sidebar 内容
  const sections = contentOnly ? [] : [
    { t: getTranslation(lang, 'compatibility'), d: (data.gameVersions || []).slice(0, 15), type: 'chips' },
    { t: getTranslation(lang, 'platforms'), d: data.loaders || [], type: 'chips' },
    { t: getTranslation(lang, 'environments'), d: [data.clientSide ? getTranslation(lang, 'client') : null, data.serverSide ? getTranslation(lang, 'server') : null].filter(Boolean), type: 'chips' },
    { t: getTranslation(lang, 'links'), d: data.links || [], type: 'links' },
    { t: getTranslation(lang, 'creators'), d: [data.author], type: 'text' }
  ];

  const measureChipsHeight = (items, maxWidth, ctx, fontSize = 13, padX = 16, rowH = 24, rowGap = 8) => {
    if (!items || !items.length) return 0;
    ctx.font = `600 ${fontSize}px "${font}"`;
    let x = 0;
    let rows = 1;
    items.forEach(item => {
      if (!item) return;
      const tw = ctx.measureText(item).width + padX;
      if (x + tw > maxWidth) {
        rows += 1;
        x = 0;
      }
      x += tw + 6;
    });
    return rows * rowH + (rows - 1) * rowGap;
  };

  const measureTextBlockHeight = (text, width, fontSize, isHeader) => {
    const lineHeight = Math.floor(fontSize * 1.6);
    dummy.font = `${isHeader ? '800' : 'normal'} ${fontSize}px "${font}"`;
    return wrapText(dummy, text || '', 0, 0, width, lineHeight, 10000, false);
  };

  // 自适应宽度计算
  const headerIconSize = 96;
  dummy.font = `800 28px "${font}"`;
  const titleWidth = Math.min(dummy.measureText(data.name || '').width + headerIconSize + 60, 900);

  let mainW = 620;
  // 首次解析，获取图片原始尺寸
  let contentNodes = data._contentNodes || await parseContentToNodes(rawBody, mainW, data.baseUrl || '');
  let maxImgW = 0;
  contentNodes.forEach(node => {
    if (node.type === 'img' && node.dw) maxImgW = Math.max(maxImgW, node.dw);
  });

  const computedMainW = clamp(Math.max(mainW, maxImgW, titleWidth), 520, 900);
  if (Math.abs(computedMainW - mainW) > 20 && !data._contentNodes) {
    mainW = computedMainW;
    // 宽度变化大，重新解析以适应图片缩放
    contentNodes = await parseContentToNodes(rawBody, mainW, data.baseUrl || '');
  } else {
    mainW = computedMainW;
  }

  // Sidebar 宽度估算
  let sidebarTextW = 0;
  dummy.font = `600 14px "${font}"`;
  sections.forEach(sec => {
    if (!sec.d || !sec.d.length) return;
    sidebarTextW = Math.max(sidebarTextW, dummy.measureText(sec.t).width);
    sec.d.forEach(item => {
      const text = typeof item === 'string' ? item : (item?.name || '');
      if (!text) return;
      sidebarTextW = Math.max(sidebarTextW, dummy.measureText(text).width);
    });
  });
  const infoLines = [
    data.license ? `License: ${data.license}` : null,
    data.updated ? `Updated: ${data.updated}` : null,
    data.created ? `Created: ${data.created}` : null
  ].filter(Boolean);
  infoLines.forEach(line => {
    sidebarTextW = Math.max(sidebarTextW, dummy.measureText(line).width);
  });

  const sidebarW = contentOnly ? 0 : clamp(sidebarTextW + 60, 220, 360);
  const width = margin * 2 + mainW + (contentOnly ? 0 : gap + sidebarW);

  // 计算 Header 高度
  const headerTextW = contentOnly ? mainW : (width - margin * 2 - headerIconSize - 24);
  let headerContentH = 0;
  dummy.font = `800 28px "${font}"`; // Title
  const titleH = wrapText(dummy, data.name || '', 0, 0, headerTextW, 32, 3, false);
  headerContentH += titleH + 6;
  dummy.font = `16px "${font}"`; // Desc
  const descH = wrapText(dummy, (data.summary || '').substring(0, 150), 0, 0, headerTextW, 24, 2, false);
  headerContentH += descH + 10;

  // Stats & Tags 行高度（按实际宽度计算是否换行）
  dummy.font = `600 15px "${font}"`;
  const dlText = formatNumber(data.downloads);
  const flText = formatNumber(data.follows);
  const statsWidth = 24 + dummy.measureText(dlText).width + 16 + 24 + dummy.measureText(flText).width + 24 + 24;
  const tags = (data.tags || []).slice(0, 3);
  const tagsRowH = measureChipsHeight(tags, Math.max(120, headerTextW - statsWidth), dummy, 13, 20, 26, 6);
  headerContentH += Math.max(26, tagsRowH); // Stats & Tags
  const headerH = contentOnly ? 0 : (Math.max(headerIconSize, headerContentH) + 20);

  // 计算 Sidebar 高度
  let sidebarH = 0;
  
  // 更准确的 Sidebar 估算
  sections.forEach(sec => {
    if (!sec.d || !sec.d.length) return;
    sidebarH += 30; // Title
    if (sec.type === 'chips') {
      const chipsH = measureChipsHeight(sec.d, sidebarW, dummy, 13, 16, 24, 8);
      sidebarH += chipsH + 10;
    } else {
      sidebarH += sec.d.length * 26 + 10;
    }
    sidebarH += 20; // Gap
  });
  const infoCount = contentOnly ? 0 : [data.license, data.updated, data.created].filter(Boolean).length;
  if (infoCount) {
    sidebarH += 30 + infoCount * 26 + 20;
  }

  // 计算 Main Content 高度（与绘制逻辑严格一致）
  let contentH = 0;
  for (const node of contentNodes) {
    if (node.type === 'text') {
      const isHeader = node.tag === 'h';
      const fontSize = isHeader ? 22 : 15;
      if (isHeader) contentH += 10;
      const h = measureTextBlockHeight(node.val, mainW, fontSize, isHeader);
      contentH += h + (isHeader ? 15 : 10);
      if (isHeader) contentH += 10; // 分割线间距
    } else if (node.type === 'list-item') {
      dummy.font = `500 15px "${font}"`;
      const bulletW = 24;
      const h = wrapText(dummy, node.val, 0, 0, Math.max(80, mainW - bulletW), 24, 10000, false);
      contentH += h + 10;
    } else if (node.type === 'table') {
      const tableH = measureTableLayout(
        dummy,
        node,
        mainW,
        22,
        `500 14px "${font}"`,
        `700 14px "${font}"`
      )?.totalH || 0;
      contentH += tableH + 20;
    } else if (node.type === 'img' && !node.error && node.imgObj) {
      let drawH = node.dh;
      if (drawH > 400) drawH = 400;
      contentH += drawH + 20;
    }
  }
  if (contentH < 200) contentH = 200;

  // 重新计算 TotalH，严格对齐绘制坐标
  // 绘制逻辑: margin -> headerH -> gap(10) -> divider -> gap(30) -> content -> gap(40) -> footer -> bottom
  const contentStartY = contentOnly ? margin : (margin + headerH + 10 + 30);
  const footerStartGap = contentOnly ? 20 : 40;
  // Footer 高度预留 (Logo + Text)
  const footerH = data.source === 'Modrinth' ? 80 : 40; 
  
  const safetyPad = 20;
  const totalH = contentStartY + Math.max(sidebarH, contentH) + footerStartGap + footerH + margin + safetyPad;

  // 若超出最大高度，分页渲染
  if (!data._noPaginate && !contentOnly && totalH > maxCanvasHeight) {
    const nodeHeights = [];
    for (const node of contentNodes) {
      if (node.type === 'text') {
        const isHeader = node.tag === 'h';
        const fontSize = isHeader ? 22 : 15;
        let h = 0;
        if (isHeader) h += 10;
        h += measureTextBlockHeight(node.val, mainW, fontSize, isHeader);
        h += (isHeader ? 15 : 10);
        if (isHeader) h += 10;
        nodeHeights.push(h);
      } else if (node.type === 'list-item') {
        dummy.font = `500 15px "${font}"`;
        const bulletW = 24;
        const h = wrapText(dummy, node.val, 0, 0, Math.max(80, mainW - bulletW), 24, 10000, false);
        nodeHeights.push(h + 10);
      } else if (node.type === 'table') {
        const tableH = measureTableLayout(
          dummy,
          node,
          mainW,
          22,
          `500 14px "${font}"`,
          `700 14px "${font}"`
        )?.totalH || 0;
        nodeHeights.push(tableH + 20);
      } else if (node.type === 'img' && !node.error && node.imgObj) {
        let drawH = node.dh;
        if (drawH > 400) drawH = 400;
        nodeHeights.push(drawH + 20);
      } else {
        nodeHeights.push(0);
      }
    }

    const availableFirst = maxCanvasHeight - (contentStartY + footerStartGap + footerH + margin + safetyPad);
    const availableNext = maxCanvasHeight - (margin + footerStartGap + footerH + margin + safetyPad);
    const pages = [];
    let bucket = [];
    let acc = 0;
    let limit = availableFirst;
    for (let i = 0; i < contentNodes.length; i++) {
      const h = nodeHeights[i];
      if (acc + h > limit && bucket.length) {
        pages.push(bucket);
        bucket = [];
        acc = 0;
        limit = availableNext;
      }
      bucket.push(contentNodes[i]);
      acc += h;
    }
    if (bucket.length) pages.push(bucket);

    const buffers = [];
    for (let i = 0; i < pages.length; i++) {
      const bufList = await drawProjectCard({
        ...data,
        _contentNodes: pages[i],
        _contentOnly: i > 0,
        _noPaginate: true,
        maxCanvasHeight
      });
      buffers.push(...bufList);
    }
    return buffers;
  }

  // 3. 开始绘制
  const canvas = createCanvas(width, totalH);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, width, totalH);

  // ================= Header Draw =================
  let cy = margin;
  const hx = margin;
  
  // Icon
  if (!contentOnly && data.icon) {
    try {
      const img = await loadImageSafe(data.icon);
      ctx.save();
      roundRect(ctx, hx, cy, headerIconSize, headerIconSize, 16);
      ctx.clip();
      ctx.drawImage(img, hx, cy, headerIconSize, headerIconSize);
      ctx.restore();
    } catch(e) {
      ctx.fillStyle = '#eee'; roundRect(ctx, hx, cy, headerIconSize, headerIconSize, 16); ctx.fill();
    }
  }

  // Header Info
  const hTx = hx + headerIconSize + 24;
  let hTy = cy;

  // Title
  if (!contentOnly) {
    ctx.fillStyle = COLORS.textMain;
    ctx.font = `800 28px "${font}"`;
    ctx.textBaseline = 'top';
    hTy = wrapText(ctx, data.name || '', hTx, hTy, headerTextW, 32, 3, true) + 4;
  }

  // Desc
  if (!contentOnly) {
    ctx.fillStyle = COLORS.textSec;
    ctx.font = `16px "${font}"`;
    hTy = wrapText(ctx, (data.summary || '').substring(0, 150), hTx, hTy, headerTextW, 24, 2, true) + 12;
  }

  // Stats & Tags Row
  // Downloads Icon
  const drawIcon = (path, x, y) => {
    if (!Path2DRef) return;
    ctx.save(); ctx.translate(x, y); ctx.scale(0.8, 0.8);
    ctx.strokeStyle = COLORS.textSec; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const p = new Path2DRef(path); ctx.stroke(p); ctx.restore();
  };
  
  let sx = hTx;
  let statY = hTy + 4;
  
  // Download
  if (!contentOnly) {
    drawIcon('M4 16v1a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-1m-4-4-4 4m0 0-4-4m4 4V4', sx, statY);
    ctx.fillStyle = COLORS.textMain; ctx.font = `600 15px "${font}"`;
    const dlText = formatNumber(data.downloads);
    ctx.fillText(dlText, sx + 24, statY + 2);
    sx += 24 + ctx.measureText(dlText).width + 16;
  }
  
  // Follows
  if (!contentOnly) {
    drawIcon('M4.3 6.3a4.5 4.5 0 0 0 0 6.4L12 20.4l7.7-7.7a4.5 4.5 0 0 0-6.4-6.4L12 7.6l-1.3-1.3a4.5 4.5 0 0 0-6.4 0', sx, statY);
    const flText = formatNumber(data.follows);
    ctx.fillText(flText, sx + 24, statY + 2);
    sx += 24 + ctx.measureText(flText).width + 24;
  }

  // Vertical Divider
  if (!contentOnly) {
    ctx.beginPath(); ctx.moveTo(sx, statY - 2); ctx.lineTo(sx, statY + 20); 
    ctx.strokeStyle = COLORS.divider; ctx.lineWidth = 1; ctx.stroke();
    sx += 24;
  }

  // Tags (Pills)
  if (!contentOnly) {
    const tags = (data.tags || []).slice(0, 3);
    tags.forEach(tag => {
      ctx.font = `600 13px "${font}"`;
      const tw = ctx.measureText(tag).width + 20;
      if (sx + tw > hTx + headerTextW) {
        sx = hTx;
        statY += 32;
      }
      ctx.fillStyle = COLORS.badgeBg;
      roundRect(ctx, sx, statY - 4, tw, 26, 13);
      ctx.fill();
      ctx.fillStyle = COLORS.textSec;
      ctx.fillText(tag, sx + 10, statY + 3);
      sx += tw + 8;
    });
  }

  // Divider Line under Header
  if (!contentOnly) {
    cy += headerH + 10;
    ctx.beginPath(); ctx.moveTo(margin, cy); ctx.lineTo(width - margin, cy);
    ctx.strokeStyle = COLORS.divider; ctx.lineWidth = 1; ctx.stroke();
  }

  // ================= Columns =================
  const colTopY = contentOnly ? margin : (cy + 30);
  
  // --- Right Sidebar ---
  const rx = margin + mainW + gap;
  let ry = colTopY;

  const drawSidebarSection = (title, items, type) => {
    if (!items || !items.length) return;
    
    ctx.fillStyle = COLORS.textMain;
    ctx.font = `700 18px "${font}"`;
    ctx.fillText(title, rx, ry);
    ry += 30;

    if (type === 'chips') {
      let cx = rx;
      items.forEach(item => {
        if (!item) return;
        ctx.font = `600 13px "${font}"`;
        const tw = ctx.measureText(item).width + 16;
        if (cx + tw > rx + sidebarW) { cx = rx; ry += 32; }
        
        ctx.fillStyle = COLORS.badgeBg;
        roundRect(ctx, cx, ry, tw, 24, 6);
        ctx.fill();
        ctx.fillStyle = COLORS.textMain;
        ctx.fillText(item, cx + 8, ry + 6);
        
        cx += tw + 6;
      });
      ry += 40;
    } else if (type === 'links') {
      items.forEach(l => {
        ctx.fillStyle = COLORS.link;
        ctx.font = `600 13px "${font}"`;
        const linkText = l?.url ? `${l.name}: ${l.url}` : (l?.name || String(l || ''));
        ry = wrapText(ctx, linkText, rx, ry, sidebarW, 20, 3, true) + 4;
      });
      ry += 20;
    } else if (type === 'text') {
      items.forEach(t => {
        ctx.fillStyle = COLORS.textMain;
        ctx.font = `15px "${font}"`;
        ctx.fillText(t, rx, ry);
        ry += 24;
      });
      ry += 20;
    }
  };

  if (!contentOnly) {
    drawSidebarSection('Compatibility', (data.gameVersions || []).slice(0, 15), 'chips');
    drawSidebarSection('Platforms', data.loaders, 'chips');
    drawSidebarSection('Supported environments', [
      data.clientSide ? (data.clientSide === 'required' ? 'Client (Required)' : 'Client') : null, 
      data.serverSide ? (data.serverSide === 'required' ? 'Server (Required)' : 'Server') : null
    ].filter(Boolean), 'chips');
    
    drawSidebarSection('Links', data.links, 'links');

    // Info Section Manually
    ctx.fillStyle = COLORS.textMain;
    ctx.font = `700 18px "${font}"`;
    ctx.fillText('Info', rx, ry);
    ry += 30;
    
    const drawInfoItem = (icon, label) => {
      ctx.fillStyle = COLORS.textSec;
      ctx.font = `14px "${font}"`;
      ctx.fillText(label, rx + 20, ry);
      // Draw dot/icon placeholder
      ctx.beginPath(); ctx.arc(rx + 6, ry - 5, 3, 0, Math.PI*2); ctx.fill();
      ry += 24;
    };
    
    if (data.license) drawInfoItem('', `${getTranslation(lang, 'license')}: ${data.license}`);
    drawInfoItem('', `${getTranslation(lang, 'updated')}: ${data.updated}`);
    drawInfoItem('', `${getTranslation(lang, 'created')}: ${data.created || '--'}`);
    ry += 20;

    drawSidebarSection(getTranslation(lang, 'creators'), [data.author], 'text');
  }

  // --- Left Content ---
  let lx = margin;
  let ly = colTopY;
  
  // Render Nodes
  for (const node of contentNodes) {
    if (node.type === 'text') {
      const isHeader = node.tag === 'h';
      const fontSize = isHeader ? 22 : 15;
      ctx.font = `${isHeader ? '800' : '600'} ${fontSize}px "${font}"`;
      ctx.fillStyle = isHeader ? COLORS.textMain : '#333';
      
      // Header Decoration
      if (isHeader) {
         ly += 10;
      }
      
      // 使用 10000 作为 maxLines，确保绘制完整内容
      ly = wrapText(ctx, node.val, lx, ly, mainW, Math.floor(fontSize * 1.6), 10000, true) + (isHeader ? 15 : 10);
      
      if (isHeader) {
         ctx.fillStyle = COLORS.divider;
         ctx.fillRect(lx, ly - 5, mainW, 1);
         ly += 10;
      }

    } else if (node.type === 'list-item') {
      const bulletX = lx + 4;
      const textX = lx + 24;
      ctx.fillStyle = '#333';
      ctx.font = `600 15px "${font}"`;
      ctx.fillText('•', bulletX, ly);
      ctx.font = `600 15px "${font}"`;
      ly = wrapText(ctx, node.val, textX, ly, Math.max(80, mainW - (textX - lx)), 24, 10000, true) + 10;
    } else if (node.type === 'table') {
      const tableH = drawTable(
        ctx,
        node,
        lx,
        ly,
        mainW,
        22,
        `600 14px "${font}"`,
        `800 14px "${font}"`,
        { headerBg: '#f5f7fa', cellBg: '#ffffff', border: '#e0e5ec', text: '#2b2f36' }
      );
      ly += tableH + 20;
    } else if (node.type === 'img' && !node.error && node.imgObj) {
      let drawH = node.dh;
      let drawW = node.dw;
      if (drawH > 400) {
        const r = 400 / drawH;
        drawH = 400; drawW = drawW * r;
      }
      // Center Image
      const dx = lx + (mainW - drawW) / 2;
      ctx.save();
      roundRect(ctx, dx, ly, drawW, drawH, 8);
      ctx.clip();
      ctx.drawImage(node.imgObj, dx, ly, drawW, drawH);
      ctx.restore();
      ly += drawH + 20;
    }
  }

  // Footer Drawing (Modrinth Logo & Author Text)
  let footerY = Math.max(ly, ry) + 40;
  if (footerY > totalH - margin - 10) {
    footerY = totalH - margin - 10;
  }

  // 1. 如果是 Modrinth，绘制 Logo
  if (data.source === 'Modrinth') {
     try {
       // 将 SVG 转为 Base64 Data URI 以加载
       const base64Svg = Buffer.from(MR_LOGO_SVG).toString('base64');
       const logoImg = await loadImage(`data:image/svg+xml;base64,${base64Svg}`);
       
       const logoH = 40;
       const logoW = logoImg.width * (logoH / logoImg.height);
       
       // 居中绘制 Logo
       ctx.drawImage(logoImg, (width - logoW) / 2, footerY, logoW, logoH);
       footerY += logoH + 15;
     } catch (e) { 
        // console.error('Logo draw failed', e); 
     }
  }

  // 2. 绘制原有 Footer 文本
  ctx.fillStyle = COLORS.textSec;
  ctx.font = `12px "${font}"`;
  ctx.textAlign = 'center';
  ctx.fillText('Generated by Koishi | Powered by Modrinth & CurseForge | Plugin By Mai_xiyu', width / 2, footerY);
  footerY += 18;
  
  // 3. 绘制要求的作者署名
  ctx.fillText('Plugin By Mai_xiyu', width / 2, footerY);

  return [await canvas.encode('png')];
}

// ================= CurseForge 专用构图 =================
export async function drawProjectCardCF(data) {
  const width = 1000;
  const margin = 24;
  const gap = 20;
  const font = GLOBAL_FONT_FAMILY;
  const maxCanvasHeight = data.maxCanvasHeight || 8000;
  const contentOnly = !!data._contentOnly;
  const lang = data._lang || 'zh';

  // CF Colors
  const C_BG = '#1b1b1b';       
  const C_PANEL = '#2d2d2d';    
  const C_TEXT_MAIN = '#e4e4e4';
  const C_TEXT_SEC = '#b0b0b0'; 
  const C_ACCENT = '#f16436';   
  const C_DIVIDER = '#2c2c2c';
  const C_BUTTON = '#f16436';

  // 1. 预处理正文
  let rawBody = data.body;
  if (!rawBody && data.summary) rawBody = `<p>${data.summary}</p>`;
  if (!data.bodyIsHtml && rawBody) rawBody = marked.parse(rawBody);
  
  // 2. 预计算 & 布局
  const dummyC = createCanvas(100, 100);
  const dummy = dummyC.getContext('2d');

  const sidebarW = 300;
  const mainW = width - margin * 2 - sidebarW - gap;

  // 解析正文节点 (包括图片)
  let contentNodes = data._contentNodes || await parseContentToNodes(rawBody, mainW, data.baseUrl || '');

  const measureTextBlockHeight = (text, width, fontSize, isHeader) => {
    const lineHeight = Math.floor(fontSize * 1.5);
    dummy.font = `${isHeader ? 'bold' : 'normal'} ${fontSize}px "${font}"`;
    return wrapText(dummy, text || '', 0, 0, width, lineHeight, 10000, false);
  };

  const measureChipsHeight = (items, maxWidth, ctx, fontSize = 12) => {
    if (!items || !items.length) return 0;
    ctx.font = `normal ${fontSize}px "${font}"`;
    let x = 0;
    let rows = 1;
    const padX = 16, rowH = 28, rowGap = 8;
    items.forEach(item => {
      const tw = ctx.measureText(item).width + padX;
      if (x + tw > maxWidth) { rows++; x = 0; }
      x += tw + 8;
    });
    return rows * rowH + (rows - 1) * rowGap;
  };

  // --- Header Layout ---
  const headerIconSize = 80;
  let headerH = 0;
  if (!contentOnly) {
    headerH = 140; 
  }

  // --- Sidebar Layout Construction ---
  let sidebarH = 0;
  const sidebarItems = []; 

  if (!contentOnly) {
    // 1. Action Box
    sidebarItems.push({ type: 'actionBox', h: 50 });
    sidebarH += 50 + 20;

    // 2. Details
    const details = [
        { l: getTranslation(lang, 'downloads'), v: formatNumber(data.downloads) },
        { l: getTranslation(lang, 'created'), v: data.created || '--' },
        { l: getTranslation(lang, 'updated'), v: data.updated || '--' },
        { l: getTranslation(lang, 'license'), v: data.license || 'Custom' }
    ];
    if (data.follows) details.splice(1, 0, { l: 'Follows', v: formatNumber(data.follows) });

    const detailH = 40 + details.length * 24;
    sidebarItems.push({ type: 'listKV', title: 'Details', data: details, h: detailH });
    sidebarH += detailH + 20;

    // 3. Game Versions
    if (data.gameVersions && data.gameVersions.length) {
        const h = measureChipsHeight(data.gameVersions, sidebarW, dummy) + 45;
        sidebarItems.push({ type: 'chips', title: 'Game Versions', data: data.gameVersions, h });
        sidebarH += h + 20;
    }

    // 4. Mod Loaders
    if (data.loaders && data.loaders.length) {
        const h = measureChipsHeight(data.loaders, sidebarW, dummy) + 45;
        sidebarItems.push({ type: 'chips', title: 'Mod Loaders', data: data.loaders, h });
        sidebarH += h + 20;
    }

    // 5. Categories
    if (data.tags && data.tags.length) {
       const h = measureChipsHeight(data.tags, sidebarW - 30, dummy) + 45;
       sidebarItems.push({ type: 'chips', title: 'Categories', data: data.tags, h });
       sidebarH += h + 20;
    }

    // 6. Links
    if (data.links && data.links.length) {
        const h = 40 + data.links.length * 24;
        sidebarItems.push({ type: 'links', title: getTranslation(lang, 'links'), data: data.links, h });
        sidebarH += h + 20;
    }

    // 7. Members
    const membersH = 40 + 50; 
    sidebarItems.push({ type: 'members', title: 'Members', data: [{ name: data.author, icon: data.authorIcon }], h: membersH });
    sidebarH += membersH + 20;

    // 8. Footer (Logo & Credits)
    const sideFooterH = 100;
    sidebarItems.push({ type: 'sideFooter', h: sideFooterH });
    sidebarH += sideFooterH;
  }

  // --- Main Content Height ---
  let contentH = 0;
  if (!contentOnly) {
      contentH += 50; 
  }
  for (const node of contentNodes) {
    if (node.type === 'text') {
      const isHeader = node.tag === 'h';
      const fontSize = isHeader ? 22 : 15;
      const h = measureTextBlockHeight(node.val, mainW, fontSize, isHeader);
      contentH += h + (isHeader ? 15 : 10);
      if (isHeader) contentH += 8;
    } else if (node.type === 'list-item') {
      dummy.font = `500 15px "${font}"`;
      const h = wrapText(dummy, node.val, 0, 0, Math.max(80, mainW - 24), 24, 10000, false);
      contentH += h + 10;
    } else if (node.type === 'table') {
      const tableH = measureTableLayout(
        dummy,
        node,
        mainW,
        22,
        `500 14px "${font}"`,
        `700 14px "${font}"`
      )?.totalH || 0;
      contentH += tableH + 16;
    } else if (node.type === 'img' && !node.error && node.imgObj) {
      let drawH = node.dh;
      if (drawH > 600) {
          const ratio = 600 / drawH;
          drawH = 600;
          node.dw = node.dw * ratio;
      }
      node._drawH = drawH; 
      contentH += drawH + 20;
    }
  }
  if (contentH < 200) contentH = 200;

  const contentStartY = contentOnly ? margin : (margin + headerH + 20);
  const totalH = contentStartY + Math.max(sidebarH, contentH) + margin;

  // 分页逻辑 (省略)

  // 3. 开始绘制
  const canvas = createCanvas(width, totalH);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = C_BG;
  ctx.fillRect(0, 0, width, totalH);

  // ================= Header Draw =================
  let cy = margin;
  if (!contentOnly) {
      // Icon
      const iconSize = 80;
      if (data.icon) {
          try {
              const img = await loadImageSafe(data.icon);
              ctx.save();
              roundRect(ctx, margin, cy, iconSize, iconSize, 8); ctx.clip();
              ctx.drawImage(img, margin, cy, iconSize, iconSize); ctx.restore();
          } catch(e) {
              ctx.fillStyle = '#333'; roundRect(ctx, margin, cy, iconSize, iconSize, 8); ctx.fill();
          }
      }

        const tx = margin + iconSize + 20;
        let ty = cy + 10;
      
        ctx.fillStyle = C_TEXT_MAIN;
        ctx.font = `bold 32px "${font}"`;
        ctx.textBaseline = 'top';
        ctx.fillText(data.name || 'Unknown', tx, ty);
      
        ty += 42;
        if (data.summary) {
          ctx.fillStyle = C_TEXT_SEC;
          ctx.font = `14px "${font}"`;
          ty = wrapText(ctx, data.summary, tx, ty, width - tx - margin, 20, 3, true) + 6;
        }

        const avatarSize = 28;
        if (data.authorIcon) {
          try {
            const aimg = await loadImageSafe(data.authorIcon);
            ctx.save();
            ctx.beginPath();
            ctx.arc(tx + avatarSize / 2, ty + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(aimg, tx, ty, avatarSize, avatarSize);
            ctx.restore();
          } catch (e) {}
        } else {
          ctx.fillStyle = '#333';
          ctx.beginPath();
          ctx.arc(tx + avatarSize / 2, ty + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.fillStyle = C_TEXT_SEC;
        ctx.font = `14px "${font}"`;
        ctx.fillText('By', tx + avatarSize + 10, ty + 6);
        const byW = ctx.measureText('By').width;
      
        ctx.fillStyle = C_ACCENT; 
        ctx.font = `bold 14px "${font}"`;
        ctx.fillText(data.author || 'Unknown', tx + avatarSize + 10 + byW + 6, ty + 6);
      
      const tabY = cy + iconSize + 30;
      ctx.fillStyle = C_DIVIDER;
      ctx.fillRect(margin, tabY + 30, width - margin * 2, 2); 
      
      ctx.fillStyle = C_TEXT_MAIN;
      ctx.font = `bold 16px "${font}"`;
      ctx.fillText('Description', margin + 10, tabY);
      ctx.fillStyle = C_ACCENT;
      ctx.fillRect(margin, tabY + 28, 100, 4);

      cy = tabY + 50; 
  } else {
      cy = margin;
  }

  // ================= Columns Draw =================
  const leftX = margin;
  const rightX = margin + mainW + gap;
  let ly = cy;
  let ry = cy;

  // --- Right Sidebar ---
  if (!contentOnly) {
      const drawSidePanel = (title) => {
          ctx.fillStyle = C_TEXT_MAIN;
          ctx.font = `bold 16px "${font}"`;
          ctx.textBaseline = 'top';
          ctx.fillText(title, rightX, ry);
          ctx.fillStyle = C_DIVIDER;
          // 分割线画在标题下方 25px
          ctx.fillRect(rightX, ry + 25, sidebarW, 1);
          return ry + 40; // 内容起始 Y
      };

      for (const item of sidebarItems) {
          if (item.type === 'actionBox') {
              ctx.fillStyle = C_BUTTON;
              roundRect(ctx, rightX, ry, sidebarW, 45, 4); ctx.fill();
              ctx.fillStyle = 'rgba(0,0,0,0.2)';
              ctx.fillRect(rightX + sidebarW - 50, ry, 1, 45);
              ctx.fillStyle = '#fff';
              ctx.font = `bold 16px "${font}"`;
              ctx.textBaseline = 'middle';
              ctx.textAlign = 'center';
              ctx.fillText('Download', rightX + (sidebarW - 50)/2, ry + 22); 
              ctx.textAlign = 'left';
              ctx.textBaseline = 'top';
              ry += item.h;
          } 
          else if (item.type === 'sideFooter') {
              ctx.fillStyle = '#333';
              ctx.fillRect(rightX, ry + 20, sidebarW, 1);
              let fy = ry + 40;
              
              try {
                  const base64Svg = Buffer.from(CF_LOGO_SVG).toString('base64');
                  const logoImg = await loadImage(`data:image/svg+xml;base64,${base64Svg}`);
                  const logoSize = 32;
                  const cx = rightX + sidebarW / 2;
                  ctx.drawImage(logoImg, cx - logoSize - 50, fy, logoSize, logoSize);
                  ctx.fillStyle = '#fff';
                  ctx.font = `bold 24px "${font}"`;
                  ctx.textBaseline = 'middle';
                  ctx.fillText('CurseForge', cx - 10, fy + logoSize/2 + 2);
              } catch (e) {}
              
              fy += 50;
              ctx.fillStyle = '#c25c09';
              ctx.font = `12px "${font}"`;
              ctx.textAlign = 'center';
              ctx.textBaseline = 'top';
              ctx.fillText('Plugin By Mai_xiyu', rightX + sidebarW / 2, fy);
              ctx.textAlign = 'left';
              
              ry += item.h;
          }
          else if (item.type === 'listKV') {
              let currY = drawSidePanel(item.title);
              item.data.forEach(d => {
                  ctx.fillStyle = C_TEXT_SEC; ctx.font = `14px "${font}"`;
                  ctx.fillText(d.l, rightX, currY);
                  ctx.textAlign = 'right';
                  ctx.fillStyle = C_TEXT_MAIN;
                  ctx.fillText(d.v, rightX + sidebarW, currY);
                  ctx.textAlign = 'left';
                  currY += 24;
              });
              ry = currY + 20;
          } 
          else if (item.type === 'chips') {
              let currY = drawSidePanel(item.title);
              let cx = rightX;
              ctx.font = `12px "${font}"`;
              item.data.forEach(tag => {
                  const tw = ctx.measureText(tag).width + 24;
                  if (cx + tw > rightX + sidebarW) { cx = rightX; currY += 32; }
                  ctx.fillStyle = C_PANEL;
                  roundRect(ctx, cx, currY, tw, 24, 4); ctx.fill();
                  ctx.fillStyle = C_TEXT_SEC;
                  ctx.fillText(tag, cx + 12, currY + 6);
                  cx += tw + 8;
              });
              ry = currY + 24 + 20;
          }
          else if (item.type === 'links') {
              let currY = drawSidePanel(item.title);
              item.data.forEach(l => {
                  ctx.fillStyle = C_TEXT_MAIN; ctx.font = `600 13px "${font}"`;
                  const linkText = l?.url ? `${l.name}: ${l.url}` : (l?.name || String(l || ''));
                  currY = wrapText(ctx, linkText, rightX, currY, sidebarW, 20, 3, true) + 4;
              });
              ry = currY + 20;
          }
          else if (item.type === 'members') {
              let currY = drawSidePanel(item.title);
              const authorData = item.data[0];
              // Avatar
              ctx.save();
              ctx.beginPath(); ctx.arc(rightX + 16, currY + 16, 16, 0, Math.PI*2); ctx.clip();
              if (authorData.icon) {
                  try {
                      const img = await loadImageSafe(authorData.icon);
                      ctx.drawImage(img, rightX, currY, 32, 32);
                  } catch(e) {
                      ctx.fillStyle = '#333'; ctx.fill();
                  }
              } else {
                  ctx.fillStyle = '#333'; ctx.fill();
              }
              ctx.restore();

              ctx.fillStyle = C_TEXT_MAIN; ctx.font = `bold 14px "${font}"`;
              ctx.fillText(authorData.name || 'User', rightX + 40, currY + 6);
              ctx.fillStyle = C_TEXT_SEC; ctx.font = `12px "${font}"`;
              ctx.fillText('Owner', rightX + 40, currY + 22);
              ry = currY + 50;
          }
      }
  }

  // --- Left Content ---
  if (!contentOnly) {
      ctx.fillStyle = C_TEXT_MAIN;
      ctx.font = `bold 24px "${font}"`;
      ctx.textBaseline = 'top';
      ctx.fillText('Description', leftX, ly);
      ly += 40;
  }

  for (const node of contentNodes) {
    if (node.type === 'text') {
      const isHeader = node.tag === 'h';
      const fontSize = isHeader ? 22 : 15;
      
      ctx.font = `${isHeader ? '800' : '600'} ${fontSize}px "${font}"`;
      ctx.fillStyle = isHeader ? '#ffffff' : '#d0d0d0'; 
      ctx.textBaseline = 'top';
      
      const lineHeight = Math.floor(fontSize * 1.5);
      ly = wrapText(ctx, node.val, leftX, ly, mainW, lineHeight, 10000, true) + (isHeader ? 15 : 10);
      if (isHeader) ly += 8;
    } else if (node.type === 'list-item') {
      const bulletX = leftX + 4;
      const textX = leftX + 24;
      ctx.fillStyle = '#d0d0d0';
      ctx.font = `600 15px "${font}"`;
      ctx.fillText('•', bulletX, ly);
      ctx.font = `600 15px "${font}"`;
      ly = wrapText(ctx, node.val, textX, ly, Math.max(80, mainW - (textX - leftX)), 24, 10000, true) + 10;
    } else if (node.type === 'table') {
      const tableH = drawTable(
        ctx,
        node,
        leftX,
        ly,
        mainW,
        22,
        `600 14px "${font}"`,
        `800 14px "${font}"`,
        { headerBg: '#2a2f36', cellBg: '#1c2026', border: '#3a4048', text: '#d8dde6' }
      );
      ly += tableH + 16;

    } else if (node.type === 'img' && !node.error && node.imgObj) {
      let drawH = node._drawH || node.dh;
      let drawW = node.dw;
      if (!node._drawH && drawH > 600) { 
          const r = 600 / drawH;
          drawH = 600; drawW = drawW * r;
      }
      
      const dx = leftX + (mainW - drawW) / 2;
      try {
          ctx.drawImage(node.imgObj, dx, ly, drawW, drawH);
      } catch(e) {}
      ly += drawH + 20;
    }
  }

  return [await canvas.encode('png')];
}

// ================= 更新通知卡片（Modrinth） =================
// ================= 更新通知卡片（Modrinth 还原版） =================
export async function drawProjectCardMRNotify(data, latest) {
  const width = 1000;
  const margin = 30; // 稍微增大边距
  const gap = 30;
  const font = GLOBAL_FONT_FAMILY;

  // Modrinth Dark Theme Colors (参考截图取色)
  const C_BG = '#131516';          // 整体深色背景 (接近黑色)
  const C_CARD = '#1a1c1d';        // 左侧内容背景 (稍微亮一点)
  const C_TEXT_MAIN = '#ffffff';   // 主标题白色
  const C_TEXT_SEC = '#9ca5b5';    // 次要文本 (Label 颜色)
  const C_DIVIDER = '#252729';     // 分割线
  const C_GREEN = '#1bd96a';       // Release Green
  const C_CHIP_BG = '#2c2d30';     // Version ID 背景
  const C_LINK = '#3d83f7';        // 链接色(备用)

  const iconSize = 80; 
  const rightW = 300;  // 侧边栏宽度
  const cardW = width - margin * 2;
  const leftW = cardW - rightW - gap;

  // 1. 高度计算
  const dummyC = createCanvas(100, 100);
  const dummy = dummyC.getContext('2d');

  // Header 高度
  const headerTextW = cardW - iconSize - 24;
  dummy.font = `800 32px "${font}"`;
  const titleH = wrapText(dummy, data.name || '', 0, 0, headerTextW, 40, 2, false);
  const headerH = Math.max(iconSize, titleH + 30) + 20;

  // Changelog 高度
  const changelogText = (latest?.changelog || '').trim() || 'No changelog provided.';
  dummy.font = `15px "${font}"`;
  const changelogBodyH = wrapText(dummy, changelogText, 0, 0, leftW - 48, 26, 30, false); 
  const mainContentH = 60 + changelogBodyH + 40; 

  // 侧边栏高度计算 (Metadata)
  // 固定项目：Release(50) + Version(50) + Loaders(50) + GameVer(50) + Env(70) + DLs(50) + Date(50) + Pub(70) + ID(60)
  // 估算大约 550px，如果内容多会自动延伸
  let sidebarH = 600; 

  const bodyH = Math.max(sidebarH, mainContentH);
  const totalH = margin + headerH + 20 + bodyH + margin + 30;

  // 2. 绘制
  const canvas = createCanvas(width, totalH);
  const ctx = canvas.getContext('2d');

  // 背景
  ctx.fillStyle = C_BG;
  ctx.fillRect(0, 0, width, totalH);

  // === Header ===
  let cy = margin;
  if (data.icon) {
    try {
      const icon = await loadImageSafe(data.icon);
      ctx.save();
      roundRect(ctx, margin, cy, iconSize, iconSize, 16);
      ctx.clip();
      ctx.drawImage(icon, margin, cy, iconSize, iconSize);
      ctx.restore();
    } catch (e) {
      ctx.fillStyle = C_CARD;
      roundRect(ctx, margin, cy, iconSize, iconSize, 16);
      ctx.fill();
    }
  }

  const tx = margin + iconSize + 24;
  let ty = cy + 5;
  
  ctx.fillStyle = C_TEXT_MAIN;
  ctx.font = `800 32px "${font}"`;
  ty = wrapText(ctx, data.name || '', tx, ty, headerTextW, 40, 2, true) + 8;
  
  ctx.fillStyle = C_TEXT_SEC;
  ctx.font = `16px "${font}"`;
  // Header 下方显示简单的 By 信息
  ctx.fillText(`By ${data.author || 'Unknown'}`, tx, ty);

  // 分割线
  cy += headerH + 10;
  ctx.strokeStyle = C_DIVIDER;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(margin, cy); ctx.lineTo(width - margin, cy); ctx.stroke();

  // === Content Area ===
  cy += 30;
  const leftX = margin;
  const rightX = margin + leftW + gap;

  // --- Left: Changelog ---
  ctx.fillStyle = C_CARD;
  roundRect(ctx, leftX, cy, leftW, bodyH, 12);
  ctx.fill();

  ctx.fillStyle = C_TEXT_MAIN;
  ctx.font = `700 22px "${font}"`;
  ctx.fillText('Changelog', leftX + 24, cy + 40);
  
  ctx.strokeStyle = C_DIVIDER;
  ctx.beginPath(); ctx.moveTo(leftX + 24, cy + 60); ctx.lineTo(leftX + leftW - 24, cy + 60); ctx.stroke();

  ctx.fillStyle = '#b4b4b4'; // Changelog 文本稍微亮一点的灰
  ctx.font = `15px "${font}"`;
  wrapText(ctx, changelogText, leftX + 24, cy + 90, leftW - 48, 26, 30, true);

  // --- Right: Metadata Sidebar (还原截图风格) ---
  let ry = cy;
  
  // Title
  ctx.fillStyle = C_TEXT_MAIN;
  ctx.font = `800 22px "${font}"`;
  ctx.fillText('Metadata', rightX, ry + 10);
  ry += 40;

  // Helper: Draw Section Label
  const drawLabel = (text) => {
    ctx.fillStyle = C_TEXT_SEC;
    ctx.font = `700 14px "${font}"`;
    ctx.fillText(text, rightX, ry);
    ry += 24;
  };
  
  // Helper: Draw Value Text
  const drawValue = (text, color = C_TEXT_MAIN, isBold = false) => {
    ctx.fillStyle = color;
    ctx.font = `${isBold ? '700' : '500'} 16px "${font}"`;
    const h = wrapText(ctx, text, rightX, ry, rightW, 22, 2, true);
    ry = h + 16; // gap
  };

  // 1. Release channel
  drawLabel('Release channel');
  // Dot
  const channelType = latest?.versionType === 'beta' ? 'Beta' : (latest?.versionType === 'alpha' ? 'Alpha' : 'Release');
  const channelColor = latest?.versionType === 'beta' ? '#4695ee' : (latest?.versionType === 'alpha' ? '#f04747' : C_GREEN);
  
  ctx.beginPath();
  ctx.arc(rightX + 6, ry - 6, 5, 0, Math.PI * 2);
  ctx.fillStyle = channelColor;
  ctx.fill();
  
  ctx.fillStyle = channelColor;
  ctx.font = `700 16px "${font}"`;
  ctx.fillText(channelType, rightX + 18, ry);
  ry += 40;

  // 2. Version number
  drawLabel('Version number');
  drawValue(latest?.version || latest?.versionId || '--');

  // 3. Loaders (With Icons)
  drawLabel('Loaders');
  const loaders = latest?.loaders || data.loaders || [];
  let lx = rightX;
  
  // 简易 Tag 图标 Path
  const tagPath = "M15.5 2H10.5C10.2 2 10 2.1 9.8 2.3L2.3 9.8C1.9 10.2 1.9 10.8 2.3 11.2L6.8 15.7C7.2 16.1 7.8 16.1 8.2 15.7L15.7 8.2C15.9 8 16 7.8 16 7.5V2.5C16 2.2 15.8 2 15.5 2ZM13.5 5C13.2 5 13 4.8 13 4.5C13 4.2 13.2 4 13.5 4C13.8 4 14 4.2 14 4.5C14 4.8 13.8 5 13.5 5Z";
  
  if (loaders.length === 0) {
      drawValue('--');
  } else {
      // 模拟 Flex 布局
      let loaderText = '';
      loaders.forEach((l, i) => {
          // 图标
          ctx.save();
          ctx.translate(lx, ry - 14);
          ctx.scale(0.9, 0.9);
          if (Path2DRef) {
             const p = new Path2DRef(tagPath);
             ctx.fillStyle = C_TEXT_SEC;
             ctx.fill(p);
          } else {
             // Fallback circle
             ctx.beginPath(); ctx.arc(8, 8, 4, 0, Math.PI*2); ctx.fill();
          }
          ctx.restore();
          
          // 文本
          ctx.fillStyle = '#b4b4b4';
          ctx.font = `500 15px "${font}"`;
          const text = l.charAt(0).toUpperCase() + l.slice(1);
          ctx.fillText(text, lx + 20, ry);
          
          const itemW = 20 + ctx.measureText(text).width + 15;
          lx += itemW;
          
          // 简单的换行处理
          if (lx > rightX + rightW - 50) {
              lx = rightX;
              ry += 24;
          }
      });
      ry += 40;
  }

  // 4. Game versions
  drawLabel('Game versions');
  const gv = (latest?.gameVersions || data.gameVersions || []).slice(0, 4).join(', ');
  drawValue(gv || 'All');

  // 5. Environment
  drawLabel('Environment');
  let envText = 'Client and server';
  if (data.clientSide === 'unsupported') envText = 'Server only';
  else if (data.serverSide === 'unsupported') envText = 'Client only';
  else if (data.clientSide === 'required' && data.serverSide === 'required') envText = 'Client and server, required on both';
  drawValue(envText);

  // 6. Downloads
  drawLabel('Downloads');
  drawValue(formatNumber(latest?.downloads || 0));

  // 7. Publication date
  drawLabel('Publication date');
  const dateStr = latest?.datePublished 
    ? new Date(latest.datePublished).toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' }) 
    : '--';
  drawValue(dateStr);

  // 8. Publisher (Avatar + Name)
  drawLabel('Publisher');
  const authorName = data.author || 'Unknown';
  const memberRole = 'Member'; // 默认写 Member，API 没返回具体 Role
  
  // Avatar
  const avatarR = 20;
  ctx.save();
  ctx.beginPath();
  ctx.arc(rightX + avatarR, ry + avatarR - 10, avatarR, 0, Math.PI*2);
  ctx.fillStyle = C_CHIP_BG;
  ctx.fill();
  ctx.clip();
  
  if (data.authorIcon) {
      try {
          const authorImg = await loadImageSafe(data.authorIcon);
          ctx.drawImage(authorImg, rightX, ry - 10, avatarR * 2, avatarR * 2);
      } catch (e) {}
  } else {
     // Draw Initials
     ctx.fillStyle = C_TEXT_SEC;
     ctx.textAlign = 'center';
     ctx.textBaseline = 'middle';
     ctx.font = `bold 16px "${font}"`;
     ctx.fillText(authorName.charAt(0).toUpperCase(), rightX + avatarR, ry + avatarR - 10);
  }
  ctx.restore();

  // Name & Role
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = C_TEXT_MAIN;
  ctx.font = `700 15px "${font}"`;
  ctx.fillText(authorName, rightX + 50, ry - 5);
  
  ctx.fillStyle = C_TEXT_SEC;
  ctx.font = `13px "${font}"`;
  ctx.fillText(memberRole, rightX + 50, ry + 15);
  
  ry += 60;

  // 9. Version ID (Chip)
  drawLabel('Version ID');
  const verId = latest?.versionId || '-------';
  const chipPadding = 10;
  ctx.font = `14px "${font}"`; // Monospace ideally, but sans is fine
  const idW = ctx.measureText(verId).width + 30; // + space for icon
  
  ctx.fillStyle = C_CHIP_BG;
  roundRect(ctx, rightX, ry - 5, idW + chipPadding * 2, 32, 8);
  ctx.fill();
  
  ctx.fillStyle = '#b4b4b4';
  ctx.fillText(verId, rightX + chipPadding, ry + 5);
  
  // Copy Icon (simulated)
  const iconX = rightX + chipPadding + ctx.measureText(verId).width + 10;
  ctx.strokeStyle = '#b4b4b4';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(iconX, ry + 4, 10, 12);
  ctx.fillStyle = '#b4b4b4';
  ctx.fillRect(iconX + 3, ry + 2, 8, 2); // top bit
  
  ry += 50;

  // Footer
  ctx.fillStyle = C_TEXT_SEC;
  ctx.font = `12px "${font}"`;
  ctx.textAlign = 'center';
  ctx.fillText('Powered by Modrinth | Generated by Koishi | Plugin By Mai_xiyu', width / 2, totalH - 15);
  
  return [await canvas.encode('png')];
}
// ================= 更新通知卡片（CurseForge） =================
export async function drawProjectCardCFNotify(data, latest) {
  const width = 1000;
  const margin = 24;
  const gap = 24;
  const font = GLOBAL_FONT_FAMILY;

  // CF Colors
  const C_BG = '#141414';         
  const C_PANEL = '#1d1d1d';      
  const C_TEXT = '#dee2e6';       
  const C_TEXT_SEC = '#adb5bd';   
  const C_ACCENT = '#f16436';     
  const C_DIVIDER = '#2d2d2d';

  const iconSize = 80;
  const rightW = 320; // 加宽右侧
  const cardW = width - margin * 2;
  const leftW = cardW - rightW - gap;

  const dummyC = createCanvas(100, 100);
  const dummy = dummyC.getContext('2d');

  // --- 辅助：映射 Release Type ---
  const getReleaseTypeStr = (type) => {
      if (type === 1) return 'Release';
      if (type === 2) return 'Beta';
      if (type === 3) return 'Alpha';
      return String(type || 'Unknown');
  };
  const releaseTypeStr = getReleaseTypeStr(latest?.releaseType);

  // --- 1. 高度计算 ---
  const headerTextW = cardW - iconSize - 24;
  
  // Header: 标题自适应
  let titleFontSize = 32;
  dummy.font = `bold ${titleFontSize}px "${font}"`;
  while (dummy.measureText(data.name || '').width > headerTextW && titleFontSize > 22) {
      titleFontSize -= 2;
      dummy.font = `bold ${titleFontSize}px "${font}"`;
  }
  const titleH = wrapText(dummy, data.name || '', 0, 0, headerTextW, titleFontSize * 1.3, 2, false);
  
  dummy.font = `16px "${font}"`;
  const summaryH = wrapText(dummy, (data.summary || '').slice(0, 200), 0, 0, headerTextW, 24, 3, false);
  const headerH = Math.max(iconSize, titleH + summaryH + 15) + 20;

  // Sidebar Metadata
  const metaLines = [
    { l: 'New Version', v: latest?.version || '--', hl: true }, // Highlight
    { l: 'Downloads', v: formatNumber(latest?.downloads) },
    { l: 'Game Ver', v: (latest?.gameVersions || data.gameVersions || []).slice(0, 5).join(', ') || '--' },
    { l: 'Loaders', v: (latest?.loaders || data.loaders || []).slice(0, 4).join(', ') || '--' },
    { l: 'Updated', v: latest?.datePublished ? new Date(latest.datePublished).toLocaleDateString() : '--' },
    { l: 'Release Type', v: releaseTypeStr },
    { l: 'File', v: latest?.fileName || '--' },
    { l: 'Size', v: formatFileSize(latest?.fileSize) },
    { l: 'Author', v: data.author || '--' },
  ];

  // 计算 Sidebar 高度 (支持换行)
  let metaH = 60; // Title padding
  dummy.font = `15px "${font}"`;
  metaLines.forEach(item => {
      metaH += 20; // Label
      const valLines = wrapText(dummy, item.v, 0, 0, rightW - 40, 24, 5, false) / 24;
      metaH += valLines * 24 + 10; // Value + padding
      metaH += 10; // Divider
  });

  // Changelog Height
  const changelogText = (latest?.changelog || '').trim() || 'No changelog provided.';
  dummy.font = `15px "${font}"`;
  const changelogBodyH = wrapText(dummy, changelogText, 0, 0, leftW - 48, 26, 60, false);
  const contentH = 60 + changelogBodyH + 40; 

  const bodyH = Math.max(metaH, contentH, 300);
  const totalH = margin + headerH + 20 + bodyH + margin + 30;

  // --- 2. 绘制 ---
  const canvas = createCanvas(width, totalH);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = C_BG;
  ctx.fillRect(0, 0, width, totalH);

  // === Header ===
  let cy = margin;
  if (data.icon) {
    try {
      const icon = await loadImageSafe(data.icon);
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 10;
      roundRect(ctx, margin, cy, iconSize, iconSize, 8); ctx.fill();
      ctx.shadowColor = 'transparent';
      roundRect(ctx, margin, cy, iconSize, iconSize, 8); ctx.clip();
      ctx.drawImage(icon, margin, cy, iconSize, iconSize); ctx.restore();
    } catch (e) {
      ctx.fillStyle = '#333'; roundRect(ctx, margin, cy, iconSize, iconSize, 8); ctx.fill();
    }
  }

  const tx = margin + iconSize + 24;
  let ty = cy + 5;
  ctx.fillStyle = C_TEXT;
  ctx.font = `bold ${titleFontSize}px "${font}"`;
  ty = wrapText(ctx, data.name || '', tx, ty, headerTextW, titleFontSize * 1.3, 2, true) + 8;

  ctx.fillStyle = C_TEXT_SEC;
  ctx.font = `16px "${font}"`;
  wrapText(ctx, `By ${data.author || 'Unknown'}`, tx, ty, headerTextW, 24, 1, true);

  // Orange Tab Indicator
  cy += headerH + 10;
  ctx.fillStyle = C_ACCENT;
  ctx.fillRect(margin, cy, 100, 4);  // 稍微长一点的指示条
  ctx.fillStyle = C_DIVIDER;
  ctx.fillRect(margin + 100, cy, width - margin * 2 - 100, 4);

  // === Body ===
  cy += 24;
  const leftX = margin;
  const rightX = margin + leftW + gap;

  // -- 左侧：Changelog --
  ctx.fillStyle = C_PANEL; roundRect(ctx, leftX, cy, leftW, bodyH, 8); ctx.fill();
  
  ctx.fillStyle = C_TEXT; ctx.font = `bold 22px "${font}"`;
  ctx.fillText('What\'s New', leftX + 24, cy + 40);
  ctx.fillStyle = C_DIVIDER; ctx.fillRect(leftX + 24, cy + 60, leftW - 48, 2);

  ctx.fillStyle = '#ced4da'; ctx.font = `15px "${font}"`;
  wrapText(ctx, changelogText, leftX + 24, cy + 85, leftW - 48, 26, 60, true);

  // -- 右侧：Sidebar --
  ctx.fillStyle = C_PANEL; roundRect(ctx, rightX, cy, rightW, bodyH, 8); ctx.fill();
  
  let ry = cy + 40;
  const maxRy = cy + bodyH - 20;
  ctx.fillStyle = C_TEXT; ctx.font = `bold 18px "${font}"`;
  ctx.fillText('File Details', rightX + 20, ry);
  ry += 20;

  metaLines.forEach(item => {
      if (ry + 40 > maxRy) {
        ctx.fillStyle = C_TEXT_SEC;
        ctx.font = `12px "${font}"`;
        ctx.fillText('...', rightX + 20, maxRy - 6);
        return;
      }
      ry += 15;
      
      // Label
      ctx.fillStyle = C_TEXT_SEC; ctx.font = `13px "${font}"`;
      ctx.fillText(item.l, rightX + 20, ry);
      
      // Value (支持换行)
      ry += 22;
      ctx.font = `15px "${font}"`;
      
      // 特殊颜色处理
      if (item.hl) ctx.fillStyle = C_ACCENT; 
      else if (item.l === 'Release Type') {
          if (item.v === 'Release') ctx.fillStyle = '#1bd96a'; // Green
          else if (item.v === 'Beta') ctx.fillStyle = '#a020f0'; // Purple
          else ctx.fillStyle = C_TEXT;
      } else {
          ctx.fillStyle = C_TEXT;
      }

      // 自动换行绘制
        const nextY = wrapText(ctx, item.v, rightX + 20, ry, rightW - 40, 24, 5, true);
        ry = nextY + 10;
        if (ry + 6 > maxRy) return;
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.fillRect(rightX + 20, ry, rightW - 40, 1);
  });

  // Footer
  ctx.fillStyle = C_TEXT_SEC; ctx.font = `12px "${font}"`; ctx.textAlign = 'center';
  ctx.fillText('Powered by CurseForge | Generated by Koishi | Plugin By Mai_xiyu', width / 2, totalH - 15);

  return [await canvas.encode('png')];
}
// ================= API 交互 =================

export async function fetchModrinthDetail(id, timeout) {
  const project = await fetchJson(`${MR_BASE}/project/${id}`, {}, timeout);
  let versions = [];
  try { versions = await fetchJson(`${MR_BASE}/project/${id}/version`, {}, timeout); } catch(e){}

  let author = 'Unknown';
  try {
    const members = await fetchJson(`${MR_BASE}/project/${id}/members`, {}, timeout);
    author = members.find(m => m.role === 'Owner')?.user?.username || members[0]?.user?.username || author;
  } catch (e) {}

  let pageInfo = null;
  try { pageInfo = await fetchModrinthPage(project.slug, timeout); } catch (e) {}

    const gameVersions = new Set<string>();
    const loaders = new Set<string>();
  versions.forEach(v => {
      v.game_versions.forEach(gv => gameVersions.add(String(gv)));
      v.loaders.forEach(l => loaders.add(String(l)));
  });

  const links = [];
  if (project.source_url) links.push({ name: 'Source', url: project.source_url });
  if (project.issues_url) links.push({ name: 'Issues', url: project.issues_url });
  if (project.wiki_url) links.push({ name: 'Wiki', url: project.wiki_url });
  if (project.discord_url) links.push({ name: 'Discord', url: project.discord_url });

  // 排序版本号 (简单按长度和数值降序)
  const sortedVersions = Array.from(gameVersions).map(String).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));

  let body = project.body;
  let bodyIsHtml = false;
  if (pageInfo?.overviewHtml) {
    body = pageInfo.overviewHtml;
    bodyIsHtml = true;
  }

  const firstMdImage = extractFirstMarkdownImage(project.body || '');
  if (firstMdImage && !bodyIsHtml) {
    body = `![](${firstMdImage})\n\n${body || ''}`;
  }

  let cover = null;
  try {
    const gallery = await fetchJson(`${MR_BASE}/project/${id}/gallery`, {}, timeout);
    if (Array.isArray(gallery) && gallery.length) cover = gallery[0]?.url;
  } catch (e) {}

  return {
    source: 'Modrinth',
    id: project.id,
    name: project.title,
    author,
    icon: project.icon_url || pageInfo?.icon,
    summary: project.description,
    body,
    bodyIsHtml,
    downloads: project.downloads,
    follows: project.followers,
    updated: new Date(project.updated).toLocaleDateString(),
    created: new Date(project.published).toLocaleDateString(),
    license: project.license?.id,
    tags: project.categories,
    gameVersions: sortedVersions,
    loaders: Array.from(loaders),
    clientSide: project.client_side,
    serverSide: project.server_side,
    links,
    cover,
    baseUrl: 'https://modrinth.com',
    url: `https://modrinth.com/${project.project_type === 'modpack' ? 'modpack' : 'mod'}/${project.slug}`
  };
}

export async function fetchCurseForgeDetail(id, apiKey, timeout, cfUrl = null) {
  const url = cfUrl || (id ? `https://www.curseforge.com/minecraft/mc-mods/${id}` : null);
  if (!url) throw new Error('CurseForge 页面地址为空');

  try {
    const html = await fetchCurseForgeHtml(url, timeout);
    const $ = cheerio.load(html);

    const icon = fixUrl(
      $('img[class*="project-avatar"], img[class*="avatar"], img[alt][src*="thumbnail"]').first().attr('src') ||
      $('meta[property="og:image"]').attr('content'),
      'https://www.curseforge.com'
    );

    // 抓取作者头像
    const authorIcon = fixUrl(
      $('.project-members .member-avatar img, .members .avatar img, .member-list img, img.avatar, img[alt*="avatar"]').first().attr('src'),
      'https://www.curseforge.com'
    );

    const overviewHtml = (
      $('.tab-content .description').first().html() ||
      $('.project-description').first().html() ||
      $('.description-content').first().html() ||
      $('.markdown').first().html()
    );

    const name = $('h1').first().text().trim() || $('meta[property="og:title"]').attr('content') || 'Unknown';
    const summary = $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || '';
    const author = $('a[href*="/members/"]').first().text().trim() || 'Unknown';

    const tags = new Set();
    $('.categories a, .tag-list a, a.tag, a.category').each((_, el) => {
      const t = $(el).text().trim();
      if (t) tags.add(t);
    });

    let downloads = null;
    $('.project-details__item, .detail-list-item, li, .project-description').each((_, el) => {
      const t = $(el).text();
      if (/Downloads?/i.test(t)) {
        const m = t.match(/([\d,.]+\s*[kKmM]?)/);
        if (m) downloads = parseCompactNumber(m[1]);
      }
    });

    let updated = null;
    let created = null;
    $('time, .project-details__item, .detail-list-item, li').each((_, el) => {
      const t = $(el).text();
      if (!updated && /Updated/i.test(t)) {
        const m = t.match(/Updated\s*:?\s*([^\n]+)/i);
        if (m) updated = m[1].trim();
      }
      if (!created && /Created/i.test(t)) {
        const m = t.match(/Created\s*:?\s*([^\n]+)/i);
        if (m) created = m[1].trim();
      }
    });

    const links = [];
    const seen = new Set();
    $('a[href^="http"]').each((_, el) => {
      const href = $(el).attr('href');
      if (!href) return;
      if (/curseforge\.com/i.test(href)) return;
      if (seen.has(href)) return;
      const text = $(el).text().trim();
      if (!text) return;
      seen.add(href);
      if (links.length < 6) links.push({ name: text, url: href });
    });

    const slug = url.split('/').filter(Boolean).pop();
    const body = overviewHtml || (summary ? `<p>${summary}</p>` : '');

    return {
      source: 'CurseForge',
      id: slug || id,
      name,
      author,
      authorIcon, // 新增
      icon,
      summary,
      body,
      bodyIsHtml: true,
      downloads: downloads || 0,
      follows: 0,
      updated: updated || '--',
      created: created || '--',
      license: 'Custom',
      tags: Array.from(tags),
      gameVersions: [],
      loaders: [],
      links,
      cover: icon,
      baseUrl: 'https://www.curseforge.com',
      url
    };
  } catch (e) {
    // Cloudflare 403 回退
  }

  const res = await fetchJson(`${CF_MIRROR_BASE}/mods/${id}`, {}, timeout);
  const mod = res.data;

  let desc = '';
  try {
    const descRes = await fetchJson(`${CF_MIRROR_BASE}/mods/${id}/description`, {}, timeout);
    desc = descRes.data;
  } catch (e) {}

  const gv = new Set();
  const ld = new Set();
  (mod.latestFilesIndexes || []).forEach(f => {
    if (f.gameVersion) gv.add(f.gameVersion);
    if (f.modLoader) {
        // 映射加载器 ID 到名称
        const name = CF_LOADER_MAP[f.modLoader];
        if (name) ld.add(name);
    }
  });
  if (gv.size === 0) (mod.latestFiles || []).forEach(f => (f.gameVersions || []).forEach(v => gv.add(v)));

  const links = [];
  if (mod.links?.websiteUrl) links.push({ name: 'Website', url: mod.links.websiteUrl });
  if (mod.links?.sourceUrl) links.push({ name: 'Source', url: mod.links.sourceUrl });
  if (mod.links?.wikiUrl) links.push({ name: 'Wiki', url: mod.links.wikiUrl });

  const cover = mod.screenshots?.find(s => s.title)?.thumbnailUrl || mod.logo?.url || mod.logo?.thumbnailUrl;
  const body = desc ? desc : (mod.summary ? `<p>${mod.summary}</p>` : '');

  return {
    source: 'CurseForge',
    id: mod.id,
    name: mod.name,
    author: mod.authors?.[0]?.name || 'Unknown',
    authorIcon: mod.authors?.[0]?.avatarUrl || mod.authors?.[0]?.avatar || null,
    icon: mod.logo?.thumbnailUrl || mod.logo?.url,
    summary: mod.summary,
    body,
    bodyIsHtml: true,
    downloads: mod.downloadCount,
    follows: mod.thumbsUpCount,
    updated: new Date(mod.dateModified).toLocaleDateString(),
    created: new Date(mod.dateCreated).toLocaleDateString(),
    license: 'Custom',
    tags: (mod.categories || []).map(c => c.name),
    gameVersions: Array.from(gv)
      .map(String)
      .filter(v => /\d/.test(v))
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true })),
    loaders: Array.from(ld).map(String).length ? Array.from(ld).map(String) : ['Forge', 'Fabric'],
    links,
    cover,
    baseUrl: 'https://www.curseforge.com',
    url: mod.links?.websiteUrl || url
  };
}

// 搜索入口 (MR)
async function searchModrinth(query, type, timeout) {
    // 先尝试直接通过ID/slug获取项目详情
    try {
        const project = await fetchJson(`${MR_BASE}/project/${encodeURIComponent(query)}`, {}, timeout);
        if (project && project.slug) {
            // 成功获取到项目,返回单个结果
            return [{
                platform: 'Modrinth',
                id: project.slug,
                name: project.title,
                author: project.author || 'Unknown',
                summary: project.description,
                type,
                icon: project.icon_url,
                downloads: project.downloads || 0,
                updated: new Date(project.updated || project.published).toLocaleDateString()
            }];
        }
    } catch (e) {
        // ID/slug获取失败,继续使用搜索API
    }
    
    // 使用搜索API
    const facet = MR_FACET_MAP[type];
    const url = `${MR_BASE}/search?query=${encodeURIComponent(query)}&facets=[["${facet}"]]&limit=20`;
    const json = await fetchJson(url, {}, timeout);
    return json.hits.map(hit => ({
        platform: 'Modrinth', id: hit.slug, name: hit.title, author: hit.author,
        summary: hit.description, type, icon: hit.icon_url,
        downloads: hit.downloads, updated: new Date(hit.date_modified).toLocaleDateString()
    }));
}

// 搜索入口 (CF)
async function searchCurseForge(query, type, apiKey, timeout, gameId = 432) {
    const typeMap = {
      mod: 'mc-mods',
      pack: 'modpacks',
      resource: 'texture-packs',
      shader: 'shaders',
      plugin: 'bukkit-plugins',
      datapack: 'data-packs',
      world: 'worlds'
    };
    const slug = typeMap[type] || 'mc-mods';
    const searchUrl = `https://www.curseforge.com/minecraft/${slug}/search?search=${encodeURIComponent(query)}`;
    try {
      const html = await fetchCurseForgeHtml(searchUrl, timeout);
      const $ = cheerio.load(html);

      const results = [];
      const seen = new Set();

      const pickText = (el, sel) => $(el).find(sel).first().text().trim();
      const pickHref = (el) => $(el).find('a[href*="/minecraft/"]').first().attr('href');

      $('.project-listing-row, .project-card, article.project-card').each((_, el) => {
        const href = pickHref(el);
        if (!href) return;
        const url = fixUrl(href, 'https://www.curseforge.com');
        if (seen.has(url)) return;
        seen.add(url);

        const name = pickText(el, 'a.project-card__name, a.name, .name, h3, h2') || $(el).find('a[href*="/minecraft/"]').first().text().trim();
        const summary = pickText(el, '.description, .summary, .project-card__summary, p');
        const author = pickText(el, '.author, .author-name, .project-author, a[href*="/members/"]');
        const icon = fixUrl($(el).find('img').first().attr('src'), 'https://www.curseforge.com');
        const dlText = pickText(el, '.download-count, .downloads, .project-downloads');
        const downloads = parseCompactNumber(dlText) || 0;
        const slugId = url.split('/').filter(Boolean).pop();

        results.push({
          platform: 'CurseForge',
          id: slugId,
          name,
          author,
          summary,
          type,
          icon,
          downloads,
          updated: '--',
          _cfUrl: url
        });
      });

      if (results.length) return results;
    } catch (e) {
      // Cloudflare 403 时回退到镜像 API
    }

    const classId = CF_CLASS_MAP[type];
    const mirrorUrl = `${CF_MIRROR_BASE}/mods/search?gameId=${encodeURIComponent(gameId)}&classId=${classId}&searchFilter=${encodeURIComponent(query)}&sortField=2&sortOrder=desc&pageSize=20`;
    const json = await fetchJson(mirrorUrl, {}, timeout);
    return (json.data || []).map(mod => ({
      platform: 'CurseForge',
      id: mod.id,
      name: mod.name,
      author: mod.authors?.[0]?.name || 'Unknown',
      summary: mod.summary,
      type,
      icon: mod.logo?.thumbnailUrl || mod.logo?.url,
      downloads: mod.downloadCount,
      updated: new Date(mod.dateModified).toLocaleDateString(),
      _cfUrl: mod.links?.websiteUrl || (mod.slug ? `https://www.curseforge.com/minecraft/${slug}/${mod.slug}` : null)
    }));
}

// ================= Apply =================
export function apply(ctx, config) {
  const logger = ctx.logger('mc-search');
  RENDER_DEBUG = !!config?.debug;
  RENDER_IMAGE_FETCH_WITH_HEADERS = config?.render?.image?.fetchWithHeaders !== false;
  const canvasService = config?.canvas;
  if (!canvasService?.createCanvas || !canvasService?.loadImage) {
    logger.warn('缺少 @napi-rs/canvas，cf/mr 指令图片功能已禁用。请在 Koishi 实例目录执行: npm i @napi-rs/canvas');
    return;
  }
  createCanvas = (w, h) => {
    const width = Math.max(1, Number(w) || 1);
    const height = Math.max(1, Number(h) || 1);
    const c = canvasService.createCanvas(width, height);
    if (!c || typeof c.getContext !== 'function') {
      throw new Error('canvas 服务异常：Canvas 无效');
    }
    return c;
  };
  loadImage = canvasService.loadImage;
  registerFont = (path, options) => {
    const family = options?.family || 'CFMRModFont';
    if (typeof canvasService.registerFont === 'function') {
      return canvasService.registerFont(path, family);
    }
    return canvasService.GlobalFonts?.registerFromPath?.(path, family);
  };
  Path2DRef = canvasService.Path2D || globalThis.Path2D;
  globalFontsRef = canvasService.GlobalFonts;
  configuredFontPath = String(config?.fontPath || '').trim();
  warnLog = (msg) => logger.warn(msg);
  fontsChecked = false;

  // 使用可用字体作为默认字体

  const states = new Map();
  const normalizeMessageIds = (res) => {
    if (!res) return [];
    if (Array.isArray(res)) return res;
    if (typeof res === 'string') return [res];
    if (res.messageId) return [res.messageId];
    return [];
  };

  const tryWithdraw = async (session, messageIds) => {
    const ids = normalizeMessageIds(messageIds);
    if (!ids.length) return;
    for (const id of ids) {
      try {
        await session.bot.deleteMessage(session.channelId, id);
      } catch (e) {}
    }
  };
  const formatList = (results, page, size, useEnglish = false) => {
     const total = Math.ceil(results.length / size);
     const list = results.slice(page*size, (page+1)*size);
     if (useEnglish) {
       return `Search Results (${page+1}/${total}):\n` + 
              list.map((item, i) => `${i + 1 + page*size}. [${item.platform}] ${item.name} - ${item.author}`).join('\n') +
              '\nEnter number to view details (p/n to turn page, q to quit)';
     }
     return `搜索结果 (${page+1}/${total}):\n` + 
            list.map((item, i) => `${i + 1 + page*size}. [${item.platform}] ${item.name} - ${item.author}`).join('\n') +
            '\n请输入序号查看详情 (p/n 翻页, q 退出)';
  };

  const handleSearch = async (session, platform, type, keyword, useEnglish = false) => {
      if (!keyword) { await session.send(useEnglish ? 'Please enter a keyword' : '请输入关键词'); return; }
      let results = [];
      try {
        if (platform === 'mr') results = await searchModrinth(keyword, type, config.requestTimeout);
        else results = await searchCurseForge(keyword, type, config.curseforgeApiKey, config.requestTimeout, config.curseforgeGameId);
      } catch(e) { await session.send(`${useEnglish ? 'Search error' : '搜索出错'}: ${e.message}`); return; }
      if (!results.length) { await session.send(useEnglish ? 'No results found' : '未找到结果'); return; }
      if (results.length === 1) {
        const item = results[0];
        try {
          let detailData;
          if (item.platform === 'Modrinth') detailData = await fetchModrinthDetail(item.id, config.requestTimeout);
          else detailData = await fetchCurseForgeDetail(item.id, config.curseforgeApiKey, config.requestTimeout, item._cfUrl);
          detailData.type = item.type;
          detailData._lang = useEnglish ? 'en' : 'zh';
          const imgBufs = detailData.source === 'CurseForge'
            ? await drawProjectCardCF({
                ...detailData,
                maxCanvasHeight: config.maxCanvasHeight || 8000
              })
            : await drawProjectCard({
                ...detailData,
                maxCanvasHeight: config.maxCanvasHeight || 8000
              });
          for (const buf of imgBufs) {
            await session.send(h.image(await toImageSrc(buf)));
          }
          if (config.sendLink) await session.send(`${useEnglish ? 'Link' : '链接'}: ${detailData.url}`);
        } catch(e) { logger.error(e); return session.send(`${useEnglish ? 'Generation failed' : '生成失败'}: ${e.message}`); }
        return;
      }
      states.set(session.cid, { results, page: 0, platform, type, listMessageIds: [], useEnglish });
      const msgId = await session.send(formatList(results, 0, config.pageSize, useEnglish));
      states.get(session.cid).listMessageIds = normalizeMessageIds(msgId);
  };

  ctx.middleware(async (session, next) => {
      const state = states.get(session.cid);
      if (!state) return next();
      const text = session.content.trim();
      const useEnglish = state.useEnglish || false;
      if (text === 'q') { states.delete(session.cid); return session.send(useEnglish ? 'Exited' : '已退出'); }
      if (text === 'n') {
        await tryWithdraw(session, state.listMessageIds);
        state.page++;
        const msgId = await session.send(formatList(state.results, state.page, config.pageSize, useEnglish));
        state.listMessageIds = normalizeMessageIds(msgId);
        return;
      }
      if (text === 'p') {
        await tryWithdraw(session, state.listMessageIds);
        state.page = Math.max(0, state.page - 1);
        const msgId = await session.send(formatList(state.results, state.page, config.pageSize, useEnglish));
        state.listMessageIds = normalizeMessageIds(msgId);
        return;
      }

      const idx = parseInt(text);
      if (!isNaN(idx) && idx > 0) {
          const item = state.results[idx - 1];
          if (item) {
              await tryWithdraw(session, state.listMessageIds);
              states.delete(session.cid);
              try {
                  let detailData;
                  if (item.platform === 'Modrinth') detailData = await fetchModrinthDetail(item.id, config.requestTimeout);
                  else detailData = await fetchCurseForgeDetail(item.id, config.curseforgeApiKey, config.requestTimeout, item._cfUrl);
                  detailData.type = item.type;
                  detailData._lang = useEnglish ? 'en' : 'zh';
                  const imgBufs = detailData.source === 'CurseForge'
                    ? await drawProjectCardCF({
                        ...detailData,
                        maxCanvasHeight: config.maxCanvasHeight || 8000
                      })
                    : await drawProjectCard({
                        ...detailData,
                        maxCanvasHeight: config.maxCanvasHeight || 8000
                      });
                  for (const buf of imgBufs) {
                    await session.send(h.image(await toImageSrc(buf)));
                  }
                  if (config.sendLink) await session.send(`${useEnglish ? 'Link' : '链接'}: ${detailData.url}`);
              } catch(e) { logger.error(e); return session.send(`${useEnglish ? 'Generation failed' : '生成失败'}: ${e.message}`); }
              return;
          }
      }
      return next();
  });

  const cfPrefix = config?.prefixes?.cf || 'cf';
  const mrPrefix = config?.prefixes?.mr || 'mr';

  ctx.command(`${mrPrefix}.helpme`, '显示 Modrinth 搜索帮助')
    .option('en', '-e, --en Use English')
    .action(({options}) => {
      if (options?.en) {
        return [
          `${mrPrefix} <keyword>  | Search Modrinth Mod (default)`,
          `${mrPrefix}.mod/.pack/.resource/.shader/.plugin <keyword>`,
          'Interaction: Enter number to view, n next page, p previous page, q quit',
          'Options: -e/--en Use English display',
        ].join('\n');
      }
      return [
        `${mrPrefix} <关键词>  | 默认搜索 Modrinth Mod`,
        `${mrPrefix}.mod/.pack/.resource/.shader/.plugin <关键词>`,
        '列表交互：输入序号查看，n 下一页，p 上一页，q 退出',
        '选项：-e/--en 使用英文显示卡片',
      ].join('\n');
    });

  ctx.command(`${cfPrefix}.helpme`, '显示 CurseForge 搜索帮助')
    .option('en', '-e, --en Use English')
    .action(({options}) => {
      if (options?.en) {
        return [
          `${cfPrefix} <keyword>  | Search CurseForge Mod (default)`,
          `${cfPrefix}.mod/.pack/.resource/.shader/.plugin <keyword>`,
          'Interaction: Enter number to view, n next page, p previous page, q quit',
          'Options: -e/--en Use English display',
        ].join('\n');
      }
      return [
        `${cfPrefix} <关键词>  | 默认搜索 CurseForge Mod`,
        `${cfPrefix}.mod/.pack/.resource/.shader/.plugin <关键词>`,
        '列表交互：输入序号查看，n 下一页，p 上一页，q 退出',
        '选项：-e/--en 使用英文显示卡片',
      ].join('\n');
    });

  ['mod', 'pack', 'resource', 'shader', 'plugin'].forEach(t => {
      ctx.command(`${mrPrefix}.${t} [...keyword]`, `搜索 Modrinth ${t}`)
        .option('e', '-e 使用英文', { fallback: false })
        .action((argv, ...args) => {
          const allArgs = args.flat().map(String);
          const kw = allArgs.join(' ');
          return handleSearch(argv.session, 'mr', t, kw, argv.options?.e === true);
        });
      ctx.command(`${cfPrefix}.${t} [...keyword]`, `搜索 CurseForge ${t}`)
        .option('e', '-e 使用英文', { fallback: false })
        .action((argv, ...args) => {
          const allArgs = args.flat().map(String);
          const kw = allArgs.join(' ');
          return handleSearch(argv.session, 'cf', t, kw, argv.options?.e === true);
        });
  });
  ctx.command(`${mrPrefix} [...keyword]`, '搜索 Modrinth 模组')
    .option('e', '-e 使用英文', { fallback: false })
    .action((argv, ...args) => {
      const allArgs = args.flat().map(String);
      const kw = allArgs.join(' ');
      return handleSearch(argv.session, 'mr', 'mod', kw, argv.options?.e === true);
    });
  ctx.command(`${cfPrefix} [...keyword]`, '搜索 CurseForge 模组')
    .option('e', '-e 使用英文', { fallback: false })
    .action((argv, ...args) => {
      const allArgs = args.flat().map(String);
      const kw = allArgs.join(' ');
      return handleSearch(argv.session, 'cf', 'mod', kw, argv.options?.e === true);
    });
}



