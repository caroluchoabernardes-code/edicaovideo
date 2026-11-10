// Testes das regras da Etapa 2 (sem renderizar vídeo): node test/edicao.test.js
const assert = require('assert');
const { build, phrases } = require('../src/captions');
const { TONES, detectTone } = require('../src/tones');
const { checkHealth } = require('../src/health');

const mk = (text, gap = 0.4) => {
  let t = 0;
  return text.split(' ').map((w) => {
    const o = { w, start: t, end: t + gap - 0.05 };
    t += gap;
    return o;
  });
};

// Frases curtas para karaokê
const ph = phrases(mk('Você sabia que a sua microbiota intestinal influencia o seu humor?'), 3);
assert.ok(ph.every((p) => p.words.length <= 3));

// Tom automático
assert.strictEqual(detectTone('hoje a receita leva duas colheres de aveia e vai ao forno'), 'receita');
assert.strictEqual(detectTone('treino de glúteos com agachamento, três séries'), 'treino');
assert.strictEqual(detectTone('gratidão a Deus por mais um dia'), 'reflexao-fe');
assert.strictEqual(detectTone('a microbiota e o intestino controlam a inflamação'), 'educativo');
assert.strictEqual(detectTone('bom dia, vem comigo no mercado'), 'descontraido');

// Legendas, selos, passos e figurinhas
const words = mk('Primeiro, coma fibras. Segundo, cuidado com o açúcar kkkk. Terceiro, durma bem.');
const dur = words[words.length - 1].end + 0.3;
const humor = build({ words, tone: TONES.humor, duration: dur, handle: '@nutricaroluchoa', hasCaptions: false });
assert.ok(humor.ass.includes('DICA 1') && humor.ass.includes('DICA 3'));
assert.ok(humor.ass.includes('FIBRAS'));
assert.ok(humor.ass.includes('KKKKK') && humor.ass.includes('ATENÇÃO!'));
assert.ok(humor.ass.includes('Siga @nutricaroluchoa'));
assert.ok(humor.ass.includes(',Cap,'));

const receita = build({ words, tone: TONES.receita, duration: dur, handle: '', hasCaptions: false });
assert.ok(receita.ass.includes('PASSO 2'));

// Vídeo que já tem legenda: nada de legenda por cima, mas mantém zoom e card final
const semLeg = build({ words, tone: TONES.educativo, duration: dur, handle: '@x', hasCaptions: true });
assert.ok(!semLeg.ass.includes(',Cap,'));
assert.ok(semLeg.zooms.length > 0);
assert.ok(semLeg.ass.includes('Siga @x'));

// Nada do conteúdo invade o card final
const endTs = (s) => { const [h, m, x] = s.split(':'); return +h * 3600 + +m * 60 + +x; };
for (const line of humor.ass.split('\n').filter((l) => l.startsWith('Dialogue') && !/,(Box|End|EndSmall),/.test(l))) {
  assert.ok(endTs(line.split(',')[2]) <= dur + 0.01, 'evento passa do fim: ' + line);
}

// Regras de saúde
assert.ok(checkHealth('minha paciente perdeu 10 kg em dois meses').needsReview);
assert.ok(checkHealth('antes e depois da Ana').flags.some((f) => f.label === 'Antes e depois'));
const med = checkHealth('a tirzepatida e a caneta ajudam');
assert.ok(med.needsSignature);
assert.ok(!checkHealth('três dicas para cuidar do intestino').needsReview);

console.log('Edição: todos os testes passaram ✔');
