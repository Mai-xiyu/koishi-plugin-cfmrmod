"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchMcmodCommentThread = fetchMcmodCommentThread;
exports.fetchMcmodCommentList = fetchMcmodCommentList;
exports.drawMcmodCommentList = drawMcmodCommentList;
exports.drawMcmodCommentThread = drawMcmodCommentThread;
const cheerio = require('cheerio');
const constants_1 = require("../constants");
const http_1 = require("../http");
const rendering_1 = require("../rendering");
const utils_1 = require("../utils");
const COMMENT_ROW_URL = `${constants_1.BASE_URL}/frame/comment/CommentRow/`;
const COMMENT_REPLY_URL = `${constants_1.BASE_URL}/frame/comment/CommentReply/`;
const MCMOD_REPLY_API_PAGE_SIZE = 5;
function readPageTitle(html, context) {
    const $ = cheerio.load(html);
    return ((0, utils_1.cleanText)($('meta[property="og:title"]').attr('content') || '') ||
        (0, utils_1.cleanText)($('title').text()).replace(/\s*-\s*MC百科.*$/, '') ||
        context.container);
}
function inferCommentContextFromUrl(url) {
    let parsed;
    try {
        parsed = new URL(url);
    }
    catch {
        return null;
    }
    const path = parsed.pathname || '';
    const simpleMatch = path.match(/^\/(class|modpack|post|author)\/(\d+)(?:\.html)?\/?$/i);
    if (simpleMatch)
        return { type: simpleMatch[1].toLowerCase(), container: simpleMatch[2] };
    if (/^\/item\//i.test(path)) {
        const itemMatch = path.match(/^\/item\/([^/?#]+)(?:\.html)?\/?$/i);
        if (itemMatch)
            return { type: 'item', container: itemMatch[1] };
    }
    if (/^center\.mcmod\.cn$/i.test(parsed.hostname)) {
        const centerMatch = path.match(/^\/(\d+)\/?$/);
        if (centerMatch)
            return { type: 'center', container: centerMatch[1] };
    }
    return null;
}
function extractCommentContext(url, html) {
    var _a, _b;
    const text = String(html || '');
    const type = ((_a = text.match(/comment_type\s*=\s*['"]([^'"]+)['"]/)) === null || _a === void 0 ? void 0 : _a[1]) || '';
    const container = ((_b = text.match(/comment_container\s*=\s*['"]([^'"]+)['"]/)) === null || _b === void 0 ? void 0 : _b[1]) || '';
    if (type && container)
        return { type, container };
    if (!text.includes('common-comment-block'))
        return null;
    return inferCommentContextFromUrl(url);
}
function buildCommentPageCandidates(pageUrl) {
    const candidates = [pageUrl];
    try {
        const parsed = new URL(pageUrl);
        const classMatch = parsed.pathname.match(/^\/class\/(\d+)(?:\.html)?\/?$/i);
        if (classMatch)
            candidates.push(`${constants_1.BASE_URL}/modpack/${classMatch[1]}.html`);
    }
    catch { }
    return Array.from(new Set(candidates));
}
async function fetchCommentDocument(url, timeout) {
    const firstUrl = (0, utils_1.fixUrl)(url);
    if (!firstUrl)
        throw new Error('MCMod 页面地址不能为空。');
    let lastHtml = '';
    for (const pageUrl of buildCommentPageCandidates(firstUrl)) {
        const html = await (0, http_1.fetchMcmodText)(pageUrl, { headers: (0, http_1.getHeaders)(pageUrl) }, timeout);
        lastHtml = html;
        const context = extractCommentContext(pageUrl, html);
        if (context)
            return { pageUrl, html, context };
    }
    const fallback = extractCommentContext(firstUrl, lastHtml);
    if (fallback)
        return { pageUrl: firstUrl, html: lastHtml, context: fallback };
    throw new Error('无法从页面解析评论上下文。');
}
function parseTarget(input) {
    var _a, _b, _c;
    const raw = String(input || '').trim();
    const id = (_a = raw.match(/^id:(\d+)$/i)) === null || _a === void 0 ? void 0 : _a[1];
    if (id)
        return { mode: 'id', id };
    const floor = ((_b = raw.match(/^floor:(\d+)$/i)) === null || _b === void 0 ? void 0 : _b[1]) || ((_c = raw.match(/^(\d+)\s*楼?$/)) === null || _c === void 0 ? void 0 : _c[1]);
    if (floor)
        return { mode: 'floor', floor: Number(floor) };
    throw new Error('target 格式错误，请使用楼层数字、3楼、floor:3 或 id:2112330。');
}
async function postMcmodJson(url, referer, payload, timeout = 15000) {
    const body = new URLSearchParams();
    body.set('data', JSON.stringify(payload));
    const text = await (0, http_1.fetchMcmodText)(url, {
        method: 'POST',
        headers: {
            ...(0, http_1.getHeaders)(referer),
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
    if ((json === null || json === void 0 ? void 0 : json.state) !== 0)
        throw new Error(`MCMod 评论接口返回状态 ${json === null || json === void 0 ? void 0 : json.state}`);
    return (json === null || json === void 0 ? void 0 : json.data) || {};
}
async function fetchReplyPage(replyID, pageUrl, page, timeout) {
    const json = await postMcmodJson(COMMENT_REPLY_URL, pageUrl, { replyID, page }, timeout);
    if ((json === null || json === void 0 ? void 0 : json.state) !== 0)
        throw new Error(`MCMod 子评论接口返回状态 ${json === null || json === void 0 ? void 0 : json.state}`);
    return (json === null || json === void 0 ? void 0 : json.data) || {};
}
function normalizeFloor(value) {
    const match = String(value || '').match(/(\d+)/);
    return match ? Number(match[1]) : null;
}
function cleanCommentFloor(value) {
    const raw = String(value || '');
    if (!raw)
        return '';
    const text = (0, utils_1.cleanText)(cheerio.load(`<div>${raw}</div>`)('div').text() || raw);
    return text.replace(/\s+/g, ' ').trim();
}
function rowToComment(row) {
    var _a, _b, _c, _d, _e, _f, _g;
    return {
        id: String((row === null || row === void 0 ? void 0 : row.id) || ''),
        floor: cleanCommentFloor(row === null || row === void 0 ? void 0 : row.floor),
        floorNo: normalizeFloor(row === null || row === void 0 ? void 0 : row.floor),
        user: {
            id: String(((_a = row === null || row === void 0 ? void 0 : row.user) === null || _a === void 0 ? void 0 : _a.id) || '0'),
            name: String(((_b = row === null || row === void 0 ? void 0 : row.user) === null || _b === void 0 ? void 0 : _b.name) || '百科游客'),
            level: (_c = row === null || row === void 0 ? void 0 : row.user) === null || _c === void 0 ? void 0 : _c.lv,
            avatar: (0, utils_1.fixUrl)((_e = (_d = row === null || row === void 0 ? void 0 : row.user) === null || _d === void 0 ? void 0 : _d.avatar) === null || _e === void 0 ? void 0 : _e.img),
        },
        time: {
            source: String(((_f = row === null || row === void 0 ? void 0 : row.time) === null || _f === void 0 ? void 0 : _f.source) || ''),
            range: String(((_g = row === null || row === void 0 ? void 0 : row.time) === null || _g === void 0 ? void 0 : _g.range) || ''),
        },
        content: String((row === null || row === void 0 ? void 0 : row.content) || ''),
        quote: (row === null || row === void 0 ? void 0 : row.quote) || null,
        replyCount: Number((row === null || row === void 0 ? void 0 : row.reply_count) || 0) || 0,
        attitude: (row === null || row === void 0 ? void 0 : row.attitude) || null,
    };
}
function replyToComment(row) {
    var _a, _b, _c, _d, _e, _f, _g;
    return {
        id: String((row === null || row === void 0 ? void 0 : row.id) || ''),
        user: {
            id: String(((_a = row === null || row === void 0 ? void 0 : row.user) === null || _a === void 0 ? void 0 : _a.id) || '0'),
            name: String(((_b = row === null || row === void 0 ? void 0 : row.user) === null || _b === void 0 ? void 0 : _b.name) || '百科游客'),
            level: (_c = row === null || row === void 0 ? void 0 : row.user) === null || _c === void 0 ? void 0 : _c.lv,
            avatar: (0, utils_1.fixUrl)((_e = (_d = row === null || row === void 0 ? void 0 : row.user) === null || _d === void 0 ? void 0 : _d.avatar) === null || _e === void 0 ? void 0 : _e.img),
        },
        replyUser: (row === null || row === void 0 ? void 0 : row.reply_user) ? {
            id: String(row.reply_user.id || '0'),
            name: String(row.reply_user.name || ''),
        } : null,
        time: {
            source: String(((_f = row === null || row === void 0 ? void 0 : row.time) === null || _f === void 0 ? void 0 : _f.source) || ''),
            range: String(((_g = row === null || row === void 0 ? void 0 : row.time) === null || _g === void 0 ? void 0 : _g.range) || ''),
        },
        content: String((row === null || row === void 0 ? void 0 : row.content) || ''),
        attitude: (row === null || row === void 0 ? void 0 : row.attitude) || null,
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
            if (target.mode === 'id' && comment.id === target.id)
                return { comment, topPage: current, totalTopPages: total };
            if (target.mode === 'floor' && comment.floorNo === target.floor)
                return { comment, topPage: current, totalTopPages: total };
        }
        if (!rows.length && current >= total)
            break;
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
        if (!rows.length)
            break;
        apiPage += 1;
    }
    return {
        replies: collected.slice(offset, offset + pageSize),
        totalRows,
        totalPages: Math.max(1, Math.ceil(totalRows / pageSize)),
    };
}
async function fetchMcmodCommentThread(url, targetInput, page = 1, pageSize = 5, timeout = 15000) {
    const { pageUrl, html, context } = await fetchCommentDocument(url, timeout);
    const target = parseTarget(targetInput);
    const found = await findComment(context, pageUrl, target, timeout);
    const replies = found.comment.replyCount > 0
        ? await fetchReplies(found.comment.id, pageUrl, Math.max(1, Number(page) || 1), pageSize, timeout)
        : { replies: [], totalRows: 0, totalPages: 1 };
    return {
        pageUrl,
        title: readPageTitle(html, context),
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
async function fetchMcmodCommentList(url, page = 1, pageSize = 5, timeout = 15000) {
    const listPage = Math.max(1, Number(page) || 1);
    const listPageSize = Math.max(1, Math.floor(Number(pageSize) || 5));
    const { pageUrl, html, context } = await fetchCommentDocument(url, timeout);
    const firstData = await fetchCommentRows(context, pageUrl, 1, timeout);
    const firstRows = Array.isArray(firstData.row) ? firstData.row : [];
    const pageInfo = firstData.page || {};
    const apiTotalRows = Number(pageInfo.total_row || 0) || 0;
    const apiTotalPages = Number(pageInfo.total_page || pageInfo.end || (firstRows.length ? 1 : 0)) || (firstRows.length ? 1 : 0);
    const apiPageSize = apiTotalRows && apiTotalPages
        ? Math.max(1, Math.ceil(apiTotalRows / apiTotalPages))
        : Math.max(1, firstRows.length || listPageSize);
    const pinnedRows = apiTotalRows && firstRows.length > apiPageSize ? firstRows.length - apiPageSize : 0;
    const totalRows = apiTotalRows ? apiTotalRows + pinnedRows : firstRows.length;
    const totalPages = Math.max(1, Math.ceil(totalRows / listPageSize));
    const start = (listPage - 1) * listPageSize;
    const comments = [];
    if (start < totalRows) {
        let collected = [];
        if (start < firstRows.length) {
            collected = firstRows.slice(start, Math.min(firstRows.length, start + listPageSize));
        }
        let globalIndex = start + collected.length;
        let apiPage = Math.floor(Math.max(0, globalIndex - firstRows.length) / apiPageSize) + 2;
        let offset = Math.max(0, globalIndex - firstRows.length) % apiPageSize;
        while (collected.length < listPageSize && apiPage <= apiTotalPages) {
            const data = await fetchCommentRows(context, pageUrl, apiPage, timeout);
            const rows = Array.isArray(data.row) ? data.row : [];
            if (!rows.length)
                break;
            const need = listPageSize - collected.length;
            collected = collected.concat(rows.slice(offset, offset + need));
            globalIndex = start + collected.length;
            apiPage += 1;
            offset = 0;
        }
        collected.forEach(row => comments.push(rowToComment(row)));
    }
    return {
        pageUrl,
        title: readPageTitle(html, context),
        context,
        page: listPage,
        pageSize: listPageSize,
        totalRows,
        totalPages,
        comments,
    };
}
function parseContentNodes(html, includeImages) {
    var _a, _b;
    const $ = cheerio.load(`<div class="root">${html || ''}</div>`, { decodeEntities: true });
    const nodes = [];
    let buffer = '';
    const flush = () => {
        const text = buffer
            .replace(/\u00a0/g, ' ')
            .replace(/[ \t\f\v]+/g, ' ')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
        if (text)
            nodes.push({ type: 'text', text });
        buffer = '';
    };
    function walk(node) {
        if (!node)
            return;
        if (node.type === 'text') {
            buffer += node.data || '';
            return;
        }
        if (node.type !== 'tag')
            return;
        const name = String(node.name || '').toLowerCase();
        if (name === 'br') {
            buffer += '\n';
            return;
        }
        if (name === 'img') {
            const alt = (0, utils_1.cleanText)($(node).attr('alt') || '');
            const src = (0, utils_1.extractImageUrl)(node);
            const isEmotion = /\/ueditor\/dialogs\/emotion\/images\//i.test(src || '');
            if (!includeImages || isEmotion) {
                if (alt)
                    buffer += alt;
                else if (isEmotion)
                    buffer += ' [表情] ';
                else
                    buffer += ' [图片] ';
                return;
            }
            flush();
            if (src)
                nodes.push({ type: 'image', src: (0, utils_1.fixUrl)(src), alt });
            return;
        }
        if (['p', 'div', 'blockquote', 'li'].includes(name))
            flush();
        if (node.children)
            node.children.forEach(child => walk(child));
        if (['p', 'div', 'blockquote', 'li'].includes(name))
            flush();
    }
    (_b = (_a = $('.root')[0]) === null || _a === void 0 ? void 0 : _a.children) === null || _b === void 0 ? void 0 : _b.forEach(child => walk(child));
    flush();
    return nodes.length ? nodes : [{ type: 'text', text: '（无内容）' }];
}
async function prepareNodes(nodes, referer, maxWidth) {
    for (const node of nodes) {
        if (node.type !== 'image' || !node.src)
            continue;
        try {
            const img = await (0, rendering_1.loadImageWithHeaders)(node.src, referer, 18000);
            const scale = Math.min(maxWidth / img.width, 380 / img.height, 1);
            node.img = img;
            node.dw = Math.max(1, Math.floor(img.width * scale));
            node.dh = Math.max(1, Math.floor(img.height * scale));
        }
        catch (e) {
            node.error = true;
        }
    }
}
function measureNodes(ctx, nodes, width, font) {
    let height = 0;
    ctx.font = `15px "${font}"`;
    for (const node of nodes) {
        if (node.type === 'text')
            height += (0, rendering_1.wrapText)(ctx, node.text, 0, 0, width, 24, 10000, false) + 8;
        else if (node.type === 'image' && node.img && !node.error)
            height += node.dh + (node.alt ? 28 : 14);
        else
            height += 46;
    }
    return height;
}
async function drawNodes(ctx, nodes, x, y, width, font) {
    ctx.textBaseline = 'top';
    for (const node of nodes) {
        if (node.type === 'text') {
            ctx.fillStyle = '#263238';
            ctx.font = `15px "${font}"`;
            y = await (0, rendering_1.drawTextWithTwemoji)(ctx, node.text, x, y, width, 24, 10000, true) + 8;
        }
        else if (node.type === 'image' && node.img && !node.error) {
            const dx = x + (width - node.dw) / 2;
            ctx.save();
            (0, rendering_1.roundRect)(ctx, dx, y, node.dw, node.dh, 8);
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
        }
        else {
            ctx.fillStyle = '#eef3f7';
            (0, rendering_1.roundRect)(ctx, x, y, width, 36, 8);
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
    if (!url)
        return null;
    try {
        return await (0, rendering_1.loadImageWithHeaders)(url, referer, 12000);
    }
    catch {
        return null;
    }
}
function initials(name) {
    var _a;
    const value = String(name || '').trim();
    if (!value)
        return '?';
    const ascii = (_a = value.match(/[A-Za-z0-9]+/g)) === null || _a === void 0 ? void 0 : _a.join('').slice(0, 2);
    return ascii ? ascii.toUpperCase() : Array.from(value).slice(0, 2).join('');
}
function drawAvatar(ctx, img, x, y, size, name, font) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.clip();
    if (img) {
        ctx.drawImage(img, x, y, size, size);
    }
    else {
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
    (0, rendering_1.roundRect)(ctx, x, y, w, 20, 10);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.fillText(text, x + 7, y + 4);
    return w;
}
function measureBadge(ctx, text, font) {
    ctx.font = `700 12px "${font}"`;
    return ctx.measureText(text).width + 14;
}
function commentPreviewText(html, maxChars = 180) {
    const nodes = parseContentNodes(html, false);
    const text = nodes
        .map(node => node.type === 'text' ? node.text : (node.alt ? `[图片: ${node.alt}]` : '[图片]'))
        .join('\n')
        .replace(/[ \t\f\v]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    if (!text)
        return '（无内容）';
    return text.length > maxChars ? `${text.slice(0, maxChars).trim()}...` : text;
}
async function drawMcmodCommentList(list, options = {}) {
    const font = rendering_1.GLOBAL_FONT_FAMILY;
    const width = 900;
    const margin = 28;
    const contentW = width - margin * 2;
    const bodyW = contentW - 124;
    const dummyCanvas = (0, rendering_1.createCanvas)(100, 100);
    const dummy = dummyCanvas.getContext('2d');
    for (const comment of list.comments) {
        comment._avatar = await loadAvatar(comment.user.avatar, list.pageUrl);
        comment._preview = commentPreviewText(comment.content, options.previewChars || 180);
    }
    const headerH = 112;
    const listHeaderH = 58;
    const itemHeights = list.comments.map(comment => {
        dummy.font = `15px "${font}"`;
        const previewH = (0, rendering_1.wrapText)(dummy, comment._preview, 0, 0, bodyW, 23, 4, false);
        return Math.max(118, 84 + previewH);
    });
    const emptyH = list.comments.length ? 0 : 68;
    const itemsH = itemHeights.reduce((sum, h) => sum + h + 12, 0);
    const totalH = margin + headerH + 18 + listHeaderH + itemsH + emptyH + 42;
    const canvas = (0, rendering_1.createCanvas)(width, totalH);
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#eef4f7';
    ctx.fillRect(0, 0, width, totalH);
    ctx.fillStyle = '#0f5d7a';
    (0, rendering_1.roundRect)(ctx, margin, margin, contentW, headerH, 14);
    ctx.fill();
    ctx.fillStyle = '#2f9ab7';
    (0, rendering_1.roundRect)(ctx, margin + 18, margin + 18, 78, 78, 12);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 30px "${font}"`;
    ctx.textAlign = 'center';
    ctx.fillText('MC', margin + 57, margin + 32);
    ctx.font = `700 13px "${font}"`;
    ctx.fillText('MOD', margin + 57, margin + 66);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff';
    ctx.font = `800 28px "${font}"`;
    (0, rendering_1.wrapText)(ctx, list.title || 'MCMod 评论列表', margin + 116, margin + 20, contentW - 146, 34, 2, true);
    ctx.font = `600 14px "${font}"`;
    ctx.fillStyle = 'rgba(255,255,255,0.84)';
    ctx.fillText(`mcmod.cn / ${list.context.type}:${list.context.container}`, margin + 116, margin + 82);
    let y = margin + headerH + 18;
    ctx.fillStyle = '#153743';
    ctx.font = `800 20px "${font}"`;
    ctx.fillText(`主评论 ${list.page}/${list.totalPages}`, margin + 4, y + 4);
    ctx.fillStyle = '#607d8b';
    ctx.font = `13px "${font}"`;
    ctx.fillText(`每页 ${list.pageSize} 条，共 ${list.totalRows} 条；输入 n/p 翻页，q 退出`, margin + 4, y + 32);
    y += listHeaderH;
    if (!list.comments.length) {
        ctx.fillStyle = '#ffffff';
        (0, rendering_1.roundRect)(ctx, margin, y, contentW, 56, 10);
        ctx.fill();
        ctx.strokeStyle = '#dceaf0';
        ctx.lineWidth = 1;
        (0, rendering_1.roundRect)(ctx, margin, y, contentW, 56, 10);
        ctx.stroke();
        ctx.fillStyle = '#78909c';
        ctx.font = `14px "${font}"`;
        ctx.fillText('本页没有评论。', margin + 18, y + 18);
        y += emptyH;
    }
    for (let i = 0; i < list.comments.length; i++) {
        const comment = list.comments[i];
        const cardH = itemHeights[i];
        ctx.fillStyle = '#ffffff';
        (0, rendering_1.roundRect)(ctx, margin, y, contentW, cardH, 10);
        ctx.fill();
        ctx.strokeStyle = '#dceaf0';
        ctx.lineWidth = 1;
        (0, rendering_1.roundRect)(ctx, margin, y, contentW, cardH, 10);
        ctx.stroke();
        drawAvatar(ctx, comment._avatar, margin + 22, y + 22, 58, comment.user.name, font);
        let tx = margin + 98;
        let ty = y + 18;
        let right = width - margin - 18;
        const replyText = `回复 ${comment.replyCount}`;
        if (comment.replyCount > 0) {
            const w = measureBadge(ctx, replyText, font);
            badge(ctx, replyText, right - w, ty + 1, font, '#607d8b');
            right -= w + 8;
        }
        if (comment.user.level !== undefined) {
            const levelText = `Lv.${comment.user.level}`;
            const w = measureBadge(ctx, levelText, font);
            badge(ctx, levelText, right - w, ty + 1, font, '#1f7a9d');
            right -= w + 8;
        }
        if (comment.floor) {
            const w = measureBadge(ctx, comment.floor, font);
            badge(ctx, comment.floor, right - w, ty + 1, font, '#d2691e');
            right -= w + 8;
        }
        ctx.fillStyle = '#102a35';
        ctx.font = `800 18px "${font}"`;
        await (0, rendering_1.drawTextWithTwemoji)(ctx, comment.user.name, tx, ty, Math.max(80, right - tx), 23, 1, true);
        ty += 28;
        ctx.fillStyle = '#78909c';
        ctx.font = `13px "${font}"`;
        ctx.fillText(`${comment.time.source || '--'}  ${comment.time.range || ''}  ID:${comment.id}`, tx, ty);
        ty += 30;
        ctx.fillStyle = '#263238';
        ctx.font = `15px "${font}"`;
        await (0, rendering_1.drawTextWithTwemoji)(ctx, comment._preview, tx, ty, bodyW, 23, 4, true);
        y += cardH + 12;
    }
    ctx.fillStyle = '#78909c';
    ctx.font = `12px "${font}"`;
    ctx.textAlign = 'center';
    ctx.fillText('Generated by Koishi | Powered by MCMod', width / 2, totalH - 24);
    return await canvas.encode('png');
}
async function drawMcmodCommentThread(thread, options = {}) {
    var _a;
    const includeImages = options.includeImages !== false;
    const font = rendering_1.GLOBAL_FONT_FAMILY;
    const width = 900;
    const margin = 28;
    const contentW = width - margin * 2;
    const mainBodyW = contentW - 120;
    const replyBodyW = contentW - 148;
    const dummyCanvas = (0, rendering_1.createCanvas)(100, 100);
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
    const canvas = (0, rendering_1.createCanvas)(width, totalH);
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#eef4f7';
    ctx.fillRect(0, 0, width, totalH);
    const headerGrad = ctx.createLinearGradient(0, 0, width, headerH + margin);
    headerGrad.addColorStop(0, '#0f5d7a');
    headerGrad.addColorStop(1, '#2f9ab7');
    ctx.fillStyle = headerGrad;
    (0, rendering_1.roundRect)(ctx, margin, margin, contentW, headerH, 14);
    ctx.fill();
    ctx.fillStyle = '#3d9db5';
    (0, rendering_1.roundRect)(ctx, margin + 18, margin + 18, 78, 78, 12);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `800 28px "${font}"`;
    (0, rendering_1.wrapText)(ctx, thread.title || 'MCMod 评论', margin + 116, margin + 20, contentW - 146, 34, 2, true);
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
    (0, rendering_1.roundRect)(ctx, margin, y, contentW, mainH, 12);
    ctx.fill();
    ctx.strokeStyle = '#dceaf0';
    ctx.lineWidth = 1;
    (0, rendering_1.roundRect)(ctx, margin, y, contentW, mainH, 12);
    ctx.stroke();
    drawAvatar(ctx, thread.main._avatar, margin + 22, y + 24, 64, thread.main.user.name, font);
    let tx = margin + 104;
    let ty = y + 22;
    ctx.fillStyle = '#102a35';
    ctx.font = `800 19px "${font}"`;
    ctx.fillText(thread.main.user.name, tx, ty);
    let bx = tx + ctx.measureText(thread.main.user.name).width + 10;
    if (thread.main.user.level !== undefined)
        bx += badge(ctx, `Lv.${thread.main.user.level}`, bx, ty + 1, font) + 8;
    if (thread.main.floor)
        badge(ctx, thread.main.floor, bx, ty + 1, font, '#d2691e');
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
        (0, rendering_1.roundRect)(ctx, margin, y, contentW, 44, 10);
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
        (0, rendering_1.roundRect)(ctx, margin + 28, y, contentW - 28, h, 10);
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
        if (reply.user.level !== undefined)
            badge(ctx, `Lv.${reply.user.level}`, bx, ty - 1, font);
        ty += 23;
        ctx.fillStyle = '#78909c';
        ctx.font = `12px "${font}"`;
        const replyTo = ((_a = reply.replyUser) === null || _a === void 0 ? void 0 : _a.name) ? ` 回复 @${reply.replyUser.name}` : '';
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
