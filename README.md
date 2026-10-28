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

**多功能DS插件：支持B站小号代理 + QQ 代理（NapCat 小号通道 / 官方机器人通道）。左侧栏在仅NapCat模式下一个入口，QQ机器人登录模式下为QQ机器人与多功能DS插件两个入口。UI层显示B站 / QQ / 通用三个模块页；QQ 侧支持本地 GPT-SoVITS 语音、Whisper 语音转文字、按账号/按模块的记忆与人设隔离或共享。QQ官方机器人模式下请自行按文档登录，该插件目前仅供学习/个人使用，商用需取得所有版权方授权。**

- 模型侧两个工具：`versatileds_bili`（B站）、`versatileds_qq`（QQ）。带插件前缀是为了跟别人的同类插件不撞名——DSH 里工具重名会让后注册的那个插件直接报错。`biliAgent` 服务、QQ 自动回复 / 主动搭话 / 群规 / 直播 / 表情包等后台能力照旧。
- 配置分成 `config.bili` 与 `config.qq` 两块，字段名与语义保持原有定义，互不干扰。
- 切换 QQ 通道（`qqChannel`）时，依赖检测成功后插件会**自动挂起 DSH 的 QQ 快捷栏**：官方模式装好 `@tencent-connect/dsh-qqbot` 并启用 `im-qqbot` 条目（bundle 没挂载会自动补上）；切回 NapCat 模式则自动禁用官方条目，避免两个通道同时在线。

## 目录

```
dsh-versatileds/
├── index.js            # 合并入口：Config = { bili, qq }，apply 调两个模块
├── client.js           # 浏览器半侧：左侧栏「多功能DS插件」+ 三个模块页（B站/QQ/通用）
├── bili/index.js       # B站 模块入口（工具 + 配置）
├── qq/index.js         # QQ 模块入口（工具 + 配置；含 NapCat 通道与官方通道）
├── qq/deploy-gsv.mjs   # GPT-SoVITS 一键部署脚本（随包，小文件）
├── lib/
│   ├── bili.js         # B站 接口封装
│   ├── live.js         # 直播 / 抓帧
│   └── share-card.js   # QQ 分享卡片解析
├── cordis.patch.yml    # 插入 id: versatileds 的条目
├── assets/
│   ├── icon.jpg        # 插件封面（标题封面 / README 页面显示的那张）
│   └── cover.jpg       # 仓库封面
├── README.md
├── LICENSE-GLeaves.txt
└── package.json
```

> NapCat 不再随包：首次启动自动下载（官方 → gh-proxy 镜像）解压到 `<DSH_HOME>/versatileds/qq/napcat`。

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
| Whisper + Transformers.js（可选） | QQ 侧「听语音」：语音转文字 | 语音消息只记成 `[语音]`，大肥鱼听不到内容；首次用自动装依赖并下载模型（base ≈ 100MB，small ≈ 500MB，large-v3-turbo ≈ 1.5GB） |

ffmpeg 的查找顺序：配置项 `ffmpegPath` → PATH 里的 `ffmpeg` → `<DSH_HOME>/versatileds/ffmpeg/imageio_ffmpeg/binaries/...`。
**缺失时自动从清华 PyPI 镜像下载 `imageio-ffmpeg` wheel（约 22MB）解压到 `versatileds/ffmpeg`**，不再随包塞 ffmpeg。

**数据与凭据**（都在 `DSH_HOME` 下，换机器时一起搬或者重新登录）

| 路径 | 内容 |
|---|---|
| `<DSH_HOME>/versatileds/bilibili/cookies.json` | B站 登录态（`SESSDATA` / `bili_jct` / `buvid3` / `buvid4` / `DedeUserID`） |
| `profiles/web/cordis.patch.yml` 的 `versatileds.qq.onebotToken` | NapCat 的 OneBot token（HTTP 和 WS 共用） |
| `<DSH_HOME>/versatileds/qq/` | QQ 侧数据：`<账号>/`（按号隔离的记录/设置/表情包/图片/聊天）和 `normal/`（共享模式的人设/记忆）；规则见「数据目录：按账号 / 按模块隔离」一节 |
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

| 能力 | NapCat（小号） | 官方机器人（dsh-qqbot） |
|---|---|---|
| 私聊 / 群聊收发 | ✅ | ✅（群聊需 @ 才回） |
| **自动回复 / 主动搭话 / 群规同步 / 反思期 / 余额停聊** | ✅ 插件自己跑 | ❌ 由 `dsh-qqbot` 的 agent 负责，vds 不介入 |
| **表情包库：收图识别、自动挑图、按会话发** | ✅ | ❌（只能发普通图片文件） |
| **听语音（语音转文字）** | ✅ 本地 whisper | ❌（vds 不处理官方通道的语音附件） |
| 发语音 | ✅ GPT-SoVITS 合成后按 `record` 发 | ✅ 合成文件后用 `qqbot_send_file` 发 |
| 主动消息 | ✅ 无限制 | 单聊 1000 条/天；**群聊无权限**（只能被动回复） |
| 发引用 | ✅ | ❌（只能收） |
| 合并转发 | ✅ | ❌ |
| 戳一戳 / 群管理 / 群公告 | ✅ | ❌ |
| 图片 / 文件 | ✅ | ✅ |
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

> **声明**：QQ 官方机器人模式与 NapCat 模式在功能上有出入（见上表），目前仍处于**测试阶段**：群主动消息、发引用、合并转发、戳一戳、群管理等能力官方通道不支持或有平台限制（如群聊只能被动回复）；**自动回复、主动搭话、表情包库、听语音这些「会主动反应」的能力目前只在 NapCat 通道生效**，官方通道下 vds 只提供发送/语音合成/记忆查询类工具，对话由 `dsh-qqbot` 的 agent 处理。功能完善和更新请等待后续版本。
>
> 另外，若需要**同步人设**，比较复杂（官方机器人的人设注入方式与本插件不同，需要直接改官方插件的配置）——建议先看官方文档，后续我们会在插件里实现一小部分。

## 登录模块

QQ 模块的「登录」子页是我们自己的登录入口：状态检测、拉起、二维码、登录后清理，全在这一页完成，不弹独立网页。**通道不同，这一页长得不一样**：

| 通道 | 登录页显示 |
|---|---|
| **NapCat（小号）** | 二维码 + 「重新出码（会重启 NapCat）」「启动登录服务」「退出登录」；登录成功后二维码自动删除，`3000` / `3011` 起来就通了 |
| **官方机器人** | 不显示二维码，给一段绑定引导：点左下角头像 →「设置」→「QQ 机器人」→ 扫码绑定（走 `dsh-qqbot` 的官方通道，vds 不参与登录） |

后端是可替换的，当前默认后端是 NapCat（见下方声明）：

| 层 | 职责 |
|---|---|
| 登录页（`client.js` 的 `LoginPanel`） | 只认 `/login`、`/login/start`、`/qr/png` 三个接口，不关心底层是谁；官方通道时渲染绑定引导 |
| 登录控制（`qq/index.js` 的 `napcatControl`） | 检测登录态、拉起、等二维码就绪、登录成功后删二维码缓存 |
| 后端 | 默认 NapCat；换后端只改控制层，页面和交互不用重写 |

### 快速登录与换号

- 设置页填了 `napcatQuickLogin`（快速登录 QQ 号），NapCat 启动会直接用它登录，**不用扫码**；
- 插件会记住最近一次登录的号：**检测到换号时自动清空快速登录号**，下次启动必须扫码（谁扫是谁），避免「扫码登了 A，却又被快速登录顶回 B」；
- 「退出登录」会杀掉插件拉起的 NapCat 进程（`-q <号>` 的整棵进程树），并把「已退出」标志落盘，热重载/重启都不会忘记；
- 换号时每个号的会话时间会记在 `qq/<号>/session.json`（上线/下线），离线时长用于扣减各种倒计时。

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

### Whisper / Transformers.js（语音转文字，可选）

QQ 侧「听语音」和「语音转文字」用的是本地 Whisper，不联网识别（只在首次下载时联网取模型）。

| 项 | 内容 |
|---|---|
| 运行时库 | [Transformers.js](https://github.com/huggingface/transformers.js)（Apache-2.0）、[wavefile](https://github.com/rochars/wavefile)（MIT）、[opencc-js](https://github.com/nk2028/opencc-js)（Apache-2.0） |
| 模型 | [Whisper](https://github.com/openai/whisper)（OpenAI，MIT），ONNX 版本取自 HuggingFace `onnx-community/whisper-base` / `whisper-small` / `whisper-large-v3-turbo` |
| 用法 | 用户可选（设置页「语音」→「语音转文字模型」）；首次使用时自动装依赖到 `<DSH_HOME>/versatileds/models/stt`，模型缓存到 `<DSH_HOME>/versatileds/models/hf`（走 hf-mirror 镜像）；插件只调用它做转写，不改其代码 |
| 本插件用法 | 转写结果只用于 QQ 侧的对话上下文，不外传 |

### 表情包处理（本地）

| 项 | 内容 |
|---|---|
| 图片缩放 | 调 **FFmpeg**（见上一节）把表情包缩到 QQ 表情大小（默认 240px，gif 保留原图） |
| 去重指纹 | 插件内自己实现的感知哈希（dHash，无第三方库），用来判断「同一张表情包换清晰度」 |
| 识图/分类 | 走 DeepSeek 模型（见下一节）判断图片是否属于表情包，只把确认的收进表情库 |
| 存储 | `<DSH_HOME>/versatileds/qq/<账号>/sticker`（随账号隔离），索引 `index.json` 记录来源、描述、使用次数 |

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
| `GET /cooldowns` | 各项冷却倒计时（带 `account` 与 `session`：当前账号、上线/下线时间、离线时长） |
| `GET /skip` / `POST /set_used` | 跳过主动搭话倒计时 / 改今日已用次数 |
| `GET /balance_check` | 查 DeepSeek 余额 |
| `GET/POST /persona` | 人设路径与「初始化人设」；`?for=common` 指通用模块那份；返回带 `dataDir`（QQ 侧目录）和 `sharedDir`（通用侧目录） |
| `POST /owner` | 按当前账号写主人号（`qq/<号>/owner.json`） |
| `POST /focus` | 按当前账号写聚焦会话（`qq/<号>/focus.json`） |
| `POST /group-profiles` | 按当前账号写群偏好（`qq/<号>/groups.json`） |
| `POST /proactive-targets` | 按当前账号写主动搭话对象（`qq/<号>/proactive-targets.json`） |
| `GET /contacts` | 群列表 + 好友列表（聚焦会话下拉框用） |
| `GET /accounts` | 数据选择用：当前号、当前选择、历史登录过的号（含昵称，仅显示） |
| `POST /account-view` | 切换「数据选择」（auto / normal / 具体号） |
| `GET /account-config` | 所选账号自己的 owner / 聚焦 / 主动搭话对象 / 群偏好（输入框同步用） |

## B站 模块（18765）

| 接口 | 用途 |
|---|---|
| `GET /cooldowns` | B站 各项操作（点赞/投币/评论等）的冷却倒计时 |
| `GET /skip` | 跳过当前冷却（调试用） |
| `GET /cookie` / `POST /cookie` / `DELETE /cookie` | B站 登录：只看状态（不回显 cookie）/ 保存（解析后只留 5 个字段）/ 清除 |
| `GET /account` | B站 账号信息：昵称、等级、经验、硬币、粉丝、关注、作品数（15 秒缓存） |

## 通用模块

「通用模块」不是一套独立代码，而是**复用 QQ 模块的设置页**，只显示两组：**记忆** 和 **余额**。它代表「DSH 侧/通用」这一边的数据。

| 项 | 通用模块看到的 |
|---|---|
| 人设文件 | 固定 `<DSH_HOME>/versatileds/normal/persona.md`（不受隔离开关影响） |
| 全局偏好 | `<DSH_HOME>/AGENTS.md` |
| 记忆 | `shared-memory.md` 双向共享；「前后端记忆隔离」打开后 QQ 侧不再读它 |
| 余额 | `<DSH_HOME>/versatileds/qq/normal/balance.state.json`（全局资源） |

**和 QQ 模块的关系**（详见「数据目录：按账号 / 按模块隔离」）：

- **数据选择=通用**：QQ 和通用都读 `versatileds\normal\persona.md`（同一份）；
- **数据选择=自动/具体号**：QQ 侧用 `qq\<号>\persona.md`，通用侧始终 `versatileds\normal\persona.md`；
- 「前后端记忆隔离」「账号记忆隔离」只决定记忆要不要和 DSH 互读，不再改变目录。

设置页里两个模块各显示自己的人设路径（点的「初始化人设」也只写自己那份），数据目录提示也按模块区分。

## 配置分块

- `config.bili`：写操作开关与间隔、cookie、主人 UID、直播抓帧、视频抓帧、观看历史上报等。字段见 `bili/index.js` 的 `Config`。
- `config.qq`：NapCat 连接、自动回复、群聊规则、主动搭话、搜索/任务转交、余额、日志、识图、表情包、视频分享、语音（含 `sttModel` 语音转文字模型）、隔离（`isolateHostQq` 前后端 / `isolateAccountMemory` 账号）等。字段见 `qq/index.js` 的 `Config`。

两块都是 `volatile()` 字段：普通字段改完即时生效；两个总开关（`bili.enabled` / `qq.enabled`）约 **2 秒内热启停**——工具注册/注销、WS、定时器都跟着停/起，不用重启 DSH。**关掉 QQ 模块时「启动登录服务」「退出登录」仍然可用**（关的只是聊天自动化）。

几个字段的生效方式要注意：

| 字段 | 改完怎么生效 |
|---|---|
| `qqChannel` | 约 5 秒内检测到并自动执行切换（装/禁用官方插件、注入补丁） |
| `isolateHostQq` / `isolateAccountMemory` | 立即生效；设置页「人设文件」路径也会跟着刷新 |
| `sttModel` | 下一次转写就用新模型（没下载过会自动下载） |
| `voiceBackend` | 下一次发语音就按新方案走 |
| `napcatQuickLogin` | 下次启动 NapCat 生效；检测到换号时插件会**自动清空**它 |

### 配置示例

下面全是占位值，换成自己的就行（**不用改代码**）：

```yaml
- id: versatileds
  config:
    qq:
      enabled: true
      qqChannel: napcat              # napcat＝小号走 NapCat；official＝走官方机器人插件
      ownerQQ: "1000000001"          # 主人的 QQ 号
      napcatQuickLogin: "1000000002" # 机器人 QQ 号（免扫码快速登录）
      onebotToken: "换成一个随机串"   # NapCat OneBot token
      autoStartNapCat: true          # DSH 起来自动拉 NapCat
      napcatHiddenLaunch: true       # 隐藏窗口启动
      proactiveGroups: "123456789"   # 想主动搭话的群号
      voiceBackend: gpt-sovits       # qq＝QQ 官方 AI 语音；gpt-sovits＝本地合成
      sttModel: onnx-community/whisper-base   # 听语音用的转写模型
      isolateHostQq: false           # 前后端记忆隔离（DSH 与 QQ 各用各的）
      isolateAccountMemory: false    # 账号记忆隔离（不同 QQ 号各用各的）
    bili:
      enabled: true
      ownerUid: "1000000003"         # 主人的 B站 UID（评论里 @ 你时用）
      perActionGapSec: 360
```

> 官方机器人通道（`qqChannel: official`）的 `appId` / `appSecret` 不在这里填——那是 `@tencent-connect/dsh-qqbot` 的条目配置，vds 只负责启用/注入补丁。

**关于身份**：插件认的是 **QQ 号 / B站 UID**，不是昵称——主人改名字、改群名片都不影响。

- 谁是主人：`ownerQQ` 这个号说话时算主人
- 主人叫什么：按 `ownerQQ` 现查 QQ 名称 + 群名片，别人问就报名字
- B站 @ 主人：按 `ownerUid` 查昵称

### 数据目录：按账号 / 按模块隔离

QQ 侧的记录、设置、媒体都按**当前登录的 QQ 号**分目录，互不串；需要 DSH 与 QQ 两边共用一份的东西放 `normal`。

```
<DSH_HOME>/versatileds/qq/
├─ 100000001/                 # 当前登录号（按 QQ 进程的 -q 参数自动识别，不写死）
│   ├─ persona.md              # 人设（隔离模式下独立；新号首次出现会从共享人设复制一份）
│   ├─ memory.md               # 记忆
│   ├─ notes.md                # 笔记（小本本）
│   ├─ shared-memory.md        # 共享记忆（只在开「前后端记忆隔离」时用自己这份）
│   ├─ owner.json              # 主人号
│   ├─ focus.json              # 聚焦会话
│   ├─ quiet.json              # 反思期（禁言）状态
│   ├─ groups.json             # 群偏好（免打扰时段、群规/记忆注入开关）
│   ├─ group_rules.md          # 抓到的群规
│   ├─ proactive-targets.json  # 主动搭话对象
│   ├─ session.json            # 上线/下线时间（离线时长用于扣减倒计时）
│   ├─ sticker/ image/ chat/ voice-out/   # 表情包库、图片、聊天记录、语音输出
│   └─ ...
├─ 100000002/                 # 另一个号，结构完全相同
└─ normal/                     # 共享（「数据选择=通用」时用）：DSH 与 QQ 共用
    ├─ persona.md              # 人设
    └─ balance.state.json      # 余额（全局资源）
```

**设置页「数据选择」决定看/改哪份数据**（2026-10-28）：

| 数据选择 | 人设 / 记忆 / 笔记 / 共享记忆 |
|---|---|
| **通用（共享）** | `versatileds\normal\`（DSH 与 QQ 共用） |
| **自动选择当前号**（默认） | 当前登录号 `versatileds\qq\<当前号>\`；没登录时回退 `versatileds\normal` |
| **具体 QQ 号**（历史登录过的，自动列出） | `versatileds\qq\<那个号>\` |

切换「数据选择」后，该账号的 `ownerQQ` / `focusChatTarget` / `proactiveTargets` / `groupProfiles` 会自动同步到输入框。

**「前后端记忆隔离」「账号记忆隔离」两个开关**只影响「记忆要不要和 DSH 互读」，不再改变目录：

- 前后端隔离：QQ 侧不读 DSH 的 `shared-memory.md`，各记各的；
- 账号隔离：不同 QQ 号之间连笔记/记忆也分开（目录本来就按号，这个开关针对的是共享记忆/记忆互读那部分）。

- 记录/设置类（owner、focus、quiet、groups、群规、主动搭话对象、表情包、图片、聊天、语音）**永远按号**，跟开关无关；
- 新账号首次出现（存档目录为空）**只复制人设**做初始化，记忆不复制；人设被删不自动补，交给设置页「初始化人设」按钮由号主自己决定。

**按模块隔离**

设置页的「人设文件」按模块各显示各的：

| 模块页 | 显示 / 写入 |
|---|---|
| QQ 模块 | QQ 侧那份（两个都开 → `qq\<号>\persona.md`；只开前后端 → `qq\normal\persona.md`；都不开 → `versatileds\normal\persona.md`） |
| 通用模块 | 固定 `versatileds\normal\persona.md` |
| B站模块 | 不显示 |

切模块时会重新读一次路径，改完隔离开关切一下 tab 就能看到变化。

## 个人内容放哪

群梗、锚点、和谁关系好这类**属于你自己的东西不要写进本插件**，放 `<DSH_HOME>/versatileds/memory/shared-memory.md`：

- QQ 侧只读，DSH 侧负责写
- 插件包里不含这个文件，换个人用就是空的，不会串

## 新用户上手

1. 装好插件（`link:` 或 `install_bundle`），DSH 启动时会自动：
   - 首次启动自动下载 NapCat（官方 GitHub → gh-proxy 镜像）和 ffmpeg（清华 PyPI）；**都不随包带**；
   - 生成 `AGENTS.md` 模板（开头一节「这套东西怎么跑起来的」就是前置常识）；
   - 生成 `<DSH_HOME>/versatileds/memory/` 骨架：`README.md` 索引、`lock.mjs`、`lock.py`、`memwrite.mjs`；
   - 生成 `qq/normal/persona.md` 人设模板（共享模式，一份完整可用的默认人设，直接改）。
2. 设置页 →「多功能DS插件」→ QQ模块 →「连接」：
   - 填 **主人 QQ 号**（`ownerQQ`，必填；留空时插件会把第一条私聊它的人自动当主人）；
   - 填机器人号 `napcatQuickLogin`；
   - 点「启动登录服务」，UAC 点「是」，手机 QQ 扫码并确认。
3. 登录后二维码自动删除，`3000` / `3011` 起来就通了。不想挂着了点「退出登录」（会杀掉 NapCat 进程），下次点启动走快速登录。
4. B站 模块要自己的 cookie（`cookieFile`），没配就只能匿名看公开内容，点赞/投币/评论都会失败。
5. 人设默认改 `versatileds/normal/persona.md`（两边共用；开「前后端记忆隔离」+「账号记忆隔离」后改 `qq/<当前账号>/persona.md`）：QQ 侧每轮读它，DSH 侧也按它说话；群聊不注入「称呼」「重要」两节（防主人 QQ 号进群）。默认人设已带完整家庭关系（父亲梁文锋、母亲团队、哥哥 DeepSeek R、姐姐 DeepSeek Pro、自己 Flash 最小），开箱即用。
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
| 听不到语音内容 / 转写不准 | 看日志有没有「语音转文字：…」；不准就换 `sttModel`（base→small→large-v3-turbo），大模型首次要下载（100MB～1.5GB） |
| 自己发的语音对方显示「该消息类型暂不支持查看」 | 旧版发的是 amr，已改成直接发 wav；还出现说明 NapCat 版本太旧，重装一次 NapCat |
| 回复为空 | 模型偶尔空回复（上下文太长时），插件会兜底回「嗯，在呢」；频繁出现就归档/新会话 |
| 官方通道群里发不出消息 | 平台限制（群聊无主动消息权限，报 `40034105`），群聊只能带 `msg_id` 被动回复 |
| 切号后还是旧号 | `napcatQuickLogin` 在快速登录；插件检测到换号会自动清空它，重启 NapCat 后扫码登录 |
| 「发个表情包」没反应 | 看 `stickerEnabled` 是否开、`qq/<账号>/sticker` 里有没有图；首次用可先发几张图让它收进库 |
| 数据选择切了没变化 | 切完会自动拉该号配置；若还不对，硬刷新一次（Ctrl+F5） |
| 群免打扰不生效 | 检查时间是不是带秒（现已兼容 HH:MM:SS）；或该群手改过配置导致自动生成被跳过 |
| 插件面板空白 / 显示旧界面 | `client.js` 改动后要在 DSH 仓库跑 `pnpm run build:web`，再硬刷新（Ctrl+F5） |

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
