# dsh-versatileds — 多功能DS插件

<p align="center">
  <img src="./assets/cover.jpg" alt="大肥鱼 · 多功能DS插件" width="320">
</p>

> **本项目可见 ≠ 开源许可**
>
> 代码公开可见，但使用条款是「受限再分发许可」（见文末「许可」一节），不是 OSI 认证的开源协议。
> 未经授权不得商用、不得修改后公开分发；想商用请先按「许可」一节逐家取得授权。

> **仓库地址**
>
> - **GitHub**：<https://github.com/GLeaves230/dsh-versatileds>（源码 / Issues / Release）
> - **npm**：<https://www.npmjs.com/package/dsh-versatileds>（优先用这个安装）
>
> 本仓库是唯一官方源；镜像站（gh-proxy 等）只是加速下载，内容以 GitHub 为准。

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
dsh-versatileds/
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
├── vendor/             # 空目录占位：NapCat 改成首次启动自动下载（官方 → gh-proxy），不再随包
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
| NapCat（OneBot 11） | QQ 模块 NapCat 通道的全部功能 | 连不上 `3000` / `3011`，`versatileds_qq` 会提示 NapCat 没在跑；官方通道模式不需要它 |
| `@tencent-connect/dsh-qqbot`（可选） | QQ 官方机器人通道（`qqChannel: official`） | 官方通道收发由它负责；没装时切官方模式会提示安装 |
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

## QQ 通道：NapCat 与官方机器人

插件支持两种 QQ 通道，在设置页「QQ 模块 → 连接 → **QQ 通道**」下拉切换：

| 通道 | 适用 | 说明 |
|---|---|---|
| `napcat`（默认） | 小号当机器人 | 插件自己连 NapCat（OneBot 11），功能全：自动回复、主动搭话、群规、戳一戳、合并转发、引用、群管理… |
| `official` | 官方 QQ 机器人 | 收发交给 `dsh-qqbot` 插件，本插件只留工具（语音/记忆/官方发送），不连 NapCat |

### 官方机器人模式怎么开

1. 装官方插件：`@tencent-connect/dsh-qqbot`（插件页搜索安装；本插件检测到缺依赖会尝试自动安装）；
2. 绑定：点左下角账号（头像）→ 设置 →「QQ 机器人」→ 扫码绑定；
3. 白名单（建议）：官方插件配置里的 `access.c2cAllow` / `groupAllow` 填你的 openid / 群 openid——**空白名单等于全部放行**，注意安全；
4. 切到 `official` 后，本插件会自动启用 `im-qqbot`、停掉 NapCat 进程（只杀 launcher.pid / 启动记录里的，不碰你自己开的 QQ）。

### 两种通道的能力差异

| 能力 | NapCat | 官方 |
|---|---|---|
| 私聊 / 群聊收发 | ✅ | ✅（群聊需 @） |
| 主动消息 | ✅ 无限制 | 单聊 1000 条/天；**群聊无权限**（只能被动回复） |
| 发引用 | ✅ | ❌（只能收） |
| 合并转发 | ✅ | ❌ |
| 戳一戳 / 群管理 / 群公告 | ✅ | ❌ |
| 图片 / 语音 / 文件 | ✅ | ✅ |
| Markdown 排版 | ❌ | ✅（单聊/群聊） |
| B站 分享 | json 卡片 | Markdown 卡片（封面+数据+链接） |

### 官方通道的工具

切到 `official` 后插件额外提供：

| 工具 | 作用 |
|---|---|
| `versatileds_qq_send` | 官方 API 发文字（主动/回复） |
| `versatileds_qq_markdown` | 官方 Markdown（群里带 msg_id 才是被动回复） |
| `versatileds_qq_share` | B站 视频分享（封面卡片） |
| `versatileds_voice` | GPT-SoVITS 合成 AMR 语音文件（配合 `qqbot_send_file` 发） |
| `versatileds_memory` | 查记忆/群规/反思状态 |
| `qqbot_send_file` | 官方自带：发语音/图片/文件 |

### 关于官方插件的补丁

官方模式的前台收发日志、输出文本清洗，是 vds **注入到 `dsh-qqbot/dist`** 的（官方升级会覆盖）。vds 每次启动会检查并自动补回，不需要手动处理。

> **声明**：QQ 官方机器人模式与 NapCat 模式在功能上有出入（见上表），目前仍处于**测试阶段**：群主动消息、发引用、合并转发、戳一戳、群管理等能力官方通道不支持或有平台限制（如群聊只能被动回复）。功能完善和更新请等待后续版本。
>
> 另外，若需要**同步人设**，比较复杂（官方机器人的人设注入方式与本插件不同，需要直接改官方插件的配置）——建议先看官方文档，后续我们会在插件里实现一小部分。

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

QQ 模块依赖本机安装的 [NapCat](https://github.com/NapNeko/NapCatQQ)（基于 NTQQ 的协议侧框架）完成与 QQ 的连接。**本插件不包含 NapCat 的源码，也不再随包附带**；首次启动自动从它官方 GitHub（或 gh-proxy 镜像）下载官方发布版压缩包 `vendor/napcat.zip`（首次启动时自动解压到 `<DSH_HOME>/versatileds/qq/napcat`）。需要源码请自行到[NapCat 官方 GitHub](https://github.com/NapNeko/NapCatQQ) 下载。插件只在运行时启动它、读取它生成的登录二维码，不改它任何代码。

| 项 | 内容 |
|---|---|
| 项目 | https://github.com/NapNeko/NapCatQQ |
| 版权 | Copyright © 2024 Mlikiowa |
| 许可证 | Limited Redistribution License for NapCat（受限再分发许可） |
| 本插件用法 | 首次启动自动下载官方发布版（官方 GitHub → gh-proxy 镜像，失败会提示手动放 `vendor/napcat.zip`），解压到 `<DSH_HOME>/versatileds/qq/napcat`；通过 `launcher.bat` 启动它；读 `<NapCat>/cache/qrcode.png` 在设置页显示登录二维码；登录成功后删除该缓存；不改 NapCat 任何代码 |

许可证要点（详见 NapCat 仓库 `LICENSE`）：

- 再分发必须附带完整许可证文本，并注明来源与版权
- 再分发本插件时，若你自行放了 `vendor/napcat.zip`，请原样保留并附上 NapCat 的许可证文本；官方安装包已不再随附该文件
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
  name: dsh-versatileds
  config:
    bili: { ... }
    qq: { ... }
```

旧的 `bili-agent` / `qq-agent` 两行要删掉，否则同一套工具与后台逻辑会各加载一份。

## 本机状态接口

状态服务只监听 `127.0.0.1`，给设置页和排查用：

- **QQ 模块** `18766`（登录、语音、记忆、表情包、日志等）
- **B站 模块** `18765`（冷却状态）

全部接口按模块列出：

## QQ 模块（18766）

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

## B站 模块（18765）

| 接口 | 用途 |
|---|---|
| `GET /cooldowns` | B站 各项操作（点赞/投币/评论等）的冷却倒计时 |
| `GET /skip` | 跳过当前冷却（调试用） |

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
   - 首次启动自动下载 NapCat（官方 GitHub → gh-proxy 镜像）和 ffmpeg（清华 PyPI）；**都不随包带**；
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

## 常见问题（排坑）

| 现象 | 原因 / 处理 |
|---|---|
| NapCat 起不来 | UAC 弹窗要点「是」；`launcher.bat` 在 `<DSH_HOME>/versatileds/qq/napcat/`；WS 连不上先看 3000 / 3011 端口 |
| 首次启动卡住 | 正在下载/解压 NapCat（约 118MB），日志里等「首次初始化：解压 NapCat」；下载走 gh-proxy 一般一两分钟 |
| ffmpeg 下载慢或失败 | 走清华 PyPI，约 22MB；实在不行手动放到 `<DSH_HOME>/versatileds/ffmpeg/imageio_ffmpeg/binaries/` |
| 设置页一直「正在读取配置…」 | `cordis.patch.yml` 的 YAML 语法坏了（缩进/引号），用 pyyaml 校验；改这个文件**别用 PowerShell 字符串替换** |
| 语音没声音 / 像没在说话 | 看 `/voice_status` 的 `apiUp`；本地语音要等 API 起 40 秒左右；`temperature` 别低于 1.0（会循环生成 30 秒噪声） |
| 语音像别人 / 只剩气音 | 参考音频必须**纯单人、无 BGM**，`prompt_text` 和音频**一字不差** |
| Python 装不上 | 用华为镜像的 3.11.9；系统自带的 3.15 没有 torch wheel |
| GitHub / HF 拉不动 | 用镜像：代码 `ghproxy.net`，模型 `hf-mirror.com`，pip `pypi.tuna.tsinghua.edu.cn` |
| 插件突然不工作 | DSH 启动失败会**静默禁用**插件；去 DSH 日志看原因 |
| 群消息不回复 | 检查 `autoReplyEnabled`、WS 是否连着、是否在反思期（被嫌吵后静默） |

## 问题反馈

- **GitHub Issues（推荐）**：https://github.com/GLeaves230/dsh-versatileds/issues
- **PR / 讨论**：https://github.com/GLeaves230/dsh-versatileds/pulls
- 反馈时请带上：DSH 版本、插件版本（以 release tag 为准）、出问题时控制台的报错、语音问题附 `/voice_deps` 的返回
- 先在本文档「常见问题」里找一眼，能自己解决就不用等回复

## 许可

**受限再分发许可**：

- ✅ 个人使用、运行、学习、自用修改
- ✅ 原样再分发（须附带完整许可证文本、注明来源与版权）
- ⚠️ 商用必须获得**所有版权方**的商用授权；未获授权不得出售、付费托管、盈利性集成、随商业产品捆绑
- ❌ 未经作者许可，不得修改后再公开分发
- NapCat / ffmpeg 各自遵循其原许可证，不适用本许可（两者都已改成按需下载，不再随包；memorix 已停用）

> **注意**：商用版权需要自行取得以下各方的授权——**本插件作者（黑木钟 - GLeaves）、NapCat 作者（NapNeko / Mlikiowa）、FFmpeg 项目、GPT-SoVITS 作者（RVC-Boss）、语音 / 声优版权方（如可莉 CV 花玲、派蒙 CV 多多poi 及相关作品公司）、参考音频来源作者（B站 UP 主）**；获得插件作者的**源码修改再公开**授权后，也不得用于非法盈利 / 侵害利益 / 版权侵权等非法途径，请自行解决律师相关问题。
>
> **即便获得完整商用授权，也请尽量奉行 DSH 的即插即用、开放公开的插件精神。**

完整条款见 [`LICENSE-GLeaves.txt`](./LICENSE-GLeaves.txt)。
