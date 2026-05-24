import { Schema } from 'koishi';
import * as cfmr from './plugins/cfmr';
import * as mcmod from './plugins/mcmod';
import * as nlu from './nlu';
import * as notify from './notify';

export const name = 'minecraft-search';
export const inject = ['database'];

export const Config = Schema.object({
  prefixes: Schema.object({
    cf: Schema.string().default('cf'),
    mr: Schema.string().default('mr'),
    cnmc: Schema.string().default('cnmc'),
  }).default({ cf: 'cf', mr: 'mr', cnmc: 'cnmc' }).description('指令前缀设置'),
  notify: Schema.object({
    enabled: Schema.boolean().default(false).description('是否开启模组更新通知'),
    interval: Schema.number().default(30 * 60 * 1000).description('轮询间隔(ms)，默认 30 分钟'),
    adminAuthority: Schema.number().default(3).description('机器人管理员权限等级(默认 3)'),
    stateFile: Schema.string().default('data/cfmrmod_notify_state.json').description('状态存储 JSON 路径（数据库不可用时使用）'),
    configFile: Schema.string().default('data/cfmrmod_notify_config.json').description('订阅配置存储 JSON 路径（指令修改会写入）'),
    groups: Schema.array(Schema.object({
      channelId: Schema.string().description('群号/频道 ID'),
      enabled: Schema.boolean().default(true).description('是否启用本群通知'),
      subs: Schema.array(Schema.object({
        platform: Schema.union(['mr', 'cf']).description('平台：mr/cf'),
        projectId: Schema.string().description('项目 ID'),
        interval: Schema.number().default(30 * 60 * 1000).description('单独轮询间隔(ms)，默认 30 分钟，<= 0 禁用该订阅'),
      })).role('table').default([]).description('订阅列表'),
    })).role('table').default([]).description('通知群与订阅列表'),
  }).default({
    enabled: false,
    interval: 30 * 60 * 1000,
    adminAuthority: 3,
    stateFile: 'data/cfmrmod_notify_state.json',
    configFile: 'data/cfmrmod_notify_config.json',
    groups: [],
  }).description('—— 更新通知 ——'),
  timeouts: Schema.number().default(60000).description('搜索会话超时时间(ms)'),
  debug: Schema.boolean().default(false).description('开启调试日志'),
  nlu: nlu.Config,
  cfmr: cfmr.Config.default({}).description('CurseForge/Modrinth 搜索与图片卡片'),
  mcmod: mcmod.Config.default({}).description('MCMod.cn 搜索与图片卡片'),
});

const DEFAULT_PREFIXES = { cf: 'cf', mr: 'mr', cnmc: 'cnmc' };

const DEFAULT_NOTIFY = {
  enabled: false,
  interval: 30 * 60 * 1000,
  adminAuthority: 3,
  stateFile: 'data/cfmrmod_notify_state.json',
  configFile: 'data/cfmrmod_notify_config.json',
  groups: [],
};

const DEFAULT_CFMR = {
  pageSize: 10,
  cacheTtl: 5 * 60 * 1000,
  requestTimeout: 15000,
  sendLink: true,
  debug: false,
  curseforgeApiKey: '',
  curseforgeGameId: 432,
  maxCanvasHeight: 8000,
  render: {
    emoji: {
      twemoji: true,
      cdn: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72',
    },
    image: {
      fetchWithHeaders: true,
    },
  },
};

const DEFAULT_MCMOD = {
  sendLink: true,
  cookie: '',
  autoCookie: false,
  cookieCheckInterval: 30 * 60 * 1000,
  debug: false,
  comment: {
    pageSize: 5,
    maxPageSize: 10,
    includeImages: true,
  },
  render: {
    emoji: {
      twemoji: true,
      cdn: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72',
    },
    image: {
      fetchWithHeaders: true,
    },
  },
};

function isPlainObject(value: any) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function cloneValue<T>(value: T): T {
  if (Array.isArray(value)) return value.map(item => cloneValue(item)) as any;
  if (isPlainObject(value)) {
    const result: any = {};
    Object.keys(value).forEach(key => {
      result[key] = cloneValue((value as any)[key]);
    });
    return result;
  }
  return value;
}

function mergeDefaults<T>(defaults: T, input: any): T {
  const result: any = cloneValue(defaults);
  if (!isPlainObject(input)) return result;
  Object.keys(input).forEach(key => {
    const value = input[key];
    if (value === undefined) return;
    if (isPlainObject(value) && isPlainObject(result[key])) {
      result[key] = mergeDefaults(result[key], value);
      return;
    }
    result[key] = cloneValue(value);
  });
  return result;
}

export function normalizeConfig(input: any) {
  const prefixes = mergeDefaults(DEFAULT_PREFIXES, input?.prefixes);
  const debug = input?.debug ?? false;
  const timeouts = Number(input?.timeouts ?? 60000) || 60000;
  const cfmrConfig = mergeDefaults(DEFAULT_CFMR, input?.cfmr);
  const mcmodConfig = mergeDefaults(DEFAULT_MCMOD, input?.mcmod);

  return {
    prefixes,
    timeouts,
    debug,
    nlu: cloneValue(input?.nlu || {}),
    cfmr: cfmrConfig,
    mcmod: mcmodConfig,
    notify: mergeDefaults(DEFAULT_NOTIFY, input?.notify),
  };
}

export function apply(ctx: any, config: any) {
  const logger = ctx.logger(name);
  const runtimeConfig = normalizeConfig(config || {});
  let canvasAdapter: any = null;
  try {
    // Dynamic load: keep package lightweight for market scan.
    const lib = require('@napi-rs/canvas');
    canvasAdapter = {
      createCanvas: lib.createCanvas,
      loadImage: lib.loadImage,
      Path2D: lib.Path2D,
      GlobalFonts: lib.GlobalFonts,
      registerFont(path: string, family: string) {
        return lib.GlobalFonts.registerFromPath(path, family);
      },
    };
  } catch (e: any) {
    logger.warn(`未检测到 @napi-rs/canvas，图片生成功能已禁用。请在 Koishi 实例目录执行: npm i @napi-rs/canvas (${e?.message || e})`);
  }

  const prefixes = runtimeConfig.prefixes;
  const shared = {
    prefixes,
    timeouts: runtimeConfig.timeouts,
    debug: runtimeConfig.debug,
    canvas: canvasAdapter,
  };
  if (cfmr.apply) cfmr.apply(ctx, { ...runtimeConfig.cfmr, ...shared, debug: runtimeConfig.cfmr.debug ?? shared.debug });
  if (mcmod.apply) mcmod.apply(ctx, { ...runtimeConfig.mcmod, ...shared, debug: runtimeConfig.mcmod.debug ?? shared.debug });
  if (nlu.apply) nlu.apply(ctx, runtimeConfig.nlu, shared);
  if (notify.apply && canvasAdapter) notify.apply(ctx, runtimeConfig.notify, { cfmr: runtimeConfig.cfmr });
  if (!canvasAdapter) logger.warn('notify 更新卡片功能已禁用（缺少 @napi-rs/canvas）。');
}
