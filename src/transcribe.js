// Transcrição local com Whisper (roda no próprio Mac, sem enviar áudio para fora).
// Na primeira vez, o modelo (~240 MB) é baixado e fica guardado em data/models.
const path = require('path');
const { spawn } = require('child_process');
const store = require('./store');
const { FFMPEG } = require('./media');

const MODEL = process.env.WHISPER_MODEL || 'onnx-community/whisper-small_timestamped';
let asrPromise = null;

async function getAsr() {
  if (!asrPromise) {
    asrPromise = (async () => {
      const { pipeline, env } = await import('@huggingface/transformers');
      env.cacheDir = path.join(store.paths.DATA_DIR, 'models');
      return pipeline('automatic-speech-recognition', MODEL, { dtype: 'q8' });
    })().catch((e) => {
      asrPromise = null;
      throw e;
    });
  }
  return asrPromise;
}

// Extrai o áudio como PCM 16 kHz mono (formato que o Whisper espera).
function readAudio(file) {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, ['-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', '16000', '-f', 'f32le', 'pipe:1']);
    const chunks = [];
    let err = '';
    p.stdout.on('data', (d) => chunks.push(d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', reject);
    p.on('close', (code) => {
      if (code !== 0) return reject(new Error(err || 'Falha ao ler o áudio'));
      const buf = Buffer.concat(chunks);
      const copy = new Float32Array(buf.length / 4);
      Buffer.from(copy.buffer).set(buf.subarray(0, copy.length * 4));
      resolve(copy);
    });
  });
}

// Retorna { text, words: [{ w, start, end }] }
async function transcribe(file) {
  const audio = await readAudio(file);
  if (!audio.length) return { text: '', words: [] };
  const asr = await getAsr();
  const out = await asr(audio, {
    language: 'portuguese',
    task: 'transcribe',
    return_timestamps: 'word',
    chunk_length_s: 30,
    stride_length_s: 5,
  });
  const words = (out.chunks || [])
    .map((c) => ({ w: c.text.trim(), start: c.timestamp[0], end: c.timestamp[1] ?? c.timestamp[0] + 0.3 }))
    .filter((x) => x.w);
  return { text: (out.text || '').trim(), words };
}

module.exports = { transcribe, MODEL };
