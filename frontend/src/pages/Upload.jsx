import { useState } from 'react';
import { api, apiErrorMessage } from '../api.js';

const STEPS = ['arquivo', 'tipoPagamento', 'formaPagamento', 'parcelas', 'confirmar'];

function novaParcelaVazia(numero) {
  return { numero, valor: '', vencimento: '' };
}

export default function Upload() {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sucesso, setSucesso] = useState(null);

  const [arquivo, setArquivo] = useState(null);
  const [tempId, setTempId] = useState(null);
  const [nomeOriginal, setNomeOriginal] = useState('');
  const [tipoPagamento, setTipoPagamento] = useState('');
  const [formaPagamento, setFormaPagamento] = useState('');
  const [codigoImovel, setCodigoImovel] = useState('');
  const [exercicio, setExercicio] = useState('');
  const [parcelas, setParcelas] = useState([]);

  function reset() {
    setStep(0);
    setArquivo(null);
    setTempId(null);
    setNomeOriginal('');
    setTipoPagamento('');
    setFormaPagamento('');
    setCodigoImovel('');
    setExercicio('');
    setParcelas([]);
    setSucesso(null);
    setError('');
  }

  async function handleArquivoChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    setArquivo(file);
    setError('');
    setLoading(true);
    try {
      const form = new FormData();
      form.append('arquivo', file);
      const { data } = await api.post('/iptus/parse', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setTempId(data.tempId);
      setNomeOriginal(data.nomeOriginal);
      const sugestoes =
        data.parcelasSugeridas.length > 0
          ? data.parcelasSugeridas.map((p, i) => ({
              numero: p.numero || i + 1,
              valor: p.valor ?? '',
              vencimento: p.vencimento ?? '',
            }))
          : [novaParcelaVazia(1)];
      setParcelas(sugestoes);
      setStep(1);
    } catch (err) {
      setError(apiErrorMessage(err));
      setArquivo(null);
    } finally {
      setLoading(false);
    }
  }

  function escolherTipoPagamento(tipo) {
    setTipoPagamento(tipo);
    if (tipo === 'unica') {
      setParcelas((prev) => [prev[0] || novaParcelaVazia(1)]);
    }
    setStep(2);
  }

  function escolherFormaPagamento(forma) {
    setFormaPagamento(forma);
    setStep(3);
  }

  function atualizarParcela(index, campo, valor) {
    setParcelas((prev) => prev.map((p, i) => (i === index ? { ...p, [campo]: valor } : p)));
  }

  function adicionarParcela() {
    setParcelas((prev) => [...prev, novaParcelaVazia(prev.length + 1)]);
  }

  function removerParcela(index) {
    setParcelas((prev) => prev.filter((_, i) => i !== index));
  }

  function parcelasValidas() {
    return (
      parcelas.length > 0 &&
      parcelas.every((p) => p.numero && p.valor !== '' && p.vencimento && !isNaN(Number(p.valor)))
    );
  }

  async function confirmar() {
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/iptus', {
        tempId,
        nomeOriginal,
        codigoImovel,
        exercicio,
        tipoPagamento,
        formaPagamento,
        parcelas: parcelas.map((p) => ({
          numero: Number(p.numero),
          valor: Number(p.valor),
          vencimento: p.vencimento,
        })),
      });
      setSucesso(data);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  if (sucesso) {
    return (
      <div className="page">
        <div className="card success-card">
          <h2>IPTU lançado com sucesso</h2>
          <p>
            Código <strong>{sucesso.imovel.codigo}</strong> — {sucesso.parcelas.length}{' '}
            parcela(s) registrada(s).
          </p>
          <button onClick={reset}>Lançar outro IPTU</button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <h2>Lançar IPTU</h2>
      <div className="steps-indicator">
        {STEPS.map((s, i) => (
          <div key={s} className={`step-dot ${i <= step ? 'active' : ''}`} />
        ))}
      </div>

      {error && <div className="error">{error}</div>}

      {step === 0 && (
        <div className="card">
          <h3>1. Envie o arquivo do IPTU (PDF)</h3>
          <input type="file" accept="application/pdf" onChange={handleArquivoChange} disabled={loading} />
          {loading && <p>Lendo o arquivo...</p>}
        </div>
      )}

      {step === 1 && (
        <div className="card">
          <h3>2. Será pago em parcela única ou parcelado?</h3>
          <div className="choice-row">
            <button onClick={() => escolherTipoPagamento('unica')}>Parcela única</button>
            <button onClick={() => escolherTipoPagamento('parcelado')}>Parcelado</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="card">
          <h3>3. Será pago pela imobiliária ou repassado?</h3>
          <div className="choice-row">
            <button onClick={() => escolherFormaPagamento('imobiliaria')}>Imobiliária</button>
            <button onClick={() => escolherFormaPagamento('repassado')}>Repassado</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="card">
          <h3>4. Código de identificação e conferência das parcelas</h3>
          <label>
            Código de identificação (ex: I 213)
            <input
              value={codigoImovel}
              onChange={(e) => setCodigoImovel(e.target.value)}
              placeholder="I 213"
            />
          </label>
          <label>
            Exercício (ano, opcional)
            <input value={exercicio} onChange={(e) => setExercicio(e.target.value)} placeholder="2026" />
          </label>

          <table className="parcelas-table">
            <thead>
              <tr>
                <th>Parcela</th>
                <th>Valor (R$)</th>
                <th>Vencimento</th>
                {tipoPagamento === 'parcelado' && <th />}
              </tr>
            </thead>
            <tbody>
              {parcelas.map((p, i) => (
                <tr key={i}>
                  <td>
                    <input
                      type="number"
                      value={p.numero}
                      onChange={(e) => atualizarParcela(i, 'numero', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      step="0.01"
                      value={p.valor}
                      onChange={(e) => atualizarParcela(i, 'valor', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="date"
                      value={p.vencimento}
                      onChange={(e) => atualizarParcela(i, 'vencimento', e.target.value)}
                    />
                  </td>
                  {tipoPagamento === 'parcelado' && (
                    <td>
                      <button className="link-btn" onClick={() => removerParcela(i)}>
                        remover
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          {tipoPagamento === 'parcelado' && (
            <button className="link-btn" onClick={adicionarParcela}>
              + adicionar parcela
            </button>
          )}

          <div className="actions-row">
            <button
              disabled={!codigoImovel.trim() || !parcelasValidas()}
              onClick={() => setStep(4)}
            >
              Continuar
            </button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="card">
          <h3>5. Confirmar lançamento</h3>
          <ul className="resumo-list">
            <li>
              <strong>Código:</strong> {codigoImovel}
            </li>
            <li>
              <strong>Tipo de pagamento:</strong>{' '}
              {tipoPagamento === 'unica' ? 'Parcela única' : 'Parcelado'}
            </li>
            <li>
              <strong>Forma de pagamento:</strong>{' '}
              {formaPagamento === 'imobiliaria' ? 'Imobiliária' : 'Repassado'}
            </li>
            <li>
              <strong>Parcelas:</strong> {parcelas.length}
            </li>
          </ul>
          <div className="actions-row">
            <button onClick={() => setStep(3)} disabled={loading}>
              Voltar
            </button>
            <button onClick={confirmar} disabled={loading}>
              {loading ? 'Salvando...' : 'Confirmar lançamento'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
