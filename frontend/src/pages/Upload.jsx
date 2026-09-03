import { useEffect, useState } from 'react';
import { api, apiErrorMessage } from '../api.js';

const STEPS = ['arquivo', 'tributo', 'valores', 'imovel', 'quemPaga', 'confirmar'];

function formatarMoeda(valor) {
  if (valor === null || valor === undefined || valor === '') return '—';
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarData(iso) {
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

export default function Upload() {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sucesso, setSucesso] = useState(null);

  const [config, setConfig] = useState(null);

  const [arquivo, setArquivo] = useState(null);
  const [resumoParcelas, setResumoParcelas] = useState({ parcela: null, ultimaParcela: null });
  const [cotaUnicaSugerida, setCotaUnicaSugerida] = useState([]);
  const [escolhendoCotaUnica, setEscolhendoCotaUnica] = useState(false);

  const [tributo, setTributo] = useState('');
  const [formaPgto, setFormaPgto] = useState('');
  const [cotaUnica, setCotaUnica] = useState('');
  const [parcela, setParcela] = useState('');
  const [ultimaParcela, setUltimaParcela] = useState('');

  const [codigo, setCodigo] = useState('');
  const [buscandoImovel, setBuscandoImovel] = useState(false);
  const [imovelEncontrado, setImovelEncontrado] = useState(null);
  const [imovelNovo, setImovelNovo] = useState(false);
  const [proprietario, setProprietario] = useState('');
  const [inscricaoIptu, setInscricaoIptu] = useState('');
  const [dati, setDati] = useState('');

  const [quemPaga, setQuemPaga] = useState('');
  const [obs, setObs] = useState('');

  useEffect(() => {
    api
      .get('/config')
      .then(({ data }) => setConfig(data))
      .catch(() => {});
  }, []);

  function reset() {
    setStep(0);
    setArquivo(null);
    setResumoParcelas({ parcela: null, ultimaParcela: null });
    setCotaUnicaSugerida([]);
    setEscolhendoCotaUnica(false);
    setTributo('');
    setFormaPgto('');
    setCotaUnica('');
    setParcela('');
    setUltimaParcela('');
    setCodigo('');
    setImovelEncontrado(null);
    setImovelNovo(false);
    setProprietario('');
    setInscricaoIptu('');
    setDati('');
    setQuemPaga('');
    setObs('');
    setSucesso(null);
    setError('');
  }

  async function handleArquivoChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    setError('');
    setLoading(true);
    try {
      const form = new FormData();
      form.append('arquivo', file);
      const { data } = await api.post('/lancamentos/extrair', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setArquivo(file);
      setResumoParcelas(data.resumoParcelas || { parcela: null, ultimaParcela: null });
      setCotaUnicaSugerida(data.cotaUnica || []);
      setStep(1);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  }

  function escolherTributo(t) {
    setTributo(t);
    setStep(2);
  }

  function escolherFormaPgto(forma) {
    setFormaPgto(forma);
    if (forma === 'Cota única') {
      if (cotaUnicaSugerida.length > 1) {
        setEscolhendoCotaUnica(true);
        return;
      }
      if (cotaUnicaSugerida.length === 1) {
        setCotaUnica(String(cotaUnicaSugerida[0].valor));
      }
    } else {
      setParcela(resumoParcelas.parcela !== null ? String(resumoParcelas.parcela) : '');
      setUltimaParcela(resumoParcelas.ultimaParcela !== null ? String(resumoParcelas.ultimaParcela) : '');
    }
    setStep(3);
  }

  function escolherOpcaoCotaUnica(opcao) {
    setCotaUnica(opcao ? String(opcao.valor) : '');
    setEscolhendoCotaUnica(false);
    setStep(3);
  }

  async function buscarImovel() {
    if (!codigo.trim()) return;
    setError('');
    setBuscandoImovel(true);
    setImovelEncontrado(null);
    setImovelNovo(false);
    try {
      const { data } = await api.get(`/imoveis/${encodeURIComponent(codigo.trim())}`);
      setImovelEncontrado(data);
      setProprietario(data.proprietario || '');
      setInscricaoIptu(data.inscricaoIptu || '');
      setDati(data.dati || '');
      if (tributo === 'IPTU' && data.quemPagaIptu) setQuemPaga(data.quemPagaIptu);
      if (tributo === 'DATI' && data.quemPagaDati) setQuemPaga(data.quemPagaDati);
    } catch (err) {
      if (err?.response?.status === 404) {
        setImovelNovo(true);
        setProprietario('');
        setInscricaoIptu('');
        setDati('');
      } else {
        setError(apiErrorMessage(err));
      }
    } finally {
      setBuscandoImovel(false);
    }
  }

  function valoresValidos() {
    if (formaPgto === 'Cota única') return cotaUnica !== '' && !isNaN(Number(cotaUnica));
    return parcela !== '' && !isNaN(Number(parcela));
  }

  async function confirmar() {
    setError('');
    setLoading(true);
    try {
      const form = new FormData();
      if (arquivo) form.append('arquivo', arquivo, arquivo.name);
      form.append('codigo', codigo.trim());
      form.append('tributo', tributo);
      form.append('formaPgto', formaPgto);
      form.append('proprietario', proprietario);
      if (tributo === 'IPTU') form.append('inscricaoIptu', inscricaoIptu);
      if (tributo === 'DATI') form.append('dati', dati);
      form.append('quemPaga', quemPaga);
      form.append('obs', obs);

      if (formaPgto === 'Cota única') {
        form.append('cotaUnica', cotaUnica);
      } else {
        form.append('parcela', parcela);
        if (ultimaParcela !== '') form.append('ultimaParcela', ultimaParcela);
      }

      const { data } = await api.post('/lancamentos', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setSucesso(data);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  if (config && config.xlsxExists === false) {
    return (
      <div className="page">
        <div className="card">
          <h3>Nenhuma planilha configurada</h3>
          <p className="meta">Escolha o arquivo .xlsx em Configurações antes de lançar um IPTU.</p>
        </div>
      </div>
    );
  }

  if (sucesso) {
    return (
      <div className="page">
        <div className="card success-card">
          <h2>Lançamento salvo na planilha</h2>
          <p>
            Código <strong>{sucesso.codigo}</strong>
            {sucesso.created ? ' — imóvel novo, linha criada.' : ' — linha atualizada.'}
          </p>
          <button onClick={reset}>Lançar outro</button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <h2>Lançar IPTU / DATI</h2>
      <div className="steps-indicator">
        {STEPS.map((s, i) => (
          <div key={s} className={`step-dot ${i <= step ? 'active' : ''}`} />
        ))}
      </div>

      {error && <div className="error">{error}</div>}

      {step === 0 && (
        <div className="card">
          <h3>1. Envie o carnê (PDF)</h3>
          <input type="file" accept="application/pdf" onChange={handleArquivoChange} disabled={loading} />
          {loading && <p>Lendo o arquivo...</p>}
        </div>
      )}

      {step === 1 && (
        <div className="card">
          <h3>2. Esse carnê é de qual tributo?</h3>
          <div className="choice-row">
            <button onClick={() => escolherTributo('IPTU')}>IPTU</button>
            <button onClick={() => escolherTributo('DATI')}>DATI</button>
          </div>
          <div className="actions-row">
            <button className="link-btn" onClick={() => setStep(0)}>
              ← Voltar
            </button>
          </div>
        </div>
      )}

      {step === 2 && !escolhendoCotaUnica && (
        <div className="card">
          <h3>3. Cota única ou parcelado?</h3>
          <div className="choice-row">
            <button onClick={() => escolherFormaPgto('Cota única')}>Cota única</button>
            <button onClick={() => escolherFormaPgto('Parcelado')}>Parcelado</button>
          </div>
          <div className="actions-row">
            <button className="link-btn" onClick={() => setStep(1)}>
              ← Voltar
            </button>
          </div>
        </div>
      )}

      {step === 2 && escolhendoCotaUnica && (
        <div className="card">
          <h3>O arquivo tem mais de uma opção de cota única. Qual foi usada?</h3>
          <p className="meta">
            É comum o carnê trazer várias guias de pagamento à vista, com valores diferentes
            conforme a data (desconto por antecipação). Escolha a que corresponde ao pagamento
            feito.
          </p>
          <ul className="resumo-list">
            {cotaUnicaSugerida.map((opcao, i) => (
              <li key={i}>
                <button className="choice-item" onClick={() => escolherOpcaoCotaUnica(opcao)}>
                  {formatarMoeda(opcao.valor)} — vencimento {formatarData(opcao.vencimento)}
                </button>
              </li>
            ))}
            <li>
              <button className="link-btn" onClick={() => escolherOpcaoCotaUnica(null)}>
                Nenhuma dessas — vou informar manualmente
              </button>
            </li>
          </ul>
        </div>
      )}

      {step === 3 && (
        <div className="card">
          <h3>4. Conferir valor{formaPgto === 'Parcelado' ? 'es' : ''}</h3>
          {formaPgto === 'Cota única' ? (
            <label>
              Valor da cota única (R$)
              <input
                type="number"
                step="0.01"
                value={cotaUnica}
                onChange={(e) => setCotaUnica(e.target.value)}
              />
            </label>
          ) : (
            <>
              <label>
                Valor da parcela (R$)
                <input type="number" step="0.01" value={parcela} onChange={(e) => setParcela(e.target.value)} />
              </label>
              <label>
                Valor da última parcela (R$, deixe igual se não houver diferença)
                <input
                  type="number"
                  step="0.01"
                  value={ultimaParcela}
                  onChange={(e) => setUltimaParcela(e.target.value)}
                />
              </label>
              {config?.listas?.nParcelas && (
                <p className="meta">
                  Total calculado ({config.listas.nParcelas}x):{' '}
                  {formatarMoeda(
                    parcela === ''
                      ? null
                      : Number(parcela) * (config.listas.nParcelas - 1) +
                          Number(ultimaParcela === '' ? parcela : ultimaParcela)
                  )}
                </p>
              )}
            </>
          )}
          <div className="actions-row">
            <button className="link-btn" onClick={() => setStep(2)}>
              ← Voltar
            </button>
            <button disabled={!valoresValidos()} onClick={() => setStep(4)}>
              Continuar
            </button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="card">
          <h3>5. Código de identificação do imóvel</h3>
          <label>
            Código (coluna "I" da planilha)
            <input
              value={codigo}
              onChange={(e) => {
                setCodigo(e.target.value);
                setImovelEncontrado(null);
                setImovelNovo(false);
              }}
              onBlur={buscarImovel}
              placeholder="ex: 213"
            />
          </label>
          {buscandoImovel && <p className="meta">Buscando na planilha...</p>}

          {imovelEncontrado && (
            <div className="success">Imóvel encontrado: {imovelEncontrado.proprietario}</div>
          )}
          {imovelNovo && (
            <div className="meta">Código não encontrado na planilha — será criada uma linha nova.</div>
          )}

          {(imovelEncontrado || imovelNovo) && (
            <>
              <label>
                Proprietário
                <input value={proprietario} onChange={(e) => setProprietario(e.target.value)} />
              </label>
              {tributo === 'IPTU' && (
                <label>
                  Inscrição IPTU
                  <input value={inscricaoIptu} onChange={(e) => setInscricaoIptu(e.target.value)} />
                </label>
              )}
              {tributo === 'DATI' && (
                <label>
                  Inscrição DATI
                  <input value={dati} onChange={(e) => setDati(e.target.value)} />
                </label>
              )}
            </>
          )}

          <div className="actions-row">
            <button className="link-btn" onClick={() => setStep(3)}>
              ← Voltar
            </button>
            <button
              disabled={!codigo.trim() || !(imovelEncontrado || imovelNovo) || !proprietario.trim()}
              onClick={() => setStep(5)}
            >
              Continuar
            </button>
          </div>
        </div>
      )}

      {step === 5 && (
        <div className="card">
          <h3>6. Quem paga e confirmação</h3>
          <label>
            Quem paga o {tributo}
            <select value={quemPaga} onChange={(e) => setQuemPaga(e.target.value)}>
              <option value="">Selecione...</option>
              {(config?.listas?.quemPagaOpcoes || []).map((op) => (
                <option key={op} value={op}>
                  {op}
                </option>
              ))}
            </select>
          </label>
          <label>
            Observações (opcional)
            <input value={obs} onChange={(e) => setObs(e.target.value)} />
          </label>

          <ul className="resumo-list">
            <li>
              <strong>Código:</strong> {codigo}
            </li>
            <li>
              <strong>Tributo:</strong> {tributo}
            </li>
            <li>
              <strong>Forma:</strong> {formaPgto}
            </li>
            <li>
              <strong>Valor:</strong>{' '}
              {formaPgto === 'Cota única' ? formatarMoeda(cotaUnica) : formatarMoeda(parcela)}
              {formaPgto === 'Parcelado' && ultimaParcela !== '' && ultimaParcela !== parcela && (
                <> (última: {formatarMoeda(ultimaParcela)})</>
              )}
            </li>
          </ul>

          <div className="actions-row">
            <button className="link-btn" onClick={() => setStep(4)} disabled={loading}>
              ← Voltar
            </button>
            <button onClick={confirmar} disabled={loading || !quemPaga}>
              {loading ? 'Salvando...' : 'Salvar na planilha'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
