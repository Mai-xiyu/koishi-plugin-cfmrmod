const cheerio = require('cheerio');
import { BASE_URL, CENTER_URL } from '../constants';
import { fetchMcmodText, fetchWithTimeout, getHeaders } from '../http';
import { createCanvas, drawTable, drawTextWithTwemoji, GLOBAL_FONT_FAMILY, loadImage, loadImageWithHeaders, measureTableLayout, roundRect, wrapText } from '../rendering';
import { cleanText, extractImageUrl, fixUrl, parseGalleryFromTable } from '../utils';
// ================= 渲染：作者卡片 (macOS 风格) =================
  // ================= 渲染：作者卡片 (macOS 风格) =================
export async function drawAuthorCard(url) {
    const uid = url.match(/author\/(\d+)/)?.[1] || 'Unknown';
    
    // 1. 获取数据
    const html = await fetchMcmodText(url, { headers: getHeaders(url) });
    const $ = cheerio.load(html);

    const username = cleanText($('.author-name h5').text()) || $('title').text().split('-')[0].trim();
    const subname = $('.author-name .subname p').map((i, el) => $(el).text().trim()).get().join(' / ');
    const avatarUrl = fixUrl($('.author-user-avatar img').attr('src'));
    const bio = cleanText($('.author-content .text').text()) || '（暂无简介）';
    
    // 统计数据
    const pageInfo: { views?: string; createDate?: string; lastEdit?: string; editCount?: string } = {};
    const fullText = $('body').text().replace(/\s+/g, ' '); 
    
    function extractStat(regex) {
      const m = fullText.match(regex);
      if (m && m[1] && m[1].length < 20) return m[1].trim();
      return null;
    }

    pageInfo.views = extractStat(/浏览量[：:]\s*([\d,]+)/);
    pageInfo.createDate = extractStat(/创建日期[：:]\s*(\d{4}-\d{2}-\d{2}|\d+年前|\d+个月前|\d+天前)/);
    pageInfo.lastEdit = extractStat(/最后编辑[：:]\s*(\d{4}-\d{2}-\d{2}|\d+年前|\d+个月前|\d+天前)/);
    pageInfo.editCount = extractStat(/编辑次数[：:]\s*(\d+)/);
    
    let favCount = '0';
    const favEl = $('.author-fav .nums, .common-fuc-group li.like .nums, .fav-count');
    if (favEl.length) {
      favCount = favEl.attr('title') || favEl.text().trim() || '0';
    }
    if (favCount === '0') {
      const favMatch = fullText.match(/收藏\s*(\d+)/);
      if (favMatch) favCount = favMatch[1];
    }

    const stats = [];
    if (pageInfo.views) stats.push({ l: '浏览量', v: pageInfo.views });
    if (pageInfo.createDate) stats.push({ l: '创建日期', v: pageInfo.createDate });
    if (pageInfo.lastEdit) stats.push({ l: '最后编辑', v: pageInfo.lastEdit });
    if (pageInfo.editCount) stats.push({ l: '编辑次数', v: pageInfo.editCount });
    if (favCount) stats.push({ l: '收藏', v: favCount });

    const links = [];
    $('.author-link .common-link-icon-list a, .common-link-icon-frame a').each((i, el) => {
      const h = $(el).attr('href');
      let n = $(el).attr('data-original-title') || $(el).text().trim();
      if (!n && h) {
        if(h.includes('github')) n='GitHub'; 
        else if(h.includes('bilibili')) n='Bilibili';
        else if(h.includes('curseforge')) n='CurseForge';
        else if(h.includes('modrinth')) n='Modrinth';
        else if(h.includes('mcbbs')) n='MCBBS';
        else n='Link';
      }
      if (n && h && !links.some(l => l.n === n)) links.push({ n, h });
    });

    // 列表抓取 - 优先使用特定类名，因为它们更稳定
    const teams = [];
    const projects = [];
    const partners = [];

    // 辅助函数：从容器中提取列表项
    function extractListItems(container, targetList, isProject = false) {
      // 增加 .block 选择器以匹配 div.block (用于参与项目)
      container.find('li.block, .block, .row > div').each((i, el) => {
        const n = cleanText($(el).find('.name a, .name, h4').first().text());
        if (!n) return;
        const m = fixUrl($(el).find('img').attr('src'));
        // 增加 .count 选择器 (用于相关作者的合作次数)
        const r = cleanText($(el).find('.position, .meta, .count').text());
        // 获取类型标签 (模组/整合包等)
        let t = '';
        if (isProject) {
          const badge = $(el).find('.badge, .badge-mod, .badge-modpack').first().text().trim();
          if (badge) t = badge;
        }
        if (!targetList.some(x => x.n === n)) {
          targetList.push({ n, m, r, t });
        }
      });
    }

    // 1. 尝试特定类名 (根据用户提供的 HTML 结构修正)
    extractListItems($('.author-member .list, .author-team .list'), teams, false);
    extractListItems($('.author-mods .list'), projects, true);
    extractListItems($('.author-partner .list, .author-users .list'), partners, false);

    // 2. 如果没抓到，尝试通用抓取 (遍历所有 block/panel)
    if (teams.length === 0 || projects.length === 0 || partners.length === 0) {
      $('.common-card-layout, .panel, .block').each((i, el) => {
        const title = $(el).find('.head, .panel-heading, h3, h4').text().trim();
        if (teams.length === 0 && title.includes('参与团队')) extractListItems($(el), teams);
        if (projects.length === 0 && (title.includes('参与项目') || title.includes('发布的模组'))) extractListItems($(el), projects);
        if (partners.length === 0 && (title.includes('相关作者') || title.includes('合作者'))) extractListItems($(el), partners);
      });
    }

    // 2. 布局计算
    const width = 800;
    const font = GLOBAL_FONT_FAMILY;
    const padding = 40;
    const windowMargin = 20;
    const contentW = width - windowMargin*2 - padding*2; // 实际内容宽度
    
    // 严格计算高度
    let cursorY = 60; // Initial padding inside window
    
    // Avatar area
    cursorY += 100 + 40; // Avatar(100) + gap(40)
    
    // Stats Grid
    if (stats.length > 0) {
      cursorY += 80 + 30; // StatH(80) + gap(30)
    }
    
    // Links
    if (links.length > 0) {
      // Simulate link wrapping
      const tempC = createCanvas(100,100);
      const tempCtx = tempC.getContext('2d');
      tempCtx.font = `bold 14px "${font}"`;
        
      let lx = 0;
      let ly = 0;
      let rowH = 34;
        
      links.forEach(l => {
        const lw = tempCtx.measureText(l.n).width + 30;
        if (lx + lw > contentW) {
          lx = 0;
          ly += 45; // Line gap
        }
        lx += lw + 10;
      });
      cursorY += ly + rowH + 60; // + gap
    }
    
    // Lists Calculation Helper
    function calcSectionHeight(items, itemH, cols) {
      if (!items.length) return 0;
      const rows = Math.ceil(items.length / cols);
      // Title(35) + Rows * (ItemH + 15) + BottomGap(30)
      return 35 + rows * (itemH + 15) + 30;
    }
    
    cursorY += calcSectionHeight(teams, 70, 3);
    cursorY += calcSectionHeight(projects, 90, 2);
    cursorY += calcSectionHeight(partners, 100, 5);
    
    // Bio
    let bioH = 0;
    if (bio && bio !== '（暂无简介）') {
      const tempC = createCanvas(100,100);
      const tempCtx = tempC.getContext('2d');
      tempCtx.font = `16px "${font}"`;
      // Title(35)
      cursorY += 35;
      // Content
      bioH = wrapText(tempCtx, bio, 0, 0, contentW - 40, 26, 1000, false);
      cursorY += bioH + 40 + 60; // Padding inside rect(40) + BottomGap(60)
    }
    
    // Footer
    cursorY += 30;
    
    const windowH = cursorY;
    const totalH = windowH + windowMargin*2;

    const canvas = createCanvas(width, totalH);
    const ctx = canvas.getContext('2d');
    
    // 3. 绘制背景 (使用微软 Bing 每日图片/自然风格)
    try {
      // 使用 Bing 每日图片 API (1920x1080)
      const bgUrl = 'https://bing.biturl.top/?resolution=1920&format=image&index=0&mkt=zh-CN';
      const bgImg = await loadImage(bgUrl);
        
      // 保持比例填充
      const r = Math.max(width / bgImg.width, totalH / bgImg.height);
      const dw = bgImg.width * r;
      const dh = bgImg.height * r;
      const dx = (width - dw) / 2;
      const dy = (totalH - dh) / 2;
        
      ctx.drawImage(bgImg, dx, dy, dw, dh);
        
      // 叠加一层模糊遮罩或颜色，保证文字可读性 (虽然有亚克力板，但背景太花也不好)
      // 这里不模糊背景本身（Canvas模糊开销大），而是加一层半透明遮罩
      ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
      ctx.fillRect(0, 0, width, totalH);
        
    } catch (e) {
      // 失败回退到渐变
      const grad = ctx.createLinearGradient(0, 0, width, totalH);
      grad.addColorStop(0, '#a18cd1');
      grad.addColorStop(1, '#fbc2eb');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, totalH);
    }
    
    // 4. 绘制 Acrylic 窗口
    const windowW = width - windowMargin*2;
    
    // 窗口背景 (40% Acrylic - 模拟)
    // 使用白色半透明 + 背景模糊效果 (Canvas 无法直接 backdrop-filter，只能通过叠加半透明白)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)'; // 提高不透明度以遮盖背景杂乱
    roundRect(ctx, windowMargin, windowMargin, windowW, windowH, 20);
    ctx.fill();
    
    // 窗口边框
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1.5;
    roundRect(ctx, windowMargin, windowMargin, windowW, windowH, 20);
    ctx.stroke();
    
    // 5. 窗口控件 (Traffic Lights)
    const controlY = windowMargin + 20;
    const controlX = windowMargin + 20;
    const controlR = 6;
    const controlGap = 20;
    
    ctx.fillStyle = '#ff5f56'; // Red
    ctx.beginPath(); ctx.arc(controlX, controlY, controlR, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#ffbd2e'; // Yellow
    ctx.beginPath(); ctx.arc(controlX + controlGap, controlY, controlR, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#27c93f'; // Green
    ctx.beginPath(); ctx.arc(controlX + controlGap*2, controlY, controlR, 0, Math.PI*2); ctx.fill();
    
    // 6. 内容绘制
    // 重置 cursorY 到窗口内部起始位置
    cursorY = windowMargin + 60;
    const contentX = windowMargin + padding;
    
    // Header: Avatar & Name
    const avatarSize = 100;
    
    // Avatar
    ctx.save();
    ctx.beginPath();
    ctx.arc(contentX + avatarSize/2, cursorY + avatarSize/2, avatarSize/2, 0, Math.PI*2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.clip();
    
    if (avatarUrl) {
      try {
        const img = await loadImage(avatarUrl);
        ctx.drawImage(img, contentX, cursorY, avatarSize, avatarSize);
      } catch(e) {
        ctx.fillStyle = '#ddd'; ctx.fill();
      }
    } else {
      ctx.fillStyle = '#ddd'; ctx.fill();
    }
    ctx.restore();
    
    // Name & UID
    const textX = contentX + avatarSize + 30;
    ctx.fillStyle = '#333';
    ctx.font = `bold 40px "${font}"`;
    ctx.textBaseline = 'top';
    ctx.fillText(username, textX, cursorY + 10);
    
    // UID Chip
    const uidText = `UID: ${uid}`;
    ctx.font = `bold 14px "${font}"`;
    const uidW = ctx.measureText(uidText).width + 20;
    ctx.fillStyle = 'rgba(0,0,0,0.05)';
    roundRect(ctx, textX, cursorY + 60, uidW, 24, 12);
    ctx.fill();
    ctx.fillStyle = '#666';
    ctx.fillText(uidText, textX + 10, cursorY + 64);

    // Subname (Alias)
    if (subname) {
      ctx.fillStyle = '#999';
      ctx.font = `14px "${font}"`;
      // 绘制在 UID 下方，稍微留点间距
      ctx.fillText(subname, textX, cursorY + 95);
    }
    
    cursorY += avatarSize + 40;
    
    // Stats Grid
    if (stats.length > 0) {
      const statW = (contentW - (stats.length-1)*15) / stats.length;
      const statH = 80;
        
      stats.forEach((s, i) => {
        const sx = contentX + i * (statW + 15);
            
        // Card bg
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        roundRect(ctx, sx, cursorY, statW, statH, 12);
        ctx.fill();
            
        // Label
        ctx.textAlign = 'center';
        ctx.fillStyle = '#666';
        ctx.font = `14px "${font}"`;
        ctx.fillText(s.l, sx + statW/2, cursorY + 15);
            
        // Value
        ctx.fillStyle = '#333';
        ctx.font = `bold 20px "${font}"`;
        // Auto scale font if too long
        let fontSize = 20;
        while (ctx.measureText(s.v).width > statW - 10 && fontSize > 10) {
          fontSize--;
          ctx.font = `bold ${fontSize}px "${font}"`;
        }
        ctx.fillText(s.v, sx + statW/2, cursorY + 45);
      });
      ctx.textAlign = 'left';
      cursorY += statH + 30;
    }
    
    // Links
    if (links.length > 0) {
      let lx = contentX;
      let ly = cursorY;
      links.forEach(l => {
        ctx.font = `bold 14px "${font}"`;
        const lw = ctx.measureText(l.n).width + 30;
        if (lx + lw > contentX + contentW) {
          lx = contentX;
          ly += 45;
        }
            
        ctx.fillStyle = '#fff';
        roundRect(ctx, lx, ly, lw, 34, 17);
        ctx.fill();
            
        ctx.fillStyle = '#333';
        ctx.fillText(l.n, lx + 15, ly + 8);
            
        lx += lw + 10;
      });
      cursorY = ly + 60;
    }
    
    // Helper for Lists
    async function drawSection(title, items, itemH, cols, renderItem) {
      if (!items.length) return;
        
      ctx.fillStyle = '#333';
      ctx.font = `bold 22px "${font}"`;
      ctx.fillText(title, contentX, cursorY);
      cursorY += 35;
        
      const itemW = (contentW - (cols-1)*15) / cols;
        
      for (let i = 0; i < items.length; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const ix = contentX + col * (itemW + 15);
        const iy = cursorY + row * (itemH + 15);
            
        // Item Card
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        roundRect(ctx, ix, iy, itemW, itemH, 12);
        ctx.fill();
            
        await renderItem(items[i], ix, iy, itemW, itemH);
      }
        
      cursorY += Math.ceil(items.length / cols) * (itemH + 15) + 30;
    }
    
    // Draw Lists
    await drawSection('参与团队', teams, 70, 3, async (item, x, y, w, h) => {
      if (item.m) {
        try {
          const img = await loadImage(item.m);
          ctx.drawImage(img, x + 10, y + 15, 40, 40);
        } catch(e) {}
      }
      ctx.fillStyle = '#333'; ctx.font = `bold 16px "${font}"`;
      ctx.fillText(item.n, x + 60, y + 15);
      if (item.r) {
        ctx.fillStyle = '#666'; ctx.font = `12px "${font}"`;
        ctx.fillText(item.r, x + 60, y + 40);
      }
    });
    
    await drawSection('参与项目', projects, 90, 2, async (item, x, y, w, h) => {
      if (item.m) {
        try {
          const img = await loadImage(item.m);
          ctx.drawImage(img, x + 10, y + 15, 100, 60);
        } catch(e) {}
      }
        
      // 绘制类型标签 (模组/整合包)
      let nameOffsetX = 120;
      if (item.t) {
        ctx.font = `bold 12px "${font}"`;
        const tagText = item.t;
        const tagW = ctx.measureText(tagText).width + 12;
        const tagH = 20;
        const tagX = x + 120;
        const tagY = y + 12;
            
        // 根据类型设置颜色：模组=绿色，整合包=橙色，其他=灰色
        let tagBg = '#999';
        if (tagText.includes('模组')) tagBg = '#2ecc71';
        else if (tagText.includes('整合包')) tagBg = '#e67e22';
        else if (tagText.includes('资料')) tagBg = '#3498db';
            
        ctx.fillStyle = tagBg;
        roundRect(ctx, tagX, tagY, tagW, tagH, 4);
        ctx.fill();
            
        ctx.fillStyle = '#fff';
        ctx.fillText(tagText, tagX + 6, tagY + 4);
            
        nameOffsetX = 120 + tagW + 8;
      }
        
      // 去掉名称中的类型前缀（避免与标签重复）
      let displayName = item.n;
      if (item.t) {
        // 移除开头的 "模组"、"整合包" 等前缀
        displayName = displayName.replace(/^(模组|整合包|资料)\s*/g, '').trim();
      }
        
      ctx.fillStyle = '#333'; ctx.font = `bold 16px "${font}"`;
      wrapText(ctx, displayName, x + nameOffsetX, y + 15, w - nameOffsetX - 10, 20, 2, true);
      if (item.r) {
        ctx.fillStyle = '#666'; ctx.font = `12px "${font}"`;
        ctx.fillText(item.r, x + 120, y + 60);
      }
    });

    await drawSection('相关作者', partners, 100, 5, async (item, x, y, w, h) => {
      const iconSize = 50;
      if (item.m) {
        try {
          const img = await loadImage(item.m);
          ctx.save();
          ctx.beginPath(); ctx.arc(x + w/2, y + 25, iconSize/2, 0, Math.PI*2); ctx.clip();
          ctx.drawImage(img, x + w/2 - iconSize/2, y, iconSize, iconSize);
          ctx.restore();
        } catch(e) {}
      }
      ctx.textAlign = 'center';
      ctx.fillStyle = '#333'; ctx.font = `14px "${font}"`;
      wrapText(ctx, item.n, x + w/2, y + 60, w - 10, 18, 2, true);
      ctx.textAlign = 'left';
    });
    
    // Bio
    if (bio && bio !== '（暂无简介）') {
      ctx.fillStyle = '#333';
      ctx.font = `bold 22px "${font}"`;
      ctx.fillText('简介', contentX, cursorY);
      cursorY += 35;
        
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
        
      roundRect(ctx, contentX, cursorY, contentW, bioH + 40, 12);
      ctx.fill();
        
      ctx.fillStyle = '#444';
      ctx.font = `16px "${font}"`;
      wrapText(ctx, bio, contentX + 20, cursorY + 20, contentW - 40, 26, 1000, true);
        
      cursorY += bioH + 60;
    }
    
    // Footer
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.font = `12px "${font}"`;
    ctx.textAlign = 'center';
    ctx.fillText('mcmod.cn | Powered by Koishi | Plugin By Mai_xiyu', width/2, totalH - 15);

    return await canvas.encode('png');
  }
