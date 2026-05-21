"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.drawModCard = drawModCard;
const cheerio = require('cheerio');
const constants_1 = require("../constants");
const http_1 = require("../http");
const rendering_1 = require("../rendering");
const utils_1 = require("../utils");
// ================= 渲染：模组/整合包卡片 (macOS 风格) =================
async function drawModCard(url) {
    var _a;
    const html = await (0, http_1.fetchMcmodText)(url, { headers: (0, http_1.getHeaders)(url) });
    const $ = cheerio.load(html);
    // --- 1. 数据抓取 (保持原逻辑，确保稳定性) ---
    const titleRoot = $('.class-title').first();
    const title = (0, utils_1.cleanText)(titleRoot.find('h1,h2,h3').first().text()) ||
        (0, utils_1.cleanText)(($('meta[property="og:title"]').attr('content') || $('title').text()).split('-')[0]);
    const subTitle = titleRoot.find('h4,small,.sub-title,.subtitle').map((_, el) => (0, utils_1.cleanText)($(el).text())).get()
        .filter(text => text && text !== title)
        .join(' ');
    const coverNode = $('.class-cover-image img, .class-banner img').first()[0];
    const iconNode = $('.class-icon img, .class-logo img, .class-cover-icon img').first()[0];
    const hasDedicatedIcon = !!iconNode;
    let coverUrl = (0, utils_1.fixUrl)((0, utils_1.extractImageUrl)(coverNode));
    let iconUrl = (0, utils_1.fixUrl)((0, utils_1.extractImageUrl)(iconNode)) || coverUrl;
    // 标签
    const tags = [];
    const officialTags = new Set();
    const seenTags = new Set();
    $('.class-title .class-status, .class-official-group div').each((i, el) => {
        const txt = (0, utils_1.cleanText)($(el).text());
        if (!txt || txt.length > 20 || seenTags.has(txt))
            return;
        seenTags.add(txt);
        officialTags.add(txt);
        let color = '#999', bg = '#eee';
        if (txt.includes('开源') || txt.includes('活跃') || txt.includes('稳定')) {
            color = '#2ecc71';
            bg = '#e8f5e9';
        }
        else if (txt.includes('半弃坑') || txt.includes('Beta')) {
            color = '#f39c12';
            bg = '#fef9e7';
        }
        else if (txt.includes('停更') || txt.includes('闭源') || txt.includes('弃坑')) {
            color = '#e74c3c';
            bg = '#fce4ec';
        }
        tags.push({ t: txt, bg, c: color });
    });
    $('.class-label-list a').each((i, el) => {
        const labelText = (0, utils_1.cleanText)($(el).text());
        if (!labelText || officialTags.has(labelText) || seenTags.has(labelText))
            return;
        seenTags.add(labelText);
        const cls = $(el).attr('class') || '';
        let bg = '#e3f2fd', c = '#3498db';
        if (cls.includes('c_1')) {
            bg = '#e8f5e9';
            c = '#2ecc71';
        }
        else if (cls.includes('c_3')) {
            bg = '#fff3e0';
            c = '#e67e22';
        }
        tags.push({ t: labelText, bg, c });
    });
    // 统计数据
    let score = (0, utils_1.cleanText)($('.class-score-num').text());
    let scoreComment = '';
    if (!score || score === '') {
        score = (0, utils_1.cleanText)($('.class-excount .star .up').text()) || '0.0';
        scoreComment = (0, utils_1.cleanText)($('.class-excount .star .down').text());
    }
    if (!scoreComment)
        scoreComment = '暂无评价';
    const yIndex = (0, utils_1.cleanText)($('.class-excount .star .text').first().text().replace('昨日指数:', '').trim());
    let viewNum = '0', fillRate = '--';
    $('.class-excount .infos .span').each((i, el) => {
        const t = $(el).find('.t').text();
        const n = (0, utils_1.cleanText)($(el).find('.n').text());
        if (t.includes('浏览'))
            viewNum = n;
        if (t.includes('填充'))
            fillRate = n;
    });
    function getSocialNum(className) {
        let result = '0';
        const selectors = [
            `.common-fuc-group li.${className} div.nums`, `.common-fuc-group li.${className} .nums`,
            `li.${className} div.nums`, `li.${className} .nums`
        ];
        for (const sel of selectors) {
            const el = $(sel);
            if (el.length > 0) {
                const titleAttr = el.attr('title');
                if (titleAttr && /^\d+$/.test(titleAttr.replace(/,/g, '').trim())) {
                    result = titleAttr.replace(/,/g, '').trim();
                    break;
                }
                const text = el.text().replace(/,/g, '').trim();
                if (text && /^\d+$/.test(text)) {
                    result = text;
                    break;
                }
            }
        }
        return result;
    }
    const pushNum = getSocialNum('push');
    const favNum = getSocialNum('like');
    const subNum = getSocialNum('subscribe');
    // 作者
    const authors = [];
    $('.author li, .author-list li, .class-author-list li, .common-class-author li').each((i, el) => {
        const n = (0, utils_1.cleanText)($(el).find('.name a, .name, .member a').first().text()) || (0, utils_1.cleanText)($(el).attr('title'));
        const r = (0, utils_1.cleanText)($(el).find('.position').text());
        const iurl = (0, utils_1.fixUrl)((0, utils_1.extractImageUrl)($(el).find('.avatar img, img').first()[0]));
        if (n)
            authors.push({ n, r, i: iurl });
    });
    // 属性
    const props = [];
    $('.class-meta-list li').each((i, el) => {
        const l = (0, utils_1.cleanText)($(el).find('h4').text());
        const v = (0, utils_1.cleanText)($(el).find('.text').text());
        if (l && v && !l.includes('编辑') && !l.includes('推荐') && !l.includes('收录') && !l.includes('最后')) {
            props.push({ l, v });
        }
    });
    // 版本
    const versions = [];
    const mcVerRoot = $('.mcver');
    let verGroups = mcVerRoot.find('ul ul');
    if (verGroups.length === 0)
        verGroups = mcVerRoot.find('ul').first();
    const allUls = mcVerRoot.find('ul');
    allUls.each((i, ul) => {
        if ($(ul).find('ul').length > 0)
            return;
        let loader = '';
        const vers = [];
        $(ul).find('li').each((j, li) => {
            const txt = (0, utils_1.cleanText)($(li).text());
            if (txt.includes(':') || txt.includes('：'))
                loader = txt.replace(/[:：]/g, '').trim();
            else
                vers.push(txt);
        });
        if (loader && vers.length > 0)
            versions.push({ l: loader, v: vers.join(', ') });
    });
    // 链接
    const links = [];
    $('.common-link-icon-frame a').each((i, el) => {
        const name = $(el).attr('data-original-title') || 'Link';
        let sn = name;
        if (name.includes('GitHub'))
            sn = 'GitHub';
        else if (name.includes('CurseForge'))
            sn = 'CurseForge';
        else if (name.includes('Modrinth'))
            sn = 'Modrinth';
        else if (name.includes('百科'))
            sn = 'Wiki';
        links.push(sn);
    });
    // 简介解析
    const descRoot = $('.common-text').first();
    const descNodes = [];
    const BLOCK_TAGS = new Set(['p', 'div', 'section', 'article', 'blockquote', 'ul', 'ol']);
    const SKIP_TAGS = new Set(['script', 'style', 'noscript', 'svg']);
    let paragraphBuffer = '';
    let paragraphTag = 'p';
    const normalizeText = (text) => String(text || '')
        .replace(/\u00a0/g, ' ')
        .replace(/[ \t\f\v]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    const pushTextNode = (text, tag = 'p') => {
        const normalized = normalizeText(text);
        if (!normalized)
            return;
        const last = descNodes[descNodes.length - 1];
        if ((last === null || last === void 0 ? void 0 : last.type) === 't' && last.tag === tag && tag !== 'h') {
            last.val = `${last.val}\n${normalized}`;
            return;
        }
        descNodes.push({ type: 't', val: normalized, tag });
    };
    const flushParagraph = () => {
        if (!paragraphBuffer)
            return;
        pushTextNode(paragraphBuffer, paragraphTag || 'p');
        paragraphBuffer = '';
        paragraphTag = 'p';
    };
    const appendText = (text, tag = 'p') => {
        if (!text)
            return;
        if (paragraphBuffer && paragraphTag !== tag)
            flushParagraph();
        paragraphTag = tag;
        paragraphBuffer += text;
    };
    function parseNode(node, depth = 0, preferredTag = 'p') {
        if (depth > 12)
            return;
        if (!node)
            return;
        if (node.type === 'text') {
            appendText(node.data || '', preferredTag);
            return;
        }
        if (node.type !== 'tag')
            return;
        const tagName = String(node.name || '').toLowerCase();
        if (!tagName || SKIP_TAGS.has(tagName))
            return;
        if (tagName === 'img') {
            const src = (0, utils_1.extractImageUrl)(node);
            const alt = normalizeText(node.attribs.alt || '');
            const isEmojiLikeAlt = !!alt && /^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F|\p{Emoji}\u200D)+$/u.test(alt);
            const isEmojiLikeSrc = /emoji|smilies|twemoji|emot/i.test(src || '');
            if ((isEmojiLikeAlt || isEmojiLikeSrc) && alt) {
                appendText(alt, preferredTag);
                return;
            }
            flushParagraph();
            if (src && !src.includes('icon') && !src.includes('loading')) {
                descNodes.push({ type: 'i', src: (0, utils_1.fixUrl)(src) });
            }
            return;
        }
        if (tagName === 'br') {
            appendText('\n', preferredTag);
            return;
        }
        if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
            flushParagraph();
            pushTextNode($(node).text(), 'h');
            return;
        }
        if (tagName === 'li') {
            flushParagraph();
            appendText('', 'li');
            if (node.children)
                node.children.forEach(child => parseNode(child, depth + 1, 'li'));
            const text = normalizeText(paragraphBuffer);
            paragraphBuffer = '';
            paragraphTag = 'p';
            if (text)
                descNodes.push({ type: 'li', val: text });
            return;
        }
        if (tagName === 'table') {
            flushParagraph();
            const galleryItems = (0, utils_1.parseGalleryFromTable)($, node);
            if (galleryItems.length) {
                descNodes.push({ type: 'g', items: galleryItems });
                return;
            }
            const rows = [];
            $(node).find('tr').each((_, tr) => {
                const row = [];
                $(tr).find('th,td').each((__, cell) => row.push(normalizeText($(cell).text())));
                if (row.some(Boolean))
                    rows.push(row);
            });
            if (rows.length)
                descNodes.push({ type: 'tb', rows });
            return;
        }
        if (tagName === 'a') {
            const text = normalizeText($(node).text());
            const href = (0, utils_1.fixUrl)(node.attribs.href);
            const label = text || (0, utils_1.compactUrlText)(href);
            if (label)
                appendText(label, preferredTag);
            return;
        }
        const isBlock = BLOCK_TAGS.has(tagName);
        if (isBlock)
            flushParagraph();
        if (node.children)
            node.children.forEach(child => parseNode(child, depth + 1, preferredTag));
        if (isBlock)
            flushParagraph();
    }
    if (descRoot.length) {
        descRoot[0].children.forEach(child => parseNode(child, 0));
        flushParagraph();
    }
    if (descNodes.length === 0) {
        const metaDesc = $('meta[name="description"]').attr('content');
        if (metaDesc)
            descNodes.push({ type: 't', val: metaDesc, tag: 'p' });
    }
    const loadOptionalImage = async (src) => {
        if (!src)
            return null;
        try {
            return await (0, rendering_1.loadImageWithHeaders)(src, url, 18000);
        }
        catch (e) {
            try {
                return await (0, rendering_1.loadImageWithHeaders)(src, constants_1.BASE_URL, 18000);
            }
            catch (e2) {
                return null;
            }
        }
    };
    const coverImg = await loadOptionalImage(coverUrl);
    let iconImg = await loadOptionalImage(iconUrl);
    if (!iconImg && iconUrl === coverUrl && coverImg)
        iconImg = coverImg;
    const showCover = !!coverImg && (hasDedicatedIcon || coverUrl !== iconUrl);
    await Promise.all(authors.slice(0, 3).map(async (author) => {
        author.imgCache = await loadOptionalImage(author.i);
    }));
    // --- 2. 布局计算 (macOS 风格) ---
    const width = 800;
    const font = rendering_1.GLOBAL_FONT_FAMILY;
    const margin = 20; // 窗口外边距
    const winPadding = 35; // 窗口内边距
    const contentW = width - margin * 2 - winPadding * 2;
    // 预计算高度
    const dummyC = (0, rendering_1.createCanvas)(100, 100);
    const dummy = dummyC.getContext('2d');
    dummy.font = `bold 32px "${font}"`;
    // 头部区域 (Header)
    const iconSize = 88;
    const titleAreaW = contentW - iconSize - 24;
    const titleLinesNum = (0, rendering_1.wrapText)(dummy, title, 0, 0, titleAreaW, 40, 10, false) / 40;
    let headerH = Math.max(iconSize, titleLinesNum * 40 + (subTitle ? 26 : 0) + (authors.length ? 32 : 0) + 8);
    // 标签区域
    let tagsH = 0;
    if (tags.length) {
        dummy.font = `12px "${font}"`;
        let rowW = 0;
        let rows = 1;
        for (const tag of tags) {
            const tagW = dummy.measureText(tag.t).width + 20;
            if (rowW && rowW + tagW > contentW) {
                rows++;
                rowW = 0;
            }
            rowW += tagW + 10;
        }
        tagsH = rows * 28;
    }
    // 封面图 (Cover)
    let coverH = 0;
    if (showCover)
        coverH = 220;
    // 统计数据 (Stats Grid)
    // 布局：每行4个数据
    const statsItems = [
        { l: '评分', v: score }, { l: '热度', v: viewNum },
        { l: '推荐', v: pushNum }, { l: '收藏', v: favNum },
        { l: '关注', v: subNum }
    ];
    if (fillRate !== '--')
        statsItems.push({ l: '填充率', v: fillRate });
    if (yIndex)
        statsItems.push({ l: '昨日指数', v: yIndex });
    let statsH = 0;
    if (statsItems.length) {
        const rows = Math.ceil(statsItems.length / 4);
        statsH = rows * 70 + (rows - 1) * 15;
    }
    // 属性列表 (Props)
    let propsH = 0;
    if (props.length) {
        const rows = Math.ceil(props.length / 2);
        propsH = rows * 30 + 10;
    }
    // 版本和链接
    let extraH = 0;
    if (versions.length) {
        extraH += 30; // Title
        versions.forEach(v => {
            dummy.font = `14px "${font}"`;
            const lw = dummy.measureText(v.l).width + 10;
            const lines = (0, rendering_1.wrapText)(dummy, v.v, 0, 0, contentW - lw, 20, 500, false) / 20;
            extraH += lines * 20 + 10;
        });
    }
    if (links.length) {
        dummy.font = `bold 12px "${font}"`;
        let rowW = 0;
        let rows = 1;
        for (const link of links) {
            const linkW = dummy.measureText(link).width + 20;
            if (rowW && rowW + linkW > contentW) {
                rows++;
                rowW = 0;
            }
            rowW += linkW + 10;
        }
        extraH += rows * 30 + 12;
    }
    // 简介 (Desc)
    let descH = 0;
    dummy.font = `16px "${font}"`;
    for (const node of descNodes) {
        if (node.type === 't') {
            const isHeader = node.tag === 'h';
            dummy.font = `${isHeader ? 'bold' : ''} ${isHeader ? 22 : 16}px "${font}"`;
            const lh = isHeader ? 32 : 26;
            const totalNodeHeight = (0, rendering_1.wrapText)(dummy, node.val, 0, 0, contentW, lh, 5000, false);
            descH += totalNodeHeight + (isHeader ? 15 : 10);
        }
        else if (node.type === 'li') {
            dummy.font = `600 16px "${font}"`;
            const h = (0, rendering_1.wrapText)(dummy, node.val, 0, 0, Math.max(80, contentW - 24), 26, 5000, false);
            descH += h + 10;
        }
        else if (node.type === 'tb') {
            const tableH = ((_a = (0, rendering_1.measureTableLayout)(dummy, node, contentW, 22, `600 14px "${font}"`, `800 14px "${font}"`)) === null || _a === void 0 ? void 0 : _a.totalH) || 0;
            descH += tableH + 16;
        }
        else if (node.type === 'g') {
            for (const item of node.items || []) {
                try {
                    const img = await (0, rendering_1.loadImageWithHeaders)(item.src, constants_1.BASE_URL);
                    item.imgCache = img;
                    let scale = Math.min(contentW / img.width, 1);
                    let dw = img.width * scale;
                    let dh = img.height * scale;
                    if (dh > 460) {
                        const r = 460 / dh;
                        dh = 460;
                        dw = dw * r;
                    }
                    item.dw = dw;
                    item.dh = dh;
                    const captionH = item.caption ? (0, rendering_1.wrapText)(dummy, item.caption, 0, 0, contentW, 22, 5, false) : 0;
                    descH += dh + captionH + 26;
                }
                catch (e) {
                    item.error = true;
                    descH += 110;
                }
            }
        }
        else if (node.type === 'i') {
            try {
                const img = await (0, rendering_1.loadImageWithHeaders)(node.src, constants_1.BASE_URL);
                node.imgCache = img; // 缓存供绘制时使用
                const maxH = 400;
                let r = Math.min(contentW / img.width, maxH / img.height);
                if (r > 1)
                    r = 1;
                const dh = img.height * r;
                descH += dh + 20;
            }
            catch (e) {
                node.imgFailed = true;
            }
        }
        else if (node.type === 'br') {
            descH += 10;
        }
    }
    if (descH > 0)
        descH += 50; // Title + Padding
    // 总高度
    let cursorY = margin + 40; // Top traffic lights area
    const components = [
        { h: headerH, gap: 16 },
        { h: tagsH, gap: 20 },
        { h: coverH, gap: 25 },
        { h: statsH, gap: 25 },
        { h: propsH, gap: 25 },
        { h: extraH, gap: 25 },
        { h: descH, gap: 20 }
    ];
    components.forEach(c => { if (c.h > 0)
        cursorY += c.h + c.gap; });
    const windowH = cursorY;
    const totalH = windowH + margin * 2 + 24;
    // --- 3. 开始绘制 ---
    const canvas = (0, rendering_1.createCanvas)(width, totalH);
    const ctx = canvas.getContext('2d');
    // 背景 (Bing 壁纸)
    try {
        const bgUrl = 'https://bing.biturl.top/?resolution=1920&format=image&index=0&mkt=zh-CN';
        const bgImg = await (0, rendering_1.loadImage)(bgUrl);
        const r = Math.max(width / bgImg.width, totalH / bgImg.height);
        ctx.drawImage(bgImg, (width - bgImg.width * r) / 2, (totalH - bgImg.height * r) / 2, bgImg.width * r, bgImg.height * r);
        ctx.fillStyle = 'rgba(0,0,0,0.15)'; // 遮罩
        ctx.fillRect(0, 0, width, totalH);
    }
    catch (e) {
        const grad = ctx.createLinearGradient(0, 0, 0, totalH);
        grad.addColorStop(0, '#e0c3fc');
        grad.addColorStop(1, '#8ec5fc');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, totalH);
    }
    // 窗口 (Acrylic)
    const winX = margin;
    const winY = margin;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.2)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 20;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    (0, rendering_1.roundRect)(ctx, winX, winY, width - margin * 2, windowH, 16);
    ctx.fill();
    ctx.restore();
    // 窗口边框
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    (0, rendering_1.roundRect)(ctx, winX, winY, width - margin * 2, windowH, 16);
    ctx.stroke();
    // 交通灯
    const trafficY = winY + 20;
    ['#ff5f56', '#ffbd2e', '#27c93f'].forEach((c, i) => {
        ctx.beginPath();
        ctx.arc(winX + 20 + i * 25, trafficY, 6, 0, Math.PI * 2);
        ctx.fillStyle = c;
        ctx.fill();
    });
    // --- 内容绘制 ---
    let dy = winY + 50;
    const cx = winX + winPadding;
    const getInitials = (text) => {
        var _a;
        const value = (0, utils_1.cleanText)(text).replace(/^\[[^\]]+\]\s*/, '');
        if (!value)
            return 'MOD';
        const ascii = (_a = value.match(/[A-Za-z0-9]+/g)) === null || _a === void 0 ? void 0 : _a.join('').slice(0, 2);
        if (ascii)
            return ascii.toUpperCase();
        return Array.from(value).slice(0, 2).join('');
    };
    const drawImageCover = (img, x, y, w, h, radius) => {
        const scale = Math.max(w / img.width, h / img.height);
        ctx.save();
        (0, rendering_1.roundRect)(ctx, x, y, w, h, radius);
        ctx.clip();
        ctx.drawImage(img, x + (w - img.width * scale) / 2, y + (h - img.height * scale) / 2, img.width * scale, img.height * scale);
        ctx.restore();
    };
    const drawInitialTile = (x, y, w, h, label, radius = 12) => {
        const grad = ctx.createLinearGradient(x, y, x + w, y + h);
        grad.addColorStop(0, '#4b5563');
        grad.addColorStop(1, '#111827');
        ctx.fillStyle = grad;
        (0, rendering_1.roundRect)(ctx, x, y, w, h, radius);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${Math.max(18, Math.floor(w * 0.32))}px "${font}"`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(getInitials(label), x + w / 2, y + h / 2);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
    };
    // 1. Header
    if (iconImg)
        drawImageCover(iconImg, cx, dy, iconSize, iconSize, 12);
    else
        drawInitialTile(cx, dy, iconSize, iconSize, title, 12);
    // Title
    const titleX = cx + iconSize + 24;
    ctx.fillStyle = '#333';
    ctx.font = `bold 32px "${font}"`;
    ctx.textBaseline = 'top';
    const titleDrawnH = (0, rendering_1.wrapText)(ctx, title, titleX, dy - 4, titleAreaW, 40, 3, true);
    // SubTitle
    let subY = titleDrawnH + 5;
    if (subTitle) {
        ctx.fillStyle = '#888';
        ctx.font = `16px "${font}"`;
        ctx.fillText(subTitle, titleX, subY);
        subY += 25;
    }
    // Authors
    if (authors.length) {
        let ax = titleX;
        for (const a of authors.slice(0, 3)) { // 最多显示3个作者
            ctx.save();
            ctx.beginPath();
            ctx.arc(ax + 12, subY + 12, 12, 0, Math.PI * 2);
            ctx.clip();
            if (a.imgCache)
                ctx.drawImage(a.imgCache, ax, subY, 24, 24);
            else {
                ctx.fillStyle = '#d1d5db';
                ctx.fillRect(ax, subY, 24, 24);
            }
            ctx.restore();
            if (!a.imgCache) {
                ctx.fillStyle = '#6b7280';
                ctx.font = `bold 11px "${font}"`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(getInitials(a.n).slice(0, 1), ax + 12, subY + 12);
                ctx.textAlign = 'left';
                ctx.textBaseline = 'alphabetic';
            }
            ctx.fillStyle = '#666';
            ctx.font = `14px "${font}"`;
            let name = a.n;
            while (ctx.measureText(name).width > 130 && name.length > 2)
                name = `${name.slice(0, -2)}...`;
            if (ax + 30 + ctx.measureText(name).width > cx + contentW)
                break;
            ctx.fillText(name, ax + 30, subY + 5);
            ax += ctx.measureText(name).width + 45;
        }
    }
    dy += headerH + 16;
    // 2. Tags
    if (tags.length) {
        let tx = cx;
        let ty = dy;
        ctx.textBaseline = 'middle';
        tags.forEach(t => {
            ctx.font = `12px "${font}"`;
            const tw = ctx.measureText(t.t).width + 20;
            if (tx !== cx && tx + tw > cx + contentW) {
                tx = cx;
                ty += 28;
            }
            ctx.fillStyle = t.bg;
            (0, rendering_1.roundRect)(ctx, tx, ty, tw, 24, 6);
            ctx.fill();
            ctx.fillStyle = t.c;
            ctx.fillText(t.t, tx + 10, ty + 12);
            tx += tw + 10;
        });
        ctx.textBaseline = 'alphabetic';
        dy += tagsH + 20;
    }
    // 3. Cover Image
    if (showCover) {
        drawImageCover(coverImg, cx, dy, contentW, coverH, 12);
        dy += coverH + 25;
    }
    // 4. Stats Grid
    if (statsItems.length) {
        const cols = 4;
        const gap = 15;
        const itemW = (contentW - (cols - 1) * gap) / cols;
        const itemH = 70;
        statsItems.forEach((s, i) => {
            const c = i % cols;
            const r = Math.floor(i / cols);
            const x = cx + c * (itemW + gap);
            const y = dy + r * (itemH + gap);
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            (0, rendering_1.roundRect)(ctx, x, y, itemW, itemH, 10);
            ctx.fill();
            ctx.textAlign = 'center';
            ctx.fillStyle = '#888';
            ctx.font = `12px "${font}"`;
            ctx.fillText(s.l, x + itemW / 2, y + 15);
            ctx.fillStyle = '#333';
            ctx.font = `bold 20px "${font}"`;
            ctx.fillText(s.v, x + itemW / 2, y + 40);
        });
        ctx.textAlign = 'left';
        dy += Math.ceil(statsItems.length / cols) * (itemH + gap) + 10;
    }
    // 5. Props List
    if (props.length) {
        const colW = contentW / 2;
        props.forEach((p, i) => {
            const c = i % 2;
            const r = Math.floor(i / 2);
            const x = cx + c * colW;
            const y = dy + r * 30;
            ctx.fillStyle = '#888';
            ctx.font = `14px "${font}"`;
            ctx.fillText(p.l + ':', x, y);
            const lw = ctx.measureText(p.l + ':').width;
            ctx.fillStyle = '#333';
            // 截断过长文本
            let val = p.v;
            while (ctx.measureText(val).width > colW - lw - 20 && val.length > 5)
                val = val.slice(0, -1);
            if (val.length < p.v.length)
                val += '...';
            ctx.fillText(val, x + lw + 10, y);
        });
        dy += Math.ceil(props.length / 2) * 30 + 15;
    }
    // 6. Versions & Links
    if (versions.length) {
        ctx.fillStyle = '#333';
        ctx.font = `bold 16px "${font}"`;
        ctx.fillText('支持版本', cx, dy);
        dy += 25;
        versions.forEach(v => {
            ctx.fillStyle = '#555';
            ctx.font = `bold 14px "${font}"`;
            ctx.fillText(v.l, cx, dy);
            const lw = ctx.measureText(v.l).width + 10;
            ctx.fillStyle = '#e74c3c';
            ctx.font = `14px "${font}"`;
            dy = (0, rendering_1.wrapText)(ctx, v.v, cx + lw, dy, contentW - lw, 20, 500, true) + 5;
        });
        dy += 15;
    }
    if (links.length) {
        let lx = cx;
        let ly = dy;
        ctx.textBaseline = 'middle';
        links.forEach(l => {
            ctx.font = `bold 12px "${font}"`;
            const w = ctx.measureText(l).width + 20;
            if (lx !== cx && lx + w > cx + contentW) {
                lx = cx;
                ly += 30;
            }
            ctx.fillStyle = '#333';
            (0, rendering_1.roundRect)(ctx, lx, ly, w, 24, 12);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.fillText(l, lx + 10, ly + 12);
            lx += w + 10;
        });
        ctx.textBaseline = 'alphabetic';
        dy += Math.ceil((ly - dy + 24) / 30) * 30 + 12;
    }
    // 7. Description
    if (descNodes.length) {
        ctx.fillStyle = '#333';
        ctx.font = `bold 20px "${font}"`;
        ctx.fillText('简介', cx, dy);
        ctx.fillStyle = '#3498db';
        ctx.fillRect(cx, dy + 25, 40, 4);
        dy += 45;
        for (const node of descNodes) {
            if (node.type === 't') {
                const isHeader = node.tag === 'h';
                ctx.font = `${isHeader ? '800' : '600'} ${isHeader ? 22 : 16}px "${font}"`;
                ctx.fillStyle = isHeader ? '#2c3e50' : '#444';
                const lh = isHeader ? 32 : 26;
                dy = await (0, rendering_1.drawTextWithTwemoji)(ctx, node.val, cx, dy, contentW, lh, 5000, true) + (isHeader ? 15 : 10);
            }
            else if (node.type === 'li') {
                const bulletX = cx + 4;
                const textX = cx + 24;
                ctx.fillStyle = '#444';
                ctx.font = `600 16px "${font}"`;
                ctx.fillText('•', bulletX, dy);
                ctx.font = `600 16px "${font}"`;
                dy = await (0, rendering_1.drawTextWithTwemoji)(ctx, node.val, textX, dy, Math.max(80, contentW - (textX - cx)), 26, 5000, true) + 10;
            }
            else if (node.type === 'tb') {
                const tableH = (0, rendering_1.drawTable)(ctx, node, cx, dy, contentW, 22, `600 14px "${font}"`, `800 14px "${font}"`, { headerBg: 'rgba(52,152,219,0.12)', cellBg: 'rgba(255,255,255,0.7)', border: 'rgba(52,152,219,0.25)', text: '#2f3742' });
                dy += tableH + 16;
            }
            else if (node.type === 'g') {
                for (const item of node.items || []) {
                    if (item.error || !item.imgCache) {
                        ctx.fillStyle = 'rgba(0,0,0,0.06)';
                        (0, rendering_1.roundRect)(ctx, cx, dy, contentW, 90, 8);
                        ctx.fill();
                        ctx.fillStyle = '#999';
                        ctx.font = `600 14px "${font}"`;
                        ctx.fillText('Image failed to load', cx + 16, dy + 38);
                        dy += 110;
                        continue;
                    }
                    const dx = cx + (contentW - item.dw) / 2;
                    ctx.save();
                    (0, rendering_1.roundRect)(ctx, dx, dy, item.dw, item.dh, 8);
                    ctx.clip();
                    ctx.drawImage(item.imgCache, dx, dy, item.dw, item.dh);
                    ctx.restore();
                    dy += item.dh + 8;
                    if (item.caption) {
                        ctx.fillStyle = '#666';
                        ctx.font = `600 14px "${font}"`;
                        dy = await (0, rendering_1.drawTextWithTwemoji)(ctx, item.caption, cx, dy, contentW, 22, 5, true) + 12;
                    }
                    else {
                        dy += 8;
                    }
                }
            }
            else if (node.type === 'i') {
                if (node.imgFailed) {
                    ctx.fillStyle = 'rgba(0,0,0,0.06)';
                    (0, rendering_1.roundRect)(ctx, cx, dy, contentW, 90, 8);
                    ctx.fill();
                    ctx.fillStyle = '#999';
                    ctx.font = `600 14px "${font}"`;
                    ctx.fillText('Image failed to load', cx + 16, dy + 38);
                    dy += 110;
                    continue;
                }
                try {
                    const img = node.imgCache || await (0, rendering_1.loadImageWithHeaders)(node.src, constants_1.BASE_URL);
                    const maxH = 400;
                    let r = Math.min(contentW / img.width, maxH / img.height);
                    if (r > 1)
                        r = 1; // 避免小图片被强制拉伸放大
                    const dw = img.width * r;
                    const dh = img.height * r;
                    ctx.save();
                    (0, rendering_1.roundRect)(ctx, cx + (contentW - dw) / 2, dy, dw, dh, 8);
                    ctx.clip();
                    ctx.drawImage(img, cx + (contentW - dw) / 2, dy, dw, dh);
                    ctx.restore();
                    dy += dh + 20;
                }
                catch (e) { }
            }
            else if (node.type === 'br') {
                dy += 10;
            }
        }
    }
    // Footer
    ctx.fillStyle = '#999';
    ctx.font = `12px "${font}"`;
    ctx.textAlign = 'center';
    ctx.fillText('mcmod.cn | Powered by Koishi', width / 2, totalH - 12);
    return await canvas.encode('png');
}
