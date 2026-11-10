// Regras de conteúdo de saúde. Os alertas aparecem no painel e, na Etapa 3,
// impedem a aprovação até a revisão (e a assinatura do Dr. Fernando, quando exigida).

const REVIEW = [
  [/\bpacientes?\b/i, 'Menciona paciente'],
  [/\bantes e depois\b/i, 'Antes e depois'],
  [/\b(perdi|perdeu|eliminei|eliminou|emagreci|emagreceu|secou|sequei)\b[^.?!]{0,30}\b(\d+|um|dois|três|quatro|cinco|dez|vinte)\s*(kg|quilos?|cm)\b/i, 'Foco em peso perdido'],
  [/\b(\d+)\s*(kg|quilos?)\b/i, 'Cita quilos'],
  [/\b(garant\w+|100\s?%|cura|curou|definitiv[oa]|milagros\w+|sem esfor[cç]o)\b/i, 'Promessa de resultado'],
];

const SIGNATURE = [
  /\b(ozempic|wegovy|mounjaro|zepbound|saxenda|victoza|rybelsus)\b/i,
  /\b(tirzepatida|semaglutida|retatrutida|liraglutida|dulaglutida)\b/i,
  /\b(canetas?|canetinhas?)\b/i,
  /\b(horm[oô]ni\w*|testosterona|gestrinona|oxandrolona|estradiol|progesterona|implantes? hormon\w*)\b/i,
  /\b(sermorelin\w*|bpc[\s-]?157|ghk[\s-]?cu|pept[ií]deos?)\b/i,
  /\b(rem[eé]dios?|medicamentos?|medica[cç](ão|ões)|inje[cç](ão|ões)|injet[aá]ve(l|is)|dose|dosagem)\b/i,
];

function checkHealth(text) {
  const flags = [];
  for (const [re, label] of REVIEW) {
    const m = text.match(re);
    if (m) flags.push({ type: 'revisao', label, trecho: m[0] });
  }
  if (flags.some((f) => f.label === 'Foco em peso perdido')) {
    const i = flags.findIndex((f) => f.label === 'Cita quilos');
    if (i >= 0) flags.splice(i, 1);
  }
  const meds = [];
  for (const re of SIGNATURE) {
    const m = text.match(re);
    if (m) meds.push(m[0]);
  }
  if (meds.length) {
    flags.push({ type: 'assinatura', label: 'Medicamento, caneta ou hormônio: precisa da assinatura do Dr. Fernando', trecho: [...new Set(meds)].join(', ') });
  }
  return {
    flags,
    needsReview: flags.length > 0,
    needsSignature: meds.length > 0,
  };
}

module.exports = { checkHealth };
