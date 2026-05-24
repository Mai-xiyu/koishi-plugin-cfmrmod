const cheerio = require('cheerio');
import { BASE_URL } from '../constants';
import { fetchMcmodText, getHeaders } from '../http';
import { createCanvas, drawTextWithTwemoji, GLOBAL_FONT_FAMILY, loadImageWithHeaders, roundRect, wrapText } from '../rendering';
import { cleanText, extractImageUrl, fixUrl } from '../utils';

const COMMENT_ROW_URL = `${BASE_URL}/frame/comment/CommentRow/`;
const COMMENT_REPLY_URL = `${BASE_URL}/frame/comment/CommentReply/`;
const MCMOD_REPLY_API_PAGE_SIZE = 5;

function parseCommentContext(url, html) {
  const type =
    String(html || '').match(/comment_type\s*=\s*['"]([^'"]+)['"]/)?.[1] ||
    (String(url).includes('/class/') ? 'class' : '');
  const container =
    String(html || '').match(/comment_container\s*=\s*['"]([^'"]+)['"]/)?.[1] ||
    String(url).match(/\/(?:class|item|post)\/(\d+)/)?.[1] ||
    '';
  if (!type || !container) {
    throw new Error('无法从页面解析评论上下文。');
  }
  return { type, container };
}

function parseTarget(input) {
  const raw = String(input || '').trim();
  const id = raw.match(/^id:(\d+)$/i)?.[1];
  if (id) return { mode: 'id', id };
  const floor = raw.match(/^floor:(\d+)$/i)?.[1] || raw.match(/^(\d+)\s*楼?$/)?.[1];
  if (floor) return { mode: 'floor', floor: Number(floor) };
  throw new Error('target 格式错误，请使用楼层数字、3楼、floor:3 或 id:2112330。');
}

async function postMcmodJson(url, referer, payload, timeout = 15000) {
  const body = new URLSearchParams();
  body.set('data', JSON.stringify(payload));
  const text = await fetchMcmodText(url, {
    method: 'POST',
    headers: {
      ...getHeaders(referer),
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body,
  }, timeout);
  return JSON.parse(text);
}

async function fetchCommentRows(context, pageUrl, page, timeout) {
  const json = await postMcmodJson(COMMENT_ROW_URL, pageUrl, {
    type: context.type,
    channel: '1',
    doid: context.container,
    page,
    selfonly: 0,
  }, timeout);
  if (json?.state !== 0) throw new Error(`MCMod 评论接口返回状态 ${json?.state}`);
  return json?.data || {};
}

async function fetchReplyPage(replyID, pageUrl, page, timeout) {
  const json = await postMcmodJson(COMMENT_REPLY_URL, pageUrl, { replyID, page }, timeout);
  if (json?.state !== 0) throw new Error(`MCMod 子评论接口返回状态 ${json?.state}`);
  return json?.data || {};
}

function normalizeFloor(value) {
  const match = String(value || '').match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

function rowToComment(row) {
  return {
    id: String(row?.id || ''),
    floor: String(row?.floor || ''),
    floorNo: normalizeFloor(row?.floor),
    user: {
      id: String(row?.user?.id || '0'),
      name: String(row?.user?.name || '百科游客'),
      level: row?.user?.lv,
      avatar: fixUrl(row?.user?.avatar?.img),
    },
    time: {
      source: String(row?.time?.source || ''),
      range: String(row?.time?.range || ''),
    },
    content: String(row?.content || ''),
    quote: row?.quote || null,
    replyCount: Number(row?.reply_count || 0) || 0,
    attitude: row?.attitude || null,
  };
}

function replyToComment(row) {
  return {
    id: String(row?.id || ''),
    user: {
      id: String(row?.user?.id || '0'),
      name: String(row?.user?.name || '百科游客'),
      level: row?.user?.lv,
      avatar: fixUrl(row?.user?.avatar?.img),
    },
    replyUser: row?.reply_user ? {
      id: String(row.reply_user.id || '0'),
      name: String(row.reply_user.name || ''),
    } : null,
    time: {
      source: String(row?.time?.source || ''),
      range: String(row?.time?.range || ''),
    },
    content: String(row?.content || ''),
    attitude: row?.attitude || null,
  };
}

async function findComment(context, pageUrl, target, timeout) {
  let current = 1;
  let total = 1;
  while (current <= total) {
    const data = await fetchCommentRows(context, pageUrl, current, timeout);
    const rows = Array.isArray(data.row) ? data.row : [];
    const pageInfo = data.page || {};
    total = Number(pageInfo.total_page || pageInfo.end || total || 1) || 1;
    for (const row of rows) {
      const comment = rowToComment(row);
      if (target.mode === 'id' && comment.id === target.id) return { comment, topPage: current, totalTopPages: total };
      if (target.mode === 'floor' && comment.floorNo === target.floor) return { comment, topPage: current, totalTopPages: total };
    }
    if (!rows.length && current >= total) break;
    current += 1;
  }
  throw new Error(target.mode === 'id' ? `未找到评论 ID: ${target.id}` : `未找到 ${target.floor}楼。`);
}

async function fetchReplies(commentId, pageUrl, page, pageSize, timeout) {
  const start = (Math.max(1, page) - 1) * pageSize;
  const firstApiPage = Math.floor(start / MCMOD_REPLY_API_PAGE_SIZE) + 1;
  const offset = start % MCMOD_REPLY_API_PAGE_SIZE;
  const need = offset + pageSize;
  const collected = [];
  let apiPage = firstApiPage;
  let totalRows = 0;
  let totalApiPages = firstApiPage;

  while (collected.length < need && apiPage <= totalApiPages) {
    const data = await fetchReplyPage(commentId, pageUrl, apiPage, timeout);
    const rows = Array.isArray(data.row) ? data.row : [];
    const pageInfo = data.page || {};
    totalRows = Number(pageInfo.total_row || totalRows || rows.length) || 0;
    totalApiPages = Number(pageInfo.total_page || pageInfo.end || totalApiPages || apiPage) || apiPage;
    rows.forEach(row => collected.push(replyToComment(row)));
    if (!rows.length) break;
    apiPage += 1;
  }

  return {
    replies: collected.slice(offset, offset + pageSize),
    totalRows,
    totalPages: Math.max(1, Math.ceil(totalRows / pageSize)),
  };
}

export async function fetchMcmodCommentThread(url, targetInput, page = 1, pageSize = 5, timeout = 15000) {
  const pageUrl = fixUrl(url);
  if (!pageUrl) throw new Error('MCMod 页面地址不能为空。');
  const html = await fetchMcmodText(pageUrl, { headers: getHeaders(pageUrl) }, timeout);
  const context = parseCommentContext(pageUrl, html);
  const target = parseTarget(targetInput);
  const found = await findComment(context, pageUrl, target, timeout);
  const replies = await fetchReplies(found.comment.id, pageUrl, Math.max(1, Number(page) || 1), pageSize, timeout);

  const title =
    cleanText(cheerio.load(html)('meta[property="og:title"]').attr('content') || '') ||
    cleanText(cheerio.load(html)('title').text()).replace(/\s*-\s*MC百科.*$/, '') ||
    context.container;

  return {
    pageUrl,
    title,
    context,
    target,
    main: found.comment,
    topPage: found.topPage,
    totalTopPages: found.totalTopPages,
    replyPage: Math.max(1, Number(page) || 1),
    replyPageSize: pageSize,
    replyTotalRows: replies.totalRows,
    replyTotalPages: replies.totalPages,
    replies: replies.replies,
  };
}

function parseContentNodes(html, includeImages) {
  const $ = cheerio.load(`<div class="root">${html || ''}</div>`, { decodeEntities: true });
  const nodes = [];
  let buffer = '';

  const flush = () => {
    const text = buffer
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t\f\v]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (text) nodes.push({ type: 'text', text });
    buffer = '';
  };

  function walk(node) {
    if (!node) return;
    if (node.type === 'text') {
      buffer += node.data || '';
      return;
    }
    if (node.type !== 'tag') return;
    const name = String(node.name || '').toLowerCase();
    if (name === 'br') {
      buffer += '\n';
      return;
    }
    if (name === 'img') {
      const alt = cleanText($(node).attr('alt') || '');
      const src = extractImageUrl(node);
      const isEmotion = /\/ueditor\/dialogs\/emotion\/images\//i.test(src || '');
      if (!includeImages || isEmotion) {
        if (alt) buffer += alt;
        else if (isEmotion) buffer += ' [表情] ';
        return;
      }
      flush();
      if (src) nodes.push({ type: 'image', src: fixUrl(src), alt });
      return;
    }
    if (['p', 'div', 'blockquote', 'li'].includes(name)) flush();
    if (node.children) node.children.forEach(child => walk(child));
    if (['p', 'div', 'blockquote', 'li'].includes(name)) flush();
  }

  $('.root')[0]?.children?.forEach(child => walk(child));
  flush();
  return nodes.length ? nodes : [{ type: 'text', text: '（无内容）' }];
}

async function prepareNodes(nodes, referer, maxWidth) {
  for (const node of nodes) {
    if (node.type !== 'image' || !node.src) continue;
    try {
      const img = await loadImageWithHeaders(node.src, referer, 18000);
      const scale = Math.min(maxWidth / img.width, 380 / img.height, 1);
      node.img = img;
      node.dw = Math.max(1, Math.floor(img.width * scale));
      node.dh = Math.max(1, Math.floor(img.height * scale));
    } catch (e) {
      node.error = true;
    }
  }
}

function measureNodes(ctx, nodes, width, font) {
  let height = 0;
  ctx.font = `15px "${font}"`;
  for (const node of nodes) {
    if (node.type === 'text') height += wrapText(ctx, node.text, 0, 0, width, 24, 10000, false) + 8;
    else if (node.type === 'image' && node.img && !node.error) height += node.dh + (node.alt ? 28 : 14);
    else height += 46;
  }
  return height;
}

async function drawNodes(ctx, nodes, x, y, width, font) {
  ctx.textBaseline = 'top';
  for (const node of nodes) {
    if (node.type === 'text') {
      ctx.fillStyle = '#263238';
      ctx.font = `15px "${font}"`;
      y = await drawTextWithTwemoji(ctx, node.text, x, y, width, 24, 10000, true) + 8;
    } else if (node.type === 'image' && node.img && !node.error) {
      const dx = x + (width - node.dw) / 2;
      ctx.save();
      roundRect(ctx, dx, y, node.dw, node.dh, 8);
      ctx.clip();
      ctx.drawImage(node.img, dx, y, node.dw, node.dh);
      ctx.restore();
      y += node.dh + 8;
      if (node.alt) {
        ctx.fillStyle = '#78909c';
        ctx.font = `12px "${font}"`;
        ctx.textAlign = 'center';
        ctx.fillText(node.alt, x + width / 2, y);
        ctx.textAlign = 'left';
        y += 20;
      }
    } else {
      ctx.fillStyle = '#eef3f7';
      roundRect(ctx, x, y, width, 36, 8);
      ctx.fill();
      ctx.fillStyle = '#78909c';
      ctx.font = `13px "${font}"`;
      ctx.fillText('图片加载失败', x + 14, y + 10);
      y += 46;
    }
  }
  return y;
}

async function loadAvatar(url, referer) {
  if (!url) return null;
  try {
    return await loadImageWithHeaders(url, referer, 12000);
  } catch {
    return null;
  }
}

function initials(name) {
  const value = String(name || '').trim();
  if (!value) return '?';
  const ascii = value.match(/[A-Za-z0-9]+/g)?.join('').slice(0, 2);
  return ascii ? ascii.toUpperCase() : Array.from(value).slice(0, 2).join('');
}

function drawAvatar(ctx, img, x, y, size, name, font) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.clip();
  if (img) {
    ctx.drawImage(img, x, y, size, size);
  } else {
    ctx.fillStyle = '#dce7ef';
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = '#40748f';
    ctx.font = `700 ${Math.floor(size * 0.32)}px "${font}"`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials(name), x + size / 2, y + size / 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
  }
  ctx.restore();
}

function badge(ctx, text, x, y, font, color = '#1f7a9d') {
  ctx.font = `700 12px "${font}"`;
  const w = ctx.measureText(text).width + 14;
  ctx.fillStyle = `${color}1a`;
  roundRect(ctx, x, y, w, 20, 10);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.fillText(text, x + 7, y + 4);
  return w;
}

export async function drawMcmodCommentThread(thread, options: any = {}) {
  const includeImages = options.includeImages !== false;
  const font = GLOBAL_FONT_FAMILY;
  const width = 900;
  const margin = 28;
  const contentW = width - margin * 2;
  const mainBodyW = contentW - 120;
  const replyBodyW = contentW - 148;

  const dummyCanvas = createCanvas(100, 100);
  const dummy = dummyCanvas.getContext('2d');

  const mainNodes = parseContentNodes(thread.main.content, includeImages);
  await prepareNodes(mainNodes, thread.pageUrl, mainBodyW);
  thread.main._avatar = await loadAvatar(thread.main.user.avatar, thread.pageUrl);
  for (const reply of thread.replies) {
    reply._nodes = parseContentNodes(reply.content, includeImages);
    await prepareNodes(reply._nodes, thread.pageUrl, replyBodyW);
    reply._avatar = await loadAvatar(reply.user.avatar, thread.pageUrl);
  }

  const headerH = 112;
  const mainH = Math.max(112, 74 + measureNodes(dummy, mainNodes, mainBodyW, font));
  const replyHeaderH = 54;
  const replyHeights = thread.replies.map(reply => {
    return Math.max(76, 52 + measureNodes(dummy, reply._nodes, replyBodyW, font));
  });
  const emptyReplyH = thread.replies.length ? 0 : 54;
  const totalH = margin + headerH + 18 + mainH + 18 + replyHeaderH + replyHeights.reduce((sum, h) => sum + h + 12, 0) + emptyReplyH + 44;

  const canvas = createCanvas(width, totalH);
  const ctx = canvas.getContext('2d');
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#eef4f7';
  ctx.fillRect(0, 0, width, totalH);

  const headerGrad = ctx.createLinearGradient(0, 0, width, headerH + margin);
  headerGrad.addColorStop(0, '#0f5d7a');
  headerGrad.addColorStop(1, '#2f9ab7');
  ctx.fillStyle = headerGrad;
  roundRect(ctx, margin, margin, contentW, headerH, 14);
  ctx.fill();
  ctx.fillStyle = '#3d9db5';
  roundRect(ctx, margin + 18, margin + 18, 78, 78, 12);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = `800 28px "${font}"`;
  wrapText(ctx, thread.title || 'MCMod 评论', margin + 116, margin + 20, contentW - 146, 34, 2, true);
  ctx.font = `600 14px "${font}"`;
  ctx.fillStyle = 'rgba(255,255,255,0.84)';
  ctx.fillText(`mcmod.cn / ${thread.context.type}:${thread.context.container}`, margin + 116, margin + 82);
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 30px "${font}"`;
  ctx.textAlign = 'center';
  ctx.fillText('MC', margin + 57, margin + 32);
  ctx.font = `700 13px "${font}"`;
  ctx.fillText('MOD', margin + 57, margin + 66);
  ctx.textAlign = 'left';

  let y = margin + headerH + 18;
  ctx.fillStyle = '#fff';
  roundRect(ctx, margin, y, contentW, mainH, 12);
  ctx.fill();
  ctx.strokeStyle = '#dceaf0';
  ctx.lineWidth = 1;
  roundRect(ctx, margin, y, contentW, mainH, 12);
  ctx.stroke();

  drawAvatar(ctx, thread.main._avatar, margin + 22, y + 24, 64, thread.main.user.name, font);
  let tx = margin + 104;
  let ty = y + 22;
  ctx.fillStyle = '#102a35';
  ctx.font = `800 19px "${font}"`;
  ctx.fillText(thread.main.user.name, tx, ty);
  let bx = tx + ctx.measureText(thread.main.user.name).width + 10;
  if (thread.main.user.level !== undefined) bx += badge(ctx, `Lv.${thread.main.user.level}`, bx, ty + 1, font) + 8;
  if (thread.main.floor) badge(ctx, thread.main.floor, bx, ty + 1, font, '#d2691e');
  ty += 28;
  ctx.fillStyle = '#78909c';
  ctx.font = `13px "${font}"`;
  ctx.fillText(`${thread.main.time.source || '--'}  ${thread.main.time.range || ''}  ID:${thread.main.id}`, tx, ty);
  ty += 30;
  await drawNodes(ctx, mainNodes, tx, ty, mainBodyW, font);

  y += mainH + 18;
  ctx.fillStyle = '#153743';
  ctx.font = `800 20px "${font}"`;
  ctx.fillText(`子评论 ${thread.replyPage}/${thread.replyTotalPages}`, margin + 4, y + 4);
  ctx.fillStyle = '#607d8b';
  ctx.font = `13px "${font}"`;
  ctx.fillText(`每页 ${thread.replyPageSize} 条，共 ${thread.replyTotalRows} 条；输入 n/p 翻页，q 退出`, margin + 4, y + 32);
  y += replyHeaderH;

  if (!thread.replies.length) {
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, margin, y, contentW, 44, 10);
    ctx.fill();
    ctx.fillStyle = '#78909c';
    ctx.font = `14px "${font}"`;
    ctx.fillText('本页没有子评论。', margin + 18, y + 14);
    y += 54;
  }

  for (let i = 0; i < thread.replies.length; i++) {
    const reply = thread.replies[i];
    const h = replyHeights[i];
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, margin + 28, y, contentW - 28, h, 10);
    ctx.fill();
    ctx.fillStyle = '#d8e6ec';
    ctx.fillRect(margin + 52, y - 12, 2, 12);
    drawAvatar(ctx, reply._avatar, margin + 52, y + 18, 44, reply.user.name, font);

    tx = margin + 112;
    ty = y + 16;
    ctx.fillStyle = '#17313b';
    ctx.font = `800 15px "${font}"`;
    ctx.fillText(reply.user.name, tx, ty);
    bx = tx + ctx.measureText(reply.user.name).width + 8;
    if (reply.user.level !== undefined) badge(ctx, `Lv.${reply.user.level}`, bx, ty - 1, font);
    ty += 23;
    ctx.fillStyle = '#78909c';
    ctx.font = `12px "${font}"`;
    const replyTo = reply.replyUser?.name ? ` 回复 @${reply.replyUser.name}` : '';
    ctx.fillText(`${reply.time.source || '--'}${replyTo}`, tx, ty);
    ty += 24;
    await drawNodes(ctx, reply._nodes, tx, ty, replyBodyW, font);
    y += h + 12;
  }

  ctx.fillStyle = '#78909c';
  ctx.font = `12px "${font}"`;
  ctx.textAlign = 'center';
  ctx.fillText('Generated by Koishi | Powered by MCMod', width / 2, totalH - 24);

  return await canvas.encode('png');
}
