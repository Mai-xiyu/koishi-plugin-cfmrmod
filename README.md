# koishi-plugin-cfmrmod

Koishi 插件：搜索 CurseForge / Modrinth / MCMod，并渲染图片卡片。

## 使用方法

### 指令
- `cf <关键词>`：默认搜索 CurseForge Mod
- `cf.mod/.pack/.resource/.shader/.plugin <关键词>`
- `mr <关键词>`：默认搜索 Modrinth Mod
- `mr.mod/.pack/.resource/.shader/.plugin <关键词>`
- `cnmc <关键词>`：默认搜索 MCMod Mod
- `cnmc.mod/.data/.pack/.tutorial/.author/.user <关键词>`
- `cf.help` / `mr.help` / `cnmc.help`

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

#### 更新通知（notify）
- `notify.enabled`: 是否开启更新通知
- `notify.interval`: 全局轮询间隔（毫秒）
- `notify.adminAuthority`: 权限等级（1=全部，2=管理员+群主，3=仅群主）
- `notify.stateFile`: 状态文件路径（JSON）
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
