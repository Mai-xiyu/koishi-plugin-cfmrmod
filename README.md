# koishi-plugin-cfmrmod

Koishi 插件：搜索 CurseForge / Modrinth / MCMod，并渲染图片卡片。
哥给个star吧
Star就是我维护的动力🤤

## 贡献说明

- `yabo083`：贡献了部分代码修复与 bug 修复。

## 使用方法

### 指令
- `cf <关键词>`：默认搜索 CurseForge Mod
- `cf.mod/.pack/.resource/.shader/.plugin <关键词>`
- `mr <关键词>`：默认搜索 Modrinth Mod
- `mr.mod/.pack/.resource/.shader/.plugin <关键词>`
- `cnmc <关键词>`：默认搜索 MCMod Mod
- `cnmc.mod/.data/.pack/.tutorial/.author/.user <关键词>`
- `cf.help` / `mr.help` / `cnmc.help`

#### AI 自然语言查询（可选）
开启 `nlu.enabled` 并配置 OpenAI 兼容接口后，只有 `@机器人` 的消息会进入自然语言理解；不 @ 机器人时仍只响应上面的显式命令。

示例：
- `@机器人 查询钠模组`：默认在 MCMod 查询 Mod
- `@机器人 在 cf 查一下 jei`：在 CurseForge 查询 Mod
- `@机器人 在 mr 查一下 iris 光影`：在 Modrinth 查询 Shader
- `@机器人 在 cnmc 查一下 Create: EasyFilling`：在 MCMod 查询 Mod

#### 更新通知（notify）
- `notify.add <platform> <projectId>` 添加订阅
- `notify.remove <platform> <projectId>` 删除订阅
- `notify.list` 列出订阅
- `notify.enable <onoff>` 启用/禁用本群通知
- `notify.check [arg] [-b]` 手动检查更新（arg 为序号或 projectId；-b 强制发送最新卡片）
- `notify.helpme` 查看完整参数说明

参数说明：
- `<platform>`：平台代码，`mr`=Modrinth，`cf`=CurseForge
- `<projectId>`：平台项目 ID（不是名称）
- `<onoff>`：`on/off` 或 `true/false`
- `[arg]`：`notify.check` 的参数，可填订阅序号或 `projectId`
- `-b`：强制发送最新卡片（忽略是否更新）

列表交互：输入序号查看，`n` 下一页，`p` 上一页，`q` 退出。

### 配置要点
#### 通用
- `prefixes`: 设置 `cf` / `mr` / `cnmc` 指令前缀
- `timeouts`: 搜索会话超时（毫秒）
- `debug`: 调试日志开关

#### AI 自然语言理解（nlu）
- `nlu.enabled`: 是否启用 `@机器人` 自然语言查询
- `nlu.endpoint`: OpenAI 兼容 Chat Completions 接口地址，默认 `https://api.openai.com/v1/chat/completions`
- `nlu.apiKey`: API Key
- `nlu.model`: 模型名称，默认 `gpt-4o-mini`
- `nlu.timeout`: AI 请求超时（毫秒）
- `nlu.temperature`: AI 温度参数，默认 `0`

#### MCMod（mcmod）
- `mcmod.cookie`: 手动填写 mcmod.cn Cookie
- `mcmod.autoCookie`: 自动从 `cookie-manager` 获取 Cookie（存在该模块时生效）
- `mcmod.cookieCheckInterval`: Cookie / `MCMOD_SEED` 检查间隔（毫秒）
- 未配置 Cookie 时，插件会自动访问 MCMod 首页获取 `MCMOD_SEED`，用于通过站点的基础 Cookie 校验。

#### 更新通知（notify）
- `notify.enabled`: 是否开启更新通知
- `notify.interval`: 全局轮询间隔（毫秒）
- `notify.adminAuthority`: 权限等级（1=全部，2=管理员+群主，3=仅群主）
- `notify.stateFile`: 状态文件路径（JSON）
- `notify.configFile`: 订阅配置文件路径（JSON，指令修改会写入）
- `notify.groups`: 通知群组列表
        - `channelId`: 群/频道 ID
        - `enabled`: 是否启用本群通知
        - `subs`: 订阅列表
                - `platform`: `mr` 或 `cf`
                - `projectId`: 项目 ID
                - `interval`: 单独轮询间隔（毫秒），<=0 禁用

## 项目特点
- 支持 CurseForge / Modrinth / MCMod 多平台搜索
- 结果以图片卡片形式展示
- 支持多类型内容（模组/整合包/教程/作者/用户等）
- 可配置前缀与超时等通用参数
