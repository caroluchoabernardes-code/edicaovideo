// Monta o arquivo de legendas/grafismos (formato ASS) e a lista de momentos
// para zoom e efeitos sonoros, a partir das palavras transcritas.

const W = 1080;
const H = 1920;

// Palavras que geram um "selo" no topo da tela (inserção visual contextual).
const KEYWORD_CHIPS = [
  [/^microbiota/i, 'MICROBIOTA'],
  [/^intestin/i, 'INTESTINO'],
  [/^disbiose/i, 'DISBIOSE'],
  [/^probi[oó]tic/i, 'PROBIÓTICOS'],
  [/^fibras?$/i, 'FIBRAS'],
  [/^prote[ií]na/i, 'PROTEÍNA'],
  [/^inflama/i, 'INFLAMAÇÃO'],
  [/^glicemia|^insulina/i, 'GLICEMIA'],
  [/^metabolismo/i, 'METABOLISMO'],
  [/^horm[oô]ni/i, 'HORMÔNIOS'],
  [/^sono$|^dormir$|^durma$/i, 'SONO'],
  [/^[aá]gua$|^hidrata/i, 'HIDRATAÇÃO'],
  [/^energia$/i, 'ENERGIA'],
  [/^humor$/i, 'HUMOR'],
  [/^emagrec/i, 'EMAGRECIMENTO'],
];

const ORDINALS = {
  primeiro: 1, primeira: 1, segundo: 2, segunda: 2, terceiro: 3, terceira: 3,
  quarto: 4, quarta: 4, quinto: 5, quinta: 5,
};

// Figurinhas estilo meme (só nos tons descontraído, receita e humor).
const MEMES = [
  [/^(k{3,}|(ha){2,}h?|rsrs\w*)$/i, 'KKKKK'],
  [/^(incr[ií]vel|maravilhos[oa]|perfeit[oa]|del[ií]cia|delicios[oa])$/i, 'UAU!'],
  [/^(nunca|jamais)$/i, 'NUNCA!'],
  [/^(cuidado|aten[cç][aã]o)$/i, 'ATENÇÃO!'],
  [/^(segredo)$/i, 'SEGREDO!'],
];

const clean = (w) => w.replace(/[.,!?;:"“”()…]/g, '').toLowerCase();
const assEsc = (s) => s.replace(/\\/g, '').replace(/[{}]/g, '');

function ts(sec) {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const cs = Math.round((s - Math.floor(s)) * 100);
  const ss = Math.floor(s % 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}.${String(Math.min(cs, 99)).padStart(2, '0')}`;
}

// Agrupa palavras em frases curtas (respeitando pontuação e pausas).
function phrases(words, maxWords, maxChars = 24) {
  const out = [];
  let cur = [];
  const flush = () => {
    if (cur.length) out.push(cur);
    cur = [];
  };
  words.forEach((w, i) => {
    const prev = words[i - 1];
    if (cur.length && prev && w.start - prev.end > 0.6) flush();
    const len = cur.reduce((n, x) => n + x.w.length + 1, 0) + w.w.length;
    if (cur.length && (cur.length >= maxWords || len > maxChars)) flush();
    cur.push(w);
    if (/[.!?]$/.test(w.w)) flush();
  });
  flush();
  return out.map((ws) => ({ words: ws, start: ws[0].start, end: ws[ws.length - 1].end }));
}

function build({ words, tone, duration, handle, hasCaptions, endCard = 2.5 }) {
  const c = tone.caption;
  const fs = c.size;
  const styles = [];
  if (c.mode === 'pill') {
    styles.push(`Style: Cap,Poppins,${fs},${c.text},${c.text},${c.box},${c.box},-1,0,0,0,100,100,0,0,3,16,0,2,80,80,560,1`);
  } else if (c.mode === 'soft') {
    styles.push(`Style: Cap,Poppins,${fs},${c.text},${c.text},${c.outline},&H64000000,-1,0,0,0,100,100,0,0,1,2,4,2,80,80,560,1`);
  } else {
    styles.push(`Style: Cap,Poppins,${fs},${c.text},${c.text},${c.outline},&H80000000,-1,0,0,0,100,100,0,0,1,7,3,2,70,70,560,1`);
  }
  styles.push('Style: Chip,Poppins,46,&H00FFFFFF,&H00FFFFFF,&H00578DB0,&H00578DB0,-1,0,0,0,100,100,2,0,3,18,0,8,80,80,330,1');
  styles.push('Style: Step,Poppins,58,&H005F3A1F,&H005F3A1F,&H00FFFFFF,&H00FFFFFF,-1,0,0,0,100,100,1,0,3,18,0,8,70,70,215,1');
  styles.push('Style: Meme,Poppins,110,&H0000E5FF,&H0000E5FF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,9,0,5,40,40,40,1');
  styles.push('Style: Mark,Poppins,38,&H55FFFFFF,&H55FFFFFF,&H80000000,&H80000000,0,0,0,0,100,100,0,0,1,1,1,9,50,50,140,1');
  styles.push('Style: End,Poppins,72,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,0,2,5,60,60,0,1');
  styles.push('Style: EndSmall,Poppins,44,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,2,5,60,60,0,1');
  styles.push('Style: Box,Poppins,10,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1');

  const ev = [];
  // Tudo que é do conteúdo termina antes do card final (só o card usa o tempo extra).
  const add = (start, end, style, text, layer = 0, allowEnd = false) => {
    const e = allowEnd ? end : Math.min(end, duration);
    if (e - start < 0.05) return;
    ev.push(`Dialogue: ${layer},${ts(start)},${ts(e)},${style},,0,0,0,,${text}`);
  };

  const zooms = [];
  const pops = [];
  const whooshes = [];
  const ph = phrases(words, c.maxWords);

  // Legendas karaokê: a frase inteira aparece e a palavra falada fica destacada.
  ph.forEach((p, pi) => {
    const next = ph[pi + 1];
    const phraseEnd = Math.min(next ? next.start : p.end + 0.4, p.end + 0.4);
    if (tone.zoom.every && pi % tone.zoom.every === 0) zooms.push({ s: p.start, e: phraseEnd });
    if (hasCaptions) return;
    p.words.forEach((w, wi) => {
      const s = wi === 0 ? p.start : w.start;
      const e = wi === p.words.length - 1 ? phraseEnd : p.words[wi + 1].start;
      if (e <= s) return;
      const parts = p.words.map((x, xi) => {
        const t = assEsc(c.upper ? x.w.toUpperCase() : x.w);
        return xi === wi ? `{\\c${c.active}\\3c${c.mode === 'pill' ? c.box : c.outline || c.active}}${t}{\\r}` : t;
      });
      const pop = wi === 0 ? '{\\fscx85\\fscy85\\t(0,90,\\fscx100\\fscy100)}' : '';
      add(s, e, 'Cap', pop + parts.join(' '), 1);
    });
  });

  // Selos de palavra-chave, passos numerados e figurinhas.
  const lastChip = {};
  let chipBusyUntil = 0;
  let stepCount = 0;
  words.forEach((w, i) => {
    const k = clean(w.w);
    for (const [re, label] of KEYWORD_CHIPS) {
      if (re.test(k) && w.start >= chipBusyUntil && (lastChip[label] === undefined || w.start - lastChip[label] > 8)) {
        lastChip[label] = w.start;
        chipBusyUntil = w.start + 1.9;
        add(w.start, w.start + 1.8, 'Chip', `{\\fad(80,150)\\fscx70\\fscy70\\t(0,120,\\fscx100\\fscy100)}${label}`, 2);
        if (tone.sfx.pop) pops.push(w.start);
        break;
      }
    }
    if (ORDINALS[k] && (i === 0 || /[.!?,]$/.test(words[i - 1].w) || words[i - 1].end < w.start - 0.25)) {
      const n = ORDINALS[k];
      if (n === stepCount + 1) {
        stepCount = n;
        const next = words.slice(i + 1).find((x) => ORDINALS[clean(x.w)] === n + 1);
        const end = Math.min(next ? next.start : w.start + 4, w.start + 6);
        add(w.start, end, 'Step', `{\\fad(100,150)}${tone.steps || 'DICA'} ${n}`, 2);
        if (tone.sfx.pop) pops.push(w.start);
        if (tone.sfx.whoosh) whooshes.push(Math.max(0, w.start - 0.15));
      }
    }
    if (tone.memes) {
      for (const [re, label] of MEMES) {
        if (re.test(k)) {
          const rot = i % 2 ? -8 : 7;
          const y = 760 + (i % 3) * 60;
          add(w.start, w.start + 1.2, 'Meme', `{\\pos(${W / 2},${y})\\frz${rot}\\fscx40\\fscy40\\t(0,110,\\fscx115\\fscy115)\\t(110,200,\\fscx100\\fscy100)\\fad(0,120)}${label}`, 3);
          pops.push(w.start);
          zooms.push({ s: w.start, e: w.start + 0.6, strong: true });
          break;
        }
      }
    }
  });

  if (tone.sfx.whoosh) zooms.filter((z, i) => i % 3 === 0).forEach((z) => whooshes.push(Math.max(0, z.s - 0.12)));

  // Marca d'água e card final.
  const total = duration + endCard;
  if (handle) add(0, duration, 'Mark', handle, 4);
  const box = `{\\p1\\pos(0,0)\\1c&H000000&\\1a&H50&\\fad(250,0)}m 0 0 l ${W} 0 ${W} ${H} 0 ${H}{\\p0}`;
  add(duration, total, 'Box', box, 5, true);
  add(duration, total, 'EndSmall', `{\\pos(${W / 2},${H / 2 - 120})\\fad(250,0)}Gostou? Então...`, 6, true);
  add(duration, total, 'End', `{\\pos(${W / 2},${H / 2})\\fad(250,0)\\fscx80\\fscy80\\t(0,200,\\fscx100\\fscy100)}Siga ${handle || ''}`, 6, true);
  add(duration, total, 'EndSmall', `{\\pos(${W / 2},${H / 2 + 120})\\fad(400,0)}Salve e compartilhe com quem precisa`, 6, true);
  pops.push(duration);

  const ass = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${W}`,
    `PlayResY: ${H}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    ...styles,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...ev,
    '',
  ].join('\n');

  return { ass, zooms, pops: [...new Set(pops)].sort((a, b) => a - b), whooshes: [...new Set(whooshes)].sort((a, b) => a - b), phrases: ph.length };
}

module.exports = { build, phrases };
