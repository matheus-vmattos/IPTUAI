# IPTUAI

Assistente para lançamento de guias de IPTU. Você sobe o PDF do carnê, o sistema
tenta extrair automaticamente as parcelas (número, valor, vencimento), você
revisa/confirma, escolhe se é parcela única ou parcelado e se é pago pela
imobiliária ou repassado, e associa tudo a um código de identificação do imóvel
(ex: `I 213`). Depois é possível consultar por esse código, ver qual parcela
está vencendo, o valor, marcar como paga e imprimir o arquivo original.

## Arquitetura

- **`backend/`** — API em Node.js/Express + SQLite. Guarda usuários, imóveis,
  lançamentos de IPTU e parcelas, e os arquivos PDF enviados. É o servidor
  central que todos os usuários (multiusuário) acessam.
- **`frontend/`** — Aplicativo desktop em Electron + React, com build via
  `electron-builder` e atualização automática via `electron-updater` (usando
  GitHub Releases deste repositório).

## Rodando em desenvolvimento

### 1. Backend

**Windows (mais simples):** dentro da pasta `backend`, dê duplo-clique em
`iniciar-servidor.bat`. Ele instala tudo automaticamente na primeira vez e
sobe o servidor. Precisa ter o [Node.js](https://nodejs.org) instalado
(baixe a versão LTS). Deixe essa janela aberta enquanto for usar o app.

**Linha de comando (Mac/Linux/Windows):**
```bash
cd backend
npm install
cp .env.example .env   # ajuste JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
npm run dev
```

O servidor sobe em `http://localhost:4000`. Na primeira execução, um usuário
administrador é criado automaticamente com o email/senha definidos em `.env`
(padrão: `admin@iptuai.local` / `troque-esta-senha` — a mensagem com essas
credenciais também aparece no terminal ao iniciar). Troque a senha em `.env`
antes de usar de verdade.

### 2. Frontend (app desktop)

```bash
cd frontend
npm install
npm run dev
```

Isso sobe o Vite (renderer) e abre a janela do Electron apontando para ele.
Na tela de login, informe o endereço do backend (`http://localhost:4000` em
desenvolvimento, ou o endereço do servidor real em produção) e as credenciais.

## Fluxo de uso

1. **Lançar IPTU**: envie o PDF do carnê. O sistema tenta extrair as parcelas
   automaticamente (número, valor, vencimento) — esse é um ponto de partida:
   revise e corrija os valores antes de confirmar.
2. Escolha **parcela única ou parcelado**.
3. Escolha se é pago **pela imobiliária ou repassado**.
4. Informe o **código de identificação** do imóvel (ex: `I 213`). Se o código
   já existir, o novo lançamento é associado ao mesmo imóvel.
5. **Consultar**: digite o código de identificação para ver a parcela que
   está vencendo, o valor, marcar parcelas como pagas e imprimir o arquivo
   original do carnê.
6. **Configurações**: trocar o endereço do servidor e cadastrar novos usuários
   da equipe (multiusuário).

## Hospedando o backend na nuvem (Render)

Para que a equipe use o app sem precisar rodar nada localmente, o backend
precisa ficar hospedado em algum lugar sempre ligado. O jeito mais simples é o
[Render](https://render.com), usando o arquivo `render.yaml` já incluído neste
repositório:

1. Crie uma conta gratuita em https://render.com (pode entrar com GitHub).
2. No painel, clique em **New +** → **Blueprint**.
3. Conecte este repositório (`matheus-vmattos/IPTUAI`) e selecione a branch
   `claude/iptu-helper-program-lgtuag`.
4. O Render vai detectar o `render.yaml` automaticamente. Ele vai pedir para
   você preencher `ADMIN_EMAIL` e `ADMIN_PASSWORD` (as credenciais do
   primeiro usuário administrador) — escolha uma senha forte.
5. Clique em **Apply**. Em alguns minutos o serviço estará no ar, com uma URL
   parecida com `https://iptuai-backend.onrender.com`.

**Sobre custo:** o `render.yaml` usa o plano "Starter" com um disco
persistente pequeno (necessário para não perder os dados a cada reinício —
o plano gratuito do Render não tem disco persistente). O custo é baixo
(na faixa de US$ 7/mês). Depois de publicado, ninguém da equipe precisa
mexer em servidor, terminal ou configuração nenhuma — só abrir o app e
logar.

## Múltiplos usuários

O backend é o único ponto de dados compartilhado — todos os apps desktop devem
apontar para o mesmo servidor. Para isso você precisa hospedar o `backend/`
em algum lugar acessível pela rede da equipe (uma VPS, um serviço como Render/
Railway/Fly.io, ou um servidor interno). Depois disso:

- Cada pessoa da equipe abre o app, aponta para a URL do servidor em
  **Configurações → Servidor** (ou na tela de login) e faz login.
- Novos usuários são criados por alguém que já tem acesso, em
  **Configurações → Novo usuário da equipe**.

O SQLite (`backend/data/iptuai.db`) e os PDFs enviados (`backend/uploads/`)
ficam no servidor — inclua-os na sua rotina de backup.

## Build do app desktop (com auto-update)

```bash
cd frontend
npm run build       # gera o instalador em frontend/release/, sem publicar
npm run release      # gera e publica o instalador como GitHub Release
```

O `package.json` do frontend já está configurado para publicar releases no
repositório `matheus-vmattos/iptuai`. Para `npm run release` funcionar você
precisa de um token do GitHub com permissão de escrita em Releases, exportado
como `GH_TOKEN` no ambiente (veja a documentação do
[electron-builder](https://www.electron.build/configuration/publish)).

Depois de publicado, os apps já instalados verificam e baixam atualizações
automaticamente ao abrir (via `electron-updater`), então para atualizar o app
de todo mundo basta gerar uma nova versão e publicar um novo Release.

> Nota: instaladores do Windows não assinados digitalmente mostram um aviso
> do SmartScreen na primeira execução. Isso é esperado sem um certificado de
> assinatura de código.

## Extração automática de parcelas

A extração é híbrida: o backend lê o texto do PDF e procura por valores
rotulados (ex: "Valor da Parcela", "Valor com Taxa") associando-os à data de
vencimento mais próxima no texto, já que PDFs de carnê raramente preservam a
ordem visual dos campos ao extrair o texto. O formato varia entre
prefeituras, então a extração é sempre uma sugestão — revise antes de
confirmar.

É comum o carnê trazer, no mesmo arquivo, tanto as guias de **cota única**
(geralmente 2 ou 3 alternativas, com valores diferentes conforme a data —
desconto por antecipação) quanto as guias de **parcelamento** (uma por mês).
Quando você escolhe "parcela única" e o sistema encontra mais de uma
alternativa de cota única no arquivo, ele pergunta qual delas foi
efetivamente usada antes de seguir para a revisão final.
