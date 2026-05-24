const cheerio = require('cheerio');
import { BASE_URL, CENTER_URL } from '../constants';
import { fetchMcmodText, fetchWithTimeout, getHeaders } from '../http';
import { createCanvas, drawTable, drawTextWithTwemoji, GLOBAL_FONT_FAMILY, loadImage, loadImageWithHeaders, measureTableLayout, roundRect, wrapText } from '../rendering';
import { cleanText, extractImageUrl, fixUrl, parseGalleryFromTable } from '../utils';
// ================= 详情页卡片 =================
  // ================= 详情页卡片 (资料/物品/通用) =================
  // ================= 详情页卡片 (资料/物品/通用) - 深度解析版 =================
export async function createInfoCard(url, type) {
    // 1. 获取并解析页面
    const html = await fetchMcmodText(url, { headers: getHeaders('https://search.mcmod.cn/') });
    const $ = cheerio.load(html);

    // --- 基础信息 ---
    // 标题：尝试从 .itemname 或 h3 获取
    let title = cleanText($('.itemname .name h5, .itemname .name').first().text());
    if (!title) title = cleanText($('title').text().split('-')[0].trim());
    
    // 来源/模组：面包屑导航倒数第三个通常是模组名
    let source = cleanText($('.common-nav .item').eq(1).text()); 
    // 或者尝试从 nav 链接判断
    if (!source) source = cleanText($('.common-nav li a[href*="/class/"]').last().text());

    // 图标：优先获取高清大图 (128x128)，其次普通图标
    let imgUrl = fixUrl($('.item-info-table img[width="128"]').attr('src'));
    if (!imgUrl) imgUrl = fixUrl($('.item-info-table img').first().attr('src'));
    if (!imgUrl) imgUrl = fixUrl($('.common-icon-text-frame img').attr('src'));

    // --- 属性列表 ---
    const props = [];
    
    // 1. 抓取右侧/下方的表格数据 (.item-data table, .item-info-table table)
    // 排除包含图片的行，只抓取文字属性
    $('table.table-bordered tr').each((i, tr) => {
      const tds = $(tr).find('td');
      if (tds.length >= 2) {
        // 可能是 <th>key</th><td>value</td> 或者 <td>key</td><td>value</td>
        let key = cleanText($(tds[0]).text()).replace(/[:：]/g, '');
        let val = cleanText($(tds[1]).text());
            
        // 过滤无效行 (如图标行)
        if (key && val && val.length > 0 && !$(tds[1]).find('img').length) {
          // 排除重复
          if (!props.some(p => p.l === key)) {
            props.push({ l: key, v: val });
          }
        }
      }
    });

    // --- 简介 ---
    // 优先 .item-content，其次 meta description
    let desc = '';
    const contentDiv = $('.item-content.common-text').first();
    if (contentDiv.length) {
      desc = cleanText(contentDiv.text());
    } else {
      desc = $('meta[name="description"]').attr('content') || '暂无简介';
    }
    // 清理 "MCmod does not have a description..." 等默认文本
    if (desc.includes('MCmod does not have a description')) desc = '暂无简介';

    // --- 相关物品 (新增) ---
    const relations = [];
    $('.common-imglist-block .common-imglist li').each((i, el) => {
      if (i >= 7) return; // 最多显示7个
      const name = $(el).attr('data-original-title') || cleanText($(el).find('.text').text());
      const icon = fixUrl($(el).find('img').attr('src'));
      if (name && icon) relations.push({ n: name, i: icon });
    });

    // ================= 绘图逻辑 =================
    const width = 800;
    const font = GLOBAL_FONT_FAMILY;
    const margin = 20;
    const winPadding = 30;
    const contentW = width - margin * 2 - winPadding * 2;

    const dummyC = createCanvas(100, 100);
    const dummy = dummyC.getContext('2d');
    dummy.font = `bold 32px "${font}"`;

    // 1. 高度计算
    // Header (Title + Source)
    let headerH = 60; 
    if (source) headerH += 30;
    
    // Content Layout: Left (Icon + Props) | Right (Desc)
    const iconSize = 100;
    const leftColW = 240; // 左侧宽度
    const rightColW = contentW - leftColW - 20; // 右侧宽度

    // Props Height
    let propsH = 0;
    if (props.length) {
      propsH = props.length * 28 + 20;
    }
    const leftH = iconSize + 20 + propsH;

    // Desc Height
    dummy.font = `16px "${font}"`;
    const descLines = wrapText(dummy, desc, 0, 0, rightColW, 26, 30, false) / 26;
    const descH = 40 + descLines * 26; // Title + Text

    // Relations Height
    let relH = 0;
    if (relations.length) {
      relH = 90; // Title + Icons
    }

    // Main Content Height (取左右最大值)
    let mainH = Math.max(leftH, descH);
    
    // Total Layout
    let cursorY = margin + 50; // Top traffic lights
    const gap = 20;

    cursorY += headerH + gap;
    cursorY += mainH + gap;
    if (relH) cursorY += relH + gap;

    const windowH = cursorY;
    const totalH = windowH + margin * 2;

    // 2. 绘制背景与窗口
    const canvas = createCanvas(width, totalH);
    const ctx = canvas.getContext('2d');

    // 背景 (Bing)
    try {
      const bgUrl = 'https://bing.biturl.top/?resolution=1920&format=image&index=0&mkt=zh-CN';
      const bgImg = await loadImage(bgUrl);
      const r = Math.max(width / bgImg.width, totalH / bgImg.height);
      ctx.drawImage(bgImg, (width - bgImg.width * r) / 2, (totalH - bgImg.height * r) / 2, bgImg.width * r, bgImg.height * r);
      ctx.fillStyle = 'rgba(0,0,0,0.1)'; ctx.fillRect(0, 0, width, totalH);
    } catch (e) {
      const grad = ctx.createLinearGradient(0, 0, 0, totalH);
      grad.addColorStop(0, '#e6dee9'); grad.addColorStop(1, '#dad4ec'); // 柔和紫灰
      ctx.fillStyle = grad; ctx.fillRect(0, 0, width, totalH);
    }

    // 窗口 (Acrylic)
    const winX = margin, winY = margin;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    roundRect(ctx, winX, winY, width - margin * 2, windowH, 16);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1;
    roundRect(ctx, winX, winY, width - margin * 2, windowH, 16); ctx.stroke();

    // 交通灯
    ['#ff5f56', '#ffbd2e', '#27c93f'].forEach((c, i) => {
      ctx.beginPath(); ctx.arc(winX + 20 + i * 25, winY + 20, 6, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill();
    });

    // --- 内容绘制 ---
    let dy = winY + 50;
    const cx = winX + winPadding;

    // 1. Header
    ctx.fillStyle = '#333'; ctx.font = `bold 32px "${font}"`; ctx.textBaseline = 'top';
    ctx.fillText(title, cx, dy);
    
    if (source) {
      ctx.fillStyle = '#888'; ctx.font = `bold 16px "${font}"`;
      // 绘制所属模组标签
      const tagW = ctx.measureText(source).width + 16;
      ctx.fillStyle = '#f0f0f0'; roundRect(ctx, cx, dy + 45, tagW, 26, 6); ctx.fill();
      ctx.fillStyle = '#666'; ctx.fillText(source, cx + 8, dy + 49);
    }
    dy += headerH + gap;

    // 2. Left Column (Icon + Props)
    const leftX = cx;
    let leftY = dy;
    
    // Icon
    if (imgUrl) {
      try {
        const img = await loadImage(imgUrl);
        // 保持比例绘制在 100x100 区域居中
        const r = Math.min(iconSize / img.width, iconSize / img.height);
        const dw = img.width * r, dh = img.height * r;
        ctx.drawImage(img, leftX + (iconSize - dw) / 2, leftY + (iconSize - dh) / 2, dw, dh);
      } catch(e) {
        ctx.fillStyle = '#eee'; roundRect(ctx, leftX, leftY, iconSize, iconSize, 12); ctx.fill();
      }
    }
    leftY += iconSize + 20;

    // Props
    if (props.length) {
      props.forEach(p => {
        ctx.fillStyle = '#999'; ctx.font = `12px "${font}"`;
        ctx.fillText(p.l, leftX, leftY);
            
        ctx.fillStyle = '#333'; ctx.font = `bold 14px "${font}"`;
        let v = p.v;
        if (v.length > 20) v = v.substring(0, 18) + '...';
        ctx.fillText(v, leftX, leftY + 16);
            
        leftY += 38;
      });
    }

    // 3. Right Column (Description)
    const rightX = cx + leftColW + 20;
    let rightY = dy;

    ctx.fillStyle = '#333'; ctx.font = `bold 20px "${font}"`; ctx.fillText('简介', rightX, rightY);
    ctx.fillStyle = '#3498db'; ctx.fillRect(rightX, rightY + 25, 30, 4);
    rightY += 40;

    ctx.fillStyle = '#555'; ctx.font = `16px "${font}"`;
    wrapText(ctx, desc, rightX, rightY, rightColW, 26, 30, true);
    
    // 更新 dy 到主内容下方
    dy += mainH + gap;

    // 4. Relations (Bottom)
    if (relations.length) {
      // 分割线
      ctx.strokeStyle = '#eee'; ctx.lineWidth = 1; 
      ctx.beginPath(); ctx.moveTo(cx, dy); ctx.lineTo(cx + contentW, dy); ctx.stroke();
      dy += 20;

      ctx.fillStyle = '#333'; ctx.font = `bold 18px "${font}"`; 
      ctx.fillText('相关物品', cx, dy);
        
      let rx = cx + 90;
      const rIconSize = 32;
        
      for (const r of relations) {
        try {
          const img = await loadImage(r.i);
          ctx.drawImage(img, rx, dy - 5, rIconSize, rIconSize);
        } catch(e) {
          ctx.fillStyle = '#eee'; ctx.fillRect(rx, dy - 5, rIconSize, rIconSize);
        }
            
        // 简单显示名字 tooltip 效果不太好做，这里只画图标，或者简单的名字
        // 为了美观，这里只画图标，名字太长会乱
        // ctx.fillStyle = '#666'; ctx.font = `10px "${font}"`; 
        // ctx.fillText(r.n.substring(0, 5), rx, dy + 40);

        rx += rIconSize + 15;
      }
    }

    // Footer
    ctx.fillStyle = '#aaa'; ctx.font = `12px "${font}"`; ctx.textAlign = 'center';
    ctx.fillText('mcmod.cn | Powered by Koishi', width / 2, totalH - 15);

    return await canvas.encode('png');
  }

