"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setMcmodCookie = setMcmodCookie;
exports.getMcmodCookie = getMcmodCookie;
exports.loadManagedCookie = loadManagedCookie;
exports.fetchWithTimeout = fetchWithTimeout;
exports.getHeaders = getHeaders;
exports.getImageHeaders = getImageHeaders;
exports.ensureValidCookie = ensureValidCookie;
exports.fetchMcmodText = fetchMcmodText;
exports.fetchMcmodJson = fetchMcmodJson;
const constants_1 = require("./constants");
const fetch = require('node-fetch');
let cookieManager = null;
try {
    cookieManager = require('../../cookie-manager');
}
catch (e) {
    // cookie-manager 不存在时静默忽略
}
let globalCookie = '';
let cookieLastCheck = 0;
const COOKIE_CHECK_INTERVAL = 30 * 60 * 1000;
function mergeCookie(name, value) {
    if (!name || !value)
        return;
    const parts = String(globalCookie || '')
        .split(';')
        .map(part => part.trim())
        .filter(Boolean)
        .filter(part => part.split('=')[0] !== name);
    parts.push(`${name}=${value}`);
    globalCookie = parts.join('; ');
}
function rememberSetCookie(setCookie) {
    if (!setCookie)
        return;
    const list = Array.isArray(setCookie) ? setCookie : [setCookie];
    for (const line of list) {
        const first = String(line || '').split(';')[0];
        const idx = first.indexOf('=');
        if (idx <= 0)
            continue;
        mergeCookie(first.slice(0, idx).trim(), first.slice(idx + 1).trim());
    }
}
function rememberResponseCookies(res) {
    var _a, _b, _c, _d;
    try {
        const raw = (_b = (_a = res === null || res === void 0 ? void 0 : res.headers) === null || _a === void 0 ? void 0 : _a.raw) === null || _b === void 0 ? void 0 : _b.call(_a)['set-cookie'];
        if (raw === null || raw === void 0 ? void 0 : raw.length)
            rememberSetCookie(raw);
    }
    catch { }
    try {
        const one = (_d = (_c = res === null || res === void 0 ? void 0 : res.headers) === null || _c === void 0 ? void 0 : _c.get) === null || _d === void 0 ? void 0 : _d.call(_c, 'set-cookie');
        if (one)
            rememberSetCookie(one);
    }
    catch { }
}
function hasCookie(name) {
    return String(globalCookie || '').split(';').some(part => part.trim().startsWith(`${name}=`));
}
function setMcmodCookie(cookie, checkedAt = Date.now()) {
    globalCookie = String(cookie || '');
    cookieLastCheck = checkedAt;
}
function getMcmodCookie() {
    return globalCookie;
}
function loadManagedCookie(logger) {
    if (!cookieManager)
        return;
    cookieManager.getCookie().then(cookie => {
        var _a;
        if (cookie) {
            setMcmodCookie(cookie);
            (_a = logger === null || logger === void 0 ? void 0 : logger.info) === null || _a === void 0 ? void 0 : _a.call(logger, '已自动获取 mcmod.cn Cookie');
        }
    }).catch(e => {
        var _a;
        (_a = logger === null || logger === void 0 ? void 0 : logger.warn) === null || _a === void 0 ? void 0 : _a.call(logger, '自动获取 Cookie 失败:', (e === null || e === void 0 ? void 0 : e.message) || e);
    });
}
async function fetchWithTimeout(url, opts = {}, timeout = 15000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const res = await fetch(url, { ...opts, signal: controller.signal });
        clearTimeout(id);
        return res;
    }
    catch (err) {
        clearTimeout(id);
        throw err;
    }
}
function getHeaders(referer = `${constants_1.BASE_URL}/`) {
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': referer,
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'X-Requested-With': 'XMLHttpRequest',
    };
    if (globalCookie) {
        headers['Cookie'] = globalCookie;
    }
    return headers;
}
function getImageHeaders(url, referer = `${constants_1.BASE_URL}/`) {
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': referer,
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
    };
    try {
        const host = new URL(url).hostname;
        if (globalCookie && /(^|\.)mcmod\.cn$/i.test(host)) {
            headers['Cookie'] = globalCookie;
        }
    }
    catch { }
    return headers;
}
async function ensureValidCookie() {
    const now = Date.now();
    if (hasCookie('MCMOD_SEED') && (now - cookieLastCheck) < COOKIE_CHECK_INTERVAL) {
        return;
    }
    if (cookieManager) {
        try {
            const cookie = await cookieManager.getCookie();
            if (cookie) {
                setMcmodCookie(cookie, now);
                if (hasCookie('MCMOD_SEED'))
                    return;
            }
        }
        catch (e) {
            // 静默失败
        }
    }
    try {
        const res = await fetchWithTimeout(`${constants_1.BASE_URL}/`, {
            headers: getHeaders(`${constants_1.BASE_URL}/`),
        });
        rememberResponseCookies(res);
        cookieLastCheck = now;
        try {
            await res.text();
        }
        catch { }
    }
    catch (e) {
        cookieLastCheck = now;
    }
}
function withCurrentCookie(opts = {}) {
    const headers = { ...(opts.headers || {}) };
    if (globalCookie)
        headers['Cookie'] = globalCookie;
    return { ...opts, headers };
}
function rememberDocumentCookie(html) {
    const text = String(html || '');
    const regex = /document\.cookie\s*=\s*(['"])(.*?)\1/g;
    let match;
    while ((match = regex.exec(text)))
        rememberSetCookie(match[2]);
}
function isCookieChallengeHtml(html) {
    const text = String(html || '');
    return text.length < 1024 && /document\.cookie\s*=/.test(text) && /window\.location\.href\s*=/.test(text);
}
async function fetchMcmodText(url, opts = {}, timeout = 15000) {
    await ensureValidCookie();
    let res = await fetchWithTimeout(url, withCurrentCookie(opts), timeout);
    rememberResponseCookies(res);
    let html = await res.text();
    rememberDocumentCookie(html);
    if (isCookieChallengeHtml(html)) {
        cookieLastCheck = 0;
        await ensureValidCookie();
        res = await fetchWithTimeout(url, withCurrentCookie(opts), timeout);
        rememberResponseCookies(res);
        html = await res.text();
        rememberDocumentCookie(html);
    }
    return html;
}
async function fetchMcmodJson(url, opts = {}, timeout = 15000) {
    const text = await fetchMcmodText(url, opts, timeout);
    return JSON.parse(text);
}
