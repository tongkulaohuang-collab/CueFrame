import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { access, copyFile, mkdir, readdir, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const executableCache = new Set();

async function run(command, args, options = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: options.cwd, windowsHide: true, shell: false,
      signal: options.signal, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', settled = false;
    const timeout = setTimeout(() => child.kill(), options.timeoutMs ?? 600_000);
    const finish = (fn, value) => { if (!settled) { settled = true; clearTimeout(timeout); fn(value); } };
    child.stdout.on('data', chunk => { stdout = (stdout + chunk.toString('utf8')).slice(-1_000_000); });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString('utf8')).slice(-1_000_000); });
    child.on('error', error => finish(reject, error));
    child.on('close', code => {
      if (code === 0 || options.allowNonZero) finish(resolve, { stdout, stderr, code });
      else finish(reject, new Error(`${path.basename(command)} 执行失败 (${code ?? '已终止'}): ${stderr.slice(-6000)}`));
    });
  });
}

async function exists(filename) { try { await access(filename); return true; } catch { return false; } }

async function publishFile(source, destination) {
  // Windows scanners may briefly retain a just-encoded file after FFmpeg exits.
  for (let attempt = 0; ; attempt += 1) {
    try { await rename(source, destination); return; }
    catch (error) {
      if (!['EPERM', 'EBUSY', 'EACCES'].includes(error.code) || attempt >= 4) throw error;
      await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1)));
    }
  }
}

async function usable(command) {
  if (!command || typeof command !== 'string') return false;
  if (executableCache.has(command)) return true;
  try { await run(command, ['-version'], { timeoutMs: 10_000 }); executableCache.add(command); return true; }
  catch { return false; }
}

/** Paths may be supplied explicitly; otherwise use project-local tools, then PATH. */
export async function resolveMediaTools(config = {}) {
  const media = config.media ?? {};
  const binaryDir = path.join(projectDir, '.tools', 'python', 'imageio_ffmpeg', 'binaries');
  const local = await readdir(binaryDir).catch(() => []);
  const explicitFfmpeg = config.ffmpegPath ?? config.ffmpeg ?? media.ffmpegPath ?? process.env.FFMPEG_PATH;
  const candidates = explicitFfmpeg ? [explicitFfmpeg] : [
    ...local.filter(name => /^ffmpeg-/.test(name) && !name.endsWith('.md')).map(name => path.join(binaryDir, name)),
    'ffmpeg',
  ];
  let ffmpeg;
  for (const candidate of candidates) if (await usable(candidate)) { ffmpeg = candidate; break; }
  if (!ffmpeg) throw new Error('未找到可用 FFmpeg。请配置 ffmpegPath，或在项目 .tools/python 安装 imageio-ffmpeg。');
  const explicitFfprobe = config.ffprobePath ?? config.ffprobe ?? media.ffprobePath ?? process.env.FFPROBE_PATH;
  const probes = explicitFfprobe ? [explicitFfprobe] : [path.join(path.dirname(ffmpeg), process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe'), 'ffprobe'];
  let ffprobe;
  for (const candidate of probes) if (await usable(candidate)) { ffprobe = candidate; break; }
  return { ffmpeg, ...(ffprobe ? { ffprobe } : {}) };
}

async function localFile(filename) {
  if (typeof filename !== 'string' || !filename.trim()) throw new Error('媒体文件路径不能为空。');
  const resolved = path.resolve(filename);
  if (!(await stat(resolved)).isFile()) throw new Error(`不是有效媒体文件：${resolved}`);
  return resolved;
}

/** ffprobe is optional: the bundled FFmpeg supplies the same required metadata. */
export async function probeMedia(filename, config = {}) {
  const input = await localFile(filename);
  const { ffmpeg, ffprobe } = await resolveMediaTools(config);
  if (ffprobe) {
    const { stdout } = await run(ffprobe, ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', input], config);
    const data = JSON.parse(stdout);
    const streams = data.streams ?? [];
    const video = streams.find(stream => stream.codec_type === 'video');
    const duration = Number(data.format?.duration ?? video?.duration ?? streams.find(s => s.codec_type === 'audio')?.duration);
    if (!(duration > 0)) throw new Error(`无法读取媒体时长：${input}`);
    return { duration, ...(video ? { width: video.width, height: video.height } : {}), hasAudio: streams.some(s => s.codec_type === 'audio') };
  }
  const { stderr } = await run(ffmpeg, ['-hide_banner', '-i', input], { ...config, allowNonZero: true });
  const time = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  const videoLine = stderr.split(/\r?\n/).find(line => /Stream #.*Video:/.test(line));
  const size = videoLine?.match(/(?:,\s|\s)(\d{2,5})x(\d{2,5})(?:\s|,|\[)/);
  if (!time) throw new Error(`无法读取媒体时长：${input}`);
  const duration = Number(time[1]) * 3600 + Number(time[2]) * 60 + Number(time[3]);
  if (!(duration > 0)) throw new Error(`媒体时长无效：${input}`);
  return { duration, ...(size ? { width: Number(size[1]), height: Number(size[2]) } : {}), hasAudio: /Stream #.*Audio:/.test(stderr) };
}

function timestamp(seconds) {
  const ms = Math.max(0, Math.round(seconds * 1000));
  return `${String(Math.floor(ms / 3_600_000)).padStart(2, '0')}:${String(Math.floor(ms / 60_000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
}

export function toSrt(captions = []) {
  if (!Array.isArray(captions)) throw new Error('captions 必须是数组。');
  return captions.map((caption, index) => {
    const start = Number(caption.start), end = Number(caption.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) throw new Error(`字幕 ${index + 1} 的时间段无效。`);
    const text = String(caption.text ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/\n\s*\n/g, '\n').trim();
    return `${index + 1}\n${timestamp(start)} --> ${timestamp(end)}\n${text}\n`;
  }).join('\n');
}

function dimensions(width, height, fps) {
  for (const [name, value] of Object.entries({ width, height })) {
    if (!Number.isInteger(value) || value < 64 || value > 7680 || value % 2 !== 0) throw new Error(`${name} 必须为 64–7680 之间的偶数。`);
  }
  if (!Number.isFinite(fps) || fps < 1 || fps > 120) throw new Error('fps 必须为 1–120。');
}

function warn(config, message) { if (typeof config.onWarning === 'function') config.onWarning(message); }

function wrapCaption(text, columns) {
  return String(text ?? '').split(/\r?\n/).map(paragraph => {
    const lines = []; let line = '', used = 0;
    for (const char of paragraph) {
      const weight = /[\u0020-\u007e]/.test(char) ? 0.56 : 1;
      if (used + weight > columns && line) { lines.push(line.trim()); line = ''; used = 0; }
      line += char; used += weight;
    }
    if (line) lines.push(line.trim());
    return lines.join('\n');
  }).join('\n');
}

function burnSubtitleScript(captions, width, height, fontSize) {
  const assTime = seconds => {
    const total = Math.max(0, Math.round(seconds * 100));
    return `${Math.floor(total / 360000)}:${String(Math.floor(total / 6000) % 60).padStart(2, '0')}:${String(Math.floor(total / 100) % 60).padStart(2, '0')}.${String(total % 100).padStart(2, '0')}`;
  };
  const margin = Math.round(width * 0.06);
  return `[Script Info]\nScriptType: v4.00+\nPlayResX: ${width}\nPlayResY: ${height}\nWrapStyle: 0\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Microsoft YaHei,${fontSize.toFixed(2)},&H00FFFFFF,&H00FFFFFF,&H00202020,&H00000000,0,0,0,0,100,100,0,0,1,${Math.max(1, fontSize / 18).toFixed(2)},0,2,${margin},${margin},${Math.round(height * 0.06)},1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n` + captions.map(caption => {
    const text = String(caption.text ?? '').replace(/\\/g, '＼').replace(/\{/g, '｛').replace(/\}/g, '｝').replace(/\r?\n/g, '\\N');
    return `Dialogue: 0,${assTime(caption.start)},${assTime(caption.end)},Default,,0,0,0,,${text}`;
  }).join('\n') + '\n';
}

async function installFont(workDir, config) {
  const candidate = config.fontPath ?? (process.platform === 'win32' ? path.join(process.env.WINDIR ?? 'C:\\Windows', 'Fonts', 'msyh.ttc') : undefined);
  if (!candidate || !(await exists(candidate))) {
    warn(config, '未找到微软雅黑字体，字幕将使用 FFmpeg 的系统回退字体；请检查中文显示。');
    return false;
  }
  await mkdir(path.join(workDir, 'fonts'), { recursive: true });
  const destination = path.join(workDir, 'fonts', 'subtitle-font.ttc');
  if (!(await exists(destination))) await copyFile(candidate, destination);
  return true;
}

async function fingerprint(files, settings) {
  const metadata = [];
  for (const filename of files) { const info = await stat(filename); metadata.push({ filename, size: info.size, mtimeMs: info.mtimeMs }); }
  return createHash('sha256').update(JSON.stringify({ metadata, settings })).digest('hex').slice(0, 20);
}

/** Native video audio is preserved when audioPath is absent. With separate TTS,
 *  the narration duration is authoritative; short video freezes its last frame. */
export async function renderMovie({ scenes, width, height, fps = 24, fit = 'contain', outputPath, subtitlePath, burnSubtitles = true }, config = {}) {
  dimensions(width, height, fps);
  if (!Array.isArray(scenes) || !scenes.length) throw new Error('至少需要一个镜头。');
  if (!['contain', 'cover'].includes(fit)) throw new Error('fit 必须为 contain 或 cover。');
  if (!outputPath || path.extname(outputPath).toLowerCase() !== '.mp4') throw new Error('outputPath 必须是 MP4 文件路径。');
  const output = path.resolve(outputPath);
  await mkdir(path.dirname(output), { recursive: true });
  const workDir = `${output}.render-work`;
  await mkdir(workDir, { recursive: true });
  const { ffmpeg } = await resolveMediaTools(config);
  const probeConfig = { ...config, ffmpeg };
  const captions = [], clipFiles = [];
  let offset = 0;
  for (let index = 0; index < scenes.length; index += 1) {
    const scene = scenes[index];
    const videoPath = await localFile(scene.videoPath);
    const video = await probeMedia(videoPath, probeConfig);
    if (!video.width || !video.height) throw new Error(`镜头 ${scene.id ?? index + 1} 没有视频画面。`);
    const audioPath = scene.audioPath ? await localFile(scene.audioPath) : undefined;
    const audio = audioPath ? await probeMedia(audioPath, probeConfig) : video;
    if (!audio.hasAudio) throw new Error(`镜头 ${scene.id ?? index + 1} 缺少${audioPath ? '配音文件中的' : '视频原生'}音轨，无法合成有声视频。`);
    const requested = Number(scene.duration);
    const rawDuration = audioPath ? Math.max(audio.duration, Number.isFinite(requested) && requested > 0 ? requested : 0) : video.duration;
    const duration = Math.ceil((rawDuration - 1e-6) * fps) / fps;
    if (audioPath && video.duration + 1 / fps < duration) warn(config, `镜头 ${scene.id ?? index + 1} 画面短于配音，将补最后一帧约 ${(duration - video.duration).toFixed(2)} 秒。`);
    if (audioPath && requested > 0 && audio.duration > requested + 0.1) warn(config, `镜头 ${scene.id ?? index + 1} 配音超过计划时长，已保留完整旁白。`);
    for (const caption of scene.captions ?? []) {
      const start = Number(caption.start), end = Number(caption.end);
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) throw new Error(`镜头 ${scene.id ?? index + 1} 的字幕时间无效。`);
      if (start < duration) captions.push({ start: offset + start, end: offset + Math.min(end, duration), text: caption.text });
    }
    const key = await fingerprint(audioPath ? [videoPath, audioPath] : [videoPath], { width, height, fps, fit, duration, version: 2 });
    const clipName = `clip-${index}-${key}.mp4`;
    const clipPath = path.join(workDir, clipName);
    let reusable = false;
    if (await exists(clipPath)) { try { const prior = await probeMedia(clipPath, probeConfig); reusable = prior.hasAudio && prior.width === width && prior.height === height && Math.abs(prior.duration - duration) < 0.15; } catch {} }
    if (!reusable) {
      const scale = fit === 'cover' ? `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}` : `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`;
      const vf = `${scale},setsar=1,fps=${fps},tpad=stop_mode=clone:stop_duration=${duration},trim=duration=${duration},setpts=PTS-STARTPTS`;
      const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-i', videoPath];
      if (audioPath) args.push('-i', audioPath);
      args.push('-map', '0:v:0', '-map', `${audioPath ? 1 : 0}:a:0`, '-vf', vf,
        '-af', `aresample=48000,apad,atrim=duration=${duration},asetpts=PTS-STARTPTS`, '-t', String(duration),
        '-c:v', 'libx264', '-preset', config.preset ?? 'veryfast', '-crf', String(config.crf ?? 20), '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', '-video_track_timescale', '90000');
      const partial = `${clipPath}.pending.mp4`;
      args.push(partial);
      await run(ffmpeg, args, config);
      await publishFile(partial, clipPath);
    }
    clipFiles.push(clipName);
    offset += duration;
  }
  const subtitlePixels = Math.max(14, Math.min(width, height) / 22);
  const captionColumns = Math.max(6, Math.floor(width * 0.86 / subtitlePixels));
  const wrappedCaptions = captions.map(caption => ({ ...caption, text: wrapCaption(caption.text, captionColumns) }));
  const srt = toSrt(wrappedCaptions);
  const subtitleOutput = path.resolve(subtitlePath ?? output.replace(/\.mp4$/i, '.srt'));
  if (subtitleOutput === output) throw new Error('字幕路径不能与视频输出路径相同。');
  await mkdir(path.dirname(subtitleOutput), { recursive: true });
  await writeFile(subtitleOutput, srt, 'utf8');
  await writeFile(path.join(workDir, 'subtitles.srt'), srt, 'utf8');
  await writeFile(path.join(workDir, 'subtitles.ass'), burnSubtitleScript(wrappedCaptions, width, height, subtitlePixels), 'utf8');
  await writeFile(path.join(workDir, 'concat.txt'), clipFiles.map(name => `file '${name}'`).join('\n'), 'utf8');
  const partialOutput = path.join(path.dirname(output), `.${path.basename(output, '.mp4')}.${randomUUID()}.pending.mp4`);
  const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-f', 'concat', '-safe', '1', '-i', 'concat.txt'];
  if (burnSubtitles && captions.length) {
    await installFont(workDir, config);
    args.push('-vf', 'subtitles=filename=subtitles.ass:fontsdir=fonts',
      '-c:v', 'libx264', '-preset', config.preset ?? 'veryfast', '-crf', String(config.crf ?? 20), '-pix_fmt', 'yuv420p');
  } else args.push('-c:v', 'copy');
  args.push('-c:a', 'copy', '-movflags', '+faststart', partialOutput);
  await run(ffmpeg, args, { ...config, cwd: workDir });
  const result = await probeMedia(partialOutput, probeConfig);
  if (result.width !== width || result.height !== height || !result.hasAudio || Math.abs(result.duration - offset) > Math.max(0.25, scenes.length * 0.04)) throw new Error('成片校验失败：画幅、音轨或时长不符合预期。');
  await publishFile(partialOutput, output);
  return result;
}

/** Fully local test assets, visibly identified; no AI or paid APIs are called. */
export async function createDemoAssets(jobDir, input = {}, config = {}) {
  const demoDir = path.resolve(jobDir, 'demo-assets');
  await mkdir(demoDir, { recursive: true });
  const width = Number(input.width ?? 720), height = Number(input.height ?? 1280), fps = Number(input.fps ?? 24);
  dimensions(width, height, fps);
  const { ffmpeg } = await resolveMediaTools(config);
  const hasFont = await installFont(demoDir, config);
  const perScene = Math.max(2, Math.min(Number(input.duration) || 12, 18) / 3);
  const narrations = ['这是程序生成的测试画面。', '小球经过山谷，找到了星星。', '系统配音与字幕已合成为视频。'];
  const colors = ['0x172B4D', '0x1C3B35', '0x382343'];
  const scenes = [];
  let voiceCount = 0;
  for (let index = 0; index < narrations.length; index += 1) {
    const id = `demo-${index + 1}`;
    const narration = narrations[index];
    const textPath = path.join(demoDir, `${id}-voice.txt`), audioPath = path.join(demoDir, `${id}.wav`), videoPath = path.join(demoDir, `${id}.mp4`);
    await writeFile(textPath, narration, 'utf8');
    let voiced = false;
    if (process.platform === 'win32' && !config.disableSystemVoice) {
      try {
        await run('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(projectDir, 'scripts', 'demo-voice.ps1'), '-TextPath', textPath, '-OutputPath', audioPath], { ...config, timeoutMs: 45_000 });
        voiced = true; voiceCount += 1;
      } catch { warn(config, `演示镜头 ${index + 1} 无法使用 Windows 中文系统语音，将使用明确标注的测试提示音。`); }
    }
    if (!voiced) await run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-f', 'lavfi', '-i', `sine=frequency=${330 + index * 110}:sample_rate=48000:duration=${perScene}`, '-af', 'volume=0.12,afade=t=in:d=0.2,afade=t=out:st=' + Math.max(0, perScene - 0.3) + ':d=0.3', '-c:a', 'pcm_s16le', audioPath], config);
    const audio = await probeMedia(audioPath, { ...config, ffmpeg });
    const duration = Math.ceil(Math.max(audio.duration, perScene) * fps) / fps;
    const label = hasFont ? `程序生成测试画面 · 非 AI 生成\n${voiced ? 'Windows 系统配音' : '无配音：仅测试提示音'}\n镜头 ${index + 1} / 3` : `LOCAL PIPELINE DEMO - NOT AI GENERATED\n${voiced ? 'Windows system voice' : 'TEST TONE - NO NARRATION'}\nScene ${index + 1} / 3`;
    await writeFile(path.join(demoDir, `${id}-label.txt`), label, 'utf8');
    const shortSide = Math.min(width, height), font = hasFont ? 'fontfile=fonts/subtitle-font.ttc:' : '';
    const fontSize = Math.max(16, Math.floor(shortSide / 24));
    const vf = [
      `drawgrid=width=${Math.round(width / 8)}:height=${Math.round(height / 12)}:thickness=1:color=white@0.06`,
      `drawbox=x=0:y=${Math.round(height * 0.7)}:w=iw:h=${Math.round(height * 0.3)}:color=black@0.15:t=fill`,
      `drawtext=${font}textfile=${id}-label.txt:fontcolor=white:fontsize=${fontSize}:line_spacing=${Math.round(fontSize * 0.5)}:box=1:boxcolor=black@0.65:boxborderw=12:x=(w-tw)/2:y=h*0.09`,
      `drawtext=${font}text='${hasFont ? '●' : 'O'}':fontcolor=0xF5C25C:fontsize=${Math.round(shortSide * 0.22)}:x='(w-tw)*(0.12+0.7*t/${duration})':y='h*0.5-sin(t*3)*h*0.06'`,
      `drawtext=${font}text='${hasFont ? '★' : '*'}':fontcolor=0x76DCC5:fontsize=${Math.round(shortSide * 0.12)}:x=w*0.76:y=h*0.43`,
    ].join(',');
    await run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-f', 'lavfi', '-i', `color=c=${colors[index]}:s=${width}x${height}:r=${fps}:d=${duration}`, '-vf', vf, '-an', '-c:v', 'libx264', '-preset', config.preset ?? 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', videoPath], { ...config, cwd: demoDir });
    scenes.push({ id, narration, visualPrompt: '程序生成几何动画测试画面，非豆包或 Seedance 产物。', audioPath, videoPath, duration,
      captions: [{ start: 0, end: duration, text: voiced ? narration : `[测试提示音，无配音] ${narration}` }], demoSource: voiced ? '程序测试画面 + Windows 中文系统配音' : '程序测试画面 + 测试提示音（无配音）' });
  }
  return { title: '本地工作流演示（程序测试素材）', characterBible: '测试角色：金色圆球与绿色星星；所有画面由 FFmpeg 程序生成，不代表生成模型效果。',
    demoSource: voiceCount === scenes.length ? 'FFmpeg 程序生成测试画面 + Windows 中文系统配音；未调用豆包或 Seedance。' : 'FFmpeg 程序生成测试画面；部分或全部音轨为测试提示音，无 AI 配音；未调用豆包或 Seedance。', scenes };
}
