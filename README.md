# IPTUAI

Assistente para lançamento de guias de IPTU/DATI direto na planilha de
controle da equipe. Você sobe o PDF do carnê, o sistema tenta extrair
automaticamente os valores (cota única ou parcela), você revisa/confirma,
informa o código de identificação do imóvel (coluna `I` da planilha) e
quem paga — e o app grava tudo direto na linha correspondente da sua
`Projeto_IPTU.xlsx` (aba "IPTU"), sem passar por nenhum banco de dados
intermediário.

## Arquitetura

- **App local, sem servidor na nuvem e sem login.** É um aplicativo
  desktop (Electron + React) que, ao abrir, sobe sozinho um backend local
  (Node/Express, só na sua máquina, porta 4317) responsável por ler e
  extrair os PDFs e por editar a planilha. Não há banco de dados: a
  própria planilha `.xlsx` é o armazenamento.
- **A planilha continua sendo a fonte de verdade.** O app não recria nem
  reformata o arquivo — ele edita cirurgicamente só as células de dados
  da linha do imóvel (valores, quem paga, forma de pagamento, link do
  carnê, flags de "salvo/lançado"), preservando fórmulas, comentários,
  formatação e qualquer outra aba exatamente como estavam. Se o código do
  imóvel ainda não existir na planilha, uma linha nova é criada com as
  mesmas fórmulas das demais.
- **Uso sequencial.** Como é um arquivo Excel (não um banco), o app
  pressupõe que uma pessoa lança de cada vez. Se o arquivo estiver numa
  pasta de rede compartilhada, evite duas pessoas rodando o app e
  lançando ao mesmo tempo.

## Rodando em desenvolvimento

```bash
cd backend && npm install
cd ../frontend && npm install
npm run dev
```

O `npm run dev` do frontend sobe o Vite e abre a janela do Electron, que
por sua vez já inicia o backend local automaticamente (não precisa abrir
outro terminal nem rodar o backend separado).

Na primeira vez, abra **Configurações** dentro do app e:

1. Escolha o arquivo `.xlsx` da planilha (ex: `Projeto_IPTU.xlsx`).
2. Escolha a pasta onde os carnês em PDF devem ser salvos.

Essa mesma tela mostra a **versão instalada** e tem um botão **"Verificar
atualizações"** — o app já baixa sozinho ao abrir, mas dá pra forçar a
checagem e ver o progresso do download ali, com um botão pra reiniciar e
instalar assim que a atualização estiver pronta.

## Fluxo de uso

1. **Lançar**: envie um ou vários PDFs de carnê de uma vez. Para cada um,
   o sistema tenta extrair automaticamente o valor da cota única (ou das
   parcelas, identificando o valor recorrente e o valor da última parcela
   quando diferente), a **inscrição do imóvel lida de dentro do PDF**
   (mais confiável que o nome do arquivo) e o **código do imóvel pelo
   nome do arquivo** (ex: `I213.pdf`, `213 - Rua tal.pdf`) como reforço —
   sempre uma sugestão, revise antes de confirmar. Depois de ler a
   inscrição, o app **sempre pergunta se o carnê é de um imóvel de
   rateio** (um número usado no seu sistema contábil pra cobrar o
   proprietário, diferente do código "I").
   - **Não**: segue no fluxo normal de um imóvel só. Se a inscrição bater
     em mais de uma linha da planilha mesmo assim, mostra as opções pra
     escolher a certa.
   - **Sim**: informa o número do rateio (se já existir, é reconhecido) e
     o app já traz os **"I" cadastrados nessa inscrição específica** do
     carnê (pode ter mais de um) — dá pra adicionar outras linhas
     manualmente também. Pra cada linha: valor **e % de reajuste**
     (provisão pro próximo exercício) são independentes, já que a divisão
     real varia de carnê pra carnê. O PDF é salvo uma vez só e fica
     acessível a partir de qualquer linha do grupo.
2. Diga se o carnê é de **IPTU ou DATI**, se é **cota única ou
   parcelado**, e o **código de identificação do imóvel** (coluna `I` da
   planilha, ex: `213`). Se o código já existir, os dados são gravados na
   linha existente; se não existir, uma linha nova é criada. **Um mesmo
   "I" pode ter mais de um IPTU/DATI** (inscrições diferentes na
   prefeitura) — o app nunca sobrescreve por engano: se a inscrição
   informada não bater com a que já está na linha existente, cria uma
   linha nova pra esse "segundo IPTU" em vez de substituir o primeiro.
   Quando o código bate em mais de uma linha e a inscrição não resolve
   sozinha, mostra a lista de candidatas pra escolher. Se o nome impresso
   no carnê for diferente do proprietário (ex: guia em nome de terceiro),
   informe em **"Nome no carnê"** — os dois ficam guardados
   separadamente na planilha.
3. Escolha **quem paga** (lista vem da própria planilha, aba "Listas").
4. Confirme — os valores, o proprietário/inscrição e o link do PDF salvo
   são gravados na linha do imóvel, e a coluna "salvo" desse tributo é
   marcada como "Feito". Com vários PDFs, o app passa pro próximo da fila
   sozinho e mostra um resumo no final.
5. **Consultar**: busque por código, inscrição, proprietário **ou número
   do imóvel de rateio** para ver os valores atuais (cota única, parcela,
   total calculado, valor a pagar), marcar o tributo como lançado no
   sistema contábil da empresa, abrir o PDF do carnê salvo, ou **editar
   livremente** qualquer campo do imóvel (útil pra corrigir algo sem
   precisar relançar o carnê inteiro). Buscar por um número de rateio abre
   um seletor: escolhe a inscrição (pode ter mais de uma sob o mesmo
   número) e depois o "I" dentro dela. Se a busca encontrar várias linhas
   com o mesmo código, mostra a lista pra você escolher a certa (pela
   inscrição). Se o imóvel fizer parte de
   um **imóvel de rateio** (campo "Imóvel de rateio" preenchido — o número
   usado no sistema contábil pra cobrar o proprietário, não um código
   "I"), mostra um card com o valor de cada linha do grupo e o total
   consolidado a lançar, com um botão pra **remover uma linha do grupo**
   (não mexe nos valores já lançados, só tira o rótulo). Pra ajustar a
   divisão ou trocar o carnê, é só lançar de novo em "Lançar" informando
   o mesmo número de rateio. O botão **"Excluir imóvel"** limpa todos os
   campos daquela linha (útil pra linha duplicada/errada, ex: uma linha
   órfã de antes do app existir, sem código "I", duplicando uma inscrição
   de outra linha) — não remove a linha fisicamente da tabela (evita ter
   que renumerar linha por linha as fórmulas da planilha), só apaga o
   conteúdo, e faz backup automático do arquivo antes. Uma linha sem
   código aparece na busca como "(sem código)" e ainda pode ser aberta e
   editada/excluída normalmente.
6. **Proprietários**: painel com o resumo de todos os imóveis de um
   proprietário — quantos IPTUs, valor total (cota única e parcelado),
   quantos cada forma de pagamento ("Valoriza paga", repassado etc.) e
   quantos códigos `I` compartilham a mesma inscrição (útil pra achar
   imóveis de rateio, onde uma inscrição é dividida em várias linhas). O
   botão **"Gerar PDF"** exporta um resumo enxuto pra imprimir ou enviar.
   O botão **"Renomear (imóvel mudou de dono)"** troca o proprietário em
   todos os imóveis dele de uma vez (útil quando o imóvel foi vendido) —
   não mexe em mais nada (inscrições, quem paga etc. continuam como
   estavam).
7. **Modo somente leitura** (em Configurações): desativa lançamento, edição,
   renomeação e qualquer outra escrita — só busca/consulta continuam
   funcionando (inclusive backend recusa essas rotas, não é só esconder
   botão). Útil pra dar o app pra alguém conferir os IPTUs sem risco de
   mexer na planilha real; recomendado usar com uma **cópia** da planilha,
   não o arquivo ao vivo.
8. **Virada de exercício** (em Configurações): quando começar um ano novo,
   limpa de uma vez os valores/status/quem paga/forma de pagamento
   lançados de **todos os imóveis**, mantendo proprietário, nome no
   carnê, inscrições, rateio e OBS — assim não precisa recadastrar nada
   que não muda de ano pra ano. Faz backup automático do arquivo antes de
   limpar.
9. **Provisão pro próximo exercício**: ao lançar um carnê, o app calcula e
   guarda automaticamente uma estimativa com reajuste (% padrão em
   Configurações, editável a cada lançamento) — é o valor a provisionar no
   seu sistema contábil. Para lançamentos parcelados (a maioria), o app já
   mostra a **parcela ajustada** (e a última parcela, se for diferente), não
   só o total. No ano seguinte, ao lançar o carnê real daquele mesmo
   imóvel, o app mostra sozinho a diferença entre o que foi provisionado e
   o valor real — total e também **parcela a parcela**, pra você saber
   exatamente quanto devolver ou cobrar a mais em cada parcela, sem
   precisar guardar isso em outro lugar.
10. **Painel**: visão geral pra entender onde lançar um carnê.
    - **Imóveis de rateio**: lista todos os já usados, cada um colapsado por
      padrão — clique na seta (▸/▾) pra ver as linhas "I" daquele grupo (ou
      filtre por número/código/nome, que abre sozinho os que baterem).
    - **Pendências do exercício**: imóveis ainda sem carnê lançado nesse
      exercício, separado por IPTU/DATI, com filtro por nome ou código "I"
      e paginação (15 por página).
    - **Provisão pro próximo exercício**: com as mesmas abas IPTU/DATI, um
      segundo filtro separa quem já tem valor provisório calculado pro
      próximo ano de quem ainda não tem — útil pra acompanhar o quanto
      falta provisionar, independente do que já foi lançado de verdade
      neste exercício.
    Clicar num item de qualquer lista leva direto pra tela de Consultar
    daquele imóvel.

## Extração automática de valores

A extração é híbrida: o backend lê o texto do PDF e procura por valores
rotulados (ex: "Valor da Parcela c/ Taxa", "Valor com Taxa") associando-os
à data de vencimento mais próxima no texto, já que PDFs de carnê raramente
preservam a ordem visual dos campos ao extrair o texto. O formato varia
entre prefeituras, então a extração é sempre uma sugestão — revise antes
de confirmar.

É comum o carnê trazer, no mesmo arquivo, tanto as guias de **cota única**
(geralmente 2 ou 3 alternativas, com valores diferentes conforme a data —
desconto por antecipação) quanto as guias de **parcelamento** (uma por
mês, com a última parcela costumando ter um valor levemente diferente por
arredondamento). Quando há mais de uma alternativa de cota única, o app
pergunta qual delas foi efetivamente usada antes de seguir para a revisão
final.

## Build de demonstração (portfólio)

`frontend/src/api.demo.js` é uma API falsa (mesma interface de `api.js`) que
responde com dados fictícios guardados só em memória do navegador — usada
pra publicar uma versão web interativa (sem backend real, sem planilha real)
pra mostrar o app funcionando fora do desktop. Pra gerar essa build:

```bash
cd frontend
cp src/api.js /tmp/api.js.bak
cp src/api.demo.js src/api.js
npx vite build --mode demo --outDir dist-demo
cp /tmp/api.js.bak src/api.js   # restaura a api real
```

Em modo `demo` (`import.meta.env.MODE === 'demo'`), a interface mostra um
aviso fixo no topo deixando claro que é uma demonstração com dados
fictícios. `dist-demo/` nunca é commitado (está no `.gitignore`).

## Build do app desktop (com auto-update)

**Automático (recomendado):** o workflow `.github/workflows/build-windows.yml`
builda o instalador num runner Windows real (não precisa de Wine) e publica
como GitHub Release a cada push que toque `frontend/**`. Basta:

1. Subir a versão em `frontend/package.json` (`"version"`) — **obrigatório em
   todo release**: o `electron-builder` se recusa a reaproveitar um release já
   existente há mais de 2h com a mesma versão (ele conclui o workflow como
   sucesso mesmo assim, mas pula a publicação silenciosamente).
2. Commitar e dar push. O Release novo (com o instalador e o `latest.yml` que
   alimenta o auto-update) aparece em alguns minutos em
   https://github.com/matheus-vmattos/IPTUAI/releases.

**Manual (build local):**

```bash
cd backend && npm install   # o build empacota o backend inteiro (com node_modules) dentro do app
cd ../frontend
npm run build       # gera o instalador em frontend/release/, sem publicar
npm run release      # gera e publica o instalador como GitHub Release
```

Para `npm run release` funcionar localmente você precisa de um token do
GitHub com permissão de escrita em Releases, exportado como `GH_TOKEN` no
ambiente (veja a documentação do
[electron-builder](https://www.electron.build/configuration/publish)). Builds
Windows a partir de Linux/Mac exigem Wine instalado.

Depois de publicado, os apps já instalados verificam e baixam a atualização
automaticamente ao abrir (via `electron-updater`) e a aplicam no próximo
reinício — então para atualizar o app de todo mundo basta subir a versão e
publicar um novo Release.

> Nota: instaladores do Windows não assinados digitalmente mostram um aviso
> do SmartScreen na primeira execução. Isso é esperado sem um certificado de
> assinatura de código.
