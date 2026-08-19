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

```bash
cd backend
npm install
cp .env.example .env   # ajuste JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
npm run dev
```

O servidor sobe em `http://localhost:4000`. Na primeira execução, um usuário
administrador é criado automaticamente com o email/senha definidos em `.env`
(padrão: `admin@iptuai.local`).

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

A extração é híbrida: o backend lê o texto do PDF e procura linhas com data +
valor monetário para sugerir as parcelas, mas o formato de carnê varia entre
prefeituras, então a extração é só uma sugestão — sempre revise os valores,
vencimentos e números antes de confirmar o lançamento.
