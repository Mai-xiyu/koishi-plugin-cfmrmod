"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FALLBACK_TYPE_MAP = exports.COMMON_SELECT_URL = exports.CENTER_URL = exports.BASE_URL = exports.TIMEOUT_MS = exports.PAGE_SIZE = void 0;
exports.PAGE_SIZE = 10;
exports.TIMEOUT_MS = 60000;
exports.BASE_URL = 'https://www.mcmod.cn';
exports.CENTER_URL = 'https://center.mcmod.cn';
exports.COMMON_SELECT_URL = `${exports.BASE_URL}/object/CommonSelect/`;
exports.FALLBACK_TYPE_MAP = {
    mod: 'post_relation_mod',
    pack: 'post_relation_modpack',
    author: 'author',
};
