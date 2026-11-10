// Painel de triagem — Excellence Video AI (Etapa 1)
const $ = (id) => document.getElementById(id);
const LABELS = { todos: 'Todos', pronto: 'Pronto', bruto: 'Bruto', revisar: 'Revisar', duplicado: 'Duplicado', editados: 'Editados' };
const EDIT_STATE = { 'na fila': 'Na fila', editando: 'Editando', pronto: 'Editado', erro: 'Erro' };
const COLORS = { pronto: 'var(--pronto)', bruto: 'var(--bruto)', revisar: 'var(--revisar)', duplicado: 'var(--duplicado)' };

let state = null;
let filter = 'todos';
let pollTimer = null;
let wasRunning = false;
const toneChoice = {};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDur = (s) => {
  if (!s && s !== 0) return '';
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
};

function showMsg(text) {
  const el = $('msg');
  el.hidden = !text;
  el.textContent = text || '';
}

async function api(url, opts = {}) {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Algo deu errado');
  return data;
}

async function load() {
  state = await api('/api/state');
  render();
  const running = state.job.running || state.queue > 0;
  if (running) {
    wasRunning = true;
    clearTimeout(pollTimer);
    pollTimer = setTimeout(load, 1200);
  } else if (wasRunning) {
    wasRunning = false;
    const errs = state.job.errors || [];
    showMsg(errs.length ? `Concluído com ${errs.length} aviso(s): ${errs.slice(0, 3).join(' · ')}` : '');
  }
}

function render() {
  const { config, drive, counts, total, job, videos } = state;

  if (document.activeElement !== $('driveFolder')) $('driveFolder').value = config.driveFolder || '';
  if (document.activeElement !== $('localFolder')) $('localFolder').value = config.localFolder || '';
  if (document.activeElement !== $('handle')) $('handle').value = config.handle || '';
  $('queueBadge').textContent = state.queue ? `${state.queue} na fila` : 'livre';
  $('queueBadge').className = 'pill' + (state.queue ? '' : ' ok');
  const m = state.music;
  const totalMusic = Object.values(m).reduce((a, b) => a + b, 0);
  $('musicInfo').innerHTML = totalMusic
    ? 'Músicas: ' + Object.entries(m).map(([k, n]) => `${esc(state.tones[k])} ${n}`).join(' · ')
    : 'Sem músicas ainda. Coloque faixas livres (Pixabay, YouTube Audio Library) na pasta <b>music/</b>, separadas por tom. Sem música, o vídeo sai só com a voz e os efeitos.';

  const badge = $('driveBadge');
  badge.textContent = drive.connected ? 'conectado' : drive.hasCredentials ? 'não conectado' : 'falta configurar';
  badge.className = 'pill' + (drive.connected ? ' ok' : '');
  $('driveConnect').hidden = drive.connected;
  $('driveImport').disabled = !drive.connected || job.running;
  $('localScan').disabled = job.running;

  $('progress').hidden = !job.running;
  if (job.running) {
    const pct = job.total ? Math.round((job.done / job.total) * 100) : 5;
    $('barFill').style.width = pct + '%';
    $('progressText').textContent = `${job.label}… ${job.done}/${job.total || '?'}`;
  }

  const editedCount = videos.filter((v) => v.edit).length;
  const all = { todos: total, ...counts, editados: editedCount };
  $('filters').innerHTML = Object.keys(LABELS)
    .map((k) => `<button class="chip ${filter === k ? 'active' : ''}" data-f="${k}">
      ${COLORS[k] ? `<span class="dot" style="background:${COLORS[k]}"></span>` : ''}${LABELS[k]} · ${all[k] || 0}</button>`)
    .join('');

  const list = filter === 'todos' ? videos : filter === 'editados' ? videos.filter((v) => v.edit) : videos.filter((v) => v.status === filter);
  $('empty').hidden = total > 0;
  $('grid').innerHTML = list.map(card).join('');
}

function card(v) {
  const thumb = v.hasThumb ? `style="background-image:url('/api/thumb/${v.id}')"` : '';
  const res = v.width ? `${v.width}×${v.height}` : '';
  const options = ['pronto', 'bruto', 'revisar', 'duplicado']
    .map((s) => `<option value="${s}" ${v.status === s ? 'selected' : ''}>${LABELS[s]}</option>`)
    .join('');
  return `<article class="video" data-id="${v.id}">
    <button class="thumb" ${thumb} data-play="${v.id}" title="Assistir">
      <span class="status s-${v.status}">${LABELS[v.status] || v.status}</span>
      ${v.durationSec ? `<span class="dur">${fmtDur(v.durationSec)}</span>` : ''}
    </button>
    <div class="body">
      <div class="name">${esc(v.name)}</div>
      <div class="meta">${v.source === 'drive' ? 'Drive' : 'Mac'}${v.folderPath ? ' · ' + esc(v.folderPath) : ''}${res ? ' · ' + res : ''}</div>
      <ul class="reasons">${(v.reasons || []).map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
      ${v.manual ? `<span class="manual">Ajustado por você (sugestão: ${LABELS[v.autoStatus]}) · <a href="#" data-reset="${v.id}">voltar à sugestão</a></span>` : ''}
      <div class="controls">
        <select data-status="${v.id}">${options}</select>
        <label><input type="checkbox" data-captions="${v.id}" ${v.hasCaptions ? 'checked' : ''}/> já tem legenda</label>
      </div>
      <input class="note" data-note="${v.id}" placeholder="Observação" value="${esc(v.note)}" />
      ${editBlock(v)}
    </div>
  </article>`;
}

function editBlock(v) {
  const e = v.edit;
  const canEdit = !v.error && (v.status === 'bruto' || v.status === 'revisar' || e);
  if (!canEdit) return '';
  const busy = e && (e.state === 'na fila' || e.state === 'editando');
  const toneOpts = `<option value="auto">Tom automático</option>` +
    Object.entries(state.tones).map(([k, l]) => `<option value="${k}" ${(toneChoice[v.id] ?? e?.requestedTone) === k ? 'selected' : ''}>${esc(l)}</option>`).join('');
  let info = '';
  if (e) {
    const flags = (e.health?.flags || []).map((f) =>
      `<li class="${f.type === 'assinatura' ? 'flag-sign' : 'flag-review'}">${esc(f.label)}${f.trecho ? ` — “${esc(f.trecho)}”` : ''}</li>`).join('');
    info = `<div class="edit-status es-${e.state.replace(' ', '-')}">${EDIT_STATE[e.state] || e.state}${e.step ? ' · ' + esc(e.step) + '…' : ''}${e.state === 'pronto' ? ' · ' + esc(e.toneLabel) : ''}</div>
      ${e.state === 'erro' ? `<div class="edit-error">${esc(e.error)}</div>` : ''}
      ${e.state === 'pronto' ? `<div class="edit-links"><a href="#" data-watch="${v.id}">Assistir editado</a> · <a href="/api/output/${v.id}?download=1">Baixar</a></div>
        <div class="meta">Legenda: ${esc(e.captions)} · Música: ${e.music ? esc(e.music.split('/').pop()) : 'sem música'}</div>` : ''}
      ${flags ? `<ul class="flags">${flags}</ul>` : ''}`;
  }
  return `<div class="edit">
    ${info}
    <div class="controls">
      <select data-tone="${v.id}" ${busy ? 'disabled' : ''}>${toneOpts}</select>
      <button class="btn small" data-edit="${v.id}" ${busy ? 'disabled' : ''}>${e?.state === 'pronto' || e?.state === 'erro' ? 'Editar de novo' : 'Editar'}</button>
    </div>
  </div>`;
}

async function patch(id, body) {
  try {
    await api(`/api/videos/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
    await load();
  } catch (e) {
    showMsg(e.message);
  }
}

document.addEventListener('click', async (e) => {
  const f = e.target.closest('[data-f]');
  if (f) { filter = f.dataset.f; render(); return; }

  const play = e.target.closest('[data-play]');
  if (play) {
    $('playerVideo').src = `/api/video/${play.dataset.play}`;
    $('player').showModal();
    return;
  }

  const watch = e.target.closest('[data-watch]');
  if (watch) {
    e.preventDefault();
    $('playerVideo').src = `/api/output/${watch.dataset.watch}?t=${Date.now()}`;
    $('player').showModal();
    return;
  }

  const edit = e.target.closest('[data-edit]');
  if (edit) {
    const id = edit.dataset.edit;
    const tone = document.querySelector(`[data-tone="${id}"]`)?.value || 'auto';
    try {
      await api(`/api/videos/${id}/edit`, { method: 'POST', body: JSON.stringify({ tone }) });
      showMsg('Vídeo na fila de edição. Na primeira vez, o app baixa o modelo de transcrição (~240 MB) — pode levar alguns minutos.');
      load();
    } catch (err) { showMsg(err.message); }
    return;
  }

  const reset = e.target.closest('[data-reset]');
  if (reset) { e.preventDefault(); patch(reset.dataset.reset, { status: 'auto' }); }
});

document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.tone) { toneChoice[t.dataset.tone] = t.value; return; }
  if (t.dataset.status) patch(t.dataset.status, { status: t.value });
  if (t.dataset.captions) patch(t.dataset.captions, { hasCaptions: t.checked });
  if (t.dataset.note) patch(t.dataset.note, { note: t.value });
});

$('saveHandle').addEventListener('click', async () => {
  try {
    await api('/api/config', { method: 'POST', body: JSON.stringify({ handle: $('handle').value.trim() }) });
    showMsg('@ salvo. Ele aparece na marca d\'água e no card final dos próximos vídeos.');
    load();
  } catch (err) { showMsg(err.message); }
});

$('player').addEventListener('close', () => { $('playerVideo').pause(); $('playerVideo').removeAttribute('src'); });

$('localScan').addEventListener('click', async () => {
  showMsg('');
  try {
    await api('/api/scan/local', { method: 'POST', body: JSON.stringify({ folder: $('localFolder').value }) });
    load();
  } catch (err) { showMsg(err.message); }
});

$('driveImport').addEventListener('click', async () => {
  showMsg('');
  try {
    await api('/api/drive/import', { method: 'POST', body: JSON.stringify({ folder: $('driveFolder').value }) });
    load();
  } catch (err) { showMsg(err.message); }
});

if (location.search.includes('drive=ok')) {
  showMsg('Google Drive conectado (somente leitura). Agora cole o link da pasta e clique em Importar.');
  history.replaceState(null, '', '/');
}

load().catch((e) => showMsg(e.message));
