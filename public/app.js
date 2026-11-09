// Painel de triagem — Excellence Video AI (Etapa 1)
const $ = (id) => document.getElementById(id);
const LABELS = { todos: 'Todos', pronto: 'Pronto', bruto: 'Bruto', revisar: 'Revisar', duplicado: 'Duplicado' };
const COLORS = { pronto: 'var(--pronto)', bruto: 'var(--bruto)', revisar: 'var(--revisar)', duplicado: 'var(--duplicado)' };

let state = null;
let filter = 'todos';
let pollTimer = null;
let wasRunning = false;

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
  const running = state.job.running;
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

  const all = { todos: total, ...counts };
  $('filters').innerHTML = Object.keys(LABELS)
    .map((k) => `<button class="chip ${filter === k ? 'active' : ''}" data-f="${k}">
      ${COLORS[k] ? `<span class="dot" style="background:${COLORS[k]}"></span>` : ''}${LABELS[k]} · ${all[k] || 0}</button>`)
    .join('');

  const list = filter === 'todos' ? videos : videos.filter((v) => v.status === filter);
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
    </div>
  </article>`;
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

  const reset = e.target.closest('[data-reset]');
  if (reset) { e.preventDefault(); patch(reset.dataset.reset, { status: 'auto' }); }
});

document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset.status) patch(t.dataset.status, { status: t.value });
  if (t.dataset.captions) patch(t.dataset.captions, { hasCaptions: t.checked });
  if (t.dataset.note) patch(t.dataset.note, { note: t.value });
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
