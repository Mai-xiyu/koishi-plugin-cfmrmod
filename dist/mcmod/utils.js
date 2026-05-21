"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toImageSrc = toImageSrc;
exports.cleanText = cleanText;
exports.fixUrl = fixUrl;
exports.compactUrlText = compactUrlText;
exports.extractImageUrl = extractImageUrl;
exports.parseGalleryFromTable = parseGalleryFromTable;
const constants_1 = require("./constants");
async function toImageSrc(input) {
    const value = (input && typeof input.then === 'function') ? await input : input;
    if (!value)
        return '';
    if (typeof value === 'string')
        return value;
    const buf = Buffer.isBuffer(value) ? value : (value instanceof Uint8Array ? Buffer.from(value) : null);
    if (buf)
        return `data:image/png;base64,${buf.toString('base64')}`;
    return String(value);
}
function cleanText(text) {
    if (!text)
        return '';
    return text.replace(/[\r\n\t]+/g, '').trim();
}
function fixUrl(url) {
    if (!url)
        return null;
    if (url.startsWith('//'))
        return 'https:' + url;
    if (url.startsWith('/'))
        return constants_1.BASE_URL + url;
    if (!url.startsWith('http'))
        return constants_1.BASE_URL + '/' + url;
    return url;
}
function compactUrlText(url) {
    if (!url)
        return '';
    const limit = 60;
    let text = String(url).trim();
    try {
        const parsed = new URL(text.startsWith('//') ? `https:${text}` : text);
        const host = parsed.hostname.replace(/^www\./, '');
        const path = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/$/, '');
        text = `${host}${path}`;
    }
    catch {
        text = text.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
    }
    return text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
}
function extractImageUrl(node) {
    var _a;
    if (!node || !node.attribs)
        return null;
    const attrs = node.attribs;
    const candidates = [
        attrs['data-original'],
        attrs['data-lazy-src'],
        attrs['data-src'],
        attrs['src'],
    ].filter(Boolean);
    if (attrs['srcset']) {
        const first = (_a = String(attrs['srcset']).split(',')[0]) === null || _a === void 0 ? void 0 : _a.trim().split(' ')[0];
        if (first)
            candidates.push(first);
    }
    if (attrs['style']) {
        const match = String(attrs['style']).match(/background-image:\s*url\((['"]?)([^'")]+)\1\)/i);
        if (match === null || match === void 0 ? void 0 : match[2])
            candidates.push(match[2]);
    }
    for (const candidate of candidates) {
        const url = fixUrl(String(candidate).trim());
        if (url)
            return url;
    }
    return null;
}
function parseGalleryFromTable($, tableNode) {
    const items = [];
    $(tableNode).find('td').each((_, td) => {
        const imgNode = $(td).find('img').first()[0];
        if (!imgNode)
            return;
        const src = extractImageUrl(imgNode);
        if (!src)
            return;
        const caption = cleanText($(td).find('.figcaption, figcaption').first().text()) ||
            cleanText($(td).find('[class*="caption"]').first().text()) ||
            cleanText($(imgNode).attr('alt')) ||
            '';
        items.push({ src: fixUrl(src), caption });
    });
    return items;
}
