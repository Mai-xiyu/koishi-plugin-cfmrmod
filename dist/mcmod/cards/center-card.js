"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.drawCenterCard = drawCenterCard;
exports.drawCenterCardImpl = drawCenterCardImpl;
const cheerio = require('cheerio');
const constants_1 = require("../constants");
const http_1 = require("../http");
const rendering_1 = require("../rendering");
const utils_1 = require("../utils");
// ================= 普通用户卡片 (Center Card) =================
async function drawCenterCard(uid, logger) { return drawCenterCardImpl(uid, logger); }
async function drawCenterCardImpl(uid, logger) {
    var _a, _b, _c, _d;
    const centerUrl = `${constants_1.CENTER_URL}/${uid}/`;
    const bbsUrl = `https://bbs.mcmod.cn/center/${uid}/`;
    const homeApiUrl = `${constants_1.CENTER_URL}/frame/CenterHome/`;
    const commentApiUrl = `${constants_1.CENTER_URL}/frame/CenterComment/`;
    const chartApiUrl = `${constants_1.CENTER_URL}/object/UserHistoryChartData/`;
    const params = new URLSearchParams();
    params.append('uid', uid);
    const currentYear = new Date().getFullYear();
    const chartParams = new URLSearchParams();
    chartParams.append('data', JSON.stringify({ uid: parseInt(uid), year: currentYear }));
    const apiHeaders = { ...(0, http_1.getHeaders)(centerUrl), 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' };
    let mainHtml = '', homeJson = null, commentJson = null, chartJson = null, bbsHtml = '';
    // 1. 并行获取所有数据
    try {
        const results = await Promise.allSettled([
            (0, http_1.fetchWithTimeout)(centerUrl, { headers: (0, http_1.getHeaders)() }),
            (0, http_1.fetchWithTimeout)(homeApiUrl, { method: 'POST', headers: apiHeaders, body: params }),
            (0, http_1.fetchWithTimeout)(commentApiUrl, { method: 'POST', headers: apiHeaders, body: params }),
            (0, http_1.fetchWithTimeout)(chartApiUrl, { method: 'POST', headers: apiHeaders, body: chartParams }),
            (0, http_1.fetchWithTimeout)(bbsUrl, { headers: (0, http_1.getHeaders)() })
        ]);
        if (results[0].status === 'fulfilled')
            mainHtml = await results[0].value.text();
        if (results[1].status === 'fulfilled' && results[1].value.ok)
            try {
                homeJson = await results[1].value.json();
            }
            catch (e) { }
        if (results[2].status === 'fulfilled' && results[2].value.ok)
            try {
                commentJson = await results[2].value.json();
            }
            catch (e) { }
        if (results[3].status === 'fulfilled' && results[3].value.ok)
            try {
                chartJson = await results[3].value.json();
            }
            catch (e) { }
        if (results[4].status === 'fulfilled' && results[4].value.ok)
            bbsHtml = await results[4].value.text();
    }
    catch (e) {
        logger.error(`[Card] 数据获取部分失败: ${e.message}`);
    }
    // 2. 解析 Center 主站数据
    const $main = cheerio.load(mainHtml || '');
    const header = $main('.center-header');
    const username = (0, utils_1.cleanText)(header.find('.user-un').text()) || 'User';
    const levelText = (0, utils_1.cleanText)(header.find('.user-lv').text()) || 'Lv.?';
    const signature = (0, utils_1.cleanText)(header.find('.user-sign').text()) || '（无签名）';
    let avatarUrl = (0, utils_1.fixUrl)(header.find('.user-icon-img img').attr('src'));
    let bannerUrl = null;
    $main('style').each((i, el) => {
        const styleText = $main(el).html() || '';
        const bodyBgMatch = styleText.match(/body\s*\{\s*background\s*:\s*url\(([^)]+)\)/i);
        if (bodyBgMatch && bodyBgMatch[1] && (!styleText.includes('.copyright') || styleText.includes('body{background'))) {
            bannerUrl = (0, utils_1.fixUrl)(bodyBgMatch[1].replace(/['"]/g, ''));
        }
    });
    if (!bannerUrl)
        bannerUrl = (0, utils_1.fixUrl)((_b = (_a = (header.attr('style') || '').match(/url\((.*?)\)/)) === null || _a === void 0 ? void 0 : _a[1]) === null || _b === void 0 ? void 0 : _b.replace(/['"]/g, ''));
    // 3. 解析 BBS 数据
    const bbsData = { medals: [], points: [], detailed: [], profile: [], times: [] };
    if (bbsHtml) {
        const $bbs = cheerio.load(bbsHtml);
        if (!avatarUrl)
            avatarUrl = (0, utils_1.fixUrl)($bbs('.icn.avt img').attr('src'));
        // 勋章墙 (修复：$(el) -> $bbs(el))
        $bbs('.md_ctrl img').each((i, el) => {
            const src = (0, utils_1.fixUrl)($bbs(el).attr('src'));
            const name = $bbs(el).attr('alt') || $bbs(el).attr('title') || '勋章';
            if (src)
                bbsData.medals.push({ src, name });
        });
        // 积分统计 (修复：$(el) -> $bbs(el))
        $bbs('#psts .pf_l li').each((i, el) => {
            const label = (0, utils_1.cleanText)($bbs(el).find('em').text());
            const val = (0, utils_1.cleanText)($bbs(el).text()).replace(label, '').trim();
            if (label && val)
                bbsData.points.push({ l: label, v: val });
        });
        // 详细贡献 (修复：$(el) -> $bbs(el))
        $bbs('.u_profile .bbda.pbm.mbm li p').each((i, el) => {
            const txt = $bbs(el).text();
            if (txt.includes('：') && ($bbs(el).find('.green').length > 0 || txt.includes('/'))) {
                const label = txt.split('：')[0].trim();
                const add = (0, utils_1.cleanText)($bbs(el).find('.green').text()) || '0';
                const edit = (0, utils_1.cleanText)($bbs(el).find('.blue').text()) || '0';
                if (label && !label.includes('以下数据')) {
                    bbsData.detailed.push({ l: label, add, edit });
                }
            }
        });
        // 个人档案 (修复：$(el) -> $bbs(el))
        $bbs('.u_profile .pf_l.cl li').each((i, el) => {
            const label = (0, utils_1.cleanText)($bbs(el).find('em').text());
            const val = (0, utils_1.cleanText)($bbs(el).text()).replace(label, '').trim();
            if (label && val)
                bbsData.profile.push({ l: label, v: val });
        });
        // 完整时间统计 (修复：$(el) -> $bbs(el))
        $bbs('#pbbs li').each((i, el) => {
            const label = (0, utils_1.cleanText)($bbs(el).find('em').text());
            const val = (0, utils_1.cleanText)($bbs(el).text()).replace(label, '').trim();
            if (label && val)
                bbsData.times.push({ l: label, v: val });
        });
    }
    // 4. 解析原有 API 数据
    const statsMap = {};
    if (homeJson === null || homeJson === void 0 ? void 0 : homeJson.html) {
        const $h = cheerio.load(homeJson.html);
        $h('li').each((i, el) => {
            const t = (0, utils_1.cleanText)($h(el).find('.title').text());
            const v = (0, utils_1.cleanText)($h(el).find('.text').text());
            if (t && v) {
                if (t.includes('用户组'))
                    statsMap.group = v;
                else if (t.includes('编辑次数'))
                    statsMap.edits = v;
                else if (t.includes('编辑字数'))
                    statsMap.words = v;
                else if (t.includes('短评'))
                    statsMap.comments = v;
                else if (t.includes('教程'))
                    statsMap.tutorials = v;
                else if (t.includes('注册'))
                    statsMap.reg = v;
            }
        });
    }
    // 基础统计列表
    const basicStats = [
        { l: '用户组', v: statsMap.group || '未知' }, { l: '总编辑次数', v: statsMap.edits || '0' },
        { l: '总编辑字数', v: statsMap.words || '0' }, { l: '总短评数', v: statsMap.comments || '0' },
        { l: '个人教程', v: statsMap.tutorials || '0' }
    ];
    // 如果 BBS 数据里没有注册时间，则从 API 补充
    if (!bbsData.times.some(t => t.l.includes('注册')) && statsMap.reg) {
        bbsData.times.unshift({ l: '注册时间', v: statsMap.reg });
    }
    const reactions = [];
    if (commentJson === null || commentJson === void 0 ? void 0 : commentJson.html) {
        const $c = cheerio.load(commentJson.html);
        $c('li').each((i, el) => {
            const t = (0, utils_1.cleanText)($c(el).text());
            const m = t.match(/被评[“"'](.+?)[”"']\s*[:：]\s*([\d,]+)/);
            if (m)
                reactions.push({ l: m[1], c: m[2] });
        });
    }
    const activityMap = {};
    if ((_c = chartJson === null || chartJson === void 0 ? void 0 : chartJson.chartdata) === null || _c === void 0 ? void 0 : _c.total) {
        chartJson.chartdata.total.forEach(item => {
            if (Array.isArray(item) && typeof item[1] === 'number')
                activityMap[item[0]] = item[1];
        });
    }
    // ================= 绘图逻辑 =================
    const width = 800;
    const font = rendering_1.GLOBAL_FONT_FAMILY;
    const bannerH = 160;
    const headerH = 140;
    const cardOverlap = 40;
    const padding = 20;
    const gap = 15;
    let currentY = bannerH - cardOverlap + headerH + padding;
    // BBS 勋章墙
    let medalsH = 0;
    if (bbsData.medals.length > 0) {
        const rows = Math.ceil(bbsData.medals.length / 12);
        medalsH = 50 + rows * 40 + 20;
        currentY += medalsH + gap;
    }
    // BBS 积分
    let pointsH = 0;
    if (bbsData.points.length > 0) {
        const rows = Math.ceil(bbsData.points.length / 4);
        pointsH = 50 + rows * 60 + 20;
        currentY += pointsH + gap;
    }
    // BBS 详细贡献
    let detailedH = 0;
    if (bbsData.detailed.length > 0) {
        const rows = Math.ceil(bbsData.detailed.length / 2);
        detailedH = 50 + rows * 50 + 20;
        currentY += detailedH + gap;
    }
    // 基础统计
    const statsH = 180;
    currentY += statsH + gap;
    // 表态
    let reactionSectionH = 80;
    if (reactions.length > 0) {
        const tempC = (0, rendering_1.createCanvas)(100, 100);
        const tempCtx = tempC.getContext('2d');
        tempCtx.font = `14px "${font}"`;
        let rx = 50, lines = 1;
        reactions.forEach(item => {
            const t = `${item.l}: ${item.c}`;
            const w = tempCtx.measureText(t).width + 30;
            if (rx + w > width - 50) {
                rx = 50;
                lines++;
            }
            rx += w + 10;
        });
        reactionSectionH = 50 + (lines * 35) + 20;
    }
    currentY += reactionSectionH + gap;
    // 热力图
    const mapH = 200;
    currentY += mapH + gap;
    // 时间信息区域高度
    let timesH = 0;
    if (bbsData.times.length > 0) {
        timesH = 80;
        currentY += timesH;
    }
    const totalHeight = currentY + 30; // 底部版权留白
    const canvas = (0, rendering_1.createCanvas)(width, totalHeight);
    const ctx = canvas.getContext('2d');
    // 背景
    ctx.fillStyle = '#f0f2f5';
    ctx.fillRect(0, 0, width, totalHeight);
    try {
        if (bannerUrl) {
            const img = await (0, rendering_1.loadImage)(bannerUrl);
            const r = Math.max(width / img.width, bannerH / img.height);
            ctx.drawImage(img, 0, 0, img.width, img.height, (width - img.width * r) / 2, (bannerH - img.height * r) / 2, img.width * r, img.height * r);
        }
        else {
            ctx.fillStyle = '#3498db';
            ctx.fillRect(0, 0, width, bannerH);
        }
    }
    catch (e) {
        ctx.fillStyle = '#3498db';
        ctx.fillRect(0, 0, width, bannerH);
    }
    const overlay = ctx.createLinearGradient(0, 80, 0, bannerH);
    overlay.addColorStop(0, 'rgba(0,0,0,0)');
    overlay.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = overlay;
    ctx.fillRect(0, 0, width, bannerH);
    // Header
    const cardTop = bannerH - cardOverlap;
    ctx.fillStyle = '#fff';
    (0, rendering_1.roundRect)(ctx, 20, cardTop, width - 40, headerH, 10);
    ctx.fill();
    const avX = 50, avY = cardTop - 30;
    ctx.beginPath();
    ctx.arc(avX + 50, avY + 50, 54, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    if (avatarUrl) {
        try {
            const img = await (0, rendering_1.loadImage)(avatarUrl);
            ctx.save();
            ctx.beginPath();
            ctx.arc(avX + 50, avY + 50, 50, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(img, avX, avY, 100, 100);
            ctx.restore();
        }
        catch (e) { }
    }
    const nameX = 180, nameY = cardTop + 20;
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#333';
    ctx.font = `bold 32px "${font}"`;
    ctx.fillText(username, nameX, nameY);
    const nameW = ctx.measureText(username).width;
    ctx.fillStyle = '#f39c12';
    (0, rendering_1.roundRect)(ctx, nameX + nameW + 15, nameY + 5, 50, 24, 4);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `bold 16px "${font}"`;
    ctx.fillText(levelText, nameX + nameW + 22, nameY + 8);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#999';
    ctx.font = `bold 20px "${font}"`;
    ctx.fillText(`UID: ${uid}`, width - 50, nameY + 10);
    ctx.textAlign = 'left';
    const mcid = (_d = bbsData.profile.find(p => p.l === 'MCID')) === null || _d === void 0 ? void 0 : _d.v;
    const subText = mcid ? `MCID: ${mcid}  |  ${signature}` : signature;
    ctx.fillStyle = '#666';
    ctx.font = `16px "${font}"`;
    (0, rendering_1.wrapText)(ctx, subText, nameX, nameY + 50, width - 250, 24, 2);
    let dy = cardTop + headerH + padding;
    // 绘制 BBS 勋章
    if (bbsData.medals.length > 0) {
        ctx.fillStyle = '#fff';
        (0, rendering_1.roundRect)(ctx, 20, dy, width - 40, medalsH, 10);
        ctx.fill();
        ctx.fillStyle = '#333';
        ctx.font = `bold 18px "${font}"`;
        ctx.fillText('勋章墙', 40, dy + 25);
        ctx.strokeStyle = '#eee';
        ctx.beginPath();
        ctx.moveTo(40, dy + 50);
        ctx.lineTo(width - 40, dy + 50);
        ctx.stroke();
        let mx = 40, my = dy + 60;
        const iconSize = 32;
        for (const m of bbsData.medals) {
            try {
                const img = await (0, rendering_1.loadImage)(m.src);
                ctx.drawImage(img, mx, my, iconSize, iconSize);
            }
            catch (e) { }
            mx += iconSize + 15;
            if (mx > width - 80) {
                mx = 40;
                my += iconSize + 10;
            }
        }
        dy += medalsH + gap;
    }
    // 绘制 BBS 积分
    if (bbsData.points.length > 0) {
        ctx.fillStyle = '#fff';
        (0, rendering_1.roundRect)(ctx, 20, dy, width - 40, pointsH, 10);
        ctx.fill();
        ctx.fillStyle = '#333';
        ctx.font = `bold 18px "${font}"`;
        ctx.fillText('积分统计', 40, dy + 25);
        ctx.beginPath();
        ctx.moveTo(40, dy + 50);
        ctx.lineTo(width - 40, dy + 50);
        ctx.stroke();
        const colW = (width - 80) / 4;
        bbsData.points.forEach((p, i) => {
            const col = i % 4;
            const row = Math.floor(i / 4);
            const px = 40 + col * colW;
            const py = dy + 70 + row * 60;
            ctx.fillStyle = '#999';
            ctx.font = `12px "${font}"`;
            ctx.fillText(p.l, px, py);
            ctx.fillStyle = '#333';
            ctx.font = `bold 20px "${font}"`;
            ctx.fillText(p.v, px, py + 20);
        });
        dy += pointsH + gap;
    }
    // 绘制 BBS 详细贡献
    if (bbsData.detailed.length > 0) {
        ctx.fillStyle = '#fff';
        (0, rendering_1.roundRect)(ctx, 20, dy, width - 40, detailedH, 10);
        ctx.fill();
        ctx.fillStyle = '#333';
        ctx.font = `bold 18px "${font}"`;
        ctx.fillText('详细贡献', 40, dy + 25);
        ctx.beginPath();
        ctx.moveTo(40, dy + 50);
        ctx.lineTo(width - 40, dy + 50);
        ctx.stroke();
        const colW = (width - 80) / 2;
        bbsData.detailed.forEach((d, i) => {
            const col = i % 2;
            const row = Math.floor(i / 2);
            const dx = 40 + col * colW;
            const dyLoc = dy + 70 + row * 50;
            ctx.fillStyle = '#555';
            ctx.font = `16px "${font}"`;
            ctx.fillText(d.l, dx, dyLoc);
            ctx.fillStyle = '#2ecc71';
            ctx.font = `bold 16px "${font}"`;
            const addTxt = `+${d.add}`;
            const addW = ctx.measureText(addTxt).width;
            ctx.fillText(addTxt, dx + 120, dyLoc);
            ctx.fillStyle = '#3498db';
            const editTxt = `~${d.edit}`;
            ctx.fillText(editTxt, dx + 120 + addW + 15, dyLoc);
        });
        dy += detailedH + gap;
    }
    // 绘制 基础统计
    ctx.fillStyle = '#fff';
    (0, rendering_1.roundRect)(ctx, 20, dy, width - 40, statsH, 10);
    ctx.fill();
    ctx.fillStyle = '#333';
    ctx.font = `bold 18px "${font}"`;
    ctx.fillText('基础统计', 40, dy + 25);
    ctx.beginPath();
    ctx.moveTo(40, dy + 50);
    ctx.lineTo(width - 40, dy + 50);
    ctx.stroke();
    const colW = (width - 40) / 3;
    basicStats.forEach((s, i) => {
        const col = i % 3, row = Math.floor(i / 3);
        const cx = 20 + col * colW;
        const cy = dy + 70 + row * 50;
        ctx.fillStyle = '#999';
        ctx.font = `14px "${font}"`;
        ctx.fillText(s.l, cx + 30, cy);
        ctx.fillStyle = '#333';
        ctx.font = `bold 16px "${font}"`;
        ctx.fillText(s.v, cx + 30, cy + 25);
    });
    dy += statsH + gap;
    // 绘制 表态
    ctx.fillStyle = '#fff';
    (0, rendering_1.roundRect)(ctx, 20, dy, width - 40, reactionSectionH, 10);
    ctx.fill();
    ctx.fillStyle = '#333';
    ctx.font = `bold 18px "${font}"`;
    ctx.fillText('表态统计', 40, dy + 25);
    ctx.beginPath();
    ctx.moveTo(40, dy + 50);
    ctx.lineTo(width - 40, dy + 50);
    ctx.stroke();
    if (reactions.length) {
        let rx = 50, ry = dy + 75;
        ctx.font = `14px "${font}"`;
        reactions.forEach(r => {
            const t = `${r.l}: ${r.c}`;
            const w = ctx.measureText(t).width + 30;
            if (rx + w > width - 50) {
                rx = 50;
                ry += 35;
            }
            ctx.fillStyle = '#f0f2f5';
            (0, rendering_1.roundRect)(ctx, rx, ry - 18, w, 28, 14);
            ctx.fill();
            ctx.fillStyle = '#e74c3c';
            ctx.beginPath();
            ctx.arc(rx + 10, ry - 4, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#555';
            ctx.fillText(t, rx + 20, ry - 10);
            rx += w + 10;
        });
    }
    else {
        ctx.fillStyle = '#ccc';
        ctx.font = `14px "${font}"`;
        ctx.fillText('暂无表态', 50, dy + 75);
    }
    dy += reactionSectionH + gap;
    // 绘制 热力图
    ctx.fillStyle = '#fff';
    (0, rendering_1.roundRect)(ctx, 20, dy, width - 40, mapH, 10);
    ctx.fill();
    ctx.fillStyle = '#333';
    ctx.font = `bold 18px "${font}"`;
    ctx.fillText(`活跃度 (${currentYear})`, 40, dy + 25);
    ctx.beginPath();
    ctx.moveTo(40, dy + 50);
    ctx.lineTo(width - 40, dy + 50);
    ctx.stroke();
    const box = 11, g = 3, sx = 50, sy = dy + 70;
    const start = new Date(currentYear, 0, 1);
    let curr = new Date(currentYear, 0, 1);
    const end = new Date(currentYear, 11, 31);
    while (curr <= end) {
        const doy = Math.floor((curr.getTime() - start.getTime()) / 86400000);
        const c = Math.floor((doy + start.getDay() + 6) / 7);
        const r = (curr.getDay() + 6) % 7;
        if (c < 53) {
            const count = activityMap[curr.toISOString().split('T')[0]] || 0;
            ctx.fillStyle = count === 0 ? '#ebedf0' : count <= 2 ? '#9be9a8' : count <= 5 ? '#40c463' : '#216e39';
            (0, rendering_1.roundRect)(ctx, sx + c * (box + g), sy + r * (box + g), box, box, 2);
            ctx.fill();
        }
        curr.setDate(curr.getDate() + 1);
    }
    dy += mapH + gap;
    // 绘制详细时间列表
    if (bbsData.times.length > 0) {
        ctx.fillStyle = '#666';
        ctx.font = `12px "${font}"`;
        let tx = 40, ty = dy;
        bbsData.times.forEach(t => {
            const str = `${t.l}: ${t.v}`;
            const w = ctx.measureText(str).width;
            if (tx + w > width - 40) {
                tx = 40; // 换行
                ty += 20;
            }
            ctx.fillText(str, tx, ty);
            tx += w + 30; // 字段间距
        });
        dy = ty + 30; // 更新总高度游标
    }
    // Footer
    ctx.fillStyle = '#999';
    ctx.font = `12px "${font}"`;
    ctx.textAlign = 'center';
    ctx.fillText('mcmod.cn & bbs.mcmod.cn | Powered by Koishi | Plugin By Mai_xiyu', width / 2, totalHeight - 15);
    return await canvas.encode('png');
}
