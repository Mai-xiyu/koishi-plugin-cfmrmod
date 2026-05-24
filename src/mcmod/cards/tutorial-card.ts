const cheerio = require('cheerio');
import { BASE_URL, CENTER_URL } from '../constants';
import { fetchMcmodText, fetchWithTimeout, getHeaders } from '../http';
import { createCanvas, drawTable, drawTextWithTwemoji, GLOBAL_FONT_FAMILY, loadImage, loadImageWithHeaders, measureTableLayout, roundRect, wrapText } from '../rendering';
import { cleanText, compactUrlText, extractImageUrl, fixUrl, parseGalleryFromTable } from '../utils';
// ================= 渲染：教程卡片 (macOS 风格) =================
export async function drawTutorialCard(url) {
    const html = await fetchMcmodText(url, { headers: getHeaders(url) });
    const $ = cheerio.load(html);

    // --- 1. 核心数据抓取 ---

    // 标题
    const title = cleanText($('h1, .post-title, .article-title, .postname h5').first().text()) || cleanText($('title').text().split('-')[0]);
    
    // 作者
    let author = cleanText($('.post-user-frame .post-user-name a').first().text());
    if (!author) author = cleanText($('.post-user-name a').first().text());
    if (!author) author = cleanText($('a[href*="/center/"]').first().text());
    if (!author) author = '未知作者';
    
    // 头像
    let authorAvatar = fixUrl($('.post-user-frame .post-user-avatar img').attr('src'));
    if (!authorAvatar) authorAvatar = fixUrl($('.post-user-avatar img').attr('src'));

    // 浏览量/日期
    let views = '0';
    let date = '';
    $('.common-rowlist-2 li').each((i, el) => {
      const text = $(el).text();
      if (text.includes('浏览量')) views = text.replace(/[^0-9]/g, '') || '0';
      if (text.includes('创建日期')) {
        const fullDate = $(el).attr('data-original-title');
        date = fullDate ? fullDate.split(' ')[0] : text.replace('创建日期：', '').trim();
      }
    });
    
    // 互动数据
    function getSocialNum(className) {
      let result = '0';
      const selectors = [
        `.common-fuc-group[data-category="post"] li.${className} div.nums`,
        `.common-fuc-group li.${className} div.nums`,
        `.common-fuc-group li.${className} .nums`,
        `li.${className} div.nums`,
      ];
      for (const sel of selectors) {
        const el = $(sel);
        if (el.length > 0) {
          const titleAttr = el.attr('title');
          if (titleAttr) {
            const num = titleAttr.replace(/,/g, '').trim();
            if (num && /^\d+$/.test(num)) return num;
          }
          const text = el.text().replace(/,/g, '').trim();
          if (text && /^\d+$/.test(text)) return text;
        }
      }
      return result;
    }
    const pushNum = getSocialNum('push');
    const favNum = getSocialNum('like');

    // 目录
    const tocItems = [];
    $('a[href^="javascript:void(0);"]').each((i, el) => {
      const text = cleanText($(el).text());
      if (text && text.length > 2 && text.length < 50 && !text.includes('百科') && !text.includes('登录')) {
        tocItems.push(text);
      }
    });

    // 正文提取
    const contentNodes = [];
    const contentRoot = $('.post-content, .article-content, .common-text, .news-text').first();
    const BLOCK_TAGS = new Set(['p', 'div', 'section', 'article', 'blockquote', 'ul', 'ol']);
    const SKIP_TAGS = new Set(['script', 'style', 'noscript', 'svg']);
    let textBuffer = '';
    let textTag = 'p';

    const normalizeText = (text) => String(text || '')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t\f\v]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    const pushTextNode = (text, tag = 'p') => {
      const normalized = normalizeText(text);
      if (!normalized) return;
      const last = contentNodes[contentNodes.length - 1];
      if (last?.type === 't' && last.tag === tag && tag !== 'h') {
        last.val = `${last.val}\n${normalized}`;
        return;
      }
      contentNodes.push({ type: 't', val: normalized, tag });
    };

    const flushText = () => {
      if (!textBuffer) return;
      pushTextNode(textBuffer, textTag || 'p');
      textBuffer = '';
      textTag = 'p';
    };

    const appendText = (text, tag = 'p') => {
      if (!text) return;
      if (textBuffer && textTag !== tag) flushText();
      textTag = tag;
      textBuffer += text;
    };

    function parseContent(node, preferredTag = 'p') {
      if (!node) return;
      if (node.type === 'text') {
        appendText(node.data || '', preferredTag);
        return;
      }
      if (node.type !== 'tag') return;

      const tagName = String(node.name || '').toLowerCase();
      if (!tagName || SKIP_TAGS.has(tagName)) return;

      if (tagName === 'img') {
        const src = extractImageUrl(node);
        const alt = normalizeText(node.attribs.alt || '');
        const isEmojiLikeAlt = !!alt && /^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F|\p{Emoji}\u200D)+$/u.test(alt);
        const isEmojiLikeSrc = /emoji|smilies|twemoji|emot/i.test(src || '');
        if ((isEmojiLikeAlt || isEmojiLikeSrc) && alt) {
          appendText(alt, preferredTag);
          return;
        }
        flushText();
        if (src && !src.includes('loading') && !src.includes('icon')) {
          contentNodes.push({ type: 'i', src: fixUrl(src) });
        }
        return;
      }

      if (tagName === 'br') {
        appendText('\n', preferredTag);
        return;
      }

      if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
        flushText();
        pushTextNode($(node).text(), 'h');
        return;
      }

      if (tagName === 'li') {
        flushText();
        appendText('', 'li');
        if (node.children) node.children.forEach(child => parseContent(child, 'li'));
        const text = normalizeText(textBuffer);
        textBuffer = '';
        textTag = 'p';
        if (text) contentNodes.push({ type: 'li', val: text });
        return;
      }

      if (tagName === 'table') {
        flushText();
        const galleryItems = parseGalleryFromTable($, node);
        if (galleryItems.length) {
          contentNodes.push({ type: 'g', items: galleryItems });
          return;
        }
        const rows = [];
        $(node).find('tr').each((_, tr) => {
          const row = [];
          $(tr).find('th,td').each((__, cell) => row.push(normalizeText($(cell).text())));
          if (row.some(Boolean)) rows.push(row);
        });
        if (rows.length) contentNodes.push({ type: 'tb', rows });
        return;
      }

      if (tagName === 'a') {
        const text = normalizeText($(node).text());
        const href = fixUrl(node.attribs.href);
        const label = text || compactUrlText(href);
        if (label) appendText(label, preferredTag);
        return;
      }

      const isBlock = BLOCK_TAGS.has(tagName);
      if (isBlock) flushText();
      if (node.children) node.children.forEach(child => parseContent(child, preferredTag));
      if (isBlock) flushText();
    }
    
    if (contentRoot.length) {
      const textContainer = contentRoot.find('.text').first();
      if (textContainer.length > 0) textContainer[0].children.forEach(parseContent);
      else contentRoot[0].children.forEach(parseContent);
    }
    flushText();
    
    if (contentNodes.length === 0) {
      const metaDesc = $('meta[name="description"]').attr('content');
      if (metaDesc) contentNodes.push({ type: 't', val: metaDesc, tag: 'p' });
    }

    // --- 2. 布局常量定义 ---
    const width = 1000;
    const font = GLOBAL_FONT_FAMILY;
    const margin = 20;
    const winPadding = 40;
    const contentW = width - margin * 2 - winPadding * 2;

    // --- 3. 关键步骤：预加载图片以获取真实高度 ---
    // 并行加载所有图片，确保后续高度计算准确
    await Promise.all(contentNodes.map(async (node) => {
      if (node.type === 'i') {
        try {
          const img = await loadImageWithHeaders(node.src, BASE_URL);
          node.img = img; // 保存 Image 对象
          // 计算自适应尺寸：宽度最大为 contentW，高度按比例缩放，不设上限
          const scale = Math.min(contentW / img.width, 1); 
          node.dw = img.width * scale;
          node.dh = img.height * scale;
        } catch (e) {
          node.error = true;
        }
      } else if (node.type === 'g') {
        for (const item of node.items || []) {
          try {
            const img = await loadImageWithHeaders(item.src, BASE_URL);
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
          } catch (e) {
            item.error = true;
          }
        }
      }
    }));

    // --- 4. 精确计算总高度 ---
    const dummyC = createCanvas(100, 100);
    const dummy = dummyC.getContext('2d');
    let totalH = 0;
    
    // Header 高度
    dummy.font = `bold 32px "${font}"`;
    const titleLines = wrapText(dummy, title, 0, 0, contentW, 45, 5, false) / 45;
    const headerH = 60 + titleLines * 45 + 50 + 20;
    totalH += headerH;

    // TOC 高度
    let tocH = 0;
    if (tocItems.length > 0) {
      tocH = 50 + Math.ceil(tocItems.length / 2) * 35 + 20;
      totalH += tocH;
    }

    // 正文高度 (使用真实图片高度)
    let contentH = 0;
    dummy.font = `16px "${font}"`;
    for (const node of contentNodes) {
      if (node.type === 't') {
        const isHeader = node.tag === 'h';
        const fontSize = isHeader ? 22 : 16;
        dummy.font = `${isHeader ? 'bold' : ''} ${fontSize}px "${font}"`;
        const lineHeight = Math.floor(fontSize * 1.6);
        // 这里不再限制行数 (limit = 10000)，显示全部文本
        const lines = wrapText(dummy, node.val, 0, 0, contentW, lineHeight, 10000, false) / lineHeight;
        contentH += lines * lineHeight + (isHeader ? 25 : 15);
      } else if (node.type === 'li') {
        dummy.font = `600 16px "${font}"`;
        const h = wrapText(dummy, node.val, 0, 0, Math.max(80, contentW - 24), 26, 10000, false);
        contentH += h + 12;
      } else if (node.type === 'tb') {
        const tableH = measureTableLayout(
          dummy,
          node,
          contentW,
          22,
          `600 14px "${font}"`,
          `800 14px "${font}"`
        )?.totalH || 0;
        contentH += tableH + 20;
      } else if (node.type === 'g') {
        for (const item of node.items || []) {
          if (item.error || !item.imgCache) {
            contentH += 110;
            continue;
          }
          const captionH = item.caption ? wrapText(dummy, item.caption, 0, 0, contentW, 22, 5, false) : 0;
          contentH += item.dh + captionH + 24;
        }
      } else if (node.type === 'i' && !node.error && node.img) {
        // 使用预加载时计算出的真实高度
        contentH += node.dh + 25; 
      }
    }
    if (contentH === 0) contentH = 100;
    totalH += contentH + 50; // Padding

    const windowH = totalH+100;
    const canvasH = windowH + margin * 2;

    // --- 5. 绘制 ---
    const canvas = createCanvas(width, canvasH);
    const ctx = canvas.getContext('2d');

    // 背景 (Bing)
    try {
      const bgUrl = 'https://bing.biturl.top/?resolution=1920&format=image&index=0&mkt=zh-CN';
      const bgImg = await loadImage(bgUrl);
      const r = Math.max(width / bgImg.width, canvasH / bgImg.height);
      ctx.drawImage(bgImg, (width - bgImg.width * r) / 2, (canvasH - bgImg.height * r) / 2, bgImg.width * r, bgImg.height * r);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.fillRect(0, 0, width, canvasH);
    } catch (e) {
      const grad = ctx.createLinearGradient(0, 0, 0, canvasH);
      grad.addColorStop(0, '#a18cd1'); grad.addColorStop(1, '#fbc2eb');
      ctx.fillStyle = grad; ctx.fillRect(0, 0, width, canvasH);
    }

    // 窗口主体
    const winX = margin, winY = margin;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    roundRect(ctx, winX, winY, width - margin * 2, windowH, 16);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1;
    roundRect(ctx, winX, winY, width - margin * 2, windowH, 16); ctx.stroke();

    // 交通灯
    ['#ff5f56', '#ffbd2e', '#27c93f'].forEach((c, i) => {
      ctx.beginPath(); ctx.arc(winX + 25 + i * 25, winY + 25, 6, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill();
    });

    // --- 内容绘制 ---
    let dy = winY + 60;
    const cx = winX + winPadding;

    // 1. Header
    ctx.fillStyle = '#333'; ctx.font = `bold 32px "${font}"`; ctx.textBaseline = 'top';
    const drawnTitleH = wrapText(ctx, title, cx, dy, contentW, 45, 5, true);
    dy += drawnTitleH + 20;

    // Meta Info
    const avSize = 40;
    if (authorAvatar) {
      try {
        const img = await loadImageWithHeaders(authorAvatar, BASE_URL);
        ctx.save(); ctx.beginPath(); ctx.arc(cx + avSize/2, dy + avSize/2, avSize/2, 0, Math.PI*2); ctx.clip();
        ctx.drawImage(img, cx, dy, avSize, avSize); ctx.restore();
      } catch(e) {
        ctx.fillStyle = '#ccc'; ctx.beginPath(); ctx.arc(cx + avSize/2, dy + avSize/2, avSize/2, 0, Math.PI*2); ctx.fill();
      }
    } else {
      ctx.fillStyle = '#ccc'; ctx.beginPath(); ctx.arc(cx + avSize/2, dy + avSize/2, avSize/2, 0, Math.PI*2); ctx.fill();
    }

    ctx.fillStyle = '#333'; ctx.font = `bold 16px "${font}"`;
    ctx.fillText(author, cx + avSize + 15, dy + 5);
    ctx.fillStyle = '#888'; ctx.font = `12px "${font}"`;
    ctx.fillText(date || '未知日期', cx + avSize + 15, dy + 25);

    // Stats
    const statsY = dy + 10;
    let sx = cx + contentW;
    const drawStat = (icon, val, color) => {
      ctx.textAlign = 'right';
      ctx.fillStyle = color; ctx.font = `bold 16px "${font}"`;
      const vw = ctx.measureText(val).width;
      ctx.fillText(val, sx, statsY);
      ctx.fillStyle = '#999'; ctx.font = `12px "${font}"`;
      ctx.fillText(icon, sx - vw - 5, statsY);
      sx -= (vw + 5 + ctx.measureText(icon).width + 20);
      ctx.textAlign = 'left';
    };
    
    drawStat('收藏', favNum, '#f1c40f');
    drawStat('推荐', pushNum, '#e74c3c');
    drawStat('浏览', views, '#3498db');

    dy += avSize + 30;

    // Divider
    ctx.fillStyle = 'rgba(0,0,0,0.05)'; ctx.fillRect(cx, dy, contentW, 1);
    dy += 25;

    // 2. TOC
    if (tocItems.length > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.03)';
      roundRect(ctx, cx, dy, contentW, tocH - 20, 10); ctx.fill();
      ctx.fillStyle = '#555'; ctx.font = `bold 16px "${font}"`;
      ctx.fillText('目录', cx + 20, dy + 30);
        
      let tx = cx + 20; let ty = dy + 60;
      const colW = (contentW - 40) / 2;
      ctx.fillStyle = '#666'; ctx.font = `14px "${font}"`;
      tocItems.forEach((item, i) => {
        const col = i % 2; 
        if (col === 0 && i > 0) ty += 30;
        const x = tx + col * colW;
        let displayTitle = item;
        if (ctx.measureText(displayTitle).width > colW - 20) {
          while (ctx.measureText(displayTitle + '...').width > colW - 20 && displayTitle.length > 0) displayTitle = displayTitle.slice(0, -1);
          displayTitle += '...';
        }
        ctx.fillText(`${i+1}. ${displayTitle}`, x, ty);
      });
      dy += tocH + 10;
    }

    // 3. Content (Drawing loop)
    for (const node of contentNodes) {
      if (node.type === 't') {
        const isHeader = node.tag === 'h';
        const fontSize = isHeader ? 22 : 16;
        ctx.font = `${isHeader ? '800' : '600'} ${fontSize}px "${font}"`;
        ctx.fillStyle = isHeader ? '#2c3e50' : '#444';
            
        if (isHeader) {
          ctx.fillStyle = '#3498db';
          ctx.fillRect(cx - 15, dy + 5, 4, fontSize);
          ctx.fillStyle = '#2c3e50';
        }
            
        const lineHeight = Math.floor(fontSize * 1.6);
        dy = await drawTextWithTwemoji(ctx, node.val, cx, dy, contentW, lineHeight, 10000, true) + (isHeader ? 20 : 15);
      } else if (node.type === 'li') {
        const bulletX = cx + 4;
        const textX = cx + 24;
        ctx.fillStyle = '#444';
        ctx.font = `600 16px "${font}"`;
        ctx.fillText('•', bulletX, dy);
        ctx.font = `600 16px "${font}"`;
        dy = await drawTextWithTwemoji(ctx, node.val, textX, dy, Math.max(80, contentW - (textX - cx)), 26, 10000, true) + 12;
      } else if (node.type === 'tb') {
        const tableH = drawTable(
          ctx,
          node,
          cx,
          dy,
          contentW,
          22,
          `600 14px "${font}"`,
          `800 14px "${font}"`,
          { headerBg: 'rgba(52,152,219,0.12)', cellBg: 'rgba(255,255,255,0.7)', border: 'rgba(52,152,219,0.25)', text: '#2f3742' }
        );
        dy += tableH + 20;
      } else if (node.type === 'g') {
        for (const item of node.items || []) {
          if (item.error || !item.imgCache) {
            ctx.fillStyle = 'rgba(0,0,0,0.06)';
            roundRect(ctx, cx, dy, contentW, 90, 8); ctx.fill();
            ctx.fillStyle = '#999';
            ctx.font = `600 14px "${font}"`;
            ctx.fillText('Image failed to load', cx + 16, dy + 38);
            dy += 110;
            continue;
          }
          const dx = cx + (contentW - item.dw) / 2;
          ctx.save();
          roundRect(ctx, dx, dy, item.dw, item.dh, 8); ctx.clip();
          ctx.drawImage(item.imgCache, dx, dy, item.dw, item.dh);
          ctx.restore();
          dy += item.dh + 8;
          if (item.caption) {
            ctx.fillStyle = '#666';
            ctx.font = `600 14px "${font}"`;
            dy = await drawTextWithTwemoji(ctx, item.caption, cx, dy, contentW, 22, 5, true) + 12;
          } else {
            dy += 8;
          }
        }
            
      } else if (node.type === 'i' && !node.error && node.img) {
        // 绘制预加载的图片
        // 居中显示
        const dx = cx + (contentW - node.dw) / 2;
            
        ctx.save();
        // 绘制图片 (圆角效果)
        roundRect(ctx, dx, dy, node.dw, node.dh, 8); 
        ctx.clip();
        ctx.drawImage(node.img, dx, dy, node.dw, node.dh);
        ctx.restore();
            
        dy += node.dh + 25;
      } else if (node.type === 'i' && (node.error || !node.img)) {
        ctx.fillStyle = 'rgba(0,0,0,0.06)';
        roundRect(ctx, cx, dy, contentW, 90, 8); ctx.fill();
        ctx.fillStyle = '#999';
        ctx.font = `600 14px "${font}"`;
        ctx.fillText('Image failed to load', cx + 16, dy + 38);
        dy += 110;
      }
    }

    // Footer
    dy += 30;
    ctx.fillStyle = '#aaa'; ctx.font = `12px "${font}"`; ctx.textAlign = 'center';
    ctx.fillText('mcmod.cn | Powered by Koishi', width / 2, canvasH - 15);

    return await canvas.encode('png');
  }
