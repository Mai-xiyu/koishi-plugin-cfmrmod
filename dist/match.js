"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeSearchText = normalizeSearchText;
exports.searchAliases = searchAliases;
exports.scoreSearchResult = scoreSearchResult;
exports.selectExactSearchResult = selectExactSearchResult;
function cleanQueryText(value) {
    let text = String(value || '').trim();
    const intentWords = [
        '帮我', '请', '查询一下', '查一下', '搜索一下', '查询', '搜索', '找一下', '找',
        '模组', '整合包', '资源包', '材质包', '材质', '光影', '插件', '教程', '作者', '用户',
        '评论', '短评', '本体', '本身', '详情', '页面',
    ];
    let changed = true;
    while (changed && text) {
        changed = false;
        for (const word of intentWords) {
            if (text.startsWith(word)) {
                text = text.slice(word.length).trim();
                changed = true;
            }
            if (text.endsWith(word)) {
                text = text.slice(0, -word.length).trim();
                changed = true;
            }
        }
    }
    return text;
}
function stripHtml(value) {
    return String(value || '').replace(/<[^>]+>/g, ' ');
}
function normalizeSearchText(value) {
    return stripHtml(value)
        .toLowerCase()
        .normalize('NFKC')
        .replace(/&[a-z0-9#]+;/gi, ' ')
        .replace(/[\s"'`‘’“”.,，。:：;；!！?？()[\]（）【】{}<>《》_\-–—+|/\\]+/g, '')
        .trim();
}
function words(value) {
    return stripHtml(value).match(/[A-Za-z0-9]+/g) || [];
}
function acronym(value) {
    const list = words(value);
    if (list.length < 2)
        return '';
    return list.map(word => word[0]).join('').toLowerCase();
}
function pushAlias(aliases, value) {
    const text = stripHtml(value).replace(/\s+/g, ' ').trim();
    if (!text)
        return;
    aliases.push(text);
}
function searchAliases(item) {
    var _a;
    const aliases = [];
    const fields = [item === null || item === void 0 ? void 0 : item.name, item === null || item === void 0 ? void 0 : item.title, item === null || item === void 0 ? void 0 : item.modName, item === null || item === void 0 ? void 0 : item.id].filter(Boolean);
    for (const field of fields) {
        const text = stripHtml(field).replace(/\s+/g, ' ').trim();
        pushAlias(aliases, text);
        text.replace(/[\[(（【]([^\])）】]+)[\])）】]/g, (_, alias) => {
            pushAlias(aliases, alias);
            return '';
        });
        pushAlias(aliases, text.replace(/[\[(（【][^\])）】]+[\])）】]/g, ' '));
        const leading = (_a = text.match(/^\s*[\[(（【]([^\])）】]+)[\])）】]/)) === null || _a === void 0 ? void 0 : _a[1];
        if (leading)
            pushAlias(aliases, leading);
        const acro = acronym(text);
        if (acro)
            pushAlias(aliases, acro);
    }
    return Array.from(new Set(aliases));
}
function looksLikeShortAcronym(queryNorm) {
    return /^[a-z0-9]{2,5}$/.test(queryNorm);
}
function hasAddonWords(value) {
    return /附属|支持|扩展|集成|兼容|插件|addon|addons|integration|integrations|support|supports|plugin|plugins|bee|bees|hider|history|utility|utilities/i
        .test(String(value || ''));
}
function scoreSearchResult(item, query) {
    const rawQuery = cleanQueryText(query);
    const queryNorm = normalizeSearchText(rawQuery);
    if (!queryNorm)
        return 0;
    let best = 0;
    const title = String((item === null || item === void 0 ? void 0 : item.name) || (item === null || item === void 0 ? void 0 : item.title) || '');
    const titleNorm = normalizeSearchText(title);
    const aliases = searchAliases(item);
    for (const alias of aliases) {
        const aliasNorm = normalizeSearchText(alias);
        if (!aliasNorm)
            continue;
        if (aliasNorm === queryNorm)
            best = Math.max(best, 1000);
        if (acronym(alias) === queryNorm) {
            const firstWord = normalizeSearchText(words(alias)[0] || '');
            best = Math.max(best, firstWord === queryNorm ? 640 : 940);
        }
        if (aliasNorm.startsWith(queryNorm)) {
            const lengthPenalty = Math.min(180, Math.max(0, aliasNorm.length - queryNorm.length) * 4);
            const base = looksLikeShortAcronym(queryNorm) ? 620 : 820;
            best = Math.max(best, base - lengthPenalty);
        }
        if (queryNorm.length >= 3 && aliasNorm.includes(queryNorm)) {
            const lengthPenalty = Math.min(160, Math.max(0, aliasNorm.length - queryNorm.length) * 2);
            best = Math.max(best, 520 - lengthPenalty);
        }
    }
    if (titleNorm && titleNorm === queryNorm)
        best = Math.max(best, 1000);
    if (titleNorm && titleNorm.startsWith(queryNorm)) {
        const base = looksLikeShortAcronym(queryNorm) ? 580 : 760;
        best = Math.max(best, base - Math.min(120, titleNorm.length - queryNorm.length));
    }
    if (looksLikeShortAcronym(queryNorm) && hasAddonWords(title))
        best = Math.max(0, best - 260);
    return best;
}
function selectExactSearchResult(results, query, minScore = 700) {
    let best = null;
    let bestScore = 0;
    for (const item of results || []) {
        const score = scoreSearchResult(item, query);
        if (score > bestScore) {
            best = item;
            bestScore = score;
        }
    }
    return best && bestScore >= minScore ? best : null;
}
