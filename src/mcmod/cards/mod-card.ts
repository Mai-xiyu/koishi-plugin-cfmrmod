const cheerio = require('cheerio');
import { BASE_URL, CENTER_URL } from '../constants';
import { fetchMcmodText, fetchWithTimeout, getHeaders } from '../http';
import { createCanvas, drawTable, drawTextWithTwemoji, GLOBAL_FONT_FAMILY, loadImage, loadImageWithHeaders, measureTableLayout, roundRect, wrapText } from '../rendering';
import { cleanText, compactUrlText, extractImageUrl, fixUrl, parseGalleryFromTable } from '../utils';
// ================= 渲染：模组/整合包卡片 (macOS 风格) =================
export async function drawModCard(url) {
    const html = await fetchMcmodText(url, { headers: getHeaders(url) });
    const $ = cheerio.load(html);

    // --- 1. 数据抓取 (保持原逻辑，确保稳定性) ---
    const titleEl = $('.class-title').clone();
    titleEl.find('.class-official-group').remove();
    const titleHtml = titleEl.html() || '';
    const cleanTitleStr = titleHtml.replace(/<[^>]+>/g, '\n');
    const titleLines = cleanTitleStr.split('\n').map(s=>s.trim()).filter(s=>s);
    const title = titleLines[0] || cleanText($('.class-title').text().replace(/开源|活跃|稳定|闭源|停更|弃坑|半弃坑|Beta/g, '').trim());
    const subTitle = titleLines.slice(1).join(' ');

    let coverUrl = fixUrl($('.class-cover-image img').attr('src'));
    let iconUrl = fixUrl($('.class-icon img').attr('src'));
    // 如果没有封面，用图标代替；如果没有图标，尝试用封面代替
    if (!coverUrl && iconUrl) coverUrl = iconUrl;
    if (!iconUrl && coverUrl) iconUrl = coverUrl;

    // 标签
    const tags = [];
    const officialTags = new Set();
    $('.class-official-group div').each((i, el) => {
      const txt = cleanText($(el).text());
      if (!txt || txt.length > 20) return;
      officialTags.add(txt);
      let color = '#999', bg = '#eee';
      if (txt.includes('开源') || txt.includes('活跃') || txt.includes('稳定')) { color = '#2ecc71'; bg = '#e8f5e9'; }
      else if (txt.includes('半弃坑') || txt.includes('Beta')) { color = '#f39c12'; bg = '#fef9e7'; }
      else if (txt.includes('停更') || txt.includes('闭源') || txt.includes('弃坑')) { color = '#e74c3c'; bg = '#fce4ec'; }
      tags.push({ t: txt, bg, c: color });
    });
    $('.class-label-list a').each((i, el) => {
      const labelText = cleanText($(el).text());
      if (!labelText || officialTags.has(labelText)) return;
      const cls = $(el).attr('class') || '';
      let bg = '#e3f2fd', c = '#3498db';
      if(cls.includes('c_1')) { bg='#e8f5e9'; c='#2ecc71'; } 
      else if(cls.includes('c_3')) { bg='#fff3e0'; c='#e67e22'; }
      tags.push({ t: labelText, bg, c });
    });

    // 统计数据
    let score = cleanText($('.class-score-num').text());
    let scoreComment = '';
    if(!score || score === '') {
      score = cleanText($('.class-excount .star .up').text()) || '0.0';
      scoreComment = cleanText($('.class-excount .star .down').text());
    }
    if (!scoreComment) scoreComment = '暂无评价';
    const yIndex = cleanText($('.class-excount .star .text').first().text().replace('昨日指数:','').trim());
    
    let viewNum = '0', fillRate = '--';
    $('.class-excount .infos .span').each((i, el) => {
      const t = $(el).find('.t').text();
      const n = cleanText($(el).find('.n').text());
      if(t.includes('浏览')) viewNum = n;
      if(t.includes('填充')) fillRate = n;
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
          if (titleAttr && /^\d+$/.test(titleAttr.replace(/,/g, '').trim())) { result = titleAttr.replace(/,/g, '').trim(); break; }
          const text = el.text().replace(/,/g, '').trim();
          if (text && /^\d+$/.test(text)) { result = text; break; }
        }
      }
      return result;
    }
    const pushNum = getSocialNum('push');
    const favNum = getSocialNum('like');
    const subNum = getSocialNum('subscribe');

    // 作者
    const authors = [];
    $('.author-list li, .author li').each((i, el) => {
      const n = cleanText($(el).find('.name').text());
      const r = cleanText($(el).find('.position').text());
      const iurl = fixUrl($(el).find('img').attr('src'));
      if(n) authors.push({ n, r, i: iurl });
    });

    // 属性
    const props = [];
    $('.class-meta-list li').each((i, el) => {
      const l = cleanText($(el).find('h4').text());
      const v = cleanText($(el).find('.text').text());
      if(l && v && !l.includes('编辑') && !l.includes('推荐') && !l.includes('收录') && !l.includes('最后')) {
        props.push({ l, v });
      }
    });

    // 版本
    const versions = [];
    const mcVerRoot = $('.mcver');
    let verGroups = mcVerRoot.find('ul ul'); 
    if (verGroups.length === 0) verGroups = mcVerRoot.find('ul').first();
    const allUls = mcVerRoot.find('ul');
    allUls.each((i, ul) => {
      if ($(ul).find('ul').length > 0) return;
      let loader = '';
      const vers = [];
      $(ul).find('li').each((j, li) => {
        const txt = cleanText($(li).text());
        if (txt.includes(':') || txt.includes('：')) loader = txt.replace(/[:：]/g, '').trim();
        else vers.push(txt);
      });
      if (loader && vers.length > 0) versions.push({ l: loader, v: vers.join(', ') });
    });

    // 链接
    const links = [];
    $('.common-link-icon-frame a').each((i, el) => {
      const name = $(el).attr('data-original-title') || 'Link';
      let sn = name;
      if(name.includes('GitHub')) sn='GitHub';
      else if(name.includes('CurseForge')) sn='CurseForge';
      else if(name.includes('Modrinth')) sn='Modrinth';
      else if(name.includes('百科')) sn='Wiki';
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
      if (!normalized) return;
      const last = descNodes[descNodes.length - 1];
      if (last?.type === 't' && last.tag === tag && tag !== 'h') {
        last.val = `${last.val}\n${normalized}`;
        return;
      }
      descNodes.push({ type: 't', val: normalized, tag });
    };

    const flushParagraph = () => {
      if (!paragraphBuffer) return;
      pushTextNode(paragraphBuffer, paragraphTag || 'p');
      paragraphBuffer = '';
      paragraphTag = 'p';
    };

    const appendText = (text, tag = 'p') => {
      if (!text) return;
      if (paragraphBuffer && paragraphTag !== tag) flushParagraph();
      paragraphTag = tag;
      paragraphBuffer += text;
    };

    function parseNode(node, depth = 0, preferredTag = 'p') {
      if (depth > 12) return;
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
        flushParagraph();
        if (src && !src.includes('icon') && !src.includes('loading')) {
          descNodes.push({ type: 'i', src: fixUrl(src) });
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
        if (node.children) node.children.forEach(child => parseNode(child, depth + 1, 'li'));
        const text = normalizeText(paragraphBuffer);
        paragraphBuffer = '';
        paragraphTag = 'p';
        if (text) descNodes.push({ type: 'li', val: text });
        return;
      }

      if (tagName === 'table') {
        flushParagraph();
        const galleryItems = parseGalleryFromTable($, node);
        if (galleryItems.length) {
          descNodes.push({ type: 'g', items: galleryItems });
          return;
        }
        const rows = [];
        $(node).find('tr').each((_, tr) => {
          const row = [];
          $(tr).find('th,td').each((__, cell) => row.push(normalizeText($(cell).text())));
          if (row.some(Boolean)) rows.push(row);
        });
        if (rows.length) descNodes.push({ type: 'tb', rows });
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
      if (isBlock) flushParagraph();
      if (node.children) node.children.forEach(child => parseNode(child, depth + 1, preferredTag));
      if (isBlock) flushParagraph();
    }
    if (descRoot.length) {
      descRoot[0].children.forEach(child => parseNode(child, 0));
      flushParagraph();
    }
    if (descNodes.length === 0) {
      const metaDesc = $('meta[name="description"]').attr('content');
      if (metaDesc) descNodes.push({ type: 't', val: metaDesc, tag: 'p' });
    }

    // --- 2. 布局计算 (macOS 风格) ---
    const width = 800;
    const font = GLOBAL_FONT_FAMILY;
    const margin = 20; // 窗口外边距
    const winPadding = 35; // 窗口内边距
    const contentW = width - margin * 2 - winPadding * 2;
    
    // 预计算高度
    const dummyC = createCanvas(100, 100);
    const dummy = dummyC.getContext('2d');
    dummy.font = `bold 32px "${font}"`;

    // 头部区域 (Header)
    let headerH = 100; // Icon(80) + padding
    const titleLinesNum = wrapText(dummy, title, 0, 0, contentW - 100, 40, 10, false) / 40;
    headerH = Math.max(headerH, 10 + titleLinesNum * 40 + (subTitle ? 25 : 0) + (authors.length ? 40 : 0));
    
    // 标签区域
    let tagsH = 0;
    if (tags.length) tagsH = 40;

    // 封面图 (Cover)
    let coverH = 0;
    if (coverUrl) coverH = 300; // 固定封面显示高度

    // 统计数据 (Stats Grid)
    // 布局：每行4个数据
    const statsItems = [
      { l: '评分', v: score }, { l: '热度', v: viewNum }, 
      { l: '推荐', v: pushNum }, { l: '收藏', v: favNum },
      { l: '关注', v: subNum }
    ];
    if (fillRate !== '--') statsItems.push({ l: '填充率', v: fillRate });
    if (yIndex) statsItems.push({ l: '昨日指数', v: yIndex });
    
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
        const lines = wrapText(dummy, v.v, 0, 0, contentW - lw, 20, 500, false) / 20;
        extraH += lines * 20 + 10;
      });
    }
    if (links.length) extraH += 50;

    // 简介 (Desc)
    let descH = 0;
    dummy.font = `16px "${font}"`;
    for (const node of descNodes) {
      if (node.type === 't') {
        const isHeader = node.tag === 'h';
        dummy.font = `${isHeader ? 'bold' : ''} ${isHeader ? 22 : 16}px "${font}"`;
        const lh = isHeader ? 32 : 26;
        const totalNodeHeight = wrapText(dummy, node.val, 0, 0, contentW, lh, 5000, false);
        descH += totalNodeHeight + (isHeader ? 15 : 10);
      } else if (node.type === 'li') {
        dummy.font = `600 16px "${font}"`;
        const h = wrapText(dummy, node.val, 0, 0, Math.max(80, contentW - 24), 26, 5000, false);
        descH += h + 10;
      } else if (node.type === 'tb') {
        const tableH = measureTableLayout(
          dummy,
          node,
          contentW,
          22,
          `600 14px "${font}"`,
          `800 14px "${font}"`
        )?.totalH || 0;
        descH += tableH + 16;
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
            const captionH = item.caption ? wrapText(dummy, item.caption, 0, 0, contentW, 22, 5, false) : 0;
            descH += dh + captionH + 26;
          } catch (e) {
            item.error = true;
            descH += 110;
          }
        }
      } else if (node.type === 'i') {
        try {
            const img = await loadImageWithHeaders(node.src, BASE_URL);
          node.imgCache = img; // 缓存供绘制时使用
          const maxH = 400;
          let r = Math.min(contentW / img.width, maxH / img.height);
          if (r > 1) r = 1;
          const dh = img.height * r;
          descH += dh + 20;
        } catch(e) {
          node.imgFailed = true;
        }
      } else if (node.type === 'br') {
        descH += 10;
      }
    }
    if (descH > 0) descH += 50; // Title + Padding

    // 总高度
    let cursorY = margin + 40; // Top traffic lights area
    const components = [
      { h: tagsH, gap: 10 },
      { h: headerH, gap: 20 },
      { h: coverH, gap: 25 },
      { h: statsH, gap: 25 },
      { h: propsH, gap: 25 },
      { h: extraH, gap: 25 },
      { h: descH, gap: 20 }
    ];
    
    components.forEach(c => { if(c.h > 0) cursorY += c.h + c.gap; });
    const windowH = cursorY;
    const totalH = windowH + margin * 2;

    // --- 3. 开始绘制 ---
    const canvas = createCanvas(width, totalH);
    const ctx = canvas.getContext('2d');

    // 背景 (Bing 壁纸)
    try {
      const bgUrl = 'https://bing.biturl.top/?resolution=1920&format=image&index=0&mkt=zh-CN';
      const bgImg = await loadImage(bgUrl);
      const r = Math.max(width / bgImg.width, totalH / bgImg.height);
      ctx.drawImage(bgImg, (width - bgImg.width * r) / 2, (totalH - bgImg.height * r) / 2, bgImg.width * r, bgImg.height * r);
      ctx.fillStyle = 'rgba(0,0,0,0.15)'; // 遮罩
      ctx.fillRect(0, 0, width, totalH);
    } catch (e) {
      const grad = ctx.createLinearGradient(0, 0, 0, totalH);
      grad.addColorStop(0, '#e0c3fc'); grad.addColorStop(1, '#8ec5fc');
      ctx.fillStyle = grad; ctx.fillRect(0, 0, width, totalH);
    }

    // 窗口 (Acrylic)
    const winX = margin;
    const winY = margin;
    
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.2)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 20;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    roundRect(ctx, winX, winY, width - margin * 2, windowH, 16);
    ctx.fill();
    ctx.restore();
    
    // 窗口边框
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1;
    roundRect(ctx, winX, winY, width - margin * 2, windowH, 16);
    ctx.stroke();

    // 交通灯
    const trafficY = winY + 20;
    ['#ff5f56', '#ffbd2e', '#27c93f'].forEach((c, i) => {
      ctx.beginPath(); ctx.arc(winX + 20 + i * 25, trafficY, 6, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill();
    });

    // --- 内容绘制 ---
    let dy = winY + 50;
    const cx = winX + winPadding;

    // 1. Tags
    if (tags.length) {
      let tx = cx;
      ctx.textBaseline = 'middle'; // Fix tag text centering
      tags.forEach(t => {
        ctx.font = `12px "${font}"`;
        const tw = ctx.measureText(t.t).width + 20;
        if (tx + tw < cx + contentW) {
          ctx.fillStyle = t.bg; roundRect(ctx, tx, dy, tw, 24, 6); ctx.fill();
          ctx.fillStyle = t.c; ctx.fillText(t.t, tx + 10, dy + 12);
          tx += tw + 10;
        }
      });
      ctx.textBaseline = 'alphabetic'; // reset
      dy += 35;
    }

    // 2. Header
    // Icon
    const iconSize = 80;
    if (iconUrl) {
      try {
          const img = await loadImageWithHeaders(iconUrl, BASE_URL);
        ctx.save();
        roundRect(ctx, cx, dy, iconSize, iconSize, 12); ctx.clip();
        ctx.drawImage(img, cx, dy, iconSize, iconSize);
        ctx.restore();
      } catch(e) {
        ctx.fillStyle = '#ddd'; roundRect(ctx, cx, dy, iconSize, iconSize, 12); ctx.fill();
      }
    }
    
    // Title
    const titleX = cx + iconSize + 20;
    ctx.fillStyle = '#333'; ctx.font = `bold 32px "${font}"`; ctx.textBaseline = 'top';
    const titleDrawnH = wrapText(ctx, title, titleX, dy - 5, contentW - iconSize - 20, 40, 3, true);
    
    // SubTitle
    let subY = titleDrawnH + 5;
    if (subTitle) {
      ctx.fillStyle = '#888'; ctx.font = `16px "${font}"`;
      ctx.fillText(subTitle, titleX, subY);
      subY += 25;
    }

    // Authors
    if (authors.length) {
      let ax = titleX;
      for (const a of authors.slice(0, 3)) { // 最多显示3个作者
        ctx.save(); ctx.beginPath(); ctx.arc(ax + 12, subY + 12, 12, 0, Math.PI * 2); ctx.clip();
        if (a.i) { try { const img = await loadImageWithHeaders(a.i, BASE_URL); ctx.drawImage(img, ax, subY, 24, 24); } catch(e) { ctx.fillStyle='#ccc'; ctx.fill(); } }
        else { ctx.fillStyle='#ccc'; ctx.fill(); }
        ctx.restore();
            
        ctx.fillStyle = '#666'; ctx.font = `14px "${font}"`;
        ctx.fillText(a.n, ax + 30, subY + 5);
        ax += ctx.measureText(a.n).width + 45;
      }
    }
    
    dy += Math.max(headerH, 100) + 20;

    // 3. Cover Image
    if (coverUrl) {
      try {
        const img = await loadImageWithHeaders(coverUrl, BASE_URL);
        const coverW = contentW;
        const coverH_Actual = 280;
        // Crop fit
        const r = Math.max(coverW / img.width, coverH_Actual / img.height);
        ctx.save();
        roundRect(ctx, cx, dy, coverW, coverH_Actual, 12); ctx.clip();
        ctx.drawImage(img, (coverW - img.width * r) / 2 + cx, (coverH_Actual - img.height * r) / 2 + dy, img.width * r, img.height * r);
        ctx.restore();
        dy += coverH_Actual + 25;
      } catch(e) {}
    }

    // 4. Stats Grid
    if (statsItems.length) {
      const cols = 4;
      const gap = 15;
      const itemW = (contentW - (cols - 1) * gap) / cols;
      const itemH = 70;
        
      statsItems.forEach((s, i) => {
        const c = i % cols; const r = Math.floor(i / cols);
        const x = cx + c * (itemW + gap);
        const y = dy + r * (itemH + gap);
            
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        roundRect(ctx, x, y, itemW, itemH, 10); ctx.fill();
            
        ctx.textAlign = 'center';
        ctx.fillStyle = '#888'; ctx.font = `12px "${font}"`;
        ctx.fillText(s.l, x + itemW / 2, y + 15);
        ctx.fillStyle = '#333'; ctx.font = `bold 20px "${font}"`;
        ctx.fillText(s.v, x + itemW / 2, y + 40);
      });
      ctx.textAlign = 'left';
      dy += Math.ceil(statsItems.length / cols) * (itemH + gap) + 10;
    }

    // 5. Props List
    if (props.length) {
      const colW = contentW / 2;
      props.forEach((p, i) => {
        const c = i % 2; const r = Math.floor(i / 2);
        const x = cx + c * colW;
        const y = dy + r * 30;
            
        ctx.fillStyle = '#888'; ctx.font = `14px "${font}"`;
        ctx.fillText(p.l + ':', x, y);
        const lw = ctx.measureText(p.l + ':').width;
        ctx.fillStyle = '#333'; 
        // 截断过长文本
        let val = p.v;
        while(ctx.measureText(val).width > colW - lw - 20 && val.length > 5) val = val.slice(0, -1);
        if(val.length < p.v.length) val += '...';
        ctx.fillText(val, x + lw + 10, y);
      });
      dy += Math.ceil(props.length / 2) * 30 + 15;
    }

    // 6. Versions & Links
    if (versions.length) {
      ctx.fillStyle = '#333'; ctx.font = `bold 16px "${font}"`; ctx.fillText('支持版本', cx, dy); dy += 25;
      versions.forEach(v => {
        ctx.fillStyle = '#555'; ctx.font = `bold 14px "${font}"`; ctx.fillText(v.l, cx, dy);
        const lw = ctx.measureText(v.l).width + 10;
        ctx.fillStyle = '#e74c3c'; ctx.font = `14px "${font}"`; 
        dy = wrapText(ctx, v.v, cx + lw, dy, contentW - lw, 20, 500, true) + 5;
      });
      dy += 15;
    }
    if (links.length) {
      let lx = cx;
      links.forEach(l => {
        ctx.font = `bold 12px "${font}"`;
        const w = ctx.measureText(l).width + 20;
        if (lx + w < cx + contentW) {
          ctx.fillStyle = '#333'; roundRect(ctx, lx, dy, w, 24, 12); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.fillText(l, lx + 10, dy + 6);
          lx += w + 10;
        }
      });
      dy += 45;
    }

    // 7. Description
    if (descNodes.length) {
      ctx.fillStyle = '#333'; ctx.font = `bold 20px "${font}"`; ctx.fillText('简介', cx, dy);
      ctx.fillStyle = '#3498db'; ctx.fillRect(cx, dy + 25, 40, 4);
      dy += 45;
        
      for (const node of descNodes) {
        if (node.type === 't') {
          const isHeader = node.tag === 'h';
          ctx.font = `${isHeader ? '800' : '600'} ${isHeader ? 22 : 16}px "${font}"`;
          ctx.fillStyle = isHeader ? '#2c3e50' : '#444';
          const lh = isHeader ? 32 : 26;
          dy = await drawTextWithTwemoji(ctx, node.val, cx, dy, contentW, lh, 5000, true) + (isHeader ? 15 : 10);
        } else if (node.type === 'li') {
          const bulletX = cx + 4;
          const textX = cx + 24;
          ctx.fillStyle = '#444';
          ctx.font = `600 16px "${font}"`;
          ctx.fillText('•', bulletX, dy);
          ctx.font = `600 16px "${font}"`;
          dy = await drawTextWithTwemoji(ctx, node.val, textX, dy, Math.max(80, contentW - (textX - cx)), 26, 5000, true) + 10;
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
          dy += tableH + 16;
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
        } else if (node.type === 'i') {
          if (node.imgFailed) {
            ctx.fillStyle = 'rgba(0,0,0,0.06)';
            roundRect(ctx, cx, dy, contentW, 90, 8); ctx.fill();
            ctx.fillStyle = '#999';
            ctx.font = `600 14px "${font}"`;
            ctx.fillText('Image failed to load', cx + 16, dy + 38);
            dy += 110;
            continue;
          }
          try {
            const img = node.imgCache || await loadImageWithHeaders(node.src, BASE_URL);
            const maxH = 400;
            let r = Math.min(contentW / img.width, maxH / img.height);
            if (r > 1) r = 1; // 避免小图片被强制拉伸放大
            const dw = img.width * r; const dh = img.height * r;
            ctx.save();
            roundRect(ctx, cx + (contentW - dw) / 2, dy, dw, dh, 8);
            ctx.clip();
            ctx.drawImage(img, cx + (contentW - dw) / 2, dy, dw, dh);
            ctx.restore();
            dy += dh + 20;
          } catch(e) {}
        } else if (node.type === 'br') {
          dy += 10;
        }
      }
    }

    // Footer
    ctx.fillStyle = '#999'; ctx.font = `12px "${font}"`; ctx.textAlign = 'center';
    ctx.fillText('mcmod.cn | Powered by Koishi', width / 2, totalH - 12);

    return await canvas.encode('png');
  }

