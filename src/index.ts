import { Schema } from 'koishi';
import * as cfmr from './plugins/cfmr';
import * as mcmod from './plugins/mcmod';
import * as notify from './notify';

export const name = 'minecraft-search';
export const inject = ['database'];

export const Config = Schema.object({
  prefixes: Schema.object({
    cf: Schema.string().default('cf'),
    mr: Schema.string().default('mr'),
    cnmc: Schema.string().default('cnmc'),
  }).description('指令前缀设置'),
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
  }).description('—— 更新通知 ——'),
  timeouts: Schema.number().default(60000).description('搜索会话超时时间(ms)'),
  debug: Schema.boolean().default(false).description('开启调试日志'),
  cfmr: cfmr.Config.description('CurseForge/Modrinth 搜索与图片卡片'),
  mcmod: mcmod.Config.description('MCMod.cn 搜索与图片卡片'),
});

export function apply(ctx: any, config: any) {
  const logger = ctx.logger(name);
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

  const prefixes = config?.prefixes || {};
  const shared = {
    prefixes,
    timeouts: config?.timeouts,
    debug: config?.debug,
    canvas: canvasAdapter,
  };
  if (cfmr.apply) cfmr.apply(ctx, { ...(config?.cfmr || {}), ...shared });
  if (mcmod.apply) mcmod.apply(ctx, { ...(config?.mcmod || {}), ...shared });
  if (notify.apply && canvasAdapter) notify.apply(ctx, config?.notify || {}, { cfmr: config?.cfmr || {} });
  if (!canvasAdapter) logger.warn('notify 更新卡片功能已禁用（缺少 @napi-rs/canvas）。');
}
