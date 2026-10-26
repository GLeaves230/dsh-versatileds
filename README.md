# dsh-versatileds-plugin — 多功能DS插件

> **免责声明（先看这段）**
>
> 本插件及随包附带 / 按需下载的各项组件（NapCat、ffmpeg、GPT-SoVITS 相关脚本、参考音频等）**仅供学习、研究和个人自用**。
>
> - ⚠️ **商用需完整授权**：必须获得**所有版权方**的商用授权才可商用；未获授权不得出售、付费托管、盈利性集成、随商业产品捆绑
> - ⚠️ **版权问题自行解决**：第三方组件、声线素材、游戏语音等的版权归各自权利人所有；要商用或公开分发请自行取得授权，作者不承担任何版权责任
> - ✅ 首次使用按下面「新用户上手」走一遍，就能让你自己的大肥鱼在 QQ 上说话（语音默认用 QQ 官方 AI 语音；想要本地音色可在「语音」页切 GPT-SoVITS，缺环境会自动下载部署）

**多功能DS插件（VersatileDS）**：B站 小号代理与 QQ 代理合体，一个左侧栏入口同时管两边：

- 左侧栏一个入口「多功能DS插件」，点进去上面切 **B站模块 / QQ模块**，每个模块页就是原来各自插件设置页的样子。
- 模型侧两个工具：`versatileds_bili`（B站）、`versatileds_qq`（QQ）。带插件前缀是为了跟别人的同类插件不撞名——DSH 里工具重名会让后注册的那个插件直接报错。`biliAgent` 服务、QQ 自动回复 / 主动搭话 / 群规 / 直播 / 表情包等后台能力照旧。
- 配置分成 `config.bili` 与 `config.qq` 两块，字段名与语义保持原有定义，互不干扰。

## 目录

```
dsh-versatileds-plugin/
├── index.js            # 合并入口：Config = { bili, qq }，apply 调两个模块
├── client.js           # 浏览器半侧：左侧栏「多功能DS插件」+ 两个模块页
├── bili/index.js       # B站 模块入口（工具 + 配置）
├── qq/index.js         # QQ 模块入口（工具 + 配置）
├── lib/
│   ├── bili.js         # B站 接口封装
│   ├── live.js         # 直播 / 抓帧
│   └── share-card.js   # QQ 分享卡片解析
├── cordis.patch.yml    # 插入 id: versatileds 的条目
├── qq/deploy-gsv.mjs   # GPT-SoVITS 一键部署脚本（随包，小文件）
├── vendor/             # 随包依赖：napcat.zip（首次启动解压；ffmpeg 改成从 PyPI 镜像下载）
└── package.json
```

## 依赖

**运行环境**

- DSH `>= 0.2.0`（见 `package.json` 的 `engines.dsh`）
- 下面两个 peer 由 DSH 宿主提供，不要在 profile 里单独装：

| 包 | 用途 |
|---|---|
| `@deepseek-ai/dsh-tools` | `defineTool`，注册 `versatileds_bili` / `versatileds_qq` 两个工具 |
| `@deepseek-ai/schemastery` | `Schema`，声明 `config.bili` / `config.qq` 的字段 |

**外部程序**

| 依赖 | 用在哪 | 缺了会怎样 |
|---|---|---|
| NapCat（OneBot 11） | QQ 模块全部功能 | 连不上 `3000` / `3011`，`versatileds_qq` 会提示 NapCat 没在跑 |
| ffmpeg | B站 抓帧、直播帧、表情包缩图、语音前后处理 | 抓帧和缩图失败，纯文字功能不受影响（缺失会自动下载） |
| GPT-SoVITS（可选） | QQ 模块的本地语音（`voiceBackend: gpt-sovits`） | 自动退回 QQ 官方 AI 语音；首次用可在设置页「语音」点「一键部署」 |
| Python 3.11（可选） | 跑 GPT-SoVITS 用 | 同上，部署脚本会自动装到 `versatileds/python311` |

ffmpeg 的查找顺序：配置项 `ffmpegPath` → PATH 里的 `ffmpeg` → `<DSH_HOME>/versatileds/ffmpeg/imageio_ffmpeg/binaries/...`。
**缺失时自动从清华 PyPI 镜像下载 `imageio-ffmpeg` wheel（约 22MB）解压到 `versatileds/ffmpeg`**，不再随包塞 ffmpeg。

**数据与凭据**（都在 `DSH_HOME` 下，换机器时一起搬或者重新登录）

| 路径 | 内容 |
|---|---|
| `<DSH_HOME>/versatileds/bilibili/cookies.json` | B站 登录态（`SESSDATA` / `bili_jct` / `buvid3` / `buvid4` / `DedeUserID`） |
| `profiles/web/cordis.patch.yml` 的 `versatileds.qq.onebotToken` | NapCat 的 OneBot token（HTTP 和 WS 共用） |
| `<DSH_HOME>/versatileds/qq/` | 人设、聊天日志、群规、识图备注、搜索请求、表情包库 |
| `<DSH_HOME>/versatileds/bilibili/` | 抓帧图片、观看记录、自动刷状态 |
| `<DSH_HOME>/versatileds/memory/` | 记忆目录（AGENTS.md 里的索引指向这里，含 `lock.mjs` / `memwrite.mjs`） |
| `<DSH_HOME>/versatileds/qq/napcat/` | 解压后的 NapCat（`launcher.bat`、二维码缓存、配置） |

## 登录模块

QQ 模块的「登录」子页是我们自己的登录入口：状态检测、拉起、二维码、登录后清理，全在这一页完成，不弹独立网页。

后端是可替换的，当前默认后端是 NapCat（见下方声明）：

| 层 | 职责 |
|---|---|
| 登录页（`client.js` 的 `LoginPanel`） | 只认 `/login`、`/login/start`、`/qr/png` 三个接口，不关心底层是谁 |
| 登录控制（`qq/index.js` 的 `napcatControl`） | 检测登录态、拉起、等二维码就绪、登录成功后删二维码缓存 |
| 后端 | 默认 NapCat；换后端只改控制层，页面和交互不用重写 |

## 第三方组件声明

### NapCat（QQ 协议端）

QQ 模块依赖本机安装的 [NapCat](https://github.com/NapNeko/NapCatQQ)（基于 NTQQ 的协议侧框架）完成与 QQ 的连接。**本插件不包含 NapCat 的源码**，但**随包附带它的官方发布版压缩包** `vendor/napcat.zip`（首次启动时自动解压到 `<DSH_HOME>/versatileds/qq/napcat`）。需要源码请自行到[NapCat 官方 GitHub](https://github.com/NapNeko/NapCatQQ) 下载。插件只在运行时启动它、读取它生成的登录二维码，不改它任何代码。

| 项 | 内容 |
|---|---|
| 项目 | https://github.com/NapNeko/NapCatQQ |
| 版权 | Copyright © 2024 Mlikiowa |
| 许可证 | Limited Redistribution License for NapCat（受限再分发许可） |
| 本插件用法 | 随包携带官方发布版 `vendor/napcat.zip`，首次启动解压到 `<DSH_HOME>/versatileds/qq/napcat`；通过 `launcher.bat` 启动它；读 `<NapCat>/cache/qrcode.png` 在设置页显示登录二维码；登录成功后删除该缓存；不改 NapCat 任何代码 |

许可证要点（详见 NapCat 仓库 `LICENSE`）：

- 再分发必须附带完整许可证文本，并注明来源与版权
- 再分发本插件时，`vendor/napcat.zip` 必须原样保留，且一并附上 NapCat 的许可证文本
- 禁止商业用途
- 未经作者许可不得修改后再公开分发
- 软件按原样提供，不附带任何担保

QQ 模块的「NapCat」子页就是这套流程的入口：看状态、拉起 NapCat、扫码、登录后自动清理二维码。

### FFmpeg（媒体处理）

| 项 | 内容 |
|---|---|
| 项目 | https://ffmpeg.org/ |
| 许可证 | LGPL 2.1+ / GPL（看具体构建；本项目下载的是 gyan.dev「essentials」构建，含 GPL 组件） |
| 用法 | 首次启动从清华 PyPI 镜像下载 `imageio-ffmpeg` wheel（内含 ffmpeg 二进制），解压到 `<DSH_HOME>/versatileds/ffmpeg`；只用来抓直播帧、缩表情包、语音前后处理（剪静音 / 变调） |
| 备注 | ffmpeg 是独立可执行程序，插件只通过命令行调用它，不改其源码 |

### GPT-SoVITS（本地语音，可选）

| 项 | 内容 |
|---|---|
| 项目 | https://github.com/RVC-Boss/GPT-SoVITS |
| 作者 | RVC-Boss 及社区贡献者 |
| 许可证 | MIT License |
| 用法 | 用户按需部署（设置页「语音」的「一键部署」会下载代码和模型）；插件通过 `api_v2.py` 的 HTTP 接口调用，不改其源码 |
| 模型 | 预训练权重来自 HuggingFace `lj1995/GPT-SoVITS`（hf-mirror 镜像下载） |
| 参考音频 | 版权见 `<DSH_HOME>/versatileds/models/gpt-sovits/ref/README.md`（来源、CV、免责） |

### 其他外部服务

| 项 | 说明 |
|---|---|
| DeepSeek API | QQ 自动回复的模型推理走 DeepSeek，需自己的 key；按 DeepSeek 的服务条款使用 |
| B站 公开接口 | B站 模块用公开接口读视频 / 直播信息，写操作（点赞/投币/评论）走你自己账号的 cookie |

## 安装

profile 里用 `link:` 指向本目录（改源码即生效），或用 `plugin_manager install_bundle` 安装打包好的 zip：

```yaml
# profile 的 cordis.patch.yml
- id: versatileds
  name: dsh-versatileds-plugin
  config:
    bili: { ... }
    qq: { ... }
```

旧的 `bili-agent` / `qq-agent` 两行要删掉，否则同一套工具与后台逻辑会各加载一份。

## 本机状态接口

状态服务只监听 `127.0.0.1`（QQ 模块 `18766`、B站 模块 `18765`），给设置页和排查用。全部接口：

**登录（NapCat）**

| 接口 | 用途 |
|---|---|
| `GET /login` | 登录态、二维码是否就绪、NapCat PID、是否已主动退出登录 |
| `POST /login/start` / `POST /login/stop` | 启动登录服务 / 退出登录（杀 NapCat 进程） |
| `GET /login/open` | 在资源管理器里打开 NapCat 目录 |
| `GET /qr` / `GET /qr/png` / `POST /qr/done` | 二维码页 / 二维码图片 / 扫码完成后清理缓存 |

**语音（GPT-SoVITS）**

| 接口 | 用途 |
|---|---|
| `GET /voice_status` | 当前语音方案、版本、API 是否在线（`apiUp`）、环境是否就绪 |
| `GET /voice_deps` | 8 项依赖自检（Python / 代码 / 模型 / 参考音频）+ 最近一次部署进度 |
| `GET /voice_deploy` | 一键部署（后台跑 `qq/deploy-gsv.mjs`，已装的跳过） |
| `GET /voice_switch?version=v2\|v4` | 切 GPT-SoVITS 版本并自动重启 API（约 40 秒） |
| `POST /voice_test` | 测试语音：`{text, target: private\|group}`，按当前参数合成并发出去 |

**记忆 / 人设 / 日志**

| 接口 | 用途 |
|---|---|
| `POST /memory_scaffold` | 补记忆目录骨架（缺什么补什么） |
| `POST /memory_sync` | 记忆同步（一键同步到各模式） |
| `GET /agents` / `POST /agents` | 看 / 生成 `AGENTS.md` 模板 |
| `POST /persona` | 生成人设模板（已存在不覆盖） |
| `GET /logs` / `GET /logs/view` | 日志列表 / 看某份日志 |
| `GET /chat_paths` / `POST /open_folder` | 聊天记录路径 / 打开所在文件夹 |
| `POST /clear_cache` | 清理缓存 |

**表情包**

| 接口 | 用途 |
|---|---|
| `GET /stickers` | 表情包列表 |
| `POST /sticker_add` / `POST /sticker_del` / `POST /sticker_fav` | 上传 / 删除 / 收藏 |
| `GET /sticker_img` | 取某张表情包图片 |

**其他**

| 接口 | 用途 |
|---|---|
| `GET /flags` | 当前 QQ 模块总开关的值（排查热切换） |
| `GET /cooldowns` | 各项冷却倒计时 |
| `GET /skip` / `POST /set_used` | 跳过主动搭话倒计时 / 改今日已用次数 |
| `GET /balance_check` | 查 DeepSeek 余额 |

## 配置分块

- `config.bili`：写操作开关与间隔、cookie、主人 UID、直播抓帧、视频抓帧、观看历史上报等。字段见 `bili/index.js` 的 `Config`。
- `config.qq`：NapCat 连接、自动回复、群聊规则、主动搭话、搜索/任务转交、余额、日志、识图、表情包、视频分享等。字段见 `qq/index.js` 的 `Config`。

两块都是 `volatile()` 字段：普通字段改完即时生效；两个总开关（`bili.enabled` / `qq.enabled`）约 **2 秒内热启停**——工具注册/注销、WS、定时器都跟着停/起，不用重启 DSH。**关掉 QQ 模块时「启动登录服务」「退出登录」仍然可用**（关的只是聊天自动化）。

### 配置示例

下面全是占位值，换成自己的就行（**不用改代码**）：

```yaml
- id: versatileds
  config:
    qq:
      enabled: true
      ownerQQ: "1000000001"          # 主人的 QQ 号
      napcatQuickLogin: "1000000002" # 机器人 QQ 号（免扫码快速登录）
      onebotToken: "换成一个随机串"   # NapCat OneBot token
      autoStartNapCat: true          # DSH 起来自动拉 NapCat
      napcatHiddenLaunch: true       # 隐藏窗口启动
      proactiveGroups: "123456789"   # 想主动搭话的群号
    bili:
      enabled: true
      ownerUid: "1000000003"         # 主人的 B站 UID（评论里 @ 你时用）
      perActionGapSec: 360
```

**关于身份**：插件认的是 **QQ 号 / B站 UID**，不是昵称——主人改名字、改群名片都不影响。

- 谁是主人：`ownerQQ` 这个号说话时算主人
- 主人叫什么：按 `ownerQQ` 现查 QQ 名称 + 群名片，别人问就报名字
- B站 @ 主人：按 `ownerUid` 查昵称

### 个人内容放哪

群梗、锚点、和谁关系好这类**属于你自己的东西不要写进本插件**，放 `<DSH_HOME>/versatileds/memory/shared-memory.md`：

- QQ 侧只读，DSH 侧负责写
- 插件包里不含这个文件，换个人用就是空的，不会串

## 新用户上手

1. 装好插件（`link:` 或 `install_bundle`），DSH 启动时会自动：
   - 解压 `vendor/napcat.zip`、`vendor/ffmpeg.zip`；
   - 生成 `AGENTS.md` 模板（开头一节「这套东西怎么跑起来的」就是前置常识）；
   - 生成 `<DSH_HOME>/versatileds/memory/` 骨架：`README.md` 索引、`lock.mjs`、`lock.py`、`memwrite.mjs`；
   - 生成 `qq/persona.md` 人设模板（一份完整可用的默认人设，直接改）。
2. 设置页 →「多功能DS插件」→ QQ模块 →「连接」：
   - 填 **主人 QQ 号**（`ownerQQ`，必填；留空时插件会把第一条私聊它的人自动当主人）；
   - 填机器人号 `napcatQuickLogin`；
   - 点「启动登录服务」，UAC 点「是」，手机 QQ 扫码并确认。
3. 登录后二维码自动删除，`3000` / `3011` 起来就通了。不想挂着了点「退出登录」（会杀掉 NapCat 进程），下次点启动走快速登录。
4. B站 模块要自己的 cookie（`cookieFile`），没配就只能匿名看公开内容，点赞/投币/评论都会失败。
5. 人设改 `qq/persona.md`：QQ 侧每轮读它，DSH 侧也按它说话；群聊不注入「称呼」「重要」两节（防主人 QQ 号进群）。默认人设已带完整家庭关系（父亲梁文锋、母亲团队、哥哥 DeepSeek R、姐姐 DeepSeek Pro、自己 Flash 最小），开箱即用。
6. **语音（可选但推荐）**：设置页 →「语音」→ 方案选「GPT-SoVITS（本地）」→ 点「环境检查」，缺依赖就点「一键部署」（自动装 Python 3.11 + torch + 模型，约 20-30 分钟，全程后台）；不装也能用 QQ 官方 AI 语音。默认音色是可莉（参考音频 `kc-1.wav`，CV 花玲），换音色把 3-10 秒干净人声放进 `versatileds/models/gpt-sovits/ref/` 再填文件名。

## 合并时修掉的问题

- QQ 设置页在 2026-10-24 20:07 被写坏（UTF-8 双重编码 + 引号丢失，`node --check` 直接报语法错误）。本包的 QQ 模块页按 14:56 的完好版本重建，并补回之后新增的 `relayEnabled`、`shareCardWatch`、`neighborBots`、`neighborNameKeywords`、`videoShare*` 等字段。
- 旧设置页有一批字段名跟 Host schema 对不上（写了不生效）：`proactiveMinGapMin` / `proactiveMaxGapMin` / `proactiveGroupMinGapMin` / `liveMaxAgeMin` / `liveRequestCooldownMin` / `stickerSendMinGapMin` / `swearBanMinutes` / `videoShareIntervalMin`。已全部按 Host 的秒制字段名对齐（`...GapSec` / `liveMaxAgeSec` / `liveRequestCooldownSec` / `stickerSendMinGapSec` / `swearBanSec` / `videoShareIntervalSec`），并补上漏掉的 `videoShareEnabled` 开关。
- 字段一致性已脚本校验：B站 28 个、QQ 99 个 Host 字段全部有对应设置项，客户端没有多余字段。

## 版本

- 0.1.0：合并完成，左侧栏「多功能DS插件」+ B站 / QQ 两个模块页；修复 QQ 设置页损坏。
- 0.2.0：包名 / 插件 id 改为 `dsh-versatileds-plugin` / `versatileds`（VersatileDS）。
- 0.2.1：ffmpeg 默认路径改成按 `DSH_HOME` 反推，去掉硬编码绝对路径（换电脑不用改代码）；修复 `/cooldowns` 状态接口因 `lastWebSearchAt` 作用域不匹配导致的进程崩溃。
- 0.2.2（已过时，见 0.2.8）：当时自带 NapCat / ffmpeg / memorix 三个依赖包、启动时自检解压；后来 memorix 停用、ffmpeg 改成镜像下载，只剩 NapCat 随包；启动日志补后端地址、WebUI 与 PID；修了一批 QQ 侧的识别问题（自己发的表情包被误标成主人接管、主人接管发的图不进上下文、双重编码乱码还原、外语强制回复、表情滥用、短回复节奏、排队消息过期）；还嘴方案改成可编辑权重列表；人设定为女生；身份识别改按 QQ 号而不是昵称。
- 0.2.3：群聊表现修复（2026-10-25 巡检）：反问刷屏收敛（别光甩「啥意思」，先自己推一个理解）；版本问题直接用共享记忆里的权威版本作答，不许说「没消息」；同一张普通图被反复转发不再重复锐评；群接话加 3 分钟时效闸、且不 @ 人；群消息发送失败先翻历史确认再重试，避免重复发；主人称呼统一（不直呼昵称、不念群名片备注、不重复叫「主人」）；别人让骂主人时代码直答拒绝；「我是谁」这类身份短问直答。
- 0.2.4：搓一搓独立成页（间隔、几率、固定方案，默认「模型思考」项不可改）；搓一搓带上下文并开 5 分钟聚焦窗口，分享也算；群上下文保留 @ 指向并带 QQ 号（`@昵称(QQ号)`），修复「看不出 @ 了谁」；记忆分三模式（共享底座 + 前后端隔离 + 群与个人隔离），新增「记忆」页和一键同步；退出锁：Ctrl+C 不再被提权清理卡住（默认不杀 NapCat，清理改异步）；群消息发送失败重试两次；群聊追加修复：反问收敛、版本问题直答、重复图不吐槽、有人受伤要关心、网站安全提问、嘲讽见好就收、@ 别人不插嘴。
- 0.2.5：许可改成「受限再分发」模式（参照 NapCat，但条款以本文件为准）；群聊点名必回。
- 0.2.6：插件版权署名：「黑木钟 - GLeaves」；不再随包带 memorix（MCP 已停用，包体 197 MB → 148 MB）；记忆目录初始化补 `lock.mjs`。
- 0.2.7（2026-10-25）：

  - 插件版权署名：「黑木钟 - GLeaves」；**不再随包带 memorix**（MCP 已停用，包体 197 MB → 147.9 MB）。
  - 工具改名 `versatileds_bili` / `versatileds_qq`（防同名插件撞车）。
  - 两个总开关支持**热启停**（约 2 秒），关 QQ 时登录/退出登录仍可用；新增「退出登录」（杀 NapCat 进程）与 `/flags` 状态接口。
  - 人设：初始化直接给完整默认人设；`SYSTEM_PROMPT` 的身份/性别改成「以 persona 为准」，群聊也开始读 persona（过滤含主人号的节）。
  - 记忆目录：首次启动自动建骨架（README 索引、`lock.mjs`、`lock.py`、`memwrite.mjs`）；插件写 notes/bili_log 前抢同一把锁，DSH 写记忆用 `memwrite.mjs` 自动加锁。
  - `AGENTS.md` 模板加「这套东西怎么跑起来的」前置常识 + 人设节；旧模板自动补节。
  - 主人身份全走 `ownerQQ` 变量（代码里没有 QQ 号字面量）；被问「你主人是谁」报「@群名片」并真的 @ 到人；群里不露 QQ 号。
  - QQ 侧：主人说「别聊了」会应声静默；记忆锚点从 shared-memory 读（直答兜底修复）。

- **0.2.8（2026-10-26）**：
  - **本地语音**：接入 GPT-SoVITS 零样本克隆，`voiceBackend` 可切 `qq` / `gpt-sovits`；默认音色可莉（`kc-1.wav`，CV 花玲），参考音频支持只填文件名；发送前自动去表情、彳亍→行～、剪前后静音、压空格和空行。
  - **语音配套**：设置页「语音」页加「GPT-SoVITS 版本」下拉（v2/v4 一键切、自动重启 API）和「测试语音」（可发私聊/群，日志身份记 Admin）；`/voice_deps` 依赖自检 + `/voice_deploy` 一键部署（`qq/deploy-gsv.mjs` 随包，Python/模型按需下载）。
  - **路径相对化**：ffmpeg 改从清华 PyPI 的 imageio-ffmpeg wheel 下载到 `<DSH_HOME>/versatileds/ffmpeg`（不再随包，包体 148MB → 117MB）；GPT-SoVITS / Python 3.11 都收在 `versatileds` 下；配置里的绝对路径全部清空走默认。
  - **人设**：补「出身」（父梁文锋、母团队、哥 DeepSeek R、姐 DeepSeek Pro、自己 Flash 最小、其余亲戚算团队）和多语种谐音理解；默认人设模板同步更新。
  - **群聊小修**：@ / 点名 / 主人接管后挂 5 分钟聚焦；主动搭话按群活跃度排序；回复开头的 `[表情]` / `[图片]` / `[语音]` 占位符不再抄出来；`@主人` 转成真 at。
  - **文档**：README / package.json 补「仅供学习、个人使用、禁止商用、版权自行解决」声明；包内依赖审计（只剩 `vendor/napcat.zip` 走本地）。

## 许可

**受限再分发许可**：

- ✅ 个人使用、运行、学习、自用修改
- ✅ 原样再分发（须附带完整许可证文本、注明来源与版权）
- ⚠️ 商用必须获得**所有版权方**的商用授权；未获授权不得出售、付费托管、盈利性集成、随商业产品捆绑
- ❌ 未经作者许可，不得修改后再公开分发
- 随包携带的 NapCat / ffmpeg 各自遵循其原许可证，不适用本许可（memorix 已停用、不再随包分发）

> **注意**：商用版权需要自行取得以下各方的授权——**本插件作者（黑木钟 - GLeaves）、NapCat 作者（NapNeko / Mlikiowa）、FFmpeg 项目、GPT-SoVITS 作者（RVC-Boss）、语音 / 声优版权方（如可莉 CV 花玲、派蒙 CV 多多poi 及相关作品公司）、参考音频来源作者（B站 UP 主）**；获得插件作者的**源码修改再公开**授权后，也不得用于非法盈利 / 侵害利益 / 版权侵权等非法途径，请自行解决律师相关问题。
>
> **即便获得完整商用授权，也请尽量奉行 DSH 的即插即用、开放公开的插件精神。**

完整条款见 [`LICENSE.txt`](./LICENSE.txt)。
