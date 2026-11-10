// Motor de edição: transforma um vídeo bruto em Reel 9:16 editado.
// Etapas: transcrição → escolha do tom → legendas/grafismos → zoom, luz e cor → música e efeitos → MP4.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const store = require('./store');
const { FFMPEG } = require('./media');
const { transcribe } = require('./transcribe');
const { TONES, detectTone } = require('./tones');
const { checkHealth } = require('./health');
const captions = require('./captions');

const ROOT = store.paths.ROOT;
const WORK = path.join(store.paths.DATA_DIR, 'work');
const TRANSCRIPTS = path.join(store.paths.DATA_DIR, 'transcripts');
const SFX = path.join(store.paths.DATA_DIR, 'sfx');
const OUTPUT = path.join(ROOT, 'output');
const MUSIC = path.join(ROOT, 'music');
const END_CARD = 2.5;
for (const d of [WORK, TRANSCRIPTS, SFX, OUTPUT]) fs.mkdirSync(d, { recursive: true });

function ff(args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(FFMPEG, args, { maxBuffer: 50 * 1024 * 1024, cwd: ROOT, ...opts }, (err, stdout, stderr) => {
      if (err) return reject(new Error((stderr || err.message).split('\n').filter(Boolean).slice(-4).join(' | ')));
      resolve({ stdout, stderr });
    });
  });
}

// Confere se o ffmpeg tem o que a edição precisa (legendas via libass e x264).
let checked = null;
async function checkFfmpeg() {
  if (checked) return checked;
  const { stdout } = await ff(['-hide_banner', '-filters']);
  const enc = await ff(['-hide_banner', '-encoders']);
  const missing = [];
  if (!/\sass\s/.test(stdout)) missing.push('legendas (libass)');
  if (!/libx264/.test(enc.stdout)) missing.push('vídeo H.264 (libx264)');
  if (missing.length) {
    throw new Error(`O ffmpeg deste Mac não tem: ${missing.join(' e ')}. Instale com "brew install ffmpeg" e abra o app com: FFMPEG_PATH=$(which ffmpeg) npm start`);
  }
  checked = true;
  return checked;
}

// Efeitos sonoros gerados pelo próprio app (sem direitos autorais de terceiros).
async function ensureSfx() {
  const pop = path.join(SFX, 'pop.wav');
  const whoosh = path.join(SFX, 'whoosh.wav');
  if (!fs.existsSync(pop)) {
    await ff(['-y', '-v', 'error', '-f', 'lavfi', '-i', 'aevalsrc=0.6*sin(2*PI*(500+2600*t)*t)*exp(-28*t):s=48000:d=0.18', pop]);
  }
  if (!fs.existsSync(whoosh)) {
    await ff(['-y', '-v', 'error', '-f', 'lavfi', '-i', 'anoisesrc=d=0.45:c=pink:r=48000:a=0.5',
      '-af', 'bandpass=f=1800:width_type=h:w=2500,afade=t=in:d=0.25:curve=qsin,afade=t=out:st=0.25:d=0.2,volume=0.7', whoosh]);
  }
  return { pop, whoosh };
}

// Mede o brilho médio para corrigir vídeos escuros ou estourados.
async function measureLight(file) {
  try {
    const { stderr } = await ff(['-v', 'info', '-i', file, '-vf', "select='not(mod(n\\,20))',scale=160:-2,signalstats,metadata=print:key=lavfi.signalstats.YAVG", '-an', '-frames:v', '40', '-f', 'null', '-']);
    const vals = [...stderr.matchAll(/YAVG=([\d.]+)/g)].map((m) => Number(m[1]));
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  } catch {
    return null;
  }
}

function pickMusic(toneKey, seed) {
  const dirs = [path.join(MUSIC, toneKey), MUSIC];
  for (const d of dirs) {
    if (!fs.existsSync(d)) continue;
    const files = fs.readdirSync(d).filter((f) => /\.(mp3|wav|m4a|aac|ogg)$/i.test(f)).sort();
    if (files.length) {
      const n = parseInt(crypto.createHash('md5').update(seed).digest('hex').slice(0, 8), 16);
      return path.join(d, files[n % files.length]);
    }
  }
  return null;
}

function musicCounts() {
  const out = {};
  for (const key of Object.keys(TONES)) {
    const d = path.join(MUSIC, key);
    out[key] = fs.existsSync(d) ? fs.readdirSync(d).filter((f) => /\.(mp3|wav|m4a|aac|ogg)$/i.test(f)).length : 0;
  }
  return out;
}

const r3 = (n) => Math.round(n * 1000) / 1000;

// Expressão de zoom "punch-in" (estilo CapCut) com entrada suave de 0,12 s.
function zoomExpr(tone, zooms, duration) {
  if (tone.zoom.slow) return `1+${tone.zoom.slow}*t/${r3(duration)}`;
  const terms = zooms.slice(0, 60).map((z) => {
    const a = z.strong ? Math.max(tone.zoom.amount, 0.14) : tone.zoom.amount;
    return `${a}*between(t,${r3(z.s)},${r3(z.e)})*min(1,(t-${r3(z.s)})/0.12)`;
  });
  return terms.length ? `1+${terms.join('+')}` : '1';
}

function videoChain(v, tone, zoomZ, light, duration, workRel) {
  const horizontal = v.width / v.height > 0.62;
  const g = tone.grade;
  let gamma = 1;
  let brightness = 0;
  if (light !== null) {
    if (light < 85) gamma = Math.min(1.45, 110 / light);
    else if (light > 175) brightness = -Math.min(0.1, (light - 175) / 400);
  }
  const eq = `eq=contrast=${g.contrast}:saturation=${g.saturation}:gamma=${r3(gamma)}:brightness=${r3(brightness)}`;
  const warm = g.warm ? ',colorbalance=rs=0.04:gs=0.01:bs=-0.04:rm=0.03:bm=-0.03' : '';
  const parts = [];
  if (horizontal) {
    parts.push('[0:v]split=2[bga][fga]');
    parts.push('[bga]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=40:4,eq=brightness=-0.08[bg]');
    parts.push('[fga]scale=1080:-2[fg]');
    parts.push('[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1,fps=30[base]');
  } else {
    parts.push('[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30[base]');
  }
  parts.push(
    `[base]${eq}${warm},scale=w='trunc(1080*(${zoomZ})/2)*2':h='trunc(1920*(${zoomZ})/2)*2':eval=frame:flags=bicubic,crop=1080:1920,` +
      `tpad=stop_mode=clone:stop_duration=${END_CARD},ass=${workRel}/legendas.ass:fontsdir=fonts,format=yuv420p[vout]`
  );
  return parts;
}

function audioChain(v, tone, music, sfxEvents, total) {
  const parts = [];
  let idx = 1;
  const voice = v.hasAudio
    ? `[0:a]highpass=f=80,loudnorm=I=-15:TP=-1.5:LRA=11,aresample=48000,apad=whole_dur=${r3(total)}[voice]`
    : `anullsrc=r=48000:cl=stereo,atrim=0:${r3(total)}[voice]`;
  parts.push(voice);
  const mix = [];
  let musicIn = null;
  if (music) {
    musicIn = idx++;
    parts.push('[voice]asplit=2[v1][vsc]');
    parts.push(`[${musicIn}:a]atrim=0:${r3(total)},aresample=48000,volume=${tone.music.volume * 2.2},afade=t=in:d=0.8,afade=t=out:st=${r3(Math.max(0, total - 2))}:d=2[mraw]`);
    parts.push('[mraw][vsc]sidechaincompress=threshold=0.04:ratio=6:attack=15:release=350[mduck]');
    mix.push('[v1]', '[mduck]');
  } else {
    mix.push('[voice]');
  }
  const sfxInputs = {};
  for (const kind of ['pop', 'whoosh']) {
    const times = sfxEvents[kind];
    if (!times.length) continue;
    sfxInputs[kind] = idx++;
    const labels = times.map((_, i) => `[${kind}${i}]`);
    parts.push(`[${sfxInputs[kind]}:a]aresample=48000,volume=${kind === 'pop' ? 0.5 : 0.35},asplit=${times.length}${labels.join('')}`);
    times.forEach((t, i) => {
      const ms = Math.round(t * 1000);
      parts.push(`[${kind}${i}]adelay=${ms}|${ms}[${kind}d${i}]`);
      mix.push(`[${kind}d${i}]`);
    });
  }
  parts.push(`${mix.join('')}amix=inputs=${mix.length}:normalize=0:duration=first,atrim=0:${r3(total)},alimiter=limit=0.95[aout]`);
  return { parts, musicIn, sfxInputs };
}

// Edita um vídeo. onStep(texto) informa o andamento para o painel.
async function editVideo(v, { toneKey = 'auto', handle = '', onStep = () => {} } = {}) {
  if (!fs.existsSync(v.path)) throw new Error('Arquivo original não encontrado');
  await checkFfmpeg();

  onStep('Transcrevendo a fala');
  const tFile = path.join(TRANSCRIPTS, `${v.id}.json`);
  let tr;
  if (fs.existsSync(tFile)) tr = JSON.parse(fs.readFileSync(tFile, 'utf8'));
  else {
    tr = await transcribe(v.path);
    fs.writeFileSync(tFile, JSON.stringify(tr, null, 2));
  }
  const words = tr.words.filter((w) => w.start < v.durationSec);

  const chosen = toneKey === 'auto' ? detectTone(tr.text, v.name) : toneKey;
  const tone = TONES[chosen] || TONES.educativo;
  const health = checkHealth(tr.text);

  onStep(`Montando legendas e grafismos (${tone.label})`);
  const duration = v.durationSec;
  const total = duration + END_CARD;
  const built = captions.build({ words, tone, duration, handle, hasCaptions: Boolean(v.hasCaptions), endCard: END_CARD });
  const workRel = path.posix.join('data', 'work', v.id);
  fs.mkdirSync(path.join(ROOT, workRel), { recursive: true });
  fs.writeFileSync(path.join(ROOT, workRel, 'legendas.ass'), built.ass);

  onStep('Analisando luz');
  const light = await measureLight(v.path);
  const sfxFiles = await ensureSfx();
  const music = pickMusic(chosen, v.id);
  const sfxEvents = {
    pop: tone.sfx.pop || tone.memes ? built.pops.filter((t) => t < total - 0.2).slice(0, 40) : [],
    whoosh: tone.sfx.whoosh ? built.whooshes.filter((t) => t < duration).slice(0, 30) : [],
  };

  const vParts = videoChain(v, tone, zoomExpr(tone, built.zooms, duration), light, duration, workRel);
  const a = audioChain(v, tone, music, sfxEvents, total);

  // A ordem dos -i precisa bater com os índices usados no filtro.
  const order = [[a.musicIn, music], [a.sfxInputs.pop, sfxFiles.pop], [a.sfxInputs.whoosh, sfxFiles.whoosh]]
    .filter(([i]) => i)
    .sort((x, y) => x[0] - y[0]);
  const orderedInputs = ['-i', v.path];
  for (const [, file] of order) {
    if (file === music) orderedInputs.push('-stream_loop', '-1', '-i', file);
    else orderedInputs.push('-i', file);
  }

  const graphFile = path.join(ROOT, workRel, 'filtro.txt');
  fs.writeFileSync(graphFile, [...vParts, ...a.parts].join(';\n'));

  const base = path.parse(v.name).name.replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 60);
  const outName = `${base}__${chosen}.mp4`;
  const outFile = path.join(OUTPUT, outName);
  const tmp = outFile.replace(/\.mp4$/, '.part.mp4');

  onStep('Renderizando o vídeo');
  await ff([
    '-y', '-v', 'error', ...orderedInputs,
    '-filter_complex_script', graphFile,
    '-map', '[vout]', '-map', '[aout]',
    '-t', String(r3(total)),
    '-c:v', 'libx264', '-preset', process.env.X264_PRESET || 'medium', '-crf', '20',
    '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart',
    tmp,
  ]);
  fs.renameSync(tmp, outFile);

  return {
    tone: chosen,
    toneLabel: tone.label,
    output: outFile,
    outputName: outName,
    transcript: tr.text,
    words: words.length,
    music: music ? path.relative(ROOT, music) : null,
    light: light === null ? null : Math.round(light),
    captions: v.hasCaptions ? 'não (vídeo já tinha legenda)' : 'sim',
    health,
  };
}

module.exports = { editVideo, musicCounts, OUTPUT };
