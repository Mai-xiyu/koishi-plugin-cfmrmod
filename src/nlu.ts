const { Schema } = require('koishi');
const fetch = require('node-fetch');

const DEFAULT_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-4o-mini';

export const Config = Schema.object({
  enabled: Schema.boolean().default(false).description('启用 @机器人 自然语言查询入口'),
  endpoint: Schema.string().default(DEFAULT_ENDPOINT).description('OpenAI 兼容 Chat Completions 接口地址'),
  apiKey: Schema.string().default('').description('OpenAI 兼容接口 API Key'),
  model: Schema.string().default(DEFAULT_MODEL).description('模型名称'),
  timeout: Schema.number().default(15000).description('AI 请求超时(ms)'),
  temperature: Schema.number().default(0).description('AI 温度参数'),
}).default({}).description('—— AI 自然语言理解 ——');

const PLATFORM_ALIASES = {
  mcmod: 'mcmod', cnmc: 'mcmod', mc: 'mcmod', 'mcmod.cn': 'mcmod', 'mc百科': 'mcmod',
  cf: 'cf', curseforge: 'cf', curse: 'cf',
  mr: 'mr', modrinth: 'mr',
};

const TYPE_ALIASES = {
  mod: 'mod', mods: 'mod', 模组: 'mod',
  pack: 'pack', modpack: 'pack', 整合包: 'pack',
  resource: 'resource', resourcepack: 'resource', 材质: 'resource', 资源包: 'resource', 材质包: 'resource',
  shader: 'shader', 光影: 'shader',
  plugin: 'plugin', 插件: 'plugin',
  data: 'data', item: 'data', 资料: 'data', 物品: 'data',
  tutorial: 'tutorial', post: 'tutorial', 教程: 'tutorial',
  author: 'author', 作者: 'author',
  user: 'user', 用户: 'user',
};

const PLATFORM_TYPES = {
  mcmod: new Set(['mod', 'pack', 'data', 'tutorial', 'author', 'user']),
  cf: new Set(['mod', 'pack', 'resource', 'shader', 'plugin']),
  mr: new Set(['mod', 'pack', 'resource', 'shader', 'plugin']),
};

const COMMENT_ACTIONS = new Set(['comment', 'comment_thread', 'thread_comment', 'floor_comment', 'reply_comment']);
const COMMENT_LIST_ACTIONS = new Set(['comments', 'comment_list', 'all_comments', 'comments_list']);

function normalizeEndpoint(endpoint) {
  const value = String(endpoint || DEFAULT_ENDPOINT).trim().replace(/\/+$/, '');
  if (/\/chat\/completions$/i.test(value)) return value;
  if (/\/v\d+$/i.test(value)) return `${value}/chat/completions`;
  return value;
}

function withTimeout(timeout) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, Number(timeout) || 15000));
  return { controller, done: () => clearTimeout(timer) };
}

function extractJsonObject(text) {
  const value = String(text || '').trim();
  try { return JSON.parse(value); } catch {}
  const match = value.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('AI 返回内容不是 JSON');
  return JSON.parse(match[0]);
}

function normalizePlatform(value) {
  const key = String(value || '').trim().toLowerCase();
  return PLATFORM_ALIASES[key] || 'mcmod';
}

function normalizeType(value, platform) {
  const key = String(value || '').trim().toLowerCase();
  const type = TYPE_ALIASES[key] || 'mod';
  return PLATFORM_TYPES[platform]?.has(type) ? type : 'mod';
}

export function normalizeAiDecision(raw) {
  const rawAction = String(raw?.action || '').trim().toLowerCase();
  const action = COMMENT_ACTIONS.has(rawAction)
    ? 'comment_thread'
    : COMMENT_LIST_ACTIONS.has(rawAction)
      ? 'comment_list'
      : (rawAction === 'direct_search' || rawAction === 'open' || rawAction === 'render')
        ? 'search'
        : rawAction;

  if (action && !['search', 'comment_thread', 'comment_list'].includes(action)) return { action: 'ignore' };

  const platform = normalizePlatform(raw?.platform);
  const type = normalizeType(raw?.type, platform);
  const url = String(raw?.url || raw?.link || '').replace(/[\r\n]+/g, ' ').trim();
  const target = String(raw?.target || raw?.floor || raw?.commentId || raw?.comment_id || '').replace(/[\r\n]+/g, ' ').trim();
  const page = Math.max(1, Number(raw?.page || 1) || 1);
  const size = Math.max(0, Number(raw?.size || raw?.pageSize || raw?.page_size || 0) || 0);
  const query = String(raw?.query || raw?.keyword || '').replace(/[\r\n]+/g, ' ').trim();

  if (action === 'comment_thread') {
    if (!target) return { action: 'ignore' };
    if (url) return { action: 'comment_thread', platform: 'mcmod', type, url, target, page, size };
    if (query) return { action: 'comment_thread', platform: 'mcmod', type, query, target, page, size };
    return { action: 'ignore' };
  }

  if (action === 'comment_list') {
    if (url) return { action: 'comment_list', platform: 'mcmod', type, url, page, size };
    if (query) return { action: 'comment_list', platform: 'mcmod', type, query, page, size };
    return { action: 'ignore' };
  }

  if (!query) return { action: 'ignore' };
  return { action: 'search', platform, type, query, direct: raw?.direct !== false };
}

async function requestAi(config, text) {
  const endpoint = normalizeEndpoint(config?.endpoint);
  const headers = { 'Content-Type': 'application/json' };
  if (config?.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`;

  const body = {
    model: config?.model || DEFAULT_MODEL,
    temperature: Number(config?.temperature ?? 0) || 0,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: [
          '你是 Minecraft 模组搜索意图解析器，只返回 JSON，不要解释。',
          'JSON 格式一: {"action":"search|ignore","platform":"mcmod|cf|mr","type":"mod|pack|data|tutorial|author|user|resource|shader|plugin","query":"关键词"}',
          'JSON 格式二: {"action":"comment_list","url":"MCMod页面URL","page":1,"size":5}，用于渲染某页面全部主评论列表。',
          'JSON 格式三: {"action":"comment_thread","url":"MCMod页面URL","target":"3楼|floor:3|id:2112330","page":1,"size":5}，用于渲染某一楼评论及子评论。',
          '如果用户要求某个模组/作者/教程的评论但没有 URL，返回 {"action":"comment_list","type":"mod|pack|tutorial|author|user","query":"关键词"}；如果还指定楼层，再用 comment_thread 并包含 target。',
          '默认 platform 为 mcmod，默认 type 为 mod。',
          'cf/curseforge 表示 CurseForge，mr/modrinth 表示 Modrinth，cnmc/mcmod/MC百科 表示 mcmod.cn。',
          '“查询/搜索/查一下/找一下/模组/评论”等只是意图词，不要放进 query；保留具体模组名、英文名、ID 或关键词。',
          '当用户说“JEI模组”“JEI本体”“查JEI”时，query 应为 "JEI"，不要扩展成 JEI 附属或更泛的关键词。',
          '如果不是搜索请求或没有明确关键词，返回 {"action":"ignore"}。',
        ].join('\n'),
      },
      { role: 'user', content: text },
    ],
  };

  const run = async (payload) => {
    const { controller, done } = withTimeout(config?.timeout);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const responseText = await res.text();
      if (!res.ok) {
        const err: any = new Error(`AI 请求失败: HTTP ${res.status} ${responseText.slice(0, 300)}`);
        err.status = res.status;
        throw err;
      }
      return JSON.parse(responseText);
    } finally {
      done();
    }
  };

  let json;
  try {
    json = await run(body);
  } catch (e) {
    if (e?.status !== 400 || !body.response_format) throw e;
    const retryBody = { ...body };
    delete retryBody.response_format;
    json = await run(retryBody);
  }

  const content = json?.choices?.[0]?.message?.content || json?.choices?.[0]?.text || json?.output_text;
  if (!content) throw new Error('AI 返回中没有 message.content');
  return normalizeAiDecision(extractJsonObject(content));
}

function botIds(session) {
  return [session?.selfId, session?.bot?.selfId, session?.bot?.userId]
    .filter(Boolean)
    .map(id => String(id));
}

function hasAtSelf(session) {
  const ids = botIds(session);
  const elements = Array.isArray(session?.elements) ? session.elements : [];
  for (const element of elements) {
    if (element?.type !== 'at') continue;
    const id = String(element?.attrs?.id || element?.attrs?.userId || element?.attrs?.qq || '');
    if (id && (!ids.length || ids.includes(id))) return true;
  }

  const content = String(session?.content || '');
  const atRegex = /<at\s+([^>]*?)\/?>(?:<\/at>)?/gi;
  let match;
  while ((match = atRegex.exec(content))) {
    const attrs = match[1] || '';
    const id = attrs.match(/(?:id|user-id|qq)=(['"]?)([^'"\s/>]+)\1/i)?.[2];
    if (id && (!ids.length || ids.includes(String(id)))) return true;
  }
  return false;
}

function stripAt(text) {
  return String(text || '')
    .replace(/<at\s+[^>]*\/?>(?:<\/at>)?/gi, ' ')
    .replace(/\[CQ:at,[^\]]+\]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getMentionText(session) {
  const stripped = String(session?.stripped?.content || '').trim();
  const raw = stripAt(session?.content || '');
  return (stripped && stripped !== String(session?.content || '').trim()) ? stripped : raw;
}

function isExplicitCommand(text, prefixes) {
  const value = String(text || '').trim().toLowerCase();
  return Object.values(prefixes || {}).some(prefix => {
    const p = String(prefix || '').trim().toLowerCase();
    return p && (value === p || value.startsWith(`${p} `) || value.startsWith(`${p}.`));
  });
}

export function buildCommand(decision, prefixes) {
  if (!decision || decision.action === 'ignore') return '';
  const cnmcPrefix = prefixes?.cnmc || 'cnmc';
  if (decision.action === 'comment_thread') {
    const page = Math.max(1, Number(decision.page || 1) || 1);
    const size = Number(decision.size || 0) || 0;
    if (decision.url) {
      return `${cnmcPrefix}.comment ${decision.url} ${decision.target} ${page}${size > 0 ? ` -s ${Math.floor(size)}` : ''}`;
    }
    if (decision.query) {
      const type = normalizeType(decision.type, 'mcmod');
      return `${cnmcPrefix}.${type} --direct --comment-target ${decision.target}${size > 0 ? ` -s ${Math.floor(size)}` : ''} ${decision.query}`;
    }
    return '';
  }
  if (decision.action === 'comment_list') {
    const page = Math.max(1, Number(decision.page || 1) || 1);
    const size = Number(decision.size || 0) || 0;
    if (decision.url) {
      return `${cnmcPrefix}.comments ${decision.url} ${page}${size > 0 ? ` -s ${Math.floor(size)}` : ''}`;
    }
    if (decision.query) {
      const type = normalizeType(decision.type, 'mcmod');
      return `${cnmcPrefix}.${type} --direct --comments${size > 0 ? ` -s ${Math.floor(size)}` : ''} ${decision.query}`;
    }
    return '';
  }
  if (decision.action !== 'search') return '';
  const platform = normalizePlatform(decision.platform);
  const type = normalizeType(decision.type, platform);
  const query = String(decision.query || '').replace(/[\r\n]+/g, ' ').trim();
  if (!query) return '';
  const prefix = platform === 'mcmod'
    ? (prefixes?.cnmc || 'cnmc')
    : platform === 'cf'
      ? (prefixes?.cf || 'cf')
      : (prefixes?.mr || 'mr');
  const direct = decision.direct !== false ? '--direct ' : '';
  return `${prefix}.${type} ${direct}${query}`;
}

export function apply(ctx, config, shared: any = {}) {
  if (!config?.enabled) return;

  const logger = ctx.logger('minecraft-nlu');
  const prefixes = shared?.prefixes || {};

  ctx.middleware(async (session, next) => {
    if (!hasAtSelf(session)) return next();

    const text = getMentionText(session);
    if (!text || isExplicitCommand(text, prefixes)) return next();

    let decision;
    try {
      decision = await requestAi(config, text);
    } catch (e) {
      logger.warn(`AI 自然语言解析失败: ${e?.message || e}`);
      await session.send(`AI 自然语言解析失败: ${e?.message || e}`);
      return;
    }

    const command = buildCommand(decision, prefixes);
    if (!command) return next();

    if (shared?.debug || config?.debug) logger.info(`NLU: ${text} -> ${command}`);
    const result = await session.execute(command);
    if (result) await session.send(result);
  });
}
