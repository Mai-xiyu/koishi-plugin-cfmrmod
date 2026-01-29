"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.Config = exports.inject = exports.name = void 0;
exports.apply = apply;
const koishi_1 = require("koishi");
const cfmr = __importStar(require("./plugins/cfmr"));
const mcmod = __importStar(require("./plugins/mcmod"));
const notify = __importStar(require("./notify"));
exports.name = 'minecraft-search';
exports.inject = ['skia', 'database'];
exports.Config = koishi_1.Schema.object({
    prefixes: koishi_1.Schema.object({
        cf: koishi_1.Schema.string().default('cf'),
        mr: koishi_1.Schema.string().default('mr'),
        cnmc: koishi_1.Schema.string().default('cnmc'),
    }).description('指令前缀设置'),
    notify: koishi_1.Schema.object({
        enabled: koishi_1.Schema.boolean().default(false).description('是否开启模组更新通知'),
        interval: koishi_1.Schema.number().default(30 * 60 * 1000).description('轮询间隔(ms)，默认 30 分钟'),
        adminAuthority: koishi_1.Schema.number().default(3).description('机器人管理员权限等级(默认 3)'),
        stateFile: koishi_1.Schema.string().default('data/cfmrmod_notify_state.json').description('状态存储 JSON 路径（数据库不可用时使用）'),
        groups: koishi_1.Schema.array(koishi_1.Schema.object({
            channelId: koishi_1.Schema.string().description('群号/频道 ID'),
            enabled: koishi_1.Schema.boolean().default(true).description('是否启用本群通知'),
            subs: koishi_1.Schema.array(koishi_1.Schema.object({
                platform: koishi_1.Schema.union(['mr', 'cf']).description('平台：mr/cf'),
                projectId: koishi_1.Schema.string().description('项目 ID'),
                interval: koishi_1.Schema.number().default(30 * 60 * 1000).description('单独轮询间隔(ms)，默认 30 分钟，<= 0 禁用该订阅'),
            })).role('table').default([]).description('订阅列表'),
        })).role('table').default([]).description('通知群与订阅列表'),
    }).description('—— 更新通知 ——'),
    timeouts: koishi_1.Schema.number().default(60000).description('搜索会话超时时间(ms)'),
    debug: koishi_1.Schema.boolean().default(false).description('开启调试日志'),
    cfmr: cfmr.Config.description('CurseForge/Modrinth 搜索与图片卡片'),
    mcmod: mcmod.Config.description('MCMod.cn 搜索与图片卡片'),
});
function apply(ctx, config) {
    const prefixes = (config === null || config === void 0 ? void 0 : config.prefixes) || {};
    const shared = {
        prefixes,
        timeouts: config === null || config === void 0 ? void 0 : config.timeouts,
        debug: config === null || config === void 0 ? void 0 : config.debug,
    };
    if (cfmr.apply)
        cfmr.apply(ctx, { ...((config === null || config === void 0 ? void 0 : config.cfmr) || {}), ...shared });
    if (mcmod.apply)
        mcmod.apply(ctx, { ...((config === null || config === void 0 ? void 0 : config.mcmod) || {}), ...shared });
    if (notify.apply)
        notify.apply(ctx, (config === null || config === void 0 ? void 0 : config.notify) || {}, { cfmr: (config === null || config === void 0 ? void 0 : config.cfmr) || {} });
}
