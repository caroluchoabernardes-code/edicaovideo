// Leitura de metadados e miniaturas com ffprobe/ffmpeg (binários embutidos via npm).
const { execFile } = require('child_process');
const fs = require('fs');
const crypto = require('crypto');

function bin(envName, pkg) {
  if (process.env[envName]) return process.env[envName];
  try {
    const p = require(pkg);
    return typeof p === 'string' ? p : p.path;
  } catch {
    return envName === 'FFPROBE_PATH' ? 'ffprobe' : 'ffmpeg';
  }
}

const FFPROBE = bin('FFPROBE_PATH', 'ffprobe-static');
const FFMPEG = bin('FFMPEG_PATH', 'ffmpeg-static');

const VIDEO_EXT = ['.mp4', '.mov', '.m4v', '.avi', '.mkv', '.webm', '.3gp', '.mts'];

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 20 * 1024 * 1024, ...opts }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout);
    });
  });
}

function parseFps(rate) {
  if (!rate || rate === '0/0') return null;
  const [a, b] = rate.split('/').map(Number);
  return b ? Math.round((a / b) * 100) / 100 : a;
}

// Retorna metadados normalizados, ou { error } se o arquivo não puder ser lido.
async function probe(file) {
  try {
    const out = await run(FFPROBE, [
      '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file,
    ]);
    const data = JSON.parse(out);
    const v = (data.streams || []).find((s) => s.codec_type === 'video');
    const a = (data.streams || []).find((s) => s.codec_type === 'audio');
    if (!v) return { error: 'Sem faixa de vídeo' };

    let width = v.width;
    let height = v.height;
    // Vídeos de celular costumam vir "deitados" com rotação nos metadados.
    const rotation = Math.abs(
      Number(v.tags?.rotate) ||
        Number((v.side_data_list || []).find((d) => d.rotation !== undefined)?.rotation) ||
        0
    );
    if (rotation === 90 || rotation === 270) [width, height] = [height, width];

    const tags = { ...(data.format?.tags || {}), ...(v.tags || {}) };
    const lower = {};
    for (const [k, val] of Object.entries(tags)) lower[k.toLowerCase()] = String(val);

    return {
      durationSec: Math.round((Number(data.format?.duration) || Number(v.duration) || 0) * 10) / 10,
      width,
      height,
      fps: parseFps(v.avg_frame_rate || v.r_frame_rate),
      videoCodec: v.codec_name,
      hasAudio: Boolean(a),
      tags: lower,
    };
  } catch (e) {
    return { error: 'Arquivo ilegível ou corrompido' };
  }
}

async function thumbnail(file, outFile, durationSec) {
  const at = durationSec && durationSec > 2 ? Math.min(durationSec * 0.3, 10) : 0;
  await run(FFMPEG, [
    '-y', '-ss', String(at), '-i', file, '-frames:v', '1',
    '-vf', 'scale=320:-2', '-q:v', '4', outFile,
  ]);
  return outFile;
}

// Impressão digital rápida: tamanho + 1 MB do início + 1 MB do fim.
// Detecta cópias idênticas mesmo com nomes diferentes, sem ler o arquivo inteiro.
function fingerprint(file) {
  const size = fs.statSync(file).size;
  const fd = fs.openSync(file, 'r');
  const chunk = 1024 * 1024;
  const hash = crypto.createHash('sha1');
  hash.update(String(size));
  const buf = Buffer.alloc(Math.min(chunk, size));
  fs.readSync(fd, buf, 0, buf.length, 0);
  hash.update(buf);
  if (size > chunk) {
    const tail = Buffer.alloc(Math.min(chunk, size));
    fs.readSync(fd, tail, 0, tail.length, Math.max(0, size - tail.length));
    hash.update(tail);
  }
  fs.closeSync(fd);
  return { size, hash: hash.digest('hex') };
}

module.exports = { probe, thumbnail, fingerprint, VIDEO_EXT, FFPROBE, FFMPEG };
