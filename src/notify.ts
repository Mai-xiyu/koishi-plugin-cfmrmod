import { Context, h } from 'koishi';
import { promises as fs } from 'fs';
import path from 'path';
import { fetchModrinthDetail, fetchCurseForgeDetail, drawProjectCardMRNotify, drawProjectCardCFNotify } from './cfmr';
const fetch = require('node-fetch');

const MR_BASE = 'https://api.modrinth.com/v2';
const CF_MIRROR_BASE = 'https://api.curse.tools/v1/cf';

function normalizePlatform(platform: unknown): 'mr' | 'cf' | null {
  if (platform === 'mr' || platform === 'cf') return platform;
  return null;
}

async function toImageSrc(input: any) {
  const value = (input && typeof input.then === 'function') ? await input : input;
  if (!value) return '';
  if (typeof value === 'string') return value;
  const buf = Buffer.isBuffer(value) ? value : (value instanceof Uint8Array ? Buffer.from(value) : null);
  if (buf) return `data:image/png;base64,${buf.toString('base64')}`;
  return String(value);
}

async function fetchJson(url: string, timeout = 15000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(id);
  }
}

export function apply(ctx: Context, config: any, options: { cfmr: any }) {
  const logger = ctx.logger('cfmr-notify');

  ctx.model.extend('cfmrmod_notify_sub', {
    id: 'unsigned',
    channelId: 'string',
    platform: 'string',
    projectId: 'string',
    lastVersion: 'string',
    lastNotifiedAt: 'timestamp',
  }, { primary: 'id', autoInc: true });

  const getRoleLevel = (session: any) => {
    const roles = new Set<string>();
    const list = session?.member?.roles;
    if (Array.isArray(list)) {
      list.forEach((r: any) => {
        if (typeof r === 'string') roles.add(r);
        else if (r && typeof r === 'object') {
          if (typeof r.id === 'string') roles.add(r.id);
          if (typeof r.name === 'string') roles.add(r.name);
        }
      });
    }
    const role = session?.member?.role;
    if (typeof role === 'string') roles.add(role);
    const onebotRole = session?.event?.sender?.role;
    if (typeof onebotRole === 'string') roles.add(onebotRole);
    const eventMember = session?.event?.member;
    if (eventMember?.role && typeof eventMember.role === 'string') roles.add(eventMember.role);
    if (Array.isArray(eventMember?.roles)) {
      eventMember.roles.forEach((r: any) => {
        if (typeof r === 'string') roles.add(r);
        else if (r && typeof r === 'object') {
          if (typeof r.id === 'string') roles.add(r.id);
          if (typeof r.name === 'string') roles.add(r.name);
        }
      });
    }
    if (roles.has('owner')) return 3;
    if (roles.has('admin')) return 2;
    if (roles.has('member')) return 1;
    return 0;
  };
  const isOwner = (session: any) => getRoleLevel(session) >= 3;
  const isAdmin = (session: any) => getRoleLevel(session) >= 2;

  const getRoleLevelAsync = async (session: any) => {
    let level = getRoleLevel(session);
    if (level > 0) return level;
    const bot = session?.bot;
    if (bot?.getGuildMember && session?.guildId && session?.userId) {
      try {
        const member = await bot.getGuildMember(session.guildId, session.userId);
        const roles = new Set<string>();
        if (member?.role && typeof member.role === 'string') roles.add(member.role);
        if (Array.isArray(member?.roles)) {
          member.roles.forEach((r: any) => {
            if (typeof r === 'string') roles.add(r);
            else if (r && typeof r === 'object') {
              if (typeof r.id === 'string') roles.add(r.id);
              if (typeof r.name === 'string') roles.add(r.name);
            }
          });
        }
        if (roles.has('owner')) level = 3;
        else if (roles.has('admin')) level = 2;
        else if (roles.has('member')) level = 1;
      } catch {}
    }
    return level;
  };

  const requireManage = async (session: any, channelId?: string) => {
    const level = Number(config.adminAuthority ?? 3);
    if (level <= 1) return true;
    if (channelId && channelId !== session.channelId) return false;
    const roleLevel = await getRoleLevelAsync(session);
    if (level <= 2) return roleLevel >= 2;
    const ok = roleLevel >= 3;
    if (!ok) {
      logger.info(`权限不足调试：level=${level}, role=${session?.member?.role}, roles=${JSON.stringify(session?.member?.roles)}, onebotRole=${session?.event?.sender?.role}`);
    }
    return ok;
  };

  const parseChannelId = (channelId: string) => {
    const idx = channelId.indexOf(':');
    if (idx <= 0) return null;
    return { platform: channelId.slice(0, idx), id: channelId.slice(idx + 1) };
  };

  const sendToChannel = async (channelId: string, content: any) => {
    const parsed = parseChannelId(channelId);
    if (parsed) {
      const bot = ctx.bots.find(b => b.platform === parsed.platform);
      if (bot) {
        await bot.sendMessage(parsed.id, content);
        return true;
      }
    }
    if (ctx.bots.length === 1) {
      await ctx.bots[0].sendMessage(channelId, content);
      return true;
    }
    if (ctx.bots.length) {
      for (const bot of ctx.bots) {
        try {
          await bot.sendMessage(channelId, content);
          return true;
        } catch {}
      }
    }
    logger.warn(`无法发送到频道 ${channelId}，请使用 platform:channelId 格式。`);
    return false;
  };

  const lastCheckMap = new Map<string, number>();
  const stateCache = new Map<string, { lastVersion?: string }>();
  let stateLoaded = false;
  let saving = false;
  let dbWarned = false;

  const getStateKey = (channelId: string, platform: 'mr' | 'cf', projectId: string) => {
    return `${channelId}|${platform}|${projectId}`;
  };

  const resolveStateFile = () => {
    const p = String(config.stateFile || 'data/cfmrmod_notify_state.json');
    return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
  };

  const loadStateFromFile = async () => {
    if (stateLoaded) return;
    stateLoaded = true;
    try {
      const filePath = resolveStateFile();
      const content = await fs.readFile(filePath, 'utf8');
      const json = JSON.parse(content);
      if (json && typeof json === 'object') {
        Object.keys(json).forEach(key => {
          const val = json[key];
          if (val && typeof val === 'object') stateCache.set(key, { lastVersion: val.lastVersion });
        });
      }
    } catch {}
  };

  const saveStateToFile = async () => {
    if (saving) return;
    saving = true;
    try {
      const filePath = resolveStateFile();
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      const obj: Record<string, { lastVersion?: string }> = {};
      for (const [key, val] of stateCache.entries()) obj[key] = { lastVersion: val.lastVersion };
      await fs.writeFile(filePath, JSON.stringify(obj, null, 2), 'utf8');
    } catch (e) {
      logger.warn(`状态文件写入失败：${e.message}`);
    } finally {
      saving = false;
    }
  };

  const getState = async (channelId: string, platform: 'mr' | 'cf', projectId: string) => {
    await loadStateFromFile();
    const key = getStateKey(channelId, platform, projectId);
    return stateCache.get(key) || null;
  };

  const createState = async (channelId: string, platform: 'mr' | 'cf', projectId: string, lastVersion: string) => {
    await loadStateFromFile();
    const key = getStateKey(channelId, platform, projectId);
    stateCache.set(key, { lastVersion });
    await saveStateToFile();
  };

  const updateState = async (channelId: string, platform: 'mr' | 'cf', projectId: string, lastVersion: string) => {
    await loadStateFromFile();
    const key = getStateKey(channelId, platform, projectId);
    stateCache.set(key, { lastVersion });
    await saveStateToFile();
  };

  const getConfigGroups = () => Array.isArray(config.groups) ? config.groups : [];

  const getConfigSubs = (channelId?: string) => {
    const groups = getConfigGroups();
    const subs: Array<{ channelId: string; platform: 'mr' | 'cf'; projectId: string; interval: number }>= [];
    for (const group of groups) {
      if (!group?.channelId) continue;
      if (channelId && group.channelId !== channelId) continue;
      if (group.enabled === false) continue;
      const list = Array.isArray(group.subs) ? group.subs : [];
      for (const sub of list) {
        const platformKey = normalizePlatform(sub?.platform);
        const projectId = String(sub?.projectId || '').trim();
        if (!platformKey || !projectId) continue;
        const rawInterval = Number(sub?.interval);
        if (Number.isFinite(rawInterval) && rawInterval <= 0) continue;
        const interval = Math.max(60 * 1000, rawInterval || Number(config.interval) || 30 * 60 * 1000);
        subs.push({ channelId: String(group.channelId), platform: platformKey, projectId, interval });
      }
    }
    return subs;
  };

  const getConfigSubsOrdered = (channelId?: string) => {
    const groups = getConfigGroups();
    const subs: Array<{ channelId: string; platform: 'mr' | 'cf'; projectId: string; interval: number }>= [];
    for (const group of groups) {
      if (!group?.channelId) continue;
      if (channelId && group.channelId !== channelId) continue;
      if (group.enabled === false) continue;
      const list = Array.isArray(group.subs) ? group.subs : [];
      for (const sub of list) {
        const platformKey = normalizePlatform(sub?.platform);
        const projectId = String(sub?.projectId || '').trim();
        if (!platformKey || !projectId) continue;
        const rawInterval = Number(sub?.interval);
        if (Number.isFinite(rawInterval) && rawInterval <= 0) continue;
        const interval = Math.max(60 * 1000, rawInterval || Number(config.interval) || 30 * 60 * 1000);
        subs.push({ channelId: String(group.channelId), platform: platformKey, projectId, interval });
      }
    }
    return subs;
  };

  async function getLatestModrinth(projectId: string, timeout: number) {
    const versions = await fetchJson(`${MR_BASE}/project/${projectId}/version`, timeout);
    const latest = Array.isArray(versions) ? versions[0] : null;
    if (!latest) return null;
    const file = Array.isArray(latest.files) && latest.files.length ? latest.files[0] : null;
    return {
      versionId: latest.id,
      version: latest.version_number || latest.name || latest.id,
      changelog: latest.changelog || '',
      downloads: latest.downloads,
      datePublished: latest.date_published,
      versionType: latest.version_type,
      loaders: Array.isArray(latest.loaders) ? latest.loaders.map(String) : [],
      gameVersions: Array.isArray(latest.game_versions) ? latest.game_versions.map(String) : [],
      fileName: file?.filename || '',
      fileSize: file?.size || 0,
    };
  }

  async function getLatestCurseForge(projectId: string, timeout: number) {
    const files = await fetchJson(`${CF_MIRROR_BASE}/mods/${projectId}/files?index=0&pageSize=1`, timeout);
    const latest = files?.data?.[0];
    if (!latest) return null;
    return {
      versionId: String(latest.id),
      version: latest.displayName || latest.fileName || String(latest.id),
      changelog: latest.changelog || '',
      downloads: latest.downloadCount,
      datePublished: latest.fileDate || null,
      releaseType: latest.releaseType,
      loaders: Array.isArray(latest.gameVersions) ? latest.gameVersions.filter((v: string) => /forge|fabric|quilt|neoforge/i.test(String(v))) : [],
      gameVersions: Array.isArray(latest.gameVersions) ? latest.gameVersions.filter((v: string) => /\d/.test(String(v))) : [],
      fileName: latest.fileName || '',
      fileSize: latest.fileLength || 0,
    };
  }

  async function sendUpdate(channelId: string, platform: 'mr' | 'cf', projectId: string, latest: any) {
    try {
      let detailData: any;
      if (platform === 'mr') detailData = await fetchModrinthDetail(projectId, options?.cfmr?.requestTimeout || 15000);
      else detailData = await fetchCurseForgeDetail(projectId, options?.cfmr?.curseforgeApiKey, options?.cfmr?.requestTimeout || 15000, null);
      detailData.type = 'mod';

      const imgBufs = detailData.source === 'CurseForge'
        ? await drawProjectCardCFNotify({ ...detailData }, latest)
        : await drawProjectCardMRNotify({ ...detailData }, latest);

      for (const buf of imgBufs) {
        const src = await toImageSrc(buf);
        await sendToChannel(channelId, h.image(src));
      }

      // 仅发送卡片，不发送文字
    } catch (e) {
      logger.warn(`发送通知失败(${platform}:${projectId}): ${e.message}`);
    }
  }

  async function checkOnce(channelId?: string, force = false) {
    if (!config.enabled) return;
    const subs = getConfigSubs(channelId);
    const stats = { checked: 0, updated: 0, noChange: 0, skipped: 0, failed: 0 };
    for (const sub of subs) {
      try {
        const key = `${sub.channelId}|${sub.platform}|${sub.projectId}`;
        const lastCheck = lastCheckMap.get(key) || 0;
        if (!force && Date.now() - lastCheck < sub.interval) {
          stats.skipped += 1;
          continue;
        }
        lastCheckMap.set(key, Date.now());
        stats.checked += 1;

        const timeout = options?.cfmr?.requestTimeout || 15000;
        const latest = sub.platform === 'mr'
          ? await getLatestModrinth(sub.projectId, timeout)
          : await getLatestCurseForge(sub.projectId, timeout);

        if (!latest) {
          stats.failed += 1;
          continue;
        }

        const state = await getState(sub.channelId, sub.platform, sub.projectId);
        if (!state) {
          await createState(sub.channelId, sub.platform, sub.projectId, latest.version || '');
          stats.noChange += 1;
          continue;
        }
        if (!state.lastVersion) {
          await updateState(sub.channelId, sub.platform, sub.projectId, latest.version);
          stats.noChange += 1;
          continue;
        }
        if (latest.version === state.lastVersion) {
          stats.noChange += 1;
          continue;
        }

        await sendUpdate(sub.channelId, sub.platform, sub.projectId, latest);
        await updateState(sub.channelId, sub.platform, sub.projectId, latest.version);
        stats.updated += 1;
      } catch (e) {
        logger.warn(`检查失败(${sub.platform}:${sub.projectId}): ${e.message}`);
        stats.failed += 1;
      }
    }
    return stats;
  }

  const checkOne = async (sub: { channelId: string; platform: 'mr' | 'cf'; projectId: string }, forceSendAll: boolean) => {
    const timeout = options?.cfmr?.requestTimeout || 15000;
    const latest = sub.platform === 'mr'
      ? await getLatestModrinth(sub.projectId, timeout)
      : await getLatestCurseForge(sub.projectId, timeout);

    if (!latest) return { sent: false, updated: false };

    const state = await getState(sub.channelId, sub.platform, sub.projectId);
    if (!state) {
      await createState(sub.channelId, sub.platform, sub.projectId, latest.version || '');
      if (forceSendAll) {
        await sendUpdate(sub.channelId, sub.platform, sub.projectId, latest);
        await updateState(sub.channelId, sub.platform, sub.projectId, latest.version || '');
        return { sent: true, updated: true };
      }
      return { sent: false, updated: false };
    }

    if (forceSendAll) {
      await sendUpdate(sub.channelId, sub.platform, sub.projectId, latest);
      await updateState(sub.channelId, sub.platform, sub.projectId, latest.version || '');
      return { sent: true, updated: true };
    }

    if (!state.lastVersion) {
      await updateState(sub.channelId, sub.platform, sub.projectId, latest.version || '');
      return { sent: false, updated: false };
    }
    if (latest.version === state.lastVersion) return { sent: false, updated: false };

    await sendUpdate(sub.channelId, sub.platform, sub.projectId, latest);
    await updateState(sub.channelId, sub.platform, sub.projectId, latest.version || '');
    return { sent: true, updated: true };
  };

  if (config.enabled) {
    const tick = Math.max(60 * 1000, Number(config.interval) || 30 * 60 * 1000);
    ctx.setInterval(() => checkOnce().catch(() => null), tick);
  }

  ctx.command('notify.add <platform> <projectId> [channelId]', '添加更新订阅')
    .action(async ({ session }, platform, projectId, channelId) => {
      if (!platform || !projectId) return '参数不足。';
      const targetChannel = channelId || session.channelId;
      if (!targetChannel) return '只能在群聊使用或指定 channelId。';
      if (!await requireManage(session, channelId)) return '权限不足。';
      return '请在配置页面的 notify.groups 中编辑订阅列表。';
    });

  ctx.command('notify.remove <platform> <projectId> [channelId]', '删除更新订阅')
    .action(async ({ session }, platform, projectId, channelId) => {
      if (!platform || !projectId) return '参数不足。';
      const targetChannel = channelId || session.channelId;
      if (!targetChannel) return '只能在群聊使用或指定 channelId。';
      if (!await requireManage(session, channelId)) return '权限不足。';
      return '请在配置页面的 notify.groups 中编辑订阅列表。';
    });

  ctx.command('notify.list [channelId]', '列出订阅')
    .action(async ({ session }, channelId) => {
      const targetChannel = channelId || session.channelId;
      if (!targetChannel) return '只能在群聊使用或指定 channelId。';
      if (!await requireManage(session, channelId)) return '权限不足。';
      const subs = getConfigSubs(targetChannel);
      if (!subs.length) return '暂无订阅。';
      return subs.map(s => `- ${s.platform}:${s.projectId} (${Math.round(s.interval / 60000)} 分钟)`).join('\n');
    });

  ctx.command('notify.enable <onoff> [channelId]', '启用/禁用本群通知')
    .action(async ({ session }, onoff, channelId) => {
      const targetChannel = channelId || session.channelId;
      if (!targetChannel) return '只能在群聊使用或指定 channelId。';
      if (!await requireManage(session, channelId)) return '权限不足。';
      return '请在配置页面的 notify.groups 中编辑 enabled。';
    });

  ctx.command('notify.check [arg]', '手动检查更新')
    .option('broadcast', '-b 直接发送最新版卡片（忽略是否更新）')
    .action(async ({ session, options }, arg) => {
      const targetChannel = session.channelId;
      if (!targetChannel) return '只能在群聊使用或指定 channelId。';
      if (!await requireManage(session)) return '权限不足。';

      const list = getConfigSubsOrdered(targetChannel);
      if (!list.length) return '暂无订阅。';

      let targets = list;
      if (arg) {
        const idx = Number(arg);
        if (Number.isFinite(idx) && idx > 0) {
          const sub = list[idx - 1];
          if (!sub) return '未找到对应序号的订阅。';
          targets = [sub];
        } else {
          const sub = list.find(s => s.projectId === String(arg));
          if (!sub) return '未找到对应项目 ID 的订阅。';
          targets = [sub];
        }
      }

      let sent = 0;
      for (const sub of targets) {
        try {
          const res = await checkOne(sub, !!options?.broadcast);
          if (res.sent) sent += 1;
        } catch (e) {
          logger.warn(`检查失败(${sub.platform}:${sub.projectId}): ${e.message}`);
        }
      }

      if (!sent) return '暂无更新。';
    });
}
