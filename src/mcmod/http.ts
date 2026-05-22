import { BASE_URL } from './constants';

const fetch = require('node-fetch');

let cookieManager = null;
try {
  cookieManager = require('../../cookie-manager');
} catch (e) {
  // cookie-manager 不存在时静默忽略
}

let globalCookie = '';
let cookieLastCheck = 0;
let cookieCheckInterval = 30 * 60 * 1000;
let useManagedCookie = false;

function mergeCookie(name, value) {
  if (!name || !value) return;
  const parts = String(globalCookie || '')
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .filter(part => part.split('=')[0] !== name);
  parts.push(`${name}=${value}`);
  globalCookie = parts.join('; ');
}

function rememberSetCookie(setCookie) {
  if (!setCookie) return;
  const list = Array.isArray(setCookie) ? setCookie : [setCookie];
  for (const line of list) {
    const first = String(line || '').split(';')[0];
    const idx = first.indexOf('=');
    if (idx <= 0) continue;
    mergeCookie(first.slice(0, idx).trim(), first.slice(idx + 1).trim());
  }
}

function rememberResponseCookies(res) {
  try {
    const raw = res?.headers?.raw?.()['set-cookie'];
    if (raw?.length) rememberSetCookie(raw);
  } catch {}
  try {
    const one = res?.headers?.get?.('set-cookie');
    if (one) rememberSetCookie(one);
  } catch {}
}

function hasCookie(name) {
  return String(globalCookie || '').split(';').some(part => part.trim().startsWith(`${name}=`));
}

export function setMcmodCookie(cookie, checkedAt = Date.now()) {
  globalCookie = String(cookie || '');
  cookieLastCheck = checkedAt;
}

export function configureMcmodCookie(options = {}) {
  useManagedCookie = !!(options as any).autoCookie;
  const interval = Number((options as any).checkInterval);
  if (Number.isFinite(interval) && interval > 0) cookieCheckInterval = interval;
  if ((options as any).cookie !== undefined) {
    setMcmodCookie((options as any).cookie || '', (options as any).cookie ? Date.now() : 0);
  }
}

export function getMcmodCookie() {
  return globalCookie;
}

export function loadManagedCookie(logger) {
  if (!cookieManager) return;
  useManagedCookie = true;
  cookieManager.getCookie().then(cookie => {
    if (cookie) {
      setMcmodCookie(cookie);
      logger?.info?.('已自动获取 mcmod.cn Cookie');
    }
  }).catch(e => {
    logger?.warn?.('自动获取 Cookie 失败:', e?.message || e);
  });
}

export async function fetchWithTimeout(url, opts = {}, timeout = 15000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

export function getHeaders(referer = `${BASE_URL}/`) {
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

export function getImageHeaders(url, referer = `${BASE_URL}/`) {
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
  } catch {}
  return headers;
}

export async function ensureValidCookie() {
  const now = Date.now();
  if (hasCookie('MCMOD_SEED') && (now - cookieLastCheck) < cookieCheckInterval) {
    return;
  }

  if (useManagedCookie && cookieManager) {
    try {
      const cookie = await cookieManager.getCookie();
      if (cookie) {
        setMcmodCookie(cookie, now);
        if (hasCookie('MCMOD_SEED')) return;
      }
    } catch (e) {
      // 静默失败
    }
  }

  try {
    const res = await fetchWithTimeout(`${BASE_URL}/`, {
      headers: getHeaders(`${BASE_URL}/`),
    });
    rememberResponseCookies(res);
    cookieLastCheck = now;
    try { await res.text(); } catch {}
  } catch (e) {
    cookieLastCheck = now;
  }
}

function withCurrentCookie(opts = {}) {
  const headers = { ...((opts as any).headers || {}) };
  if (globalCookie) headers['Cookie'] = globalCookie;
  return { ...(opts as any), headers };
}

function rememberDocumentCookie(html) {
  const text = String(html || '');
  const regex = /document\.cookie\s*=\s*(['"])(.*?)\1/g;
  let match;
  while ((match = regex.exec(text))) rememberSetCookie(match[2]);
}

function isCookieChallengeHtml(html) {
  const text = String(html || '');
  return text.length < 1024 && /document\.cookie\s*=/.test(text) && /window\.location\.href\s*=/.test(text);
}

export async function fetchMcmodText(url, opts = {}, timeout = 15000) {
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

export async function fetchMcmodJson(url, opts = {}, timeout = 15000) {
  const text = await fetchMcmodText(url, opts, timeout);
  return JSON.parse(text);
}
