# Excellence Video AI

Plataforma de edição automática de vídeos para profissionais de saúde (Reels, Shorts e TikTok).
Ela roda no seu Mac e é construída em etapas. A cada etapa, o trabalho para até você testar.

| Etapa | O que faz | Situação |
|---|---|---|
| **1. Importação e triagem** | Traz os vídeos do Google Drive (somente leitura) ou de uma pasta do Mac e separa em **pronto / bruto / revisar / duplicado** | ✅ Aprovada |
| **2. Edição dos brutos** | Edita os vídeos que você mandar editar: legenda karaokê, 6 tons, zooms, correção de luz, música, efeitos, @ e card final | ✅ Pronta para testar |
| 3. Painel de aprovação | Você aprova, corrige a legenda ou pede ajustes em cada vídeo editado. Os alertas de saúde travam a aprovação | ⏳ Próxima |
| 4. Saída no YouTube | Envia sempre como **privado**. Nada é publicado sem a sua aprovação | ⏳ |

---

## Como rodar no seu Mac (só na primeira vez)

1. **Instale o Node.js**: baixe a versão "LTS" em https://nodejs.org e instale normalmente.
2. **Baixe este projeto**: aqui no GitHub, clique no botão verde **Code** e depois em **Download ZIP**. Descompacte o arquivo (por exemplo, na pasta Documentos).
3. **Abra o Terminal**: aperte ⌘ + Espaço, digite *Terminal* e dê Enter.
4. No Terminal, digite `cd ` (com um espaço no final), arraste a pasta descompactada para dentro da janela do Terminal e aperte Enter.
5. Rode estes dois comandos, um de cada vez:

```bash
npm install
npm start
```

6. Abra **http://localhost:3000** no navegador.

Nas próximas vezes, basta repetir os passos 3 e 4 e rodar só `npm start`.
Para desligar o app, clique no Terminal e aperte **Control + C**.

---

## Duas formas de trazer os vídeos

### A) Pasta do Mac (mais simples, não precisa configurar nada)
Se você usa o **Google Drive para computador**, seus vídeos do Drive já aparecem no Finder.
No app, em **Pasta do Mac**, cole o caminho da pasta e clique em **Analisar**.
O caminho costuma ser parecido com `/Users/seu-nome/Library/CloudStorage/GoogleDrive-seu-email/Meu Drive/Videos`.

> Uma forma fácil de pegar o caminho: no Finder, clique com o botão direito na pasta, segure a tecla **Option** e escolha **Copiar "…" como Nome do Caminho**.

O app **só lê** os vídeos. Ele nunca altera, move nem apaga nada nessa pasta.

### B) Google Drive direto (somente leitura)
Essa forma precisa de uma configuração única no Google Cloud:

1. Acesse https://console.cloud.google.com, crie um projeto (ex.: "Excellence Video AI") e ative a **Google Drive API**.
2. Em **APIs e serviços → Tela de consentimento OAuth**, escolha "Externo" e adicione o seu e-mail como **usuário de teste**.
3. Em **Credenciais → Criar credenciais → ID do cliente OAuth**, escolha o tipo **Aplicativo da Web** e, em **URIs de redirecionamento autorizados**, coloque `http://localhost:3000/oauth2callback`.
4. Baixe o JSON gerado, renomeie para **`credentials.json`** e coloque na pasta do projeto.
5. Reinicie o app (`Control + C` e depois `npm start`), clique em **Conectar Google Drive**, cole o link da pasta e clique em **Importar**.

O app pede apenas a permissão `drive.readonly`. Ele baixa **cópias** dos vídeos para a pasta `library/`, no seu Mac, e não mexe em nada no Drive.

---

## Como funciona a triagem

| Status | Quando acontece |
|---|---|
| **Pronto** | O nome indica que o vídeo já está finalizado (*final, editado, pronto, postado, legendado, aprovado…*) ou ele foi exportado por um app de edição (CapCut, InShot, Edits, VN, Canva…) |
| **Bruto** | É o arquivo original da câmera do celular (metadados de iPhone/Android ou nomes como `IMG_1234`, `VID_…`, `PXL_…`) |
| **Revisar** | O arquivo está ilegível, tem menos de 3 s, não tem áudio, tem resolução baixa ou não deu para saber se já foi editado |
| **Duplicado** | É uma cópia idêntica (mesmo conteúdo, mesmo com outro nome) ou quase idêntica (mesma duração, resolução e tamanho) de outro vídeo |

- A triagem é uma **sugestão**. Você pode trocar o status de qualquer vídeo no painel, e uma nova análise **nunca apaga** essa escolha.
- Marque **"já tem legenda"** nos vídeos que já têm legenda. Na Etapa 2, esses vídeos **não recebem legenda nova**: entram só música, efeitos, memes, zooms e correção de luz.
- O botão **Exportar planilha** gera um CSV que abre no Excel ou no Numbers.

---

## Etapa 2: como editar um vídeo

1. No painel, os vídeos **brutos** (e os de **revisar**) mostram o botão **Editar**.
2. Escolha o tom ou deixe em **Tom automático**. No automático, o app ouve a fala e escolhe sozinho.
3. Clique em **Editar**. O vídeo entra na fila e o card mostra o andamento.
4. Quando terminar, clique em **Assistir editado** ou **Baixar**. O arquivo também fica salvo na pasta `output/`.

> Na **primeira** edição, o app baixa o modelo de transcrição (cerca de 240 MB). Isso acontece uma vez só. A transcrição roda **no seu Mac**: o áudio dos vídeos não é enviado para nenhum serviço.

### O que o app faz em cada vídeo

- **Formato 9:16 (1080×1920)**: vídeo horizontal ganha fundo desfocado, sem cortar o conteúdo.
- **Legenda karaokê**: a frase aparece e a palavra que você está falando fica destacada.
- **Vídeo que já tem legenda** (com "já tem legenda" marcado): **não recebe legenda nova**. Ganha só zoom, correção de luz, música, efeitos e card final.
- **Selos de palavra-chave** no topo da tela quando você fala de microbiota, intestino, fibras, proteína, inflamação, sono, hidratação e outros temas.
- **Passos numerados** ("DICA 1", ou "PASSO 1" nas receitas) quando você diz *primeiro, segundo, terceiro…*
- **Zooms no ritmo da fala** (estilo CapCut) e **correção automática de luz** em vídeos escuros ou estourados.
- **Música de fundo** que abaixa sozinha quando você fala (veja `music/LEIA-ME.md`) e **efeitos sonoros** (pop e whoosh), gerados pelo próprio app, sem direitos de terceiros.
- **@ como marca d'água** e **card final** com "Siga @…" (você muda o @ no painel).

### Os 6 tons

| Tom | Estilo |
|---|---|
| **Educativo** | Faixa branca com texto escuro e palavra destacada em azul, zoom suave, poucos efeitos |
| **Descontraído** | Texto em caixa alta com contorno, destaque amarelo, cores vivas, figurinhas estilo meme |
| **Receita** | Cores quentes, destaque laranja, "PASSO 1, 2, 3", figurinhas |
| **Treino** | Contraste alto, zooms fortes e rápidos, destaque verde-limão, música mais alta |
| **Reflexão e fé** | Texto elegante sem caixa, destaque dourado, aproximação lenta e contínua, sem efeitos sonoros |
| **Humor** | Estilo meme: caixa alta, zooms de impacto, destaque rosa, figurinhas como "KKKKK" e "UAU!" |

### Regras de conteúdo de saúde

O app lê a transcrição e mostra alertas no card do vídeo:

- 🟠 **Revisão obrigatória**: menção a paciente, antes e depois, foco em quilos perdidos ou promessa de resultado (*garantido, 100%, cura…*).
- 🔴 **Assinatura do Dr. Fernando**: menção a medicamentos, canetas emagrecedoras, hormônios ou peptídeos.

Na Etapa 3, esses alertas **impedem a aprovação** até a revisão ser feita (e a assinatura dada, quando exigida).

### Ainda não está nesta etapa

- **Inserções visuais com imagens** (por exemplo, a ilustração do intestino quando você fala de microbiota). Por enquanto, o app mostra selos de texto no lugar delas.
- **Grafismos de colagem e papel rasgado** do Reel de referência.
- **Referências científicas** na tela. Elas só entram depois que existir uma fonte verificada para cada uma: o app **nunca** inventa referência.
- **Correção da legenda** antes de renderizar. Ela entra no painel de aprovação da Etapa 3.

## Estrutura do projeto

```
server.js            servidor local (http://localhost:3000)
src/triage.js        regras de triagem
src/media.js         leitura de vídeo (ffmpeg/ffprobe já vêm incluídos)
src/drive.js         Google Drive somente leitura
src/store.js         dados locais (pasta data/, fora do GitHub)
src/transcribe.js    transcrição local (Whisper)
src/tones.js         os 6 tons de edição
src/captions.js      legenda karaokê, selos, passos, figurinhas, @ e card final
src/editor.js        motor de edição (zoom, luz, cor, música, efeitos, render)
src/health.js        alertas de conteúdo de saúde
fonts/               fonte Poppins (licença livre OFL)
music/               suas músicas por tom (ficam fora do GitHub)
public/              painel (HTML, CSS e JS)
test/                testes das regras (npm test)
```

Arquivos pessoais **nunca vão para o GitHub**: `credentials.json`, `token.json`, os vídeos (`library/`), os vídeos editados (`output/`), as músicas e os dados da triagem (`data/`) ficam listados no `.gitignore`.

> **Já baixou a Etapa 1?** Baixe o ZIP de novo, substitua a pasta e rode `npm install` mais uma vez (a Etapa 2 traz um componente novo, o de transcrição).
> Para não perder a triagem que você já fez, copie antes a pasta `data/` da versão antiga para a nova.
