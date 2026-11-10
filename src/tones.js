// Os 6 tons de edição. Cada tom define legenda, zoom, cor, música e efeitos.
// Cores no formato ASS: &HAABBGGRR (AA = transparência, 00 = opaco).

const TONES = {
  educativo: {
    label: 'Educativo',
    caption: {
      mode: 'pill', // faixa branca estilo karaokê (como o Reel de referência)
      upper: false,
      maxWords: 4,
      text: '&H00111111',
      box: '&H00FFFFFF',
      active: '&H005F3A1F', // azul Excellence
      size: 72,
    },
    zoom: { every: 2, amount: 0.06 },
    grade: { contrast: 1.04, saturation: 1.05 },
    music: { volume: 0.10 },
    sfx: { pop: true, whoosh: false },
    memes: false,
  },
  descontraido: {
    label: 'Descontraído',
    caption: {
      mode: 'outline',
      upper: true,
      maxWords: 3,
      text: '&H00FFFFFF',
      outline: '&H00000000',
      active: '&H0000E5FF', // amarelo
      size: 74,
    },
    zoom: { every: 1, amount: 0.08 },
    grade: { contrast: 1.06, saturation: 1.22 },
    music: { volume: 0.14 },
    sfx: { pop: true, whoosh: true },
    memes: true,
  },
  receita: {
    label: 'Receita',
    caption: {
      mode: 'outline',
      upper: true,
      maxWords: 3,
      text: '&H00FFFFFF',
      outline: '&H00000000',
      active: '&H00199BFF', // laranja
      size: 72,
    },
    zoom: { every: 2, amount: 0.07 },
    grade: { contrast: 1.05, saturation: 1.25, warm: true },
    music: { volume: 0.13 },
    sfx: { pop: true, whoosh: true },
    memes: true,
    steps: 'PASSO',
  },
  treino: {
    label: 'Treino',
    caption: {
      mode: 'outline',
      upper: true,
      maxWords: 2,
      text: '&H00FFFFFF',
      outline: '&H00000000',
      active: '&H0000FFB4', // verde-limão
      size: 84,
    },
    zoom: { every: 1, amount: 0.12 },
    grade: { contrast: 1.12, saturation: 1.15 },
    music: { volume: 0.18 },
    sfx: { pop: true, whoosh: true },
    memes: false,
  },
  'reflexao-fe': {
    label: 'Reflexão e fé',
    caption: {
      mode: 'soft', // texto branco elegante com sombra, sem caixa
      upper: false,
      maxWords: 4,
      text: '&H00FFFFFF',
      outline: '&H80000000',
      active: '&H0071C3E8', // dourado suave
      size: 64,
    },
    zoom: { slow: 0.08 }, // aproximação lenta e contínua
    grade: { contrast: 1.0, saturation: 0.95, warm: true },
    music: { volume: 0.12 },
    sfx: { pop: false, whoosh: false },
    memes: false,
  },
  humor: {
    label: 'Humor',
    caption: {
      mode: 'outline',
      upper: true,
      maxWords: 3,
      text: '&H00FFFFFF',
      outline: '&H00000000',
      active: '&H00FF60FF', // rosa
      size: 80,
    },
    zoom: { every: 1, amount: 0.15 },
    grade: { contrast: 1.08, saturation: 1.3 },
    music: { volume: 0.14 },
    sfx: { pop: true, whoosh: true },
    memes: true,
  },
};

// Palavras que indicam o tom quando a escolha é "automático".
const TONE_HINTS = {
  receita: /\b(receita|ingredientes?|colher(es)?|x[ií]caras?|forno|airfryer|air fryer|misture|misturar|liquidificador|panela|frigideira|assar|cozinha|massa|bolo|panqueca|recheio)\b/gi,
  treino: /\b(treino|treinar|academia|s[eé]ries?|repeti[cç](ão|ões)|agachamento|muscula[cç]ão|exerc[ií]cios?|cardio|hipertrofia|gl[uú]teos?|aquecimento)\b/gi,
  'reflexao-fe': /\b(deus|f[eé]|gratid[ãa]o|grata|ora[cç][ãa]o|senhor|jesus|prop[oó]sito|b[eê]n[cç][ãa]o|aben[cç]oad[oa]|milagre|espiritual)\b/gi,
  humor: /\b(k{3,}|(ha){2,}|rsrs|piada|brincadeira|zoeira|mico|engra[cç]ad[oa])\b/gi,
  educativo: /\b(microbiota|intestin\w*|estudos?|nutrientes?|prote[ií]nas?|fibras?|inflama\w*|horm[oô]ni\w*|metabolismo|glicemia|insulina|vitaminas?|minerais?|disbiose|probi[oó]ticos?|emagrec\w*)\b/gi,
};

function detectTone(text, name = '') {
  const src = `${name} ${text}`;
  let best = 'descontraido';
  let bestScore = 0;
  for (const [tone, re] of Object.entries(TONE_HINTS)) {
    const score = (src.match(re) || []).length;
    if (score > bestScore) {
      best = tone;
      bestScore = score;
    }
  }
  return best;
}

module.exports = { TONES, detectTone };
