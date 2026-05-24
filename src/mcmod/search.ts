import { COMMON_SELECT_URL, FALLBACK_TYPE_MAP, PAGE_SIZE } from './constants';
import { fetchMcmodJson, fetchMcmodText, fetchWithTimeout, getHeaders } from './http';
import { cleanText, fixUrl } from './utils';
import { normalizeSearchText, selectExactSearchResult } from '../match';

const cheerio = require('cheerio');

export async function fetchSearch(query, typeKey) {
  const filterMap = { mod: 1, pack: 2, data: 3, tutorial: 4, author: 5, user: 6 };
  const filter = filterMap[typeKey] || 1;
  const searchUrl = `https://search.mcmod.cn/s?key=${encodeURIComponent(query)}&filter=${filter}&mold=0`;

  let results = [];

  try {
    const html = await fetchMcmodText(searchUrl, { headers: getHeaders('https://search.mcmod.cn/') });
    const $ = cheerio.load(html);

    $('.result-item, .media, .search-list .item, .user-list .row, .list .row').each((i, el) => {
      const $el = $(el);
      let titleEl = $el.find('.head > a').first();
      if (!titleEl.length) titleEl = $el.find('.media-heading a').first();
      if (!titleEl.length) {
        $el.find('a').each((j, a) => {
          if ($(a).text().trim().length > 0 && !titleEl.length) titleEl = $(a);
        });
      }

      const title = cleanText(titleEl.text());
      let link = titleEl.attr('href');
      const modName = cleanText($el.find('.meta span, .source').first().text()) || cleanText($el.find('.media-body .text-muted').first().text());

      if (title && link) {
        link = fixUrl(link);
        if (link && !link.includes('target=') && !/^\d+$/.test(title)) {
          let summary = cleanText($el.find('.body, .media-body').text());
          summary = summary.replace(title, '').replace(modName, '').trim();
          results.push({ title, link, modName: modName || '', summary });
        }
      }
    });
  } catch (e) {
    // 主站搜索失败忽略，继续走备用
  }

  if (results.length === 0) {
    try {
      const fallbackResults = await fetchSearchFallback(query, typeKey);
      if (fallbackResults && fallbackResults.length > 0) {
        return fallbackResults;
      }
    } catch (e) {
      // 备用接口失败则彻底无结果
    }
  }

  return results;
}

async function expandDirectQueryFromModrinth(query, typeKey) {
  if (!['mod', 'pack'].includes(typeKey)) return [];
  const raw = String(query || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{1,64}$/.test(raw)) return [];
  try {
    const res = await fetchWithTimeout(`https://api.modrinth.com/v2/project/${encodeURIComponent(raw)}`, {
      headers: {
        'User-Agent': 'koishi-plugin-cfmrmod',
        'Accept': 'application/json',
      },
    }, 8000);
    if (!res.ok) return [];
    const project = await res.json();
    const title = cleanText(project?.title || '');
    const slug = cleanText(project?.slug || '');
    const aliases = [
      title.replace(/\s*[\(（][^\)）]+[\)）]\s*/g, ' ').trim(),
      title,
      slug,
    ].filter(Boolean);
    return Array.from(new Set(aliases));
  } catch {
    return [];
  }
}

export async function fetchDirectSearch(query, typeKey) {
  const results = await fetchSearch(query, typeKey);
  const direct = selectExactSearchResult(results, query);
  if (direct) return { results, direct, query };

  const aliases = await expandDirectQueryFromModrinth(query, typeKey);
  for (const alias of aliases) {
    if (normalizeSearchText(alias) === normalizeSearchText(query)) continue;
    const expandedResults = await fetchSearch(alias, typeKey);
    const expandedDirect = selectExactSearchResult(expandedResults, alias, 650) ||
      (expandedResults.length === 1 ? expandedResults[0] : null);
    if (expandedDirect) {
      return { results: expandedResults, direct: expandedDirect, query: alias };
    }
  }

  return { results, direct: null, query };
}

export async function fetchSearchFallback(query, typeKey) {
  const apiType = FALLBACK_TYPE_MAP[typeKey];
  if (!apiType) return [];

  try {
    const requestData = { key: query, type: apiType };
    const params = new URLSearchParams();
    params.append('data', JSON.stringify(requestData));

    const headers = {
      ...getHeaders('https://www.mcmod.cn'),
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    };

    const json = await fetchMcmodJson(COMMON_SELECT_URL, {
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
        if (!id) return;

        let title = '';
        let summary = '（来自快速索引）';
        let link = '';

        if (typeKey === 'author') {
          title = cleanText($el.find('b').text()) || cleanText($el.text());
          summary = cleanText($el.find('i').text());
          link = `https://www.mcmod.cn/author/${id}.html`;
        } else if (typeKey === 'pack') {
          const rawText = cleanText($el.text());
          title = rawText.replace(/^ID:\d+\s*/, '');
          link = `https://www.mcmod.cn/modpack/${id}.html`;
          summary = `ID: ${id}`;
        } else {
          const rawText = cleanText($el.text());
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
  } catch (e) {
    // console.error('备用接口解析失败:', e);
  }
  return [];
}

export function formatListPage(items, pageIndex, type) {
  const total = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const page = items.slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE);
  const typeName = { mod: '模组', pack: '整合包', data: '资料', tutorial: '教程', author: '作者', user: '用户' }[type] || '结果';
  let text = `[mcmod] 搜索到的${typeName} (第 ${pageIndex + 1}/${total} 页):\n`;
  page.forEach((it, idx) => text += `${(pageIndex * PAGE_SIZE) + idx + 1}. ${it.title}${it.modName ? ` 《${it.modName.replace(/[《》]/g, '')}》` : ''}\n`);
  text += '\n发送序号选择，p/n 翻页，q 退出。';
  return text;
}
