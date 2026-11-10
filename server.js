// Excellence Video AI — Etapa 1 (importação + triagem) e Etapa 2 (edição dos brutos).
// Roda só no seu Mac: abra http://localhost:3000 depois de "npm start".
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const store = require('./src/store');
const media = require('./src/media');
const drive = require('./src/drive');
const { triageAll, STATUSES } = require('./src/triage');
const editor = require('./src/editor');
const { TONES } = require('./src/tones');

const PORT = Number(process.env.PORT) || 3000;
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- tarefa em andamento (uma por vez) ----------
let job = { running: false, label: '', done: 0, total: 0, errors: [], finishedAt: null };
function startJob(label, fn) {
  if (job.running) return false;
  job = { running: true, label, done: 0, total: 0, errors: [], finishedAt: null };
  fn()
    .catch((e) => job.errors.push(e.message))
    .finally(() => {
      job.running = false;
      job.finishedAt = Date.now();
    });
  return true;
}

// ---------- fila de edição (um vídeo por vez) ----------
const editQueue = [];
let editing = null;

function setEdit(id, patch) {
  const list = store.getVideos();
  const v = list.find((x) => x.id === id);
  if (!v) return null;
  v.edit = { ...(v.edit || {}), ...patch, updatedAt: Date.now() };
  store.saveVideos(list);
  return v;
}

async function runEdits() {
  if (editing) return;
  while (editQueue.length) {
    const { id, tone } = editQueue.shift();
    const v = store.getVideos().find((x) => x.id === id);
    if (!v) continue;
    editing = id;
    setEdit(id, { state: 'editando', step: 'Começando', error: null });
    try {
      const r = await editor.editVideo(v, {
        toneKey: tone,
        handle: store.getConfig().handle ?? '@nutricaroluchoa',
        onStep: (step) => setEdit(id, { step }),
      });
      setEdit(id, { state: 'pronto', step: null, ...r });
    } catch (e) {
      setEdit(id, { state: 'erro', step: null, error: e.message });
    }
    editing = null;
  }
}

// Se o app foi fechado no meio de uma edição, ela volta para a fila.
for (const v of store.getVideos()) {
  if (v.edit && (v.edit.state === 'editando' || v.edit.state === 'na fila')) {
    editQueue.push({ id: v.id, tone: v.edit.requestedTone || 'auto' });
  }
}
setTimeout(runEdits, 500);

const idFor = (key) => crypto.createHash('sha1').update(key).digest('hex').slice(0, 16);

// Analisa um arquivo e devolve o registro do vídeo (mantém escolhas manuais anteriores).
async function analyze(file, base, previous) {
  const info = await media.probe(file);
  let fp = { size: 0, hash: null };
  try {
    fp = media.fingerprint(file);
  } catch (e) {
    info.error = info.error || 'Não foi possível ler o arquivo';
  }
  const rec = {
    ...base,
    ...info,
    path: file,
    size: fp.size,
    hash: fp.hash,
    addedAt: previous?.addedAt || Date.now(),
    status: previous?.status,
    manual: previous?.manual || false,
    hasCaptions: previous?.hasCaptions ?? null,
    note: previous?.note || '',
    edit: previous?.edit,
  };
  if (!info.error) {
    const thumb = path.join(store.paths.THUMBS_DIR, `${rec.id}.jpg`);
    if (!fs.existsSync(thumb)) {
      try {
        await media.thumbnail(file, thumb, info.durationSec);
      } catch {
        /* sem miniatura, segue */
      }
    }
  }
  return rec;
}

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (media.VIDEO_EXT.includes(path.extname(entry.name).toLowerCase())) out.push(full);
  }
  return out;
}

// Antes de salvar uma varredura longa, mantém o que mudou no painel enquanto ela rodava.
function saveMerged(list) {
  const fresh = new Map(store.getVideos().map((v) => [v.id, v]));
  for (const v of list) {
    const f = fresh.get(v.id);
    if (!f) continue;
    v.edit = f.edit;
    v.manual = f.manual;
    v.hasCaptions = f.hasCaptions;
    v.note = f.note;
    if (f.manual) v.status = f.status;
  }
  store.saveVideos(triageAll(list));
}

function upsert(list, rec) {
  const i = list.findIndex((v) => v.id === rec.id);
  if (i >= 0) list[i] = rec;
  else list.push(rec);
}

// ---------- API ----------
app.get('/api/state', (req, res) => {
  const videos = store.getVideos();
  const counts = Object.fromEntries(STATUSES.map((s) => [s, videos.filter((v) => v.status === s).length]));
  res.json({
    config: { handle: '@nutricaroluchoa', ...store.getConfig() },
    tones: Object.fromEntries(Object.entries(TONES).map(([k, t]) => [k, t.label])),
    music: editor.musicCounts(),
    queue: editQueue.length + (editing ? 1 : 0),
    drive: { hasCredentials: drive.hasCredentials(), connected: drive.isConnected() },
    counts,
    total: videos.length,
    job,
    videos: videos
      .map(({ path: p, tags, hash, ...v }) => ({ ...v, hasThumb: fs.existsSync(path.join(store.paths.THUMBS_DIR, `${v.id}.jpg`)) }))
      .sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0)),
  });
});

app.post('/api/config', (req, res) => {
  const cfg = { ...store.getConfig(), ...req.body };
  store.saveConfig(cfg);
  res.json(cfg);
});

// Varre uma pasta do Mac (ex.: a pasta do Google Drive para computador). Só lê, nunca altera.
app.post('/api/scan/local', (req, res) => {
  const folder = (req.body.folder || store.getConfig().localFolder || '').trim();
  if (!folder || !fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
    return res.status(400).json({ error: 'Pasta não encontrada. Confira o caminho.' });
  }
  store.saveConfig({ ...store.getConfig(), localFolder: folder });
  const ok = startJob('Analisando vídeos da pasta', async () => {
    const files = walk(folder);
    job.total = files.length;
    const list = store.getVideos();
    for (const file of files) {
      const id = idFor('local:' + file);
      const prev = list.find((v) => v.id === id);
      try {
        const rec = await analyze(file, { id, source: 'local', name: path.basename(file), folderPath: path.relative(folder, path.dirname(file)) }, prev);
        upsert(list, rec);
      } catch (e) {
        job.errors.push(`${path.basename(file)}: ${e.message}`);
      }
      job.done++;
    }
    saveMerged(list);
  });
  if (!ok) return res.status(409).json({ error: 'Já existe uma análise em andamento.' });
  res.json({ started: true });
});

// Google Drive (somente leitura)
app.get('/api/drive/connect', (req, res) => {
  if (!drive.hasCredentials()) return res.status(400).send('Falta o arquivo credentials.json — veja o README.');
  res.redirect(drive.authUrl(PORT));
});

app.get('/oauth2callback', async (req, res) => {
  try {
    await drive.saveCode(PORT, req.query.code);
    res.redirect('/?drive=ok');
  } catch (e) {
    res.status(500).send('Erro ao conectar o Google Drive: ' + e.message);
  }
});

app.post('/api/drive/import', (req, res) => {
  const input = req.body.folder || store.getConfig().driveFolder;
  const folderId = drive.folderIdFrom(input);
  if (!drive.isConnected()) return res.status(400).json({ error: 'Conecte o Google Drive primeiro.' });
  if (!folderId) return res.status(400).json({ error: 'Cole o link da pasta do Google Drive.' });
  store.saveConfig({ ...store.getConfig(), driveFolder: input });
  const ok = startJob('Importando do Google Drive', async () => {
    const files = await drive.listVideos(PORT, folderId);
    job.total = files.length;
    const list = store.getVideos();
    for (const f of files) {
      const id = idFor('drive:' + f.id);
      const prev = list.find((v) => v.id === id);
      const safe = f.name.replace(/[\\/:*?"<>|]/g, '_');
      const dest = path.join(store.paths.LIBRARY_DIR, `${f.id}_${safe}`);
      try {
        if (!fs.existsSync(dest)) await drive.download(PORT, f, dest);
        const rec = await analyze(dest, { id, source: 'drive', driveId: f.id, name: f.name, folderPath: f.folderPath, driveCreated: f.createdTime }, prev);
        upsert(list, rec);
      } catch (e) {
        job.errors.push(`${f.name}: ${e.message}`);
      }
      job.done++;
    }
    saveMerged(list);
  });
  if (!ok) return res.status(409).json({ error: 'Já existe uma importação em andamento.' });
  res.json({ started: true });
});

// Ajuste manual de um vídeo (status, legenda, observação).
app.patch('/api/videos/:id', (req, res) => {
  const list = store.getVideos();
  const v = list.find((x) => x.id === req.params.id);
  if (!v) return res.status(404).json({ error: 'Vídeo não encontrado' });
  const { status, hasCaptions, note } = req.body;
  if (status !== undefined) {
    if (status === 'auto') {
      v.manual = false;
      v.status = v.autoStatus;
    } else if (STATUSES.includes(status)) {
      v.status = status;
      v.manual = status !== v.autoStatus;
    } else return res.status(400).json({ error: 'Status inválido' });
  }
  if (hasCaptions !== undefined) v.hasCaptions = hasCaptions;
  if (note !== undefined) v.note = String(note).slice(0, 500);
  store.saveVideos(list);
  res.json({ ok: true });
});

// Aprova um vídeo para edição. tone = 'auto' ou um dos 6 tons.
app.post('/api/videos/:id/edit', (req, res) => {
  const tone = req.body.tone || 'auto';
  if (tone !== 'auto' && !TONES[tone]) return res.status(400).json({ error: 'Tom inválido' });
  const v = store.getVideos().find((x) => x.id === req.params.id);
  if (!v) return res.status(404).json({ error: 'Vídeo não encontrado' });
  if (v.error) return res.status(400).json({ error: 'Esse arquivo não pode ser lido.' });
  if (editing === v.id || editQueue.some((q) => q.id === v.id)) return res.status(409).json({ error: 'Esse vídeo já está na fila.' });
  editQueue.push({ id: v.id, tone });
  setEdit(v.id, { state: 'na fila', requestedTone: tone, step: null, error: null });
  runEdits();
  res.json({ queued: true });
});

app.get('/api/output/:id', (req, res) => {
  const v = store.getVideos().find((x) => x.id === req.params.id);
  const out = v?.edit?.output;
  if (!out || !fs.existsSync(out)) return res.status(404).end();
  if (req.query.download) return res.download(out, v.edit.outputName);
  res.sendFile(out);
});

app.get('/api/thumb/:id', (req, res) => {
  const f = path.join(store.paths.THUMBS_DIR, `${req.params.id.replace(/[^a-f0-9]/g, '')}.jpg`);
  if (!fs.existsSync(f)) return res.status(404).end();
  res.sendFile(f);
});

app.get('/api/video/:id', (req, res) => {
  const v = store.getVideos().find((x) => x.id === req.params.id);
  if (!v || !fs.existsSync(v.path)) return res.status(404).end();
  res.sendFile(v.path);
});

app.get('/api/export.csv', (req, res) => {
  const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const rows = [['nome', 'origem', 'pasta', 'status', 'sugestão automática', 'ajustado à mão', 'motivos', 'duração (s)', 'resolução', 'já tem legenda', 'observação']];
  for (const v of store.getVideos()) {
    rows.push([v.name, v.source, v.folderPath, v.status, v.autoStatus, v.manual ? 'sim' : 'não', (v.reasons || []).join('; '), v.durationSec, v.width ? `${v.width}x${v.height}` : '', v.hasCaptions === null ? '' : v.hasCaptions ? 'sim' : 'não', v.note]);
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="triagem-videos.csv"');
  res.send('﻿' + rows.map((r) => r.map(esc).join(';')).join('\n'));
});

app.listen(PORT, () => {
  console.log(`\n  Excellence Video AI — Etapas 1 e 2`);
  console.log(`  Abra no navegador: http://localhost:${PORT}\n`);
});
