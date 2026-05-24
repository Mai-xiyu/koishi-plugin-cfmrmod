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
exports.normalizeConfig = normalizeConfig;
exports.apply = apply;
const koishi_1 = require("koishi");
const cfmr = __importStar(require("./plugins/cfmr"));
const mcmod = __importStar(require("./plugins/mcmod"));
const nlu = __importStar(require("./nlu"));
const notify = __importStar(require("./notify"));
exports.name = 'minecraft-search';
exports.inject = ['database'];
exports.Config = koishi_1.Schema.object({
    prefixes: koishi_1.Schema.object({
        cf: koishi_1.Schema.string().default('cf'),
        mr: koishi_1.Schema.string().default('mr'),
        cnmc: koishi_1.Schema.string().default('cnmc'),
    }).default({ cf: 'cf', mr: 'mr', cnmc: 'cnmc' }).description('指令前缀设置'),
    notify: koishi_1.Schema.object({
        enabled: koishi_1.Schema.boolean().default(false).description('是否开启模组更新通知'),
        interval: koishi_1.Schema.number().default(30 * 60 * 1000).description('轮询间隔(ms)，默认 30 分钟'),
        adminAuthority: koishi_1.Schema.number().default(3).description('机器人管理员权限等级(默认 3)'),
        stateFile: koishi_1.Schema.string().default('data/cfmrmod_notify_state.json').description('状态存储 JSON 路径（数据库不可用时使用）'),
        configFile: koishi_1.Schema.string().default('data/cfmrmod_notify_config.json').description('订阅配置存储 JSON 路径（指令修改会写入）'),
        groups: koishi_1.Schema.array(koishi_1.Schema.object({
            channelId: koishi_1.Schema.string().description('群号/频道 ID'),
            enabled: koishi_1.Schema.boolean().default(true).description('是否启用本群通知'),
            subs: koishi_1.Schema.array(koishi_1.Schema.object({
                platform: koishi_1.Schema.union(['mr', 'cf']).description('平台：mr/cf'),
                projectId: koishi_1.Schema.string().description('项目 ID'),
                interval: koishi_1.Schema.number().default(30 * 60 * 1000).description('单独轮询间隔(ms)，默认 30 分钟，<= 0 禁用该订阅'),
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
    timeouts: koishi_1.Schema.number().default(60000).description('搜索会话超时时间(ms)'),
    debug: koishi_1.Schema.boolean().default(false).description('开启调试日志'),
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
function isPlainObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
}
function cloneValue(value) {
    if (Array.isArray(value))
        return value.map(item => cloneValue(item));
    if (isPlainObject(value)) {
        const result = {};
        Object.keys(value).forEach(key => {
            result[key] = cloneValue(value[key]);
        });
        return result;
    }
    return value;
}
function mergeDefaults(defaults, input) {
    const result = cloneValue(defaults);
    if (!isPlainObject(input))
        return result;
    Object.keys(input).forEach(key => {
        const value = input[key];
        if (value === undefined)
            return;
        if (isPlainObject(value) && isPlainObject(result[key])) {
            result[key] = mergeDefaults(result[key], value);
            return;
        }
        result[key] = cloneValue(value);
    });
    return result;
}
function normalizeConfig(input) {
    var _a, _b;
    const prefixes = mergeDefaults(DEFAULT_PREFIXES, input === null || input === void 0 ? void 0 : input.prefixes);
    const debug = (_a = input === null || input === void 0 ? void 0 : input.debug) !== null && _a !== void 0 ? _a : false;
    const timeouts = Number((_b = input === null || input === void 0 ? void 0 : input.timeouts) !== null && _b !== void 0 ? _b : 60000) || 60000;
    const cfmrConfig = mergeDefaults(DEFAULT_CFMR, input === null || input === void 0 ? void 0 : input.cfmr);
    const mcmodConfig = mergeDefaults(DEFAULT_MCMOD, input === null || input === void 0 ? void 0 : input.mcmod);
    return {
        prefixes,
        timeouts,
        debug,
        nlu: cloneValue((input === null || input === void 0 ? void 0 : input.nlu) || {}),
        cfmr: cfmrConfig,
        mcmod: mcmodConfig,
        notify: mergeDefaults(DEFAULT_NOTIFY, input === null || input === void 0 ? void 0 : input.notify),
    };
}
function apply(ctx, config) {
    var _a, _b;
    const logger = ctx.logger(exports.name);
    const runtimeConfig = normalizeConfig(config || {});
    let canvasAdapter = null;
    try {
        // Dynamic load: keep package lightweight for market scan.
        const lib = require('@napi-rs/canvas');
        canvasAdapter = {
            createCanvas: lib.createCanvas,
            loadImage: lib.loadImage,
            Path2D: lib.Path2D,
            GlobalFonts: lib.GlobalFonts,
            registerFont(path, family) {
                return lib.GlobalFonts.registerFromPath(path, family);
            },
        };
    }
    catch (e) {
        logger.warn(`未检测到 @napi-rs/canvas，图片生成功能已禁用。请在 Koishi 实例目录执行: npm i @napi-rs/canvas (${(e === null || e === void 0 ? void 0 : e.message) || e})`);
    }
    const prefixes = runtimeConfig.prefixes;
    const shared = {
        prefixes,
        timeouts: runtimeConfig.timeouts,
        debug: runtimeConfig.debug,
        canvas: canvasAdapter,
    };
    if (cfmr.apply)
        cfmr.apply(ctx, { ...runtimeConfig.cfmr, ...shared, debug: (_a = runtimeConfig.cfmr.debug) !== null && _a !== void 0 ? _a : shared.debug });
    if (mcmod.apply)
        mcmod.apply(ctx, { ...runtimeConfig.mcmod, ...shared, debug: (_b = runtimeConfig.mcmod.debug) !== null && _b !== void 0 ? _b : shared.debug });
    if (nlu.apply)
        nlu.apply(ctx, runtimeConfig.nlu, shared);
    if (notify.apply && canvasAdapter)
        notify.apply(ctx, runtimeConfig.notify, { cfmr: runtimeConfig.cfmr });
    if (!canvasAdapter)
        logger.warn('notify 更新卡片功能已禁用（缺少 @napi-rs/canvas）。');
}
