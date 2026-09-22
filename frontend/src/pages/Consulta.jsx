import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api, apiErrorMessage, BACKEND_URL } from '../api.js';
import { useModoLeitura } from '../App.jsx';

function formatarMoeda(valor) {
  if (valor === null || valor === undefined || valor === '') return '—';
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// A tela mostra o código sempre como "I 899", então é natural digitar
// assim de volta num campo que pede só o código - tira o "I" (e traço ou
// espaço depois dele) antes de usar de verdade, senão a linha nova fica
// com um código tipo "I 899" em vez de "899".
function normalizarCodigo(str) {
  return String(str ?? '').trim().replace(/^i[\s.\-_]*/i, '');
}

// Label curto de valor pra distinguir, numa lista, guias diferentes do
// mesmo código "I" (ex: 2 inscrições de IPTU na mesma linha do imóvel).
function valorLabelResultado(r) {
  const cotaUnica = r.formaPgto === 'Cota única';
  const valor = cotaUnica ? r.iptuCotaUnica ?? r.datiCotaUnica : r.iptuParcela ?? r.datiParcela;
  if (valor === null || valor === undefined || valor === '') return null;
  return cotaUnica ? `${formatarMoeda(valor)} (cota única)` : `${formatarMoeda(valor)}/parcela`;
}

function escaparHtml(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[c]);
}

function valorAtualMembroRateio(m, tributo) {
  const cotaUnica = tributo === 'IPTU' ? m.iptuCotaUnica : m.datiCotaUnica;
  const parcela = tributo === 'IPTU' ? m.iptuParcela : m.datiParcela;
  if (m.formaPgto === 'Cota única') {
    return cotaUnica !== null && cotaUnica !== undefined ? `${formatarMoeda(cotaUnica)} (cota única)` : '—';
  }
  return parcela !== null && parcela !== undefined ? `${formatarMoeda(parcela)}/mês` : '—';
}

function valorProximoMembroRateio(m, tributo) {
  const provProximoAno = tributo === 'IPTU' ? m.iptuProvisaoProximoAno : m.datiProvisaoProximoAno;
  const provParcela = tributo === 'IPTU' ? m.iptuProvisaoParcela : m.datiProvisaoParcela;
  if (m.formaPgto === 'Cota única') {
    return provProximoAno !== null && provProximoAno !== undefined
      ? `${formatarMoeda(provProximoAno)} (cota única)`
      : '—';
  }
  return provParcela !== null && provParcela !== undefined ? `${formatarMoeda(provParcela)}/mês` : '—';
}

// Relatório curto pra compartilhar com quem vai ajudar a lançar os carnês
// desse rateio - número do rateio, cada "I" que o compõe, o valor que já
// tá lançado neste exercício e uma aproximação do próximo (provisão com
// reajuste), pra servir de referência enquanto os carnês reais não chegam.
function montarHtmlRelatorioRateio(grupo, exercicio) {
  const proximoExercicio = exercicio ? exercicio + 1 : null;
  const temDati = grupo.imoveis.some(
    (m) => m.dati && m.dati !== 'Não tem' && (m.datiCotaUnica != null || m.datiParcela != null)
  );

  const linhaTabela = (m, tributo) => `
    <tr>
      <td>I ${escaparHtml(m.codigo || '(sem código)')}</td>
      <td>${escaparHtml(m.nominalIptu || m.proprietario || '—')}</td>
      <td>${escaparHtml(tributo === 'IPTU' ? m.inscricaoIptu : m.dati) || '—'}</td>
      <td>${valorAtualMembroRateio(m, tributo)}</td>
      <td>${valorProximoMembroRateio(m, tributo)}</td>
    </tr>`;

  const linhasIptu = grupo.imoveis
    .filter((m) => m.inscricaoIptu && m.inscricaoIptu !== 'Não tem')
    .map((m) => linhaTabela(m, 'IPTU'))
    .join('');
  const linhasDati = grupo.imoveis
    .filter((m) => m.dati && m.dati !== 'Não tem')
    .map((m) => linhaTabela(m, 'DATI'))
    .join('');

  const cabecalhoTabela = (ref, refProximo) =>
    `<thead><tr><th>Imóvel</th><th>Proprietário / nome no carnê</th><th>Inscrição</th><th>Valor atual (ref. ${ref})</th><th>Aproximado próximo (ref. ${refProximo})</th></tr></thead>`;

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Lançamento — Imóvel de rateio ${escaparHtml(grupo.rotuloContabil)}</title>
<style>
  body { font-family: -apple-system, Arial, sans-serif; color: #1c1e21; padding: 32px; }
  h1 { font-size: 20px; margin-bottom: 2px; }
  .subtitulo { color: #666; font-size: 12px; margin-top: 0; margin-bottom: 24px; }
  h2 { font-size: 14px; margin: 20px 0 8px; border-bottom: 1px solid #eee; padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 16px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #eee; }
  th { background: #f5f6f8; }
  .rodape { color: #888; font-size: 11px; margin-top: 24px; }
</style>
</head><body>
  <h1>Lançamento — Imóvel de rateio ${escaparHtml(grupo.rotuloContabil)}</h1>
  <p class="subtitulo">Gerado em ${new Date().toLocaleDateString('pt-BR')} — ${grupo.totalImoveis} imóve${
    grupo.totalImoveis === 1 ? 'l' : 'is'
  } nesse rateio</p>

  <h2>IPTU</h2>
  <table>
    ${cabecalhoTabela(exercicio ?? '—', proximoExercicio ?? '—')}
    <tbody>${linhasIptu || '<tr><td colspan="5">Nenhum imóvel com IPTU nesse rateio.</td></tr>'}</tbody>
  </table>

  ${
    temDati
      ? `<h2>DATI</h2>
  <table>
    ${cabecalhoTabela(exercicio ?? '—', proximoExercicio ?? '—')}
    <tbody>${linhasDati}</tbody>
  </table>`
      : ''
  }

  <p class="rodape">"Aproximado próximo" é a provisão calculada com o % de reajuste do lançamento atual — o valor real do próximo carnê pode variar.</p>
</body></html>`;
}

const CAMPOS_EDITAVEIS = [
  'proprietario',
  'nominalIptu',
  'inscricaoIptu',
  'dati',
  'quemPagaIptu',
  'quemPagaDati',
  'formaPgto',
  'iptuCotaUnica',
  'iptuParcela',
  'iptuUltimaParcela',
  'iptuProvisaoProximoAno',
  'iptuProvisaoParcela',
  'iptuProvisaoUltimaParcela',
  'datiCotaUnica',
  'datiParcela',
  'datiUltimaParcela',
  'datiProvisaoProximoAno',
  'datiProvisaoParcela',
  'datiProvisaoUltimaParcela',
  'imovelDeRateio',
  'obs',
];

// Express nao aceita um segmento de path vazio - linhas orfas (sem "I") usam
// esse valor fixo no lugar do codigo ao montar a URL; o backend sabe
// converter de volta (ver imoveisRoutes.js).
const SEM_CODIGO = '_sem_codigo_';
function codigoNaUrl(codigo) {
  return codigo ? codigo : SEM_CODIGO;
}

function paraFormulario(imovel) {
  const out = {};
  for (const campo of CAMPOS_EDITAVEIS) {
    const valor = imovel[campo];
    out[campo] = valor === null || valor === undefined ? '' : String(valor);
  }
  return out;
}

// Form compacto de "adicionar imóvel a este rateio" - usado tanto na busca
// direta pelo número do rateio quanto dentro de um "I" que já é membro de
// um. Cadastra e já lança o tributo na mesma ação (POST /lancamentos com
// imovelDeRateio forçado pro rótulo do grupo).
function NovoMembroRateioForm({ dados, quemPagaOpcoes, onChange, onCancelar, onSalvar, salvando, pendencias }) {
  return (
    <div className="card">
      <div className="iptu-header">
        <h4>Adicionar imóvel ao rateio {dados.rotulo}</h4>
        <button type="button" className="link-btn" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
      <label>
        Código "I"
        <input
          value={dados.codigo}
          onChange={(e) => onChange({ codigo: e.target.value })}
          onBlur={(e) => onChange({ codigo: normalizarCodigo(e.target.value) })}
          placeholder="ex: 1601"
        />
      </label>
      <label>
        Tributo
        <select value={dados.tributo} onChange={(e) => onChange({ tributo: e.target.value })}>
          <option value="IPTU">IPTU</option>
          <option value="DATI">DATI</option>
        </select>
      </label>
      <label>
        Inscrição {dados.tributo}
        <input value={dados.inscricao} onChange={(e) => onChange({ inscricao: e.target.value })} />
      </label>
      <label>
        Proprietário
        <input value={dados.proprietario} onChange={(e) => onChange({ proprietario: e.target.value })} />
      </label>
      <label>
        Nome no carnê (se diferente do proprietário)
        <input value={dados.nominalIptu} onChange={(e) => onChange({ nominalIptu: e.target.value })} />
      </label>
      <label>
        Forma de pagamento
        <select value={dados.formaPgto} onChange={(e) => onChange({ formaPgto: e.target.value })}>
          <option value="Cota única">Cota única</option>
          <option value="Parcelado">Parcelado</option>
        </select>
      </label>
      {dados.formaPgto === 'Cota única' ? (
        <label>
          Valor (R$)
          <input type="number" step="0.01" value={dados.cotaUnica} onChange={(e) => onChange({ cotaUnica: e.target.value })} />
        </label>
      ) : (
        <>
          <label>
            Parcela (R$)
            <input type="number" step="0.01" value={dados.parcela} onChange={(e) => onChange({ parcela: e.target.value })} />
          </label>
          <label>
            Última parcela (R$, deixe em branco se igual)
            <input
              type="number"
              step="0.01"
              value={dados.ultimaParcela}
              onChange={(e) => onChange({ ultimaParcela: e.target.value })}
            />
          </label>
        </>
      )}
      <label>
        Quem paga
        <select value={dados.quemPaga} onChange={(e) => onChange({ quemPaga: e.target.value })}>
          <option value="">—</option>
          {quemPagaOpcoes.map((op) => (
            <option key={op} value={op}>
              {op}
            </option>
          ))}
        </select>
      </label>
      <label>
        % de reajuste (provisão pro próximo exercício)
        <input type="number" step="0.1" value={dados.reajustePct} onChange={(e) => onChange({ reajustePct: e.target.value })} />
      </label>
      {pendencias.length > 0 && <p className="meta">Falta: {pendencias.join(' · ')}</p>}
      <div className="actions-row">
        <button type="button" className="link-btn" onClick={onCancelar} disabled={salvando}>
          Cancelar
        </button>
        <button type="button" disabled={pendencias.length > 0 || salvando} onClick={onSalvar}>
          {salvando ? 'Salvando...' : 'Cadastrar e lançar'}
        </button>
      </div>
    </div>
  );
}

// Uma linha de imóvel dentro de um grupo de rateio - abrir (navegação
// fluida sem sair do contexto do rateio), status de lançado por tributo com
// atalho pra marcar, e remover (quando aplicável).
// Form compacto de edição dos valores de um membro do rateio, direto na
// linha (sem navegar pro "I"). Só os campos de valor/forma de pagamento -
// pra editar o resto (proprietário, inscrição etc.) ainda precisa abrir o
// imóvel e usar "Editar".
function MembroRateioEdicaoForm({ m, dados, onChange, onCancelar, onSalvar, salvando }) {
  const temIptu = m.inscricaoIptu && m.inscricaoIptu !== 'Não tem';
  const temDati = m.dati && m.dati !== 'Não tem';
  return (
    <div className="card">
      <label>
        Forma de pagamento
        <select value={dados.formaPgto} onChange={(e) => onChange({ formaPgto: e.target.value })}>
          <option value="Cota única">Cota única</option>
          <option value="Parcelado">Parcelado</option>
        </select>
      </label>
      {temIptu &&
        (dados.formaPgto === 'Cota única' ? (
          <label>
            IPTU — cota única (R$)
            <input
              type="number"
              step="0.01"
              value={dados.iptuCotaUnica}
              onChange={(e) => onChange({ iptuCotaUnica: e.target.value })}
            />
          </label>
        ) : (
          <>
            <label>
              IPTU — parcela (R$)
              <input
                type="number"
                step="0.01"
                value={dados.iptuParcela}
                onChange={(e) => onChange({ iptuParcela: e.target.value })}
              />
            </label>
            <label>
              IPTU — última parcela (R$, deixe em branco se igual)
              <input
                type="number"
                step="0.01"
                value={dados.iptuUltimaParcela}
                onChange={(e) => onChange({ iptuUltimaParcela: e.target.value })}
              />
            </label>
          </>
        ))}
      {temDati &&
        (dados.formaPgto === 'Cota única' ? (
          <label>
            DATI — cota única (R$)
            <input
              type="number"
              step="0.01"
              value={dados.datiCotaUnica}
              onChange={(e) => onChange({ datiCotaUnica: e.target.value })}
            />
          </label>
        ) : (
          <>
            <label>
              DATI — parcela (R$)
              <input
                type="number"
                step="0.01"
                value={dados.datiParcela}
                onChange={(e) => onChange({ datiParcela: e.target.value })}
              />
            </label>
            <label>
              DATI — última parcela (R$, deixe em branco se igual)
              <input
                type="number"
                step="0.01"
                value={dados.datiUltimaParcela}
                onChange={(e) => onChange({ datiUltimaParcela: e.target.value })}
              />
            </label>
          </>
        ))}
      <div className="actions-row">
        <button type="button" className="link-btn" onClick={onCancelar} disabled={salvando}>
          Cancelar
        </button>
        <button type="button" onClick={onSalvar} disabled={salvando}>
          {salvando ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </div>
  );
}

function MembroRateioLinha({
  m,
  atual,
  onAbrir,
  onMarcarLancado,
  onRemover,
  modoLeitura,
  editando,
  onIniciarEdicao,
  onCancelarEdicao,
  onSalvarEdicao,
  formEdicao,
  onChangeEdicao,
  salvandoEdicao,
  previewAberto,
  onAlternarPreview,
  urlPreview,
}) {
  const temIptu = m.inscricaoIptu && m.inscricaoIptu !== 'Não tem';
  const temDati = m.dati && m.dati !== 'Não tem';
  const ehCotaUnica = m.formaPgto === 'Cota única';
  const parcelaMensal = (Number(m.iptuParcela) || 0) + (Number(m.datiParcela) || 0);
  const valor = ehCotaUnica
    ? (Number(m.iptuCotaUnica) || 0) + (Number(m.datiCotaUnica) || 0)
    : (Number(m.iptuTotalCalculado) || 0) + (Number(m.datiTotalCalculado) || 0);

  if (editando) {
    return (
      <li>
        <p className="meta">
          <strong>I {m.codigo || '(sem código)'} — {m.nominalIptu || m.proprietario}</strong>
        </p>
        <MembroRateioEdicaoForm
          m={m}
          dados={formEdicao}
          onChange={onChangeEdicao}
          onCancelar={onCancelarEdicao}
          onSalvar={onSalvarEdicao}
          salvando={salvandoEdicao}
        />
      </li>
    );
  }

  return (
    <li className="card">
      <button type="button" className="choice-item" onClick={onAbrir}>
        I {m.codigo || '(sem código)'} — {m.nominalIptu || m.proprietario}
        {ehCotaUnica ? (
          <> — {formatarMoeda(valor)} (cota única)</>
        ) : (
          <>
            {' '}
            — {formatarMoeda(parcelaMensal)}/parcela (total no ano: {formatarMoeda(valor)})
          </>
        )}
        {atual && ' (este)'}
      </button>
      {m.obs && <span className="meta"> {m.obs}</span>}
      <div className="meta">
        {temIptu && (
          <>
            IPTU: <strong>{m.iptuLancado === 'Feito' ? 'Feito' : 'Pendente'}</strong>
            {!modoLeitura && m.iptuLancado !== 'Feito' && (
              <>
                {' '}
                <button type="button" className="link-btn" onClick={() => onMarcarLancado('IPTU')}>
                  marcar lançado
                </button>
              </>
            )}
          </>
        )}
        {temIptu && temDati && ' · '}
        {temDati && (
          <>
            DATI: <strong>{m.datiLancado === 'Feito' ? 'Feito' : 'Pendente'}</strong>
            {!modoLeitura && m.datiLancado !== 'Feito' && (
              <>
                {' '}
                <button type="button" className="link-btn" onClick={() => onMarcarLancado('DATI')}>
                  marcar lançado
                </button>
              </>
            )}
          </>
        )}
      </div>
      {!modoLeitura && (
        <>
          <button type="button" className="link-btn" onClick={onIniciarEdicao}>
            editar valores
          </button>
          {onRemover && (
            <>
              {' · '}
              <button type="button" className="link-btn" onClick={onRemover}>
                remover deste rateio
              </button>
            </>
          )}
        </>
      )}
      {m.linkCarne && (
        <>
          {' · '}
          <button type="button" className="link-btn" onClick={onAlternarPreview}>
            {previewAberto ? 'fechar carnê' : 'ver carnê'}
          </button>
        </>
      )}
      {previewAberto && m.linkCarne && <iframe title="Carnê" src={urlPreview} className="preview-carne" />}
    </li>
  );
}

function membroRateioPendente(m) {
  const temIptu = m.inscricaoIptu && m.inscricaoIptu !== 'Não tem';
  const temDati = m.dati && m.dati !== 'Não tem';
  return (temIptu && m.iptuLancado !== 'Feito') || (temDati && m.datiLancado !== 'Feito');
}

let proximaChaveDivisao = 1;
function membroDivisaoVazio(dados) {
  return {
    key: proximaChaveDivisao++,
    codigo: '',
    inscricaoIptu: '',
    dati: '',
    proprietario: '',
    nominalIptu: '',
    quemPaga: '',
    cotaUnica: '',
    parcela: '',
    ultimaParcela: '',
    reajustePct: '',
    obs: '',
    ...dados,
  };
}

export default function Consulta() {
  const modoLeitura = useModoLeitura();
  const [busca, setBusca] = useState('');
  const [resultados, setResultados] = useState([]);
  const [imovel, setImovel] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState(null);

  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState({});
  const [salvando, setSalvando] = useState(false);

  const [grupoRateio, setGrupoRateio] = useState(null);
  const [inscricaoRateio, setInscricaoRateio] = useState(null);

  // Divide/agrupa num rateio todas as linhas "I" que compartilham a mesma
  // inscrição do imóvel aberto - sem precisar re-lançar o carnê pelo
  // assistente de Lançar (que exige subir o PDF de novo).
  const [dividindo, setDividindo] = useState(false);
  const [tributoDivisao, setTributoDivisao] = useState('IPTU');
  const [inscricaoDivisao, setInscricaoDivisao] = useState('');
  const [rotuloDivisao, setRotuloDivisao] = useState('');
  const [formaPgtoDivisao, setFormaPgtoDivisao] = useState('Parcelado');
  const [valorTotalDivisao, setValorTotalDivisao] = useState('');
  // Separado da quantidade de linhas: o número real de partes pode ser
  // diferente de quantas linhas "I" já estão cadastradas nessa inscrição
  // (ex: prédio tem 16 frações mas só 12 unidades com código "I" hoje).
  const [divisorDivisao, setDivisorDivisao] = useState('');
  const [membrosDivisao, setMembrosDivisao] = useState([]);
  const [carregandoDivisao, setCarregandoDivisao] = useState(false);
  const [salvandoDivisao, setSalvandoDivisao] = useState(false);

  // Cadastro rápido de um novo membro dentro de um imóvel de rateio já
  // existente (ex: unidade que acabou de ser cadastrada no sistema base) -
  // cadastra e já lança na mesma ação, sem sair do contexto do rateio.
  const [novoMembroRateio, setNovoMembroRateio] = useState(null);
  const [salvandoNovoMembroRateio, setSalvandoNovoMembroRateio] = useState(false);
  const [soPendentesRateio, setSoPendentesRateio] = useState(false);

  // Visualizador de PDF embutido: guarda o caminho do carnê aberto no
  // momento (null = painel fechado). Reaproveitado tanto pelo "I" aberto
  // quanto por um membro do rateio, sem precisar navegar até ele.
  const [previewCarne, setPreviewCarne] = useState(null);

  // Edição inline de um membro do rateio (sem precisar abrir o "I" via
  // navegação) - guarda a chave do membro em edição e o rascunho dos
  // campos, resolvido com PATCH /imoveis/:codigo (mesma rota da edição
  // livre de um imóvel).
  const [editandoMembroRateio, setEditandoMembroRateio] = useState(null);
  const [formMembroRateio, setFormMembroRateio] = useState({});
  const [salvandoMembroRateio, setSalvandoMembroRateio] = useState(false);

  const location = useLocation();

  useEffect(() => {
    api
      .get('/config')
      .then(({ data }) => setConfig(data))
      .catch(() => {});
  }, []);

  // Chegando de outra tela (ex: Painel) com um código já escolhido - abre
  // direto, sem precisar buscar de novo.
  useEffect(() => {
    if (location.state?.codigo) {
      abrirImovel(location.state.codigo, location.state.inscricao);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  async function buscar(e) {
    e?.preventDefault();
    if (!busca.trim()) return;
    setError('');
    setLoading(true);
    setImovel(null);
    setEditando(false);
    setGrupoRateio(null);
    setInscricaoRateio(null);
    try {
      const [resImoveis, resRateio] = await Promise.all([
        api.get('/imoveis', { params: { q: busca.trim() } }),
        api.get(`/rateios/${encodeURIComponent(busca.trim())}`).catch(() => null),
      ]);
      setResultados(resImoveis.data);
      // Bateu num numero de imovel de rateio (nao e codigo "I") - mostra o
      // drill-down em vez de (ou alem de) tentar achar por codigo/nome.
      if (resRateio?.data?.totalImoveis > 0) {
        setGrupoRateio(resRateio.data);
        if (resRateio.data.porInscricao.length === 1) setInscricaoRateio(resRateio.data.porInscricao[0]);
      } else if (resImoveis.data.length === 1) {
        abrirImovel(resImoveis.data[0].codigo, resImoveis.data[0].inscricaoIptu || resImoveis.data[0].dati);
      }
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  // inscricao desambigua qual linha, quando o codigo aparece em mais de uma
  // (ex: um "I" com mais de uma guia de IPTU) - os resultados da busca já
  // trazem a inscrição de cada linha especificamente, então normalmente já
  // sobra sem ambiguidade.
  async function abrirImovel(codigo, inscricao) {
    setError('');
    setLoading(true);
    setEditando(false);
    try {
      const { data } = await api.get(`/imoveis/${encodeURIComponent(codigoNaUrl(codigo))}`, {
        params: inscricao ? { inscricao } : undefined,
      });
      setImovel(data);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function marcarLancado(tributo) {
    if (!imovel) return;
    try {
      await api.patch(`/imoveis/${encodeURIComponent(codigoNaUrl(imovel.codigo))}/lancado`, {
        tributo,
        status: 'Feito',
        inscricao: imovel.inscricaoIptu || imovel.dati,
      });
      abrirImovel(imovel.codigo, imovel.inscricaoIptu || imovel.dati);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  // Tira uma linha do grupo de rateio (limpa só o rótulo "Imóvel de
  // rateio" dessa linha - os valores já lançados continuam lá, editáveis
  // manualmente se precisar). codigoMembro/inscricaoMembro identificam a
  // linha certa mesmo quando o código se repete em mais de uma.
  async function removerDoRateio(codigoMembro, inscricaoMembro) {
    if (!window.confirm(`Remover I ${codigoMembro} deste imóvel de rateio?`)) return;
    setError('');
    try {
      await api.patch(
        `/imoveis/${encodeURIComponent(codigoMembro)}`,
        { imovelDeRateio: '' },
        { params: inscricaoMembro ? { inscricao: inscricaoMembro } : undefined }
      );
      await abrirImovel(imovel.codigo, imovel.inscricaoIptu || imovel.dati);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  // Limpa todos os campos da linha (nao remove fisicamente - ver
  // excelStore.excluirImovel) - util pra linhas duplicadas/erradas, tipo
  // uma linha orfa com codigo vazio que ficou duplicando uma inscricao. O
  // app faz backup do arquivo automaticamente antes.
  async function excluirImovel() {
    if (!imovel) return;
    const identificador = imovel.codigo || '(sem código)';
    if (
      !window.confirm(
        `Excluir o imóvel I ${identificador} (${imovel.proprietario || 'sem proprietário'})? ` +
          'Isso limpa todos os campos dessa linha na planilha. Um backup do arquivo é feito automaticamente antes.'
      )
    ) {
      return;
    }
    const confirmacao = window.prompt(
      `Pra confirmar de vez, digite o código "${identificador}" (sem o "I") aqui embaixo:`
    );
    if (confirmacao === null) return;
    if (confirmacao.trim() !== String(identificador).trim()) {
      window.alert('Código não confere. Exclusão cancelada.');
      return;
    }
    setError('');
    try {
      await api.delete(`/imoveis/${encodeURIComponent(codigoNaUrl(imovel.codigo))}`, {
        params: imovel.inscricaoIptu || imovel.dati ? { inscricao: imovel.inscricaoIptu || imovel.dati } : undefined,
      });
      setImovel(null);
      setEditando(false);
      await buscar();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function abrirCarne() {
    if (!imovel?.linkCarne) return;
    if (window.electronAPI?.abrirArquivo) {
      await window.electronAPI.abrirArquivo(imovel.linkCarne);
    } else {
      window.alert(`Arquivo salvo em: ${imovel.linkCarne}`);
    }
  }

  function urlPreviewCarne(caminho) {
    return `${BACKEND_URL}/carnes/visualizar?path=${encodeURIComponent(caminho)}`;
  }

  // Relatório em PDF pra compartilhar com quem vai ajudar a lançar os
  // carnês desse rateio (ver montarHtmlRelatorioRateio).
  async function gerarRelatorioRateio(grupo) {
    if (!grupo) return;
    if (!window.electronAPI?.exportarPDF) {
      window.alert('Disponível só no app desktop.');
      return;
    }
    setError('');
    const html = montarHtmlRelatorioRateio(grupo, config?.listas?.exercicio);
    const nomeArquivo = `Lancamento - rateio ${grupo.rotuloContabil}.pdf`;
    try {
      const resultado = await window.electronAPI.exportarPDF(html, nomeArquivo);
      if (resultado?.salvo) window.alert(`PDF salvo em: ${resultado.caminho}`);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  // Edição rápida de um membro do rateio (valores + forma de pagamento),
  // direto na linha, sem precisar abrir/navegar pro "I" individual.
  function chaveMembroRateio(m) {
    return `${m.codigo}-${m.inscricaoIptu || m.dati || ''}`;
  }

  function iniciarEdicaoMembroRateio(m) {
    setError('');
    setEditandoMembroRateio(chaveMembroRateio(m));
    setFormMembroRateio({
      formaPgto: m.formaPgto || 'Parcelado',
      iptuCotaUnica: m.iptuCotaUnica ?? '',
      iptuParcela: m.iptuParcela ?? '',
      iptuUltimaParcela: m.iptuUltimaParcela ?? '',
      datiCotaUnica: m.datiCotaUnica ?? '',
      datiParcela: m.datiParcela ?? '',
      datiUltimaParcela: m.datiUltimaParcela ?? '',
    });
  }

  function cancelarEdicaoMembroRateio() {
    setEditandoMembroRateio(null);
    setFormMembroRateio({});
  }

  function atualizarFormMembroRateio(campos) {
    setFormMembroRateio((prev) => ({ ...prev, ...campos }));
  }

  async function salvarEdicaoMembroRateio(m) {
    setError('');
    setSalvandoMembroRateio(true);
    try {
      const payload = {};
      for (const [campo, valor] of Object.entries(formMembroRateio)) {
        payload[campo] = String(valor);
      }
      await api.patch(`/imoveis/${encodeURIComponent(codigoNaUrl(m.codigo))}`, payload, {
        params: m.inscricaoIptu || m.dati ? { inscricao: m.inscricaoIptu || m.dati } : undefined,
      });
      cancelarEdicaoMembroRateio();
      if (imovel) {
        await abrirImovel(imovel.codigo, imovel.inscricaoIptu || imovel.dati);
      } else if (grupoRateio) {
        await recarregarRateio(grupoRateio.rotuloContabil);
      }
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSalvandoMembroRateio(false);
    }
  }

  function iniciarEdicao() {
    setForm(paraFormulario(imovel));
    setEditando(true);
  }

  function atualizarCampo(campo, valor) {
    setForm((prev) => ({ ...prev, [campo]: valor }));
  }

  async function salvarEdicao(e) {
    e.preventDefault();
    setError('');
    setSalvando(true);
    try {
      const inscricaoOriginal = imovel.inscricaoIptu || imovel.dati;
      await api.patch(`/imoveis/${encodeURIComponent(codigoNaUrl(imovel.codigo))}`, form, {
        params: inscricaoOriginal ? { inscricao: inscricaoOriginal } : undefined,
      });
      setEditando(false);
      await abrirImovel(imovel.codigo, form.inscricaoIptu || form.dati || inscricaoOriginal);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSalvando(false);
    }
  }

  // Busca todas as linhas com essa inscrição exata (IPTU ou DATI) - linhas
  // sem código "I" não entram (não dá pra lançar valor nelas; use Editar ou
  // Excluir pra essas primeiro).
  async function carregarMembrosDivisao(inscricao) {
    if (!inscricao) {
      setMembrosDivisao([]);
      return;
    }
    setCarregandoDivisao(true);
    try {
      const { data } = await api.get(`/imoveis/por-inscricao/${encodeURIComponent(inscricao)}`);
      const comCodigo = data.filter((m) => m.codigo);
      setMembrosDivisao(
        comCodigo.map((m) =>
          membroDivisaoVazio({
            codigo: String(m.codigo),
            inscricaoIptu: m.inscricaoIptu || '',
            dati: m.dati || '',
            proprietario: m.proprietario || '',
            nominalIptu: m.nominalIptu || '',
            obs: m.obs || '',
          })
        )
      );
      setDivisorDivisao(String(comCodigo.length || ''));
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setCarregandoDivisao(false);
    }
  }

  // Ponto único de entrada da divisão, usado tanto a partir de um "I"
  // específico quanto a partir do imóvel de rateio (número contábil) direto
  // - preferível, já que é ele quem "manda" nesses dados, não uma unidade
  // qualquer do grupo.
  function iniciarDivisao(tributo, inscricao, rotulo, formaPgto) {
    setTributoDivisao(tributo);
    setInscricaoDivisao(inscricao);
    setRotuloDivisao(rotulo || '');
    setFormaPgtoDivisao(formaPgto || 'Parcelado');
    setValorTotalDivisao('');
    setError('');
    setDividindo(true);
    carregarMembrosDivisao(inscricao);
  }

  // A partir do "I" aberto em Consultar.
  function abrirDivisao() {
    if (!imovel) return;
    const tributo = imovel.inscricaoIptu ? 'IPTU' : 'DATI';
    const inscricao = tributo === 'IPTU' ? imovel.inscricaoIptu : imovel.dati;
    iniciarDivisao(tributo, inscricao, imovel.imovelDeRateio || imovel.grupoRateio?.rotuloContabil || '', imovel.formaPgto);
  }

  // A partir do imóvel de rateio (busca pelo número contábil) - jeito
  // preferido de mexer nisso, sem precisar abrir um "I" específico primeiro.
  function abrirDivisaoRateio(grp) {
    const primeiro = grp.imoveis[0];
    const tributo = primeiro && primeiro.inscricaoIptu === grp.inscricao ? 'IPTU' : 'DATI';
    iniciarDivisao(tributo, grp.inscricao, grupoRateio?.rotuloContabil || '');
  }

  function fecharDivisao() {
    setDividindo(false);
    setMembrosDivisao([]);
  }

  function trocarTributoDivisao(tributo) {
    setTributoDivisao(tributo);
    const inscricao = imovel ? (tributo === 'IPTU' ? imovel.inscricaoIptu : imovel.dati) : inscricaoDivisao;
    carregarMembrosDivisao(inscricao);
  }

  function atualizarMembroDivisao(key, campos) {
    setMembrosDivisao((prev) => prev.map((m) => (m.key === key ? { ...m, ...campos } : m)));
  }

  function aplicarQuemPagaDivisaoTodos(valor) {
    setMembrosDivisao((prev) => prev.map((m) => ({ ...m, quemPaga: valor })));
  }

  // Tira uma linha da divisão desta vez (não mexe na planilha - só nesse
  // rascunho) - ex: unidade vazia esse mês, não deve entrar na conta.
  // "Dividir igualmente" usa a quantidade de linhas que sobrar, então
  // remover/adicionar aqui é como aumentar ou diminuir o divisor.
  function removerMembroDivisao(key) {
    setMembrosDivisao((prev) => prev.filter((m) => m.key !== key));
  }

  // Adiciona uma linha "I" à divisão - busca os dados pra prefilar se já
  // existir na planilha (mesmo que não compartilhe essa inscrição hoje).
  async function adicionarMembroDivisao(codigoStr) {
    const codigo = normalizarCodigo(codigoStr);
    if (!codigo) return;
    if (membrosDivisao.some((m) => m.codigo === codigo)) return;
    try {
      const { data } = await api.get(`/imoveis/${encodeURIComponent(codigo)}`);
      setMembrosDivisao((prev) => [
        ...prev,
        membroDivisaoVazio({
          codigo,
          inscricaoIptu: data.inscricaoIptu || '',
          dati: data.dati || '',
          proprietario: data.proprietario || '',
          nominalIptu: data.nominalIptu || '',
          obs: data.obs || '',
        }),
      ]);
    } catch (err) {
      if (err?.response?.status === 404) {
        setMembrosDivisao((prev) => [...prev, membroDivisaoVazio({ codigo })]);
      } else {
        setError(apiErrorMessage(err));
      }
    }
  }

  function dividirValorIgualmente() {
    const total = Number(valorTotalDivisao);
    const divisor = Number(divisorDivisao) || membrosDivisao.length;
    if (isNaN(total) || !divisor || membrosDivisao.length === 0) return;
    // "Valor total do carnê" é sempre o total do ano inteiro (mesmo sentido
    // usado em todo o resto do app - ver calcTotal em excelStore.js). Num
    // carnê parcelado, esse total já soma todas as parcelas - dividir só
    // pelo número de unidades e aplicar o resultado como a parcela mensal
    // de cada uma multiplicaria o valor por engano (parcela x nParcelas x
    // divisor, em vez do total real). Divide também pelo número de
    // parcelas nesse caso.
    const nParcelas = formaPgtoDivisao === 'Parcelado' ? config?.listas?.nParcelas || 1 : 1;
    const sugestao = Math.round((total / divisor / nParcelas) * 100) / 100;
    setMembrosDivisao((prev) =>
      prev.map((m) =>
        formaPgtoDivisao === 'Cota única'
          ? { ...m, cotaUnica: String(sugestao) }
          : { ...m, parcela: String(sugestao), ultimaParcela: '' }
      )
    );
  }

  function somaMembrosDivisao() {
    return membrosDivisao.reduce((acc, m) => {
      const v = formaPgtoDivisao === 'Cota única' ? Number(m.cotaUnica) : Number(m.parcela);
      return acc + (isNaN(v) ? 0 : v);
    }, 0);
  }

  // Lista em português o que falta pra poder salvar - sem isso o botão só
  // fica desabilitado sem explicar por quê.
  function pendenciasDivisao() {
    const pendencias = [];
    if (!rotuloDivisao.trim()) pendencias.push('informe o número do imóvel de rateio');
    if (membrosDivisao.length === 0) pendencias.push('nenhuma linha com código "I" encontrada pra essa inscrição');
    const semValor = membrosDivisao.filter((m) =>
      formaPgtoDivisao === 'Cota única' ? m.cotaUnica === '' || isNaN(Number(m.cotaUnica)) : m.parcela === '' || isNaN(Number(m.parcela))
    );
    if (semValor.length > 0) pendencias.push(`falta valor em: ${semValor.map((m) => `I ${m.codigo}`).join(', ')}`);
    const semQuemPaga = membrosDivisao.filter((m) => !m.quemPaga);
    if (semQuemPaga.length > 0) pendencias.push(`falta "quem paga" em: ${semQuemPaga.map((m) => `I ${m.codigo}`).join(', ')}`);
    return pendencias;
  }

  async function confirmarDivisao() {
    setError('');
    setSalvandoDivisao(true);
    try {
      const form = new FormData();
      form.append('rotulo', rotuloDivisao.trim());
      form.append('tributo', tributoDivisao);
      const itens = membrosDivisao.map((m) => {
        const it = {
          codigo: m.codigo.trim(),
          formaPgto: formaPgtoDivisao,
          proprietario: m.proprietario || undefined,
          nominalIptu: m.nominalIptu || undefined,
          quemPaga: m.quemPaga || undefined,
          obs: m.obs || undefined,
        };
        if (tributoDivisao === 'IPTU') it.inscricaoIptu = m.inscricaoIptu || undefined;
        if (tributoDivisao === 'DATI') it.dati = m.dati || undefined;
        if (m.reajustePct !== '') it.reajustePct = m.reajustePct;
        if (formaPgtoDivisao === 'Cota única') {
          it.cotaUnica = m.cotaUnica;
        } else {
          it.parcela = m.parcela;
          if (m.ultimaParcela !== '') it.ultimaParcela = m.ultimaParcela;
        }
        return it;
      });
      form.append('itens', JSON.stringify(itens));

      const { data } = await api.post('/lancamentos/rateio', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const falhas = data.resultados.filter((r) => r.status === 'erro');
      if (falhas.length > 0) {
        setError(`Algumas linhas falharam: ${falhas.map((f) => `I ${f.codigo} (${f.mensagem})`).join('; ')}`);
      }
      fecharDivisao();
      if (imovel) {
        await abrirImovel(imovel.codigo, imovel.inscricaoIptu || imovel.dati);
      } else {
        await buscar();
      }
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSalvandoDivisao(false);
    }
  }

  function novoMembroRateioVazio(rotulo) {
    return {
      rotulo,
      codigo: '',
      tributo: 'IPTU',
      inscricao: '',
      proprietario: '',
      nominalIptu: '',
      formaPgto: 'Parcelado',
      cotaUnica: '',
      parcela: '',
      ultimaParcela: '',
      quemPaga: '',
      reajustePct: '',
    };
  }

  function abrirNovoMembroRateio(rotulo) {
    setError('');
    setNovoMembroRateio(novoMembroRateioVazio(rotulo));
  }

  function fecharNovoMembroRateio() {
    setNovoMembroRateio(null);
  }

  function atualizarNovoMembroRateio(campos) {
    setNovoMembroRateio((prev) => (prev ? { ...prev, ...campos } : prev));
  }

  function pendenciasNovoMembroRateio() {
    if (!novoMembroRateio) return [];
    const pendencias = [];
    if (!novoMembroRateio.codigo.trim()) pendencias.push('código "I"');
    if (!novoMembroRateio.inscricao.trim()) pendencias.push(`inscrição ${novoMembroRateio.tributo}`);
    if (novoMembroRateio.formaPgto === 'Cota única') {
      if (novoMembroRateio.cotaUnica === '' || isNaN(Number(novoMembroRateio.cotaUnica))) {
        pendencias.push('valor da cota única');
      }
    } else if (novoMembroRateio.parcela === '' || isNaN(Number(novoMembroRateio.parcela))) {
      pendencias.push('valor da parcela');
    }
    return pendencias;
  }

  // Re-busca o grupo de rateio pelo rótulo (sem re-executar a busca inteira)
  // pra atualizar a tela depois de cadastrar/marcar lançado um membro, quando
  // não há um "I" aberto (busca direta pelo número do rateio).
  async function recarregarRateio(rotulo) {
    try {
      const { data } = await api.get(`/rateios/${encodeURIComponent(rotulo)}`);
      setGrupoRateio(data);
      setInscricaoRateio((prev) => (prev ? data.porInscricao.find((g) => g.inscricao === prev.inscricao) || null : prev));
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function salvarNovoMembroRateio() {
    if (!novoMembroRateio) return;
    setError('');
    setSalvandoNovoMembroRateio(true);
    try {
      const form = new FormData();
      form.append('rotulo', novoMembroRateio.rotulo);
      form.append('tributo', novoMembroRateio.tributo);
      const item = {
        codigo: normalizarCodigo(novoMembroRateio.codigo),
        formaPgto: novoMembroRateio.formaPgto,
        proprietario: novoMembroRateio.proprietario || undefined,
        nominalIptu: novoMembroRateio.nominalIptu || undefined,
        quemPaga: novoMembroRateio.quemPaga || undefined,
      };
      if (novoMembroRateio.tributo === 'IPTU') item.inscricaoIptu = novoMembroRateio.inscricao || undefined;
      else item.dati = novoMembroRateio.inscricao || undefined;
      if (novoMembroRateio.reajustePct !== '') item.reajustePct = novoMembroRateio.reajustePct;
      if (novoMembroRateio.formaPgto === 'Cota única') {
        item.cotaUnica = novoMembroRateio.cotaUnica;
      } else {
        item.parcela = novoMembroRateio.parcela;
        if (novoMembroRateio.ultimaParcela !== '') item.ultimaParcela = novoMembroRateio.ultimaParcela;
      }
      form.append('itens', JSON.stringify([item]));

      const { data } = await api.post('/lancamentos/rateio', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const falha = data.resultados.find((r) => r.status === 'erro');
      if (falha) {
        setError(`Não deu pra cadastrar: ${falha.mensagem}`);
        return;
      }
      const rotulo = novoMembroRateio.rotulo;
      fecharNovoMembroRateio();
      if (imovel) {
        await abrirImovel(imovel.codigo, imovel.inscricaoIptu || imovel.dati);
      } else {
        await recarregarRateio(rotulo);
      }
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSalvandoNovoMembroRateio(false);
    }
  }

  // Marca lançado um membro do rateio (não necessariamente o "I" aberto na
  // tela) - reaproveita a mesma rota de marcarLancado, só que endereçando
  // pelo código/inscrição do membro clicado.
  async function marcarLancadoMembro(codigoMembro, inscricaoMembro, tributo) {
    setError('');
    try {
      await api.patch(`/imoveis/${encodeURIComponent(codigoNaUrl(codigoMembro))}/lancado`, {
        tributo,
        status: 'Feito',
        inscricao: inscricaoMembro,
      });
      if (imovel) {
        await abrirImovel(imovel.codigo, imovel.inscricaoIptu || imovel.dati);
      } else if (grupoRateio) {
        await recarregarRateio(grupoRateio.rotuloContabil);
      }
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  // Mesmo código "I" com 2+ guias de IPTU/DATI (inscrições diferentes) - a
  // planilha grava isso como linhas separadas, mas mostrar como "N
  // resultados" soltos parece um bug de duplicação. Agrupa como um só
  // imóvel com abas por inscrição em vez de uma lista achatada repetida.
  const mesmoCodigoEmTodos =
    resultados.length > 1 &&
    resultados[0].codigo != null &&
    resultados.every((r) => r.codigo != null && String(r.codigo) === String(resultados[0].codigo));

  return (
    <div className="page">
      <h2>Consultar imóvel</h2>

      <form className="inline-form" onSubmit={buscar}>
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Código, inscrição, proprietário ou número do imóvel de rateio..."
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Buscando...' : 'Buscar'}
        </button>
      </form>

      {error && <div className="error">{error}</div>}

      {dividindo && (
        <div className="card destaque">
          <div className="iptu-header">
            <h4>Dividir/agrupar rateio — inscrição {inscricaoDivisao}</h4>
            <button type="button" className="link-btn" onClick={fecharDivisao}>
              Cancelar
            </button>
          </div>
          <p className="meta">
            Junta todas as linhas "I" que têm essa mesma inscrição num imóvel de rateio e grava o valor de cada
            uma de uma vez — sem precisar re-lançar o carnê pelo assistente de Lançar.
          </p>

          {imovel && imovel.inscricaoIptu && imovel.dati && (
            <div className="choice-row">
              <button className={tributoDivisao === 'IPTU' ? '' : 'link-btn'} onClick={() => trocarTributoDivisao('IPTU')}>
                IPTU
              </button>
              <button className={tributoDivisao === 'DATI' ? '' : 'link-btn'} onClick={() => trocarTributoDivisao('DATI')}>
                DATI
              </button>
            </div>
          )}

          <label>
            Número do imóvel de rateio (o usado no sistema contábil, não é código "I")
            <input value={rotuloDivisao} onChange={(e) => setRotuloDivisao(e.target.value)} placeholder="ex: 837" />
          </label>

          <label>
            Forma de pagamento (aplica a todas as linhas)
            <select value={formaPgtoDivisao} onChange={(e) => setFormaPgtoDivisao(e.target.value)}>
              <option value="Cota única">Cota única</option>
              <option value="Parcelado">Parcelado</option>
            </select>
          </label>

          {carregandoDivisao && <p className="meta">Buscando linhas dessa inscrição...</p>}

          {!carregandoDivisao && (
            <>
              {membrosDivisao.length > 0 && (
                <>
                  <label>
                    Quem paga (aplica a todas as linhas)
                    <select value="" onChange={(e) => e.target.value && aplicarQuemPagaDivisaoTodos(e.target.value)}>
                      <option value="">— escolher pra todas —</option>
                      {(config?.listas?.quemPagaOpcoes || []).map((op) => (
                        <option key={op} value={op}>
                          {op}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Valor total do carnê no ano (referência pra dividir igualmente)
                    <input
                      type="number"
                      step="0.01"
                      value={valorTotalDivisao}
                      onChange={(e) => setValorTotalDivisao(e.target.value)}
                    />
                  </label>
                  {formaPgtoDivisao === 'Parcelado' && (
                    <p className="meta">
                      Some as {config?.listas?.nParcelas || '10'} parcelas do carnê (não só uma) — "dividir
                      igualmente" já calcula sozinho a parcela mensal de cada linha.
                    </p>
                  )}
                  <label>
                    Dividir por quantas partes
                    <input
                      type="number"
                      step="1"
                      value={divisorDivisao}
                      onChange={(e) => setDivisorDivisao(e.target.value)}
                    />
                  </label>
                  <p className="meta">
                    Por padrão é a quantidade de linhas ({membrosDivisao.length}), mas pode ser diferente — ex: o
                    imóvel tem mais frações do que "I"s cadastrados hoje.
                  </p>
                  <button type="button" className="link-btn" onClick={dividirValorIgualmente} disabled={!valorTotalDivisao}>
                    Dividir igualmente (÷ {divisorDivisao || membrosDivisao.length})
                  </button>
                  <p className="meta">Soma das linhas abaixo: {formatarMoeda(somaMembrosDivisao())}</p>

                  <ul className="resumo-list">
                    {membrosDivisao.map((m) => (
                      <li key={m.key} className="card">
                        <strong>I {m.codigo}</strong> — {m.nominalIptu || m.proprietario || 'sem nome'}
                        <button type="button" className="link-btn" onClick={() => removerMembroDivisao(m.key)}>
                          remover desta divisão
                        </button>
                        <label>
                          Proprietário
                          <input
                            value={m.proprietario}
                            onChange={(e) => atualizarMembroDivisao(m.key, { proprietario: e.target.value })}
                          />
                        </label>
                        <label>
                          Quem paga
                          <select
                            value={m.quemPaga}
                            onChange={(e) => atualizarMembroDivisao(m.key, { quemPaga: e.target.value })}
                          >
                            <option value="">—</option>
                            {(config?.listas?.quemPagaOpcoes || []).map((op) => (
                              <option key={op} value={op}>
                                {op}
                              </option>
                            ))}
                          </select>
                        </label>
                        {formaPgtoDivisao === 'Cota única' ? (
                          <label>
                            Valor desta linha (R$)
                            <input
                              type="number"
                              step="0.01"
                              value={m.cotaUnica}
                              onChange={(e) => atualizarMembroDivisao(m.key, { cotaUnica: e.target.value })}
                            />
                          </label>
                        ) : (
                          <>
                            <label>
                              Parcela desta linha (R$)
                              <input
                                type="number"
                                step="0.01"
                                value={m.parcela}
                                onChange={(e) => atualizarMembroDivisao(m.key, { parcela: e.target.value })}
                              />
                            </label>
                            <label>
                              Última parcela (R$, deixe em branco se igual)
                              <input
                                type="number"
                                step="0.01"
                                value={m.ultimaParcela}
                                onChange={(e) => atualizarMembroDivisao(m.key, { ultimaParcela: e.target.value })}
                              />
                            </label>
                          </>
                        )}
                        <label>
                          % de reajuste (provisão pro próximo exercício)
                          <input
                            type="number"
                            step="0.1"
                            value={m.reajustePct}
                            onChange={(e) => atualizarMembroDivisao(m.key, { reajustePct: e.target.value })}
                          />
                        </label>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <label>
                Adicionar linha "I" à divisão (aumenta o divisor)
                <input
                  placeholder="código, aperte Enter"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      adicionarMembroDivisao(e.currentTarget.value);
                      e.currentTarget.value = '';
                    }
                  }}
                />
              </label>

              {membrosDivisao.length === 0 && (
                <p className="meta">
                  Nenhuma linha com código "I" nessa divisão ainda — adicione pelo campo acima.
                </p>
              )}

              {pendenciasDivisao().length > 0 && (
                <p className="meta">Falta pra salvar: {pendenciasDivisao().join(' · ')}</p>
              )}

              <div className="actions-row">
                <button type="button" className="link-btn" onClick={fecharDivisao} disabled={salvandoDivisao}>
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={pendenciasDivisao().length > 0 || salvandoDivisao}
                  onClick={confirmarDivisao}
                >
                  {salvandoDivisao ? 'Salvando...' : `Salvar rateio (${membrosDivisao.length} linhas)`}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {grupoRateio && !imovel && !dividindo && (
        <div className="card destaque">
          <h4>Imóvel de rateio {grupoRateio.rotuloContabil}</h4>
          <p className="meta">
            {grupoRateio.totalImoveis} linha(s) em {grupoRateio.porInscricao.length} inscrição(ões) — não é código
            "I", é o número usado no sistema contábil.
          </p>
          {!inscricaoRateio ? (
            <ul className="resumo-list">
              {grupoRateio.porInscricao.map((grp) => (
                <li key={grp.inscricao || 'sem-inscricao'}>
                  <button className="choice-item" onClick={() => setInscricaoRateio(grp)}>
                    Inscrição {grp.inscricao || '(sem inscrição)'} — {grp.imoveis.map((m) => `I ${m.codigo}`).join(', ')}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <>
              {grupoRateio.porInscricao.length > 1 && (
                <button className="link-btn" onClick={() => setInscricaoRateio(null)}>
                  ← outras inscrições deste rateio
                </button>
              )}
              <p className="meta">Imóveis da inscrição {inscricaoRateio.inscricao}:</p>
              {!modoLeitura && (
                <button type="button" className="link-btn" onClick={() => abrirDivisaoRateio(inscricaoRateio)}>
                  Dividir/editar valores desta inscrição
                </button>
              )}
              <button type="button" className="link-btn" onClick={() => gerarRelatorioRateio(grupoRateio)}>
                Gerar relatório para lançamento
              </button>
              {novoMembroRateio ? (
                <NovoMembroRateioForm
                  dados={novoMembroRateio}
                  quemPagaOpcoes={config?.listas?.quemPagaOpcoes || []}
                  onChange={atualizarNovoMembroRateio}
                  onCancelar={fecharNovoMembroRateio}
                  onSalvar={salvarNovoMembroRateio}
                  salvando={salvandoNovoMembroRateio}
                  pendencias={pendenciasNovoMembroRateio()}
                />
              ) : (
                <>
                  <div className="actions-row">
                    {!modoLeitura && (
                      <button
                        type="button"
                        className="link-btn"
                        onClick={() => abrirNovoMembroRateio(grupoRateio.rotuloContabil)}
                      >
                        + Adicionar imóvel a este rateio
                      </button>
                    )}
                    <label className="meta">
                      <input
                        type="checkbox"
                        checked={soPendentesRateio}
                        onChange={(e) => setSoPendentesRateio(e.target.checked)}
                      />{' '}
                      mostrar só pendentes
                    </label>
                  </div>
                  <ul className="resumo-list">
                    {inscricaoRateio.imoveis
                      .filter((m) => !soPendentesRateio || membroRateioPendente(m))
                      .map((m, i) => (
                        <MembroRateioLinha
                          key={`${m.codigo}-${i}`}
                          m={m}
                          onAbrir={() => abrirImovel(m.codigo, m.inscricaoIptu || m.dati)}
                          onMarcarLancado={(tributo) => marcarLancadoMembro(m.codigo, m.inscricaoIptu || m.dati, tributo)}
                          modoLeitura={modoLeitura}
                          editando={editandoMembroRateio === chaveMembroRateio(m)}
                          onIniciarEdicao={() => iniciarEdicaoMembroRateio(m)}
                          onCancelarEdicao={cancelarEdicaoMembroRateio}
                          onSalvarEdicao={() => salvarEdicaoMembroRateio(m)}
                          formEdicao={formMembroRateio}
                          onChangeEdicao={atualizarFormMembroRateio}
                          salvandoEdicao={salvandoMembroRateio}
                          previewAberto={previewCarne === chaveMembroRateio(m)}
                          onAlternarPreview={() =>
                            setPreviewCarne((prev) => (prev === chaveMembroRateio(m) ? null : chaveMembroRateio(m)))
                          }
                          urlPreview={m.linkCarne ? urlPreviewCarne(m.linkCarne) : undefined}
                        />
                      ))}
                  </ul>
                </>
              )}
            </>
          )}
        </div>
      )}

      {resultados.length > 1 && !imovel && !dividindo && mesmoCodigoEmTodos && (
        <div className="card">
          <h4>I {resultados[0].codigo} — {resultados[0].proprietario}</h4>
          <p className="meta">
            Esse código tem {resultados.length} guias de IPTU/DATI (inscrições diferentes) — escolha qual:
          </p>
          <ul className="resumo-list">
            {resultados.map((r, i) => {
              const valorLabel = valorLabelResultado(r);
              return (
                <li key={`${r.codigo}-${r.inscricaoIptu || r.dati || i}`}>
                  <button
                    className="choice-item"
                    onClick={() => abrirImovel(r.codigo, r.inscricaoIptu || r.dati)}
                  >
                    Inscrição {r.inscricaoIptu || r.dati || 'sem inscrição'}
                    {valorLabel && <> — {valorLabel}</>}
                  </button>
                  {r.obs && <span className="meta"> {r.obs}</span>}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {resultados.length > 1 && !imovel && !dividindo && !mesmoCodigoEmTodos && (
        <div className="card">
          <h4>{resultados.length} resultado(s)</h4>
          <ul className="resumo-list">
            {resultados.map((r, i) => (
              <li key={`${r.codigo}-${r.inscricaoIptu || r.dati || i}`}>
                <button
                  className="choice-item"
                  onClick={() => abrirImovel(r.codigo, r.inscricaoIptu || r.dati)}
                >
                  <strong>I {r.codigo || '(sem código)'}</strong> — {r.proprietario} ({r.inscricaoIptu || 'sem inscrição'})
                  {r.obs && <span className="meta"> — {r.obs}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {imovel && !editando && !dividindo && (
        <div className="resultado">
          <div className="iptu-header">
            <h3>Imóvel I {imovel.codigo || '(sem código)'} — {imovel.proprietario}</h3>
            {!modoLeitura && (
              <div>
                <button className="link-btn" onClick={iniciarEdicao}>
                  Editar
                </button>{' '}
                {(imovel.inscricaoIptu || imovel.dati) && (
                  <>
                    <button className="link-btn" onClick={abrirDivisao}>
                      Dividir rateio desta inscrição
                    </button>{' '}
                  </>
                )}
                <button className="link-btn link-btn-perigo" onClick={excluirImovel}>
                  Excluir imóvel
                </button>
              </div>
            )}
          </div>
          {imovel.nominalIptu && (
            <p className="meta">Nome no carnê: {imovel.nominalIptu}</p>
          )}
          {imovel.obs && <p className="obs-destaque">OBS: {imovel.obs}</p>}

          <div className="card">
            <h4>IPTU</h4>
            <ul className="resumo-list">
              <li>Inscrição: {imovel.inscricaoIptu || '—'}</li>
              <li>Quem paga: {imovel.quemPagaIptu || '—'}</li>
              <li>Cota única: {formatarMoeda(imovel.iptuCotaUnica)}</li>
              <li>Parcela: {formatarMoeda(imovel.iptuParcela)} {imovel.iptuUltimaParcela ? `(última: ${formatarMoeda(imovel.iptuUltimaParcela)})` : ''}</li>
              <li>Total: {formatarMoeda(imovel.iptuTotalCalculado)}</li>
              {imovel.iptuProvisaoProximoAno != null && (
                <li>Provisão próx. exercício: {formatarMoeda(imovel.iptuProvisaoProximoAno)}</li>
              )}
              {imovel.iptuProvisaoParcela != null && (
                <li>
                  Provisão parcela: {formatarMoeda(imovel.iptuProvisaoParcela)}{' '}
                  {imovel.iptuProvisaoUltimaParcela
                    ? `(última: ${formatarMoeda(imovel.iptuProvisaoUltimaParcela)})`
                    : ''}
                </li>
              )}
              <li>
                Lançado no sistema: <strong>{imovel.iptuLancado || 'Não'}</strong>{' '}
                {!modoLeitura && imovel.iptuLancado !== 'Feito' && (
                  <button className="link-btn" onClick={() => marcarLancado('IPTU')}>
                    marcar como lançado
                  </button>
                )}
              </li>
            </ul>
          </div>

          <div className="card">
            <h4>DATI</h4>
            <ul className="resumo-list">
              <li>Inscrição: {imovel.dati || '—'}</li>
              <li>Quem paga: {imovel.quemPagaDati || '—'}</li>
              <li>Cota única: {formatarMoeda(imovel.datiCotaUnica)}</li>
              <li>Parcela: {formatarMoeda(imovel.datiParcela)} {imovel.datiUltimaParcela ? `(última: ${formatarMoeda(imovel.datiUltimaParcela)})` : ''}</li>
              <li>Total: {formatarMoeda(imovel.datiTotalCalculado)}</li>
              {imovel.datiProvisaoProximoAno != null && (
                <li>Provisão próx. exercício: {formatarMoeda(imovel.datiProvisaoProximoAno)}</li>
              )}
              {imovel.datiProvisaoParcela != null && (
                <li>
                  Provisão parcela: {formatarMoeda(imovel.datiProvisaoParcela)}{' '}
                  {imovel.datiProvisaoUltimaParcela
                    ? `(última: ${formatarMoeda(imovel.datiProvisaoUltimaParcela)})`
                    : ''}
                </li>
              )}
              <li>
                Lançado no sistema: <strong>{imovel.datiLancado || 'Não'}</strong>{' '}
                {!modoLeitura && imovel.datiLancado !== 'Feito' && (
                  <button className="link-btn" onClick={() => marcarLancado('DATI')}>
                    marcar como lançado
                  </button>
                )}
              </li>
            </ul>
          </div>

          <div className="card destaque">
            <h4>Resumo</h4>
            <ul className="resumo-list">
              <li>Forma de pagamento: {imovel.formaPgto || '—'}</li>
              <li>
                <strong>Valor a pagar: {formatarMoeda(imovel.valorAPagarCalculado)}</strong>
              </li>
              {imovel.imovelDeRateio && <li>Imóvel de rateio: {imovel.imovelDeRateio}</li>}
              {imovel.linkCarne && (
                <li>
                  Carnê salvo:{' '}
                  <button className="link-btn" title={imovel.linkCarne} onClick={abrirCarne}>
                    {imovel.linkCarne.split(/[/\\]/).pop()}
                  </button>
                </li>
              )}
            </ul>
            {imovel.linkCarne && (
              <div className="actions-row">
                <button
                  type="button"
                  onClick={() => setPreviewCarne((prev) => (prev === 'imovel' ? null : 'imovel'))}
                >
                  {previewCarne === 'imovel' ? 'Fechar visualização' : 'Visualizar carnê aqui'}
                </button>
                <button className="link-btn" onClick={abrirCarne}>
                  Abrir no aplicativo padrão
                </button>
              </div>
            )}
            {previewCarne === 'imovel' && imovel.linkCarne && (
              <iframe
                title="Carnê"
                src={urlPreviewCarne(imovel.linkCarne)}
                className="preview-carne"
              />
            )}
          </div>

          {imovel.grupoRateio && (
            <div className="card destaque">
              <h4>Imóvel de rateio {imovel.grupoRateio.rotuloContabil}</h4>
              <p className="meta">
                Número usado no sistema contábil pra cobrar o proprietário pelo total das{' '}
                {imovel.grupoRateio.totalImoveis} linhas abaixo (não é código "I" de nenhuma delas). Valor
                consolidado pra lançar de uma vez:
              </p>
              <ul className="resumo-list">
                {imovel.grupoRateio.totais.iptuCotaUnica != null && (
                  <li>IPTU cota única (total): <strong>{formatarMoeda(imovel.grupoRateio.totais.iptuCotaUnica)}</strong></li>
                )}
                {imovel.grupoRateio.totais.iptuParcelado != null && (
                  <li>IPTU parcelado (total): <strong>{formatarMoeda(imovel.grupoRateio.totais.iptuParcelado)}</strong></li>
                )}
                {imovel.grupoRateio.totais.datiCotaUnica != null && (
                  <li>DATI cota única (total): <strong>{formatarMoeda(imovel.grupoRateio.totais.datiCotaUnica)}</strong></li>
                )}
                {imovel.grupoRateio.totais.datiParcelado != null && (
                  <li>DATI parcelado (total): <strong>{formatarMoeda(imovel.grupoRateio.totais.datiParcelado)}</strong></li>
                )}
              </ul>
              <button
                type="button"
                className="link-btn"
                onClick={() => gerarRelatorioRateio(imovel.grupoRateio)}
              >
                Gerar relatório para lançamento
              </button>
              {novoMembroRateio ? (
                <NovoMembroRateioForm
                  dados={novoMembroRateio}
                  quemPagaOpcoes={config?.listas?.quemPagaOpcoes || []}
                  onChange={atualizarNovoMembroRateio}
                  onCancelar={fecharNovoMembroRateio}
                  onSalvar={salvarNovoMembroRateio}
                  salvando={salvandoNovoMembroRateio}
                  pendencias={pendenciasNovoMembroRateio()}
                />
              ) : (
                <>
                  <div className="actions-row">
                    {!modoLeitura && (
                      <button
                        type="button"
                        className="link-btn"
                        onClick={() => abrirNovoMembroRateio(imovel.grupoRateio.rotuloContabil)}
                      >
                        + Adicionar imóvel a este rateio
                      </button>
                    )}
                    <label className="meta">
                      <input
                        type="checkbox"
                        checked={soPendentesRateio}
                        onChange={(e) => setSoPendentesRateio(e.target.checked)}
                      />{' '}
                      mostrar só pendentes
                    </label>
                  </div>
                  <p className="meta">Linhas do grupo:</p>
                  <ul className="resumo-list">
                    {imovel.grupoRateio.imoveis
                      .filter((m) => !soPendentesRateio || membroRateioPendente(m))
                      .map((m, i) => {
                        const atual = m.codigo === imovel.codigo && m.inscricaoIptu === imovel.inscricaoIptu;
                        return (
                          <MembroRateioLinha
                            key={`${m.codigo}-${m.inscricaoIptu || m.dati || i}`}
                            m={m}
                            atual={atual}
                            onAbrir={() => abrirImovel(m.codigo, m.inscricaoIptu || m.dati)}
                            onMarcarLancado={(tributo) => marcarLancadoMembro(m.codigo, m.inscricaoIptu || m.dati, tributo)}
                            onRemover={atual ? undefined : () => removerDoRateio(m.codigo, m.inscricaoIptu || m.dati)}
                            modoLeitura={modoLeitura}
                            editando={editandoMembroRateio === chaveMembroRateio(m)}
                            onIniciarEdicao={() => iniciarEdicaoMembroRateio(m)}
                            onCancelarEdicao={cancelarEdicaoMembroRateio}
                            onSalvarEdicao={() => salvarEdicaoMembroRateio(m)}
                            formEdicao={formMembroRateio}
                            onChangeEdicao={atualizarFormMembroRateio}
                            salvandoEdicao={salvandoMembroRateio}
                            previewAberto={previewCarne === chaveMembroRateio(m)}
                            onAlternarPreview={() =>
                              setPreviewCarne((prev) => (prev === chaveMembroRateio(m) ? null : chaveMembroRateio(m)))
                            }
                            urlPreview={m.linkCarne ? urlPreviewCarne(m.linkCarne) : undefined}
                          />
                        );
                      })}
                  </ul>
                </>
              )}
              <p className="meta">
                Pra ajustar a divisão sem re-enviar o PDF, use "Dividir rateio desta inscrição" no topo da tela. Pra
                trocar o carnê, use "Lançar" de novo informando o número {imovel.grupoRateio.rotuloContabil} como
                imóvel de rateio.
              </p>
            </div>
          )}
        </div>
      )}

      {imovel && editando && (
        <form className="resultado" onSubmit={salvarEdicao}>
          <div className="iptu-header">
            <h3>Editando imóvel I {imovel.codigo}</h3>
            <button type="button" className="link-btn" onClick={() => setEditando(false)}>
              Cancelar
            </button>
          </div>

          <div className="card">
            <h4>Identificação</h4>
            <label>
              Proprietário
              <input value={form.proprietario} onChange={(e) => atualizarCampo('proprietario', e.target.value)} />
            </label>
            <label>
              Nome no carnê (se diferente do proprietário)
              <input value={form.nominalIptu} onChange={(e) => atualizarCampo('nominalIptu', e.target.value)} />
            </label>
            <label>
              Inscrição IPTU
              <input value={form.inscricaoIptu} onChange={(e) => atualizarCampo('inscricaoIptu', e.target.value)} />
            </label>
            <label>
              Inscrição DATI
              <input value={form.dati} onChange={(e) => atualizarCampo('dati', e.target.value)} />
            </label>
            <label>
              Imóvel de rateio
              <input value={form.imovelDeRateio} onChange={(e) => atualizarCampo('imovelDeRateio', e.target.value)} />
            </label>
          </div>

          <div className="card">
            <h4>IPTU</h4>
            <label>
              Quem paga
              <select value={form.quemPagaIptu} onChange={(e) => atualizarCampo('quemPagaIptu', e.target.value)}>
                <option value="">—</option>
                {(config?.listas?.quemPagaOpcoes || []).map((op) => (
                  <option key={op} value={op}>
                    {op}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Cota única (R$)
              <input type="number" step="0.01" value={form.iptuCotaUnica} onChange={(e) => atualizarCampo('iptuCotaUnica', e.target.value)} />
            </label>
            <label>
              Parcela (R$)
              <input type="number" step="0.01" value={form.iptuParcela} onChange={(e) => atualizarCampo('iptuParcela', e.target.value)} />
            </label>
            <label>
              Última parcela (R$)
              <input type="number" step="0.01" value={form.iptuUltimaParcela} onChange={(e) => atualizarCampo('iptuUltimaParcela', e.target.value)} />
            </label>
            <label>
              Provisão próx. exercício (R$)
              <input type="number" step="0.01" value={form.iptuProvisaoProximoAno} onChange={(e) => atualizarCampo('iptuProvisaoProximoAno', e.target.value)} />
            </label>
            <label>
              Provisão parcela (R$)
              <input type="number" step="0.01" value={form.iptuProvisaoParcela} onChange={(e) => atualizarCampo('iptuProvisaoParcela', e.target.value)} />
            </label>
            <label>
              Provisão última parcela (R$)
              <input type="number" step="0.01" value={form.iptuProvisaoUltimaParcela} onChange={(e) => atualizarCampo('iptuProvisaoUltimaParcela', e.target.value)} />
            </label>
          </div>

          <div className="card">
            <h4>DATI</h4>
            <label>
              Quem paga
              <select value={form.quemPagaDati} onChange={(e) => atualizarCampo('quemPagaDati', e.target.value)}>
                <option value="">—</option>
                {(config?.listas?.quemPagaOpcoes || []).map((op) => (
                  <option key={op} value={op}>
                    {op}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Cota única (R$)
              <input type="number" step="0.01" value={form.datiCotaUnica} onChange={(e) => atualizarCampo('datiCotaUnica', e.target.value)} />
            </label>
            <label>
              Parcela (R$)
              <input type="number" step="0.01" value={form.datiParcela} onChange={(e) => atualizarCampo('datiParcela', e.target.value)} />
            </label>
            <label>
              Última parcela (R$)
              <input type="number" step="0.01" value={form.datiUltimaParcela} onChange={(e) => atualizarCampo('datiUltimaParcela', e.target.value)} />
            </label>
            <label>
              Provisão próx. exercício (R$)
              <input type="number" step="0.01" value={form.datiProvisaoProximoAno} onChange={(e) => atualizarCampo('datiProvisaoProximoAno', e.target.value)} />
            </label>
            <label>
              Provisão parcela (R$)
              <input type="number" step="0.01" value={form.datiProvisaoParcela} onChange={(e) => atualizarCampo('datiProvisaoParcela', e.target.value)} />
            </label>
            <label>
              Provisão última parcela (R$)
              <input type="number" step="0.01" value={form.datiProvisaoUltimaParcela} onChange={(e) => atualizarCampo('datiProvisaoUltimaParcela', e.target.value)} />
            </label>
          </div>

          <div className="card destaque">
            <label>
              Forma de pagamento
              <select value={form.formaPgto} onChange={(e) => atualizarCampo('formaPgto', e.target.value)}>
                <option value="">—</option>
                {(config?.listas?.formaPgtoOpcoes || []).map((op) => (
                  <option key={op} value={op}>
                    {op}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Observações
              <input value={form.obs} onChange={(e) => atualizarCampo('obs', e.target.value)} />
            </label>
            <div className="actions-row">
              <button type="button" className="link-btn" onClick={() => setEditando(false)} disabled={salvando}>
                Cancelar
              </button>
              <button type="submit" disabled={salvando}>
                {salvando ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
