export const PAGE_SIZE = 10;
export const TIMEOUT_MS = 60000;
export const BASE_URL = 'https://www.mcmod.cn';
export const CENTER_URL = 'https://center.mcmod.cn';

export const COMMON_SELECT_URL = `${BASE_URL}/object/CommonSelect/`;
export const FALLBACK_TYPE_MAP: Record<string, string> = {
  mod: 'post_relation_mod',
  pack: 'post_relation_modpack',
  author: 'author',
};
