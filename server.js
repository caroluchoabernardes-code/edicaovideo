// Excellence Video AI — Etapa 1: importação + triagem.
// Roda só no seu Mac: abra http://localhost:3000 depois de "npm start".
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const store = require('./src/store');
const media = require('./src/media');
const drive = require('./src/drive');
const { triageAll, STATUSES } = require('./src/triage');

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
    config: store.getConfig(),
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
    store.saveVideos(triageAll(list));
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
    store.saveVideos(triageAll(list));
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
  console.log(`\n  Excellence Video AI — Etapa 1`);
  console.log(`  Abra no navegador: http://localhost:${PORT}\n`);
});
