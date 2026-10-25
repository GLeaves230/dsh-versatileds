# dsh-versatileds-plugin — 多功能DS插件

**多功能DS插件（VersatileDS）**：B站 小号代理与 QQ 代理合体，一个左侧栏入口同时管两边：

- 左侧栏一个入口「多功能DS插件」，点进去上面切 **B站模块 / QQ模块**，每个模块页就是原来各自插件设置页的样子。
- 模型侧的 `bili`、`qq` 两个工具，和 `biliAgent` 服务、QQ 自动回复 / 主动搭话 / 群规 / 直播 / 表情包等后台能力，都跟原来一样。
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
└── package.json
```

## 依赖

**运行环境**

- DSH `>= 0.2.0`（见 `package.json` 的 `engines.dsh`）
- 下面两个 peer 由 DSH 宿主提供，不要在 profile 里单独装：

| 包 | 用途 |
|---|---|
| `@deepseek-ai/dsh-tools` | `defineTool`，注册 `bili` / `qq` 两个工具 |
| `@deepseek-ai/schemastery` | `Schema`，声明 `config.bili` / `config.qq` 的字段 |

**外部程序**

| 依赖 | 用在哪 | 缺了会怎样 |
|---|---|---|
| NapCat（OneBot 11） | QQ 模块全部功能 | 连不上 `3000` / `3011`，`qq` 工具会提示 NapCat 没在跑 |
| ffmpeg | B站 抓帧、直播帧、表情包缩图、感知哈希 dHash | 抓帧和缩图失败，纯文字功能不受影响 |

ffmpeg 的查找顺序：配置项 `stickerFfmpegPath` → PATH 里的 `ffmpeg` → 由 `DSH_HOME` 反推（`<DSH_HOME>/../../live/ffmpeg/imageio_ffmpeg/binaries/...`）。

**数据与凭据**（都在 `DSH_HOME` 下，换机器时一起搬或者重新登录）

| 路径 | 内容 |
|---|---|
| `bili/cookies.json` | B站 登录态（`SESSDATA` / `bili_jct` / `buvid3` / `buvid4` / `DedeUserID`） |
| `profiles/web/cordis.patch.yml` 的 `versatileds.qq.onebotToken` | NapCat 的 OneBot token（HTTP 和 WS 共用） |
| `qq/` | 聊天日志、群规、识图备注、搜索请求、表情包库 |
| `bili/` | 抓帧图片、观看记录 |

## 登录模块

QQ 模块的「登录」子页是我们自己的登录入口：状态检测、拉起、二维码、登录后清理，全在这一页完成，不弹独立网页。

后端是可替换的，当前默认后端是 NapCat（见下方声明）：

| 层 | 职责 |
|---|---|
| 登录页（`client.js` 的 `LoginPanel`） | 只认 `/login`、`/login/start`、`/qr/png` 三个接口，不关心底层是谁 |
| 登录控制（`qq/index.js` 的 `napcatControl`） | 检测登录态、拉起、等二维码就绪、登录成功后删二维码缓存 |
| 后端 | 默认 NapCat；换后端只改控制层，页面和交互不用重写 |

## 第三方组件声明：NapCat

QQ 模块依赖本机安装的 [NapCat](https://github.com/NapNeko/NapCatQQ)（基于 NTQQ 的协议侧框架）完成与 QQ 的连接。NapCat 由使用者自行安装，**本插件不包含它的源码或二进制**，只在运行时启动它、读取它生成的登录二维码。

| 项 | 内容 |
|---|---|
| 项目 | https://github.com/NapNeko/NapCatQQ |
| 版权 | Copyright © 2024 Mlikiowa |
| 许可证 | Limited Redistribution License for NapCat（受限再分发许可） |
| 本插件用法 | 通过 `launcher.bat` 启动本机 NapCat；读 `<NapCat>/cache/qrcode.png` 在设置页显示登录二维码；登录成功后删除该缓存；不改 NapCat 任何代码 |

许可证要点（详见 NapCat 仓库 `LICENSE`）：

- 再分发必须附带完整许可证文本，并注明来源与版权
- 禁止商业用途
- 未经作者许可不得修改后再公开分发
- 软件按原样提供，不附带任何担保

QQ 模块的「NapCat」子页就是这套流程的入口：看状态、拉起 NapCat、扫码、登录后自动清理二维码。

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

## 配置分块

- `config.bili`：写操作开关与间隔、cookie、主人 UID、直播抓帧、视频抓帧、观看历史上报等。字段见 `bili/index.js` 的 `Config`。
- `config.qq`：NapCat 连接、自动回复、群聊规则、主动搭话、搜索/任务转交、余额、日志、识图、表情包、视频分享等。字段见 `qq/index.js` 的 `Config`。

两块都是 `volatile()` 字段，改完立即热替换，不用重启 DSH。

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

群梗、锚点、和谁关系好这类**属于你自己的东西不要写进本插件**，放 `$DSH_HOME/../记忆/共享记忆.md`：

- QQ 侧只读，DSH 侧负责写
- 插件包里不含这个文件，换个人用就是空的，不会串

## 新用户上手

1. 装好插件（`link:` 或 `install_bundle`）
2. 填 `ownerQQ`（自己的号）和 `napcatQuickLogin`（机器人号）
3. 进 QQ 模块 →「登录」页 → 点「启动登录服务」
4. 首次会解压自带的 NapCat 到 `<DSH_HOME>/napcat`，扫码登录
5. 登录后二维码自动删除，3000/3011 起来就通了

## 合并时修掉的问题

- QQ 设置页在 2026-10-24 20:07 被写坏（UTF-8 双重编码 + 引号丢失，`node --check` 直接报语法错误）。本包的 QQ 模块页按 14:56 的完好版本重建，并补回之后新增的 `relayEnabled`、`shareCardWatch`、`neighborBots`、`neighborNameKeywords`、`videoShare*` 等字段。
- 旧设置页有一批字段名跟 Host schema 对不上（写了不生效）：`proactiveMinGapMin` / `proactiveMaxGapMin` / `proactiveGroupMinGapMin` / `liveMaxAgeMin` / `liveRequestCooldownMin` / `stickerSendMinGapMin` / `swearBanMinutes` / `videoShareIntervalMin`。已全部按 Host 的秒制字段名对齐（`...GapSec` / `liveMaxAgeSec` / `liveRequestCooldownSec` / `stickerSendMinGapSec` / `swearBanSec` / `videoShareIntervalSec`），并补上漏掉的 `videoShareEnabled` 开关。
- 字段一致性已脚本校验：B站 28 个、QQ 99 个 Host 字段全部有对应设置项，客户端没有多余字段。

## 版本

- 0.1.0：合并完成，左侧栏「多功能DS插件」+ B站 / QQ 两个模块页；修复 QQ 设置页损坏。
- 0.2.0：包名 / 插件 id 改为 `dsh-versatileds-plugin` / `versatileds`（VersatileDS）。
- 0.2.1：ffmpeg 默认路径改成按 `DSH_HOME` 反推，去掉硬编码绝对路径（换电脑不用改代码）；修复 `/cooldowns` 状态接口因 `lastWebSearchAt` 作用域不匹配导致的进程崩溃。
- 0.2.2：自带 NapCat / ffmpeg / memorix 三个依赖包，启动时自检并按需解压（零外部依赖）；启动日志补后端地址、WebUI 与 PID；修了一批 QQ 侧的识别问题（自己发的表情包被误标成主人接管、主人接管发的图不进上下文、双重编码乱码还原、外语强制回复、表情滥用、短回复节奏、排队消息过期）；还嘴方案改成可编辑权重列表；人设定为女生；身份识别改按 QQ 号而不是昵称。
- 0.2.3：群聊表现修复（2026-10-25 巡检）：反问刷屏收敛（别光甩「啥意思」，先自己推一个理解）；版本问题直接用共享记忆里的权威版本作答，不许说「没消息」；同一张普通图被反复转发不再重复锐评；群接话加 3 分钟时效闸、且不 @ 人；群消息发送失败先翻历史确认再重试，避免重复发；主人称呼统一（不直呼昵称、不念群名片备注、不重复叫「主人」）；别人让骂主人时代码直答拒绝；「我是谁」这类身份短问直答。
