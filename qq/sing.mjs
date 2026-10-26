// 点歌自动渲染：B站 搜原唱 → demucs 分人声 → Seed-VC 换音色 → 混伴奏 → AMR
// 用法：node sing.mjs "<歌名/关键词>" "<输出名>" [起始秒] [时长秒]
// 成功时把 AMR 路径打到 stdout 最后一行。
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

// 不写死盘符：优先环境变量，其次用户目录下的 .dsh（2026-10-26 去掉 F:/DeepSeek 绝对路径）
const HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
const base = join(HOME, 'versatileds')
const venv = join(base, 'models', 'seed-vc', 'venv', 'Scripts')
const songs = join(base, 'models', 'seed-vc', 'songs')
const outDir = join(base, 'models', 'seed-vc', 'out')
const library = join(base, 'models', 'seed-vc', 'library')
const ffmpeg = join(base, 'ffmpeg', 'imageio_ffmpeg', 'binaries', 'ffmpeg-win-x86_64-v7.1.exe')
const ref = join(base, 'models', 'gpt-sovits', 'ref', 'kc-1.wav')

const [keyword, name, startArg, durArg] = process.argv.slice(2)
if (!keyword || !name) {
  console.error('用法：node sing.mjs <歌名/关键词> <输出名> [起始秒] [时长秒]')
  process.exit(1)
}
const start = Number(startArg || 40)
const dur = Number(durArg || 30)

for (const d of [songs, outDir, library]) mkdirSync(d, { recursive: true })

function die(step, r) {
  const msg = String(r.stderr || r.stdout || '').slice(-400)
  console.error(`[sing] ${step} 失败：${msg}`)
  process.exit(2)
}

// 1) B站 搜歌并下音频
const dl = spawnSync(join(venv, 'yt-dlp.exe'), [
  '-f', 'bestaudio', '--playlist-end', '1', '--no-playlist',
  'bilisearch:' + keyword, '-o', join(songs, name + '.%(ext)s'),
], { encoding: 'utf8' })
if (dl.status !== 0) die('下载', dl)
const src = ['m4a', 'webm', 'mp3', 'mp4'].map((e) => join(songs, `${name}.${e}`)).find(existsSync)
if (!src) die('下载', { stderr: '没找到下载文件' })

// 2) 转 wav
const wav = join(songs, name + '.wav')
const w = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', src, '-ar', '44100', '-ac', '2', wav], { encoding: 'utf8' })
if (w.status !== 0 || !existsSync(wav)) die('转 wav', w)

// 3) 分离人声 / 伴奏
const dm = spawnSync(join(venv, 'python.exe'), ['-m', 'demucs', '--two-stems=vocals', '-o', join(songs, 'demucs'), wav], { encoding: 'utf8' })
if (dm.status !== 0) die('demucs', dm)
const stemDir = join(songs, 'demucs', 'htdemucs', name)
const vocals = join(stemDir, 'vocals.wav')
const acc = join(stemDir, 'no_vocals.wav')
if (!existsSync(vocals)) die('demucs', { stderr: '没有 vocals.wav' })

// 4) 截取高潮段
const seg = join(songs, `${name}-seg.wav`)
const segAcc = join(songs, `${name}-acc.wav`)
const c1 = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', vocals, '-ss', String(start), '-t', String(dur), '-ar', '44100', '-ac', '1', seg], { encoding: 'utf8' })
const c2 = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', acc, '-ss', String(start), '-t', String(dur), '-ar', '44100', '-ac', '1', segAcc], { encoding: 'utf8' })
if (c1.status !== 0 || !existsSync(seg)) die('截取', c1)
if (c2.status !== 0 || !existsSync(segAcc)) die('截取伴奏', c2)

// 5) Seed-VC 换音色
const before = new Set(readdirSync(outDir).filter((f) => f.startsWith(`vc_${name}-seg`)))
const svc = spawnSync(join(venv, 'seed-vc-infer-v1.exe'), [
  '--source', seg, '--target', ref, '--output', outDir,
  '--f0-condition', 'True', '--diffusion-steps', '20', '--fp16', 'True',
], { encoding: 'utf8', env: { ...process.env, HF_ENDPOINT: 'https://hf-mirror.com' } })
if (svc.status !== 0) die('Seed-VC', svc)
const made = readdirSync(outDir)
  .filter((f) => f.startsWith(`vc_${name}-seg`) && !before.has(f))
  .map((f) => join(outDir, f))
  .filter((f) => existsSync(f))
  .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0]
if (!made) die('Seed-VC', { stderr: '没有生成文件' })

// 6) 混伴奏 → AMR
const mix = join(library, `${name}-mix.wav`)
const amr = join(library, `${name}.amr`)
const m = spawnSync(ffmpeg, [
  '-y', '-loglevel', 'error', '-i', made, '-i', segAcc,
  '-filter_complex', '[0:a]volume=0.85[v];[1:a]volume=0.5[a];[v][a]amix=inputs=2:duration=longest:normalize=0,alimiter=limit=0.95',
  mix,
], { encoding: 'utf8' })
if (m.status !== 0 || !existsSync(mix)) die('混音', m)
const a = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', mix, '-ar', '8000', '-ac', '1', '-c:a', 'libopencore_amrnb', '-b:a', '12.2k', amr], { encoding: 'utf8' })
if (a.status !== 0 || !existsSync(amr)) die('转 AMR', a)

console.error(`[sing] 完成：${keyword} → ${amr}`)
process.stdout.write(amr + '\n')
