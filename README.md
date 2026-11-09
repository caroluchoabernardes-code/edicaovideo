# Excellence Video AI

Plataforma de edição automática de vídeos para profissionais de saúde (Reels, Shorts e TikTok).
Ela roda no seu Mac e é construída em etapas. A cada etapa, o trabalho para até você testar.

| Etapa | O que faz | Situação |
|---|---|---|
| **1. Importação e triagem** | Traz os vídeos do Google Drive (somente leitura) ou de uma pasta do Mac e separa em **pronto / bruto / revisar / duplicado** | ✅ Pronta para testar |
| 2. Edição dos brutos | Edita os vídeos brutos que você aprovar: legendas, tons, cortes e inserções visuais | ⏳ Próxima |
| 3. Painel de aprovação | Você aprova ou pede ajustes em cada vídeo editado | ⏳ |
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

## Estrutura do projeto

```
server.js            servidor local (http://localhost:3000)
src/triage.js        regras de triagem
src/media.js         leitura de vídeo (ffmpeg/ffprobe já vêm incluídos)
src/drive.js         Google Drive somente leitura
src/store.js         dados locais (pasta data/, fora do GitHub)
public/              painel (HTML, CSS e JS)
test/                testes das regras (npm test)
```

Arquivos pessoais **nunca vão para o GitHub**: `credentials.json`, `token.json`, os vídeos (`library/`) e os dados da triagem (`data/`) ficam listados no `.gitignore`.
