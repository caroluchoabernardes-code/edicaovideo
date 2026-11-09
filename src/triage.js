// Regras de triagem automática: pronto | bruto | revisar | duplicado.
// A triagem é uma sugestão — a Carol pode trocar o status de qualquer vídeo no painel,
// e a escolha manual nunca é sobrescrita por uma nova varredura.

const STATUSES = ['pronto', 'bruto', 'revisar', 'duplicado'];

// Palavras no nome que indicam vídeo já editado/finalizado.
const READY_NAME = /(final|editad[oa]|pront[oa]|postad[oa]|publicad[oa]|legendad[oa]|reels?[_\- ]?ok|aprovad[oa]|export)/i;
// Padrões de nome típicos de câmera de celular (arquivo original, sem edição).
const CAMERA_NAME = /^(img|vid|mvi|pxl|dsc|gopr|dji|movie|video)[_\- ]?\d/i;
// Apps de edição que costumam gravar o nome nos metadados do arquivo exportado.
const EDITOR_TAG = /(capcut|inshot|vn video|vllo|premiere|final cut|davinci|imovie|edits|canva|splice|kinemaster|lumafusion|captions)/i;
// Metadados de câmera (iPhone, Android) indicam arquivo original.
const CAMERA_TAG = /(apple|iphone|samsung|xiaomi|motorola|google|pixel|huawei|oneplus|gopro|dji)/i;

function tagText(tags = {}) {
  return Object.entries(tags)
    .filter(([k]) => /(encoder|software|handler|make|model|creation_tool|com\.apple\.quicktime\.(make|model|software))/.test(k))
    .map(([, v]) => v)
    .join(' | ');
}

// Decide o status sugerido de UM vídeo (sem olhar duplicados).
function classify(v) {
  const reasons = [];
  if (v.error) return { status: 'revisar', reasons: [v.error] };

  const name = v.name || '';
  const tags = tagText(v.tags);
  const vertical = v.height > v.width;
  const shortSide = Math.min(v.width || 0, v.height || 0);

  // Problemas que exigem olhar humano.
  const problems = [];
  if (v.durationSec < 3) problems.push('Muito curto (menos de 3 s)');
  if (!v.hasAudio) problems.push('Sem áudio');
  if (shortSide && shortSide < 720) problems.push(`Resolução baixa (${v.width}×${v.height})`);
  if (problems.length) return { status: 'revisar', reasons: problems };

  const readyByName = READY_NAME.test(name);
  const editorMatch = tags.match(EDITOR_TAG);
  const cameraByName = CAMERA_NAME.test(name);
  const cameraByTag = CAMERA_TAG.test(tags);

  if (readyByName || editorMatch) {
    if (readyByName) reasons.push('Nome indica vídeo finalizado');
    if (editorMatch) reasons.push(`Exportado por app de edição (${editorMatch[0]})`);
    if (!vertical) reasons.push('Atenção: horizontal — Reels pede 9:16');
    if (v.durationSec > 180) reasons.push('Atenção: mais de 3 min para Reels');
    return { status: 'pronto', reasons };
  }

  if (cameraByName || cameraByTag) {
    if (cameraByTag) reasons.push('Arquivo original da câmera do celular');
    else reasons.push('Nome típico de câmera (sem edição)');
    if (!vertical) reasons.push('Horizontal — vai precisar de recorte 9:16');
    if (v.durationSec > 180) reasons.push('Longo — bom para gerar vários cortes');
    return { status: 'bruto', reasons };
  }

  return { status: 'revisar', reasons: ['Não deu para saber se já foi editado'] };
}

// Aplica a triagem na lista inteira, marcando duplicados.
// O primeiro vídeo encontrado fica com o status normal; as cópias viram "duplicado".
function triageAll(videos) {
  const byHash = new Map();
  const kept = [];
  const sorted = [...videos].sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));

  for (const v of sorted) {
    let dupOf = null;
    if (v.hash && byHash.has(v.hash)) {
      dupOf = byHash.get(v.hash);
    } else if (!v.error) {
      // Quase idêntico: mesma duração (±0,2 s), mesma resolução e tamanho até 2% diferente.
      dupOf = kept.find(
        (k) =>
          !k.error &&
          Math.abs(k.durationSec - v.durationSec) <= 0.2 &&
          k.width === v.width &&
          k.height === v.height &&
          Math.abs(k.size - v.size) / Math.max(k.size, v.size) <= 0.02
      );
    }

    let auto;
    if (dupOf) {
      const exact = dupOf.hash === v.hash;
      auto = {
        status: 'duplicado',
        reasons: [`${exact ? 'Cópia idêntica' : 'Provável cópia'} de “${dupOf.name}”`],
        duplicateOf: dupOf.id,
      };
    } else {
      auto = { ...classify(v), duplicateOf: null };
      if (v.hash) byHash.set(v.hash, v);
      kept.push(v);
    }

    v.autoStatus = auto.status;
    v.reasons = auto.reasons;
    v.duplicateOf = auto.duplicateOf;
    if (!v.manual) v.status = auto.status;
  }
  return videos;
}

module.exports = { classify, triageAll, STATUSES };
