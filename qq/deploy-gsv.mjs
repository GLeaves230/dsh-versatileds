/**
 * 一键部署 / 自检 GPT-SoVITS 环境（给插件的 /voice_deploy 用）。
 *
 * 原则：**已装的跳过，缺什么补什么**。
 *   1. Python 3.11（没有就下华为镜像的安装包静默装）
 *   2. pip 依赖（torch 2.6 cu124 + requirements）
 *   3. 模型（hf-mirror：s1v3 / s2Gv4 / bert / hubert / fast_langdetect）
 *   4. 启 API（跑在 9880）
 *
 * 路径由插件通过环境变量传进来：
 *   GSV_ROOT   <DSH_HOME>/versatileds/models/gpt-sovits（部署目标根）
 *   GSV_PY     <DSH_HOME>/versatileds/python311/python.exe（可不存在）
 * 进度写 GSV_ROOT/deploy-status.json。
 */
import { existsSync, mkdirSync, writeFileSync, statSync, createWriteStream, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { spawnSync, spawn } from 'node:child_process'

const ROOT = process.env.GSV_ROOT
  || join(process.env.DSH_HOME || '', 'versatileds', 'models', 'gpt-sovits')
const PY_DIR = dirname(process.env.GSV_PY || join(ROOT, '..', '..', 'python311', 'python.exe'))
const PY = process.env.GSV_PY || join(PY_DIR, 'python.exe')
const APP = join(ROOT, 'app')
const PM = join(APP, 'GPT_SoVITS', 'pretrained_models')
const STATUS = join(ROOT, 'deploy-status.json')

const state = { at: Date.now(), step: '', done: false, ok: false, log: [] }

function save(patch = {}) {
  Object.assign(state, patch)
  state.at = Date.now()
  try {
    mkdirSync(ROOT, { recursive: true })
    writeFileSync(STATUS, JSON.stringify(state, null, 2), 'utf8')
  } catch { /* ignore */ }
}

function log(line) {
  state.log.push(`${new Date().toTimeString().slice(0, 8)} ${line}`)
  if (state.log.length > 200) state.log.shift()
  save()
  console.log(line)
}

async function download(url, out, label) {
  if (existsSync(out) && statSync(out).size > 1_000_000) {
    log(`跳过 ${label}（已有 ${(statSync(out).size / 1048576).toFixed(1)}MB）`)
    return true
  }
  log(`下载 ${label} …`)
  for (let i = 1; i <= 3; i += 1) {
    try {
      const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(1_800_000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      mkdirSync(dirname(out), { recursive: true })
      const ws = createWriteStream(out)
      const reader = res.body.getReader()
      let got = 0
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        ws.write(Buffer.from(value))
        got += value.length
      }
      await new Promise((r) => ws.end(r))
      log(`完成 ${label}（${(got / 1048576).toFixed(1)}MB）`)
      return true
    } catch (err) {
      log(`第 ${i} 次失败 ${label}：${err?.message ?? err}`)
    }
  }
  return false
}

// ---- 1. Python 3.11 ----
if (existsSync(PY)) {
  log('Python 3.11 已就绪')
} else {
  save({ step: 'python' })
  log('没找到 Python 3.11，开始下载安装包')
  const exe = join(ROOT, 'python-3.11.9-amd64.exe')
  const ok = await download('https://mirrors.huaweicloud.com/python/3.11.9/python-3.11.9-amd64.exe', exe, 'Python 3.11.9')
  if (!ok) { save({ ok: false, done: true }); process.exit(1) }
  log('静默安装 Python 3.11（约 2 分钟）…')
  const r = spawnSync(exe, ['/quiet', 'InstallAllUsers=0', `TargetDir=${PY_DIR}`, 'PrependPath=0', 'Include_test=0'], { timeout: 900_000 })
  log(`安装结束 code=${r.status ?? '?'}`)
  if (!existsSync(PY)) { log('安装后仍找不到 python.exe'); save({ ok: false, done: true }); process.exit(1) }
}

// ---- 2. pip 依赖 ----
save({ step: 'deps' })
log('检查 pip 依赖（torch / fastapi / funasr / librosa …）')
const check = spawnSync(PY, ['-c', 'import torch,fastapi,librosa,fast_langdetect,transformers,soundfile;print("ok")'], { encoding: 'utf8', timeout: 300_000 })
if (String(check.stdout || '').includes('ok')) {
  log('依赖已齐，跳过安装')
} else {
  log('依赖缺失，开始安装（torch 2.6 cu124 + requirements，约 10 分钟）')
  const req = join(APP, 'requirements.txt')
  if (!existsSync(req)) {
    log('找不到 requirements.txt，跳过')
  } else {
    const reqWin = join(ROOT, 'requirements-win.txt')
    const raw = readFileSync(req, 'utf8').split(/\r?\n/).filter((l) => l.trim() && !l.includes('--no-binary')).join('\n')
    writeFileSync(reqWin, raw, 'utf8')
    const pip = spawnSync(PY, ['-m', 'pip', 'install', '-r', reqWin], { encoding: 'utf8', timeout: 2_400_000 })
    log(`requirements: code=${pip.status ?? '?'} ${String(pip.stderr || '').slice(-300)}`)
    const torch = spawnSync(PY, ['-m', 'pip', 'install', 'torch==2.6.0', 'torchaudio==2.6.0', '--index-url', 'https://download.pytorch.org/whl/cu124'], { encoding: 'utf8', timeout: 1_800_000 })
    log(`torch: code=${torch.status ?? '?'}`)
  }
}

// ---- 3. 模型 ----
save({ step: 'models' })
const HF = 'https://hf-mirror.com/lj1995/GPT-SoVITS/resolve/main'
const models = [
  ['s1v3.ckpt', join(PM, 's1v3.ckpt'), `${HF}/s1v3.ckpt`],
  ['s2Gv4.pth', join(PM, 'gsv-v4-pretrained', 's2Gv4.pth'), `${HF}/gsv-v4-pretrained/s2Gv4.pth`],
  ['bert', join(PM, 'chinese-roberta-wwm-ext-large', 'pytorch_model.bin'), `${HF}/chinese-roberta-wwm-ext-large/pytorch_model.bin`],
  ['hubert', join(PM, 'chinese-hubert-base', 'pytorch_model.bin'), `${HF}/chinese-hubert-base/pytorch_model.bin`],
  ['langdetect', join(PM, 'fast_langdetect', 'lid.176.bin'), 'https://dl.fbaipublicfiles.com/fasttext/supervised-models/lid.176.bin'],
]
for (const [label, out, url] of models) {
  if (!(await download(url, out, label))) {
    log(`模型 ${label} 下载失败`)
    save({ ok: false, done: true })
    process.exit(1)
  }
}

// ---- 4. 启 API ----
save({ step: 'api' })
log('启动 API（127.0.0.1:9880）')
const child = spawn(PY, ['api_v2.py', '-a', '127.0.0.1', '-p', '9880', '-c', 'GPT_SoVITS/configs/tts_infer.yaml'], {
  cwd: APP,
  detached: true,
  stdio: 'ignore',
  windowsHide: true,
})
child.unref()
await new Promise((r) => setTimeout(r, 3000))
save({ step: 'done', done: true, ok: true })
log('部署完成（API 正在加载模型，约 40 秒后可用）')
