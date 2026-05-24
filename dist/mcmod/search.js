"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchSearch = fetchSearch;
exports.fetchSearchFallback = fetchSearchFallback;
exports.formatListPage = formatListPage;
const constants_1 = require("./constants");
const http_1 = require("./http");
const utils_1 = require("./utils");
const cheerio = require('cheerio');
async function fetchSearch(query, typeKey) {
    const filterMap = { mod: 1, pack: 2, data: 3, tutorial: 4, author: 5, user: 6 };
    const filter = filterMap[typeKey] || 1;
    const searchUrl = `https://search.mcmod.cn/s?key=${encodeURIComponent(query)}&filter=${filter}&mold=0`;
    let results = [];
    try {
        const html = await (0, http_1.fetchMcmodText)(searchUrl, { headers: (0, http_1.getHeaders)('https://search.mcmod.cn/') });
        const $ = cheerio.load(html);
        $('.result-item, .media, .search-list .item, .user-list .row, .list .row').each((i, el) => {
            const $el = $(el);
            let titleEl = $el.find('.head > a').first();
            if (!titleEl.length)
                titleEl = $el.find('.media-heading a').first();
            if (!titleEl.length) {
                $el.find('a').each((j, a) => {
                    if ($(a).text().trim().length > 0 && !titleEl.length)
                        titleEl = $(a);
                });
            }
            const title = (0, utils_1.cleanText)(titleEl.text());
            let link = titleEl.attr('href');
            const modName = (0, utils_1.cleanText)($el.find('.meta span, .source').first().text()) || (0, utils_1.cleanText)($el.find('.media-body .text-muted').first().text());
            if (title && link) {
                link = (0, utils_1.fixUrl)(link);
                if (link && !link.includes('target=') && !/^\d+$/.test(title)) {
                    let summary = (0, utils_1.cleanText)($el.find('.body, .media-body').text());
                    summary = summary.replace(title, '').replace(modName, '').trim();
                    results.push({ title, link, modName: modName || '', summary });
                }
            }
        });
    }
    catch (e) {
        // 主站搜索失败忽略，继续走备用
    }
    if (results.length === 0) {
        try {
            const fallbackResults = await fetchSearchFallback(query, typeKey);
            if (fallbackResults && fallbackResults.length > 0) {
                return fallbackResults;
            }
        }
        catch (e) {
            // 备用接口失败则彻底无结果
        }
    }
    return results;
}
async function fetchSearchFallback(query, typeKey) {
    const apiType = constants_1.FALLBACK_TYPE_MAP[typeKey];
    if (!apiType)
        return [];
    try {
        const requestData = { key: query, type: apiType };
        const params = new URLSearchParams();
        params.append('data', JSON.stringify(requestData));
        const headers = {
            ...(0, http_1.getHeaders)('https://www.mcmod.cn'),
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        };
        const json = await (0, http_1.fetchMcmodJson)(constants_1.COMMON_SELECT_URL, {
            method: 'POST',
            headers,
            body: params,
        });
        if (json.state === 0 && json.html) {
            const $ = cheerio.load(json.html);
            const results = [];
            $('tr[data-id]').each((i, el) => {
                const $el = $(el);
                const id = $el.attr('data-id');
                if (!id)
                    return;
                let title = '';
                let summary = '（来自快速索引）';
                let link = '';
                if (typeKey === 'author') {
                    title = (0, utils_1.cleanText)($el.find('b').text()) || (0, utils_1.cleanText)($el.text());
                    summary = (0, utils_1.cleanText)($el.find('i').text());
                    link = `https://www.mcmod.cn/author/${id}.html`;
                }
                else if (typeKey === 'pack') {
                    const rawText = (0, utils_1.cleanText)($el.text());
                    title = rawText.replace(/^ID:\d+\s*/, '');
                    link = `https://www.mcmod.cn/modpack/${id}.html`;
                    summary = `ID: ${id}`;
                }
                else {
                    const rawText = (0, utils_1.cleanText)($el.text());
                    title = rawText.replace(/^ID:\d+\s*/, '');
                    link = `https://www.mcmod.cn/class/${id}.html`;
                    summary = `ID: ${id}`;
                }
                if (title && link) {
                    results.push({
                        title,
                        link,
                        modName: typeKey === 'pack' ? '整合包' : '',
                        summary,
                    });
                }
            });
            return results;
        }
    }
    catch (e) {
        // console.error('备用接口解析失败:', e);
    }
    return [];
}
function formatListPage(items, pageIndex, type) {
    const total = Math.max(1, Math.ceil(items.length / constants_1.PAGE_SIZE));
    const page = items.slice(pageIndex * constants_1.PAGE_SIZE, (pageIndex + 1) * constants_1.PAGE_SIZE);
    const typeName = { mod: '模组', pack: '整合包', data: '资料', tutorial: '教程', author: '作者', user: '用户' }[type] || '结果';
    let text = `[mcmod] 搜索到的${typeName} (第 ${pageIndex + 1}/${total} 页):\n`;
    page.forEach((it, idx) => text += `${(pageIndex * constants_1.PAGE_SIZE) + idx + 1}. ${it.title}${it.modName ? ` 《${it.modName.replace(/[《》]/g, '')}》` : ''}\n`);
    text += '\n发送序号选择，p/n 翻页，q 退出。';
    return text;
}
