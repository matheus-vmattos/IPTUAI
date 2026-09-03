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
   quando diferente) e também tenta identificar o **código do imóvel pelo
   nome do arquivo** (ex: `I213.pdf`, `213 - Rua tal.pdf`) — sempre uma
   sugestão, revise antes de confirmar.
2. Diga se o carnê é de **IPTU ou DATI**, se é **cota única ou
   parcelado**, e o **código de identificação do imóvel** (coluna `I` da
   planilha, ex: `213`). Se o código já existir, os dados são gravados na
   linha existente; se não existir, uma linha nova é criada. Se o nome
   impresso no carnê for diferente do proprietário (ex: guia em nome de
   terceiro), informe em **"Nome no carnê"** — os dois ficam guardados
   separadamente na planilha.
3. Escolha **quem paga** (lista vem da própria planilha, aba "Listas").
4. Confirme — os valores, o proprietário/inscrição e o link do PDF salvo
   são gravados na linha do imóvel, e a coluna "salvo" desse tributo é
   marcada como "Feito". Com vários PDFs, o app passa pro próximo da fila
   sozinho e mostra um resumo no final.
5. **Consultar**: busque por código, inscrição ou proprietário para ver
   os valores atuais (cota única, parcela, total calculado, valor a
   pagar), marcar o tributo como lançado no sistema contábil da empresa,
   e abrir o PDF do carnê salvo.
6. **Proprietários**: painel com o resumo de todos os imóveis de um
   proprietário — quantos IPTUs, valor total (cota única e parcelado),
   quantos cada forma de pagamento ("Valoriza paga", repassado etc.) e
   quantos códigos `I` compartilham a mesma inscrição (útil pra achar
   imóveis de rateio, onde uma inscrição é dividida em várias linhas).

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
