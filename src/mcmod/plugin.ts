const { h, Schema } = require('koishi');
import { createInfoCard, drawAuthorCard, drawCenterCardImpl, drawModCard, drawTutorialCard } from './cards';
import { PAGE_SIZE, TIMEOUT_MS } from './constants';
import { ensureValidCookie, loadManagedCookie, setMcmodCookie } from './http';
import { configureRenderer } from './rendering';
import { fetchSearch, formatListPage } from './search';
import { toImageSrc } from './utils';

// ================= 状态管理和常量 =================
const searchStates = new Map();

// ================= Koishi =================


export const name = 'mcmod-search';
export const Config = Schema.object({
  sendLink: Schema.boolean().default(true).description('发送卡片后是否附带链接'),
  cookie: Schema.string().description('【可选】手动填写 mcmod.cn 的 Cookie'),
  fontPath: Schema.string().role('path').description('可选：自定义字体文件路径'),
  debug: Schema.boolean().default(false).description('输出渲染调试日志'),
  render: Schema.object({
    emoji: Schema.object({
      twemoji: Schema.boolean().default(true).description('启用 Twemoji 图形兜底'),
      cdn: Schema.string().default('https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72').description('Twemoji CDN 前缀')
    }).default({}),
    image: Schema.object({
      fetchWithHeaders: Schema.boolean().default(true).description('图片先用 HTTP(带 Referer/Cookie)抓取后解码')
    }).default({})
  }).default({})
});

export function apply(ctx, config) {
  const logger = ctx.logger('mcmod');
  if (!configureRenderer(config?.canvas, config, logger)) {
    return;
  }

  // 初始化 Cookie
  if (config.cookie) {
    setMcmodCookie(config.cookie);
    logger.info('使用手动配置的 Cookie');
  } else if (config.autoCookie) {
    loadManagedCookie(logger);
  }

  // --- 状态管理 (严格隔离) ---
  function clearState(cid) {
    const state = searchStates.get(cid);
    if (state && state.timer) clearTimeout(state.timer);
    searchStates.delete(cid);
  }

  // --- 排队系统 ---
  const queue = [];
  let isProcessing = false;

  async function processQueue() {
    if (isProcessing || queue.length === 0) return;
    isProcessing = true;

    const { session, task } = queue.shift();
    try {
        await task();
    } catch (e) {
        logger.error('任务执行出错:', e);
        await session.send(`执行出错: ${e.message}`);
    } finally {
        isProcessing = false;
        // 稍微延迟一下，给系统喘息时间
        setTimeout(processQueue, 500);
    }
  }

  // 入队函数
  function enqueue(session, taskName, taskFunc) {
    return new Promise<void>((resolve, reject) => {
        queue.push({
            session,
            task: async () => {
                try {
                    // 如果队列较长，提示用户
                    if (queue.length > 1) {
                       // 可选：发送排队提示
                       // await session.send(`正在处理您的请求... (排队中)`);
                    }
                    await taskFunc();
                    resolve();
                } catch (e) {
                    reject(e);
                }
            }
        });
        processQueue();
    });
  }

  // 辅助：尝试撤回消息
  async function tryWithdraw(session, messageIds) {
    if (!messageIds || !messageIds.length) return;
    try {
        for (const id of messageIds) {
            await session.bot.deleteMessage(session.channelId, id);
        }
    } catch (e) { }
  }

  // --- 注册指令 ---
  const prefix = config?.prefixes?.cnmc || 'cnmc';
  const commandTypes = ['mod', 'data', 'pack', 'tutorial', 'author', 'user'];

  ctx.command(`${prefix}.help`).action(() => [
    `${prefix} <关键词>  | 默认搜索 Mod`,
    `${prefix}.mod/.data/.pack/.tutorial/.author/.user <关键词>`,
    '列表交互：输入序号查看，n 下一页，p 上一页，q 退出',
  ].join('\n'));

  commandTypes.forEach(type => {
      ctx.command(`${prefix}.${type} <keyword:text>`)
         .action(async ({ session }, keyword) => {
           if (!keyword) return '请输入关键词。';
             
             // 将搜索任务加入队列
             enqueue(session, `search-${type}`, async () => {
                 try {
                    if (config.debug) logger.debug(`[${session.userId}] 正在搜索 ${keyword} ...`);
                    
                    let results = await fetchSearch(keyword, type);

                    if (!results.length) {
                        await session.send('未找到相关结果。(备用也没用，我劝你换个关键词试试)');
                        return;
                    }
                    
                    
                    // 单结果直接处理
                    if (results.length === 1) {
                        const item = results[0];
                        await ensureValidCookie();
                        
                        let img;
                        if (type === 'author') img = await drawAuthorCard(item.link);
                        else if (type === 'user') {
                            const uid = item.link.match(/\/(\d+)(?:\.html|\/)?$/)?.[1] || '0';
                            img = await drawCenterCardImpl(uid, logger);
                        }
                        else if (type === 'mod' || type === 'pack') img = await drawModCard(item.link);
                        else if (type === 'tutorial') img = await drawTutorialCard(item.link);
                        else img = await createInfoCard(item.link, type);
                        
                        await session.send(h.image(await toImageSrc(img)));
                        if (config.sendLink) await session.send(`链接: ${item.link}`);
                        return;
                    }
                    
                    // 多结果：初始化状态（隔离在 session.cid）
                    clearState(session.cid);
                    const listText = formatListPage(results, 0, type);
                    const sentMessageIds = await session.send(listText);
                    
                    searchStates.set(session.cid, { 
                        type, 
                        results, 
                        pageIndex: 0, 
                        messageIds: sentMessageIds,
                        timer: setTimeout(() => searchStates.delete(session.cid), TIMEOUT_MS) 
                    });
                 } catch (e) {
                    logger.error(e);
                    await session.send(`处理失败: ${e.message}`);
                 }
             });
         });
  });

  ctx.command(`${prefix} <keyword:text>`)
     .action(async ({ session }, keyword) => {
       if (!keyword) return '请输入关键词。';

       enqueue(session, 'search-mod', async () => {
         try {
            if (config.debug) logger.debug(`[${session.userId}] 正在搜索 ${keyword} ...`);

            const results = await fetchSearch(keyword, 'mod');

            if (!results.length) {
                await session.send('未找到相关结果。(备用也没用，我劝你换个关键词试试)');
                return;
            }

            if (results.length === 1) {
                const item = results[0];
                await ensureValidCookie();

                const img = await drawModCard(item.link);
                await session.send(h.image(await toImageSrc(img)));
                if (config.sendLink) await session.send(`链接: ${item.link}`);
                return;
            }

            clearState(session.cid);
            const listText = formatListPage(results, 0, 'mod');
            const sentMessageIds = await session.send(listText);

            searchStates.set(session.cid, {
                results,
              pageIndex: 0,
                type: 'mod',
                messageIds: Array.isArray(sentMessageIds) ? sentMessageIds : [sentMessageIds],
                timer: setTimeout(() => {
                    tryWithdraw(session, Array.isArray(sentMessageIds) ? sentMessageIds : [sentMessageIds]);
                    clearState(session.cid);
                }, config.timeouts || 60000),
            });
         } catch (e) {
            logger.error('执行出错:', e);
            await session.send(`执行出错: ${e.message}`);
         }
       });
     });

  // --- 中间件 (处理序号选择) ---
  ctx.middleware(async (session, next) => {
    // 1. 专一性检查：只处理当前有搜索状态的用户
    const state = searchStates.get(session.cid);
    if (!state) return next();

    const input = session.content.trim().toLowerCase();
    
    // 退出
    if (input === 'q' || input === '退出') {
        clearState(session.cid);
        await tryWithdraw(session, state.messageIds); // 退出时也可以顺手撤回列表
        await session.send('已退出搜索。');
        return;
    }
    
    // 翻页
    if (input === 'p' || input === 'n') {
        // 加入队列处理翻页，防止并发
        enqueue(session, 'page-turn', async () => {
            // 重新获取状态，防止排队期间状态丢失
            const currentState = searchStates.get(session.cid);
            if (!currentState) return;

            clearTimeout(currentState.timer);
            currentState.timer = setTimeout(() => searchStates.delete(session.cid), TIMEOUT_MS);
            
            const total = Math.ceil(currentState.results.length / PAGE_SIZE);
            const currentPage = Number(currentState.pageIndex ?? currentState.page ?? 0) || 0;
            let newIndex = currentPage;
            
            if (input === 'n' && currentPage < total - 1) newIndex++;
            else if (input === 'p' && currentPage > 0) newIndex--;
            else {
                await session.send('没有更多页面了。');
                return;
            }

            // 撤回旧列表（可选，为了整洁）
            await tryWithdraw(session, currentState.messageIds);

            currentState.pageIndex = newIndex;
            const newMsgIds = await session.send(formatListPage(currentState.results, newIndex, currentState.type));
            currentState.messageIds = Array.isArray(newMsgIds) ? newMsgIds : [newMsgIds];
        });
        return;
    }
    
    // 选择序号
    const choice = parseInt(input);
    if (!isNaN(choice) && choice >= 1) {
        // 加入队列处理生成卡片
        enqueue(session, 'select-item', async () => {
            const currentState = searchStates.get(session.cid);
            if (!currentState) return; // 状态可能已过期

            const idx = choice - 1;
            const currentPage = Number(currentState.pageIndex ?? currentState.page ?? 0) || 0;
            const pageStart = currentPage * PAGE_SIZE;
            const pageEnd = Math.min(pageStart + PAGE_SIZE, currentState.results.length);
            
            if (choice < pageStart + 1 || choice > pageEnd) {
                // 如果序号不在当前页，忽略或提示
                // await session.send(`请输入当前页显示的序号 (${pageStart + 1}-${pageEnd})。`);
                return; 
            }
            
            if (idx >= 0 && idx < currentState.results.length) {
                const item = currentState.results[idx];
                
                // 撤回列表消息
                await tryWithdraw(session, currentState.messageIds);
                clearState(session.cid); // 完成交互，清除状态

                try {
                    await ensureValidCookie();
                    let img;
                    
                    if (currentState.type === 'author') img = await drawAuthorCard(item.link);
                    else if (currentState.type === 'user') {
                        const uid = item.link.match(/\/(\d+)(?:\.html|\/)?$/)?.[1] || '0';
                        img = await drawCenterCardImpl(uid, logger);
                    }
                    else if (currentState.type === 'mod' || currentState.type === 'pack') img = await drawModCard(item.link);
                    else if (currentState.type === 'tutorial') img = await drawTutorialCard(item.link);
                    else img = await createInfoCard(item.link, currentState.type);
                    
                    await session.send(h.image(await toImageSrc(img)));
                    if (config.sendLink) await session.send(`链接: ${item.link}`);
                } catch (e) {
                    logger.error(e);
                    await session.send(`生成失败: ${e.message}`);
                }
            }
        });
        return;
    }
    
    return next();
  });
}



