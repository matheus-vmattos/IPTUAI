import { useEffect, useState } from 'react';
import { api, apiErrorMessage } from '../api.js';

const STEPS = ['tributo', 'valores', 'imovel', 'quemPaga', 'confirmar'];

function formatarMoeda(valor) {
  if (valor === null || valor === undefined || valor === '') return '—';
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarData(iso) {
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

function itemVazio() {
  return {
    tributo: '',
    formaPgto: '',
    cotaUnica: '',
    parcela: '',
    ultimaParcela: '',
    codigo: '',
    imovelEncontrado: null,
    imovelNovo: false,
    proprietario: '',
    nominalIptu: '',
    inscricaoIptu: '',
    dati: '',
    quemPaga: '',
    obs: '',
    escolhendoCotaUnica: false,
  };
}

export default function Upload() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // fila: um item por PDF selecionado. Cada item guarda a extração feita e
  // as respostas do usuário; processados um de cada vez no wizard abaixo.
  const [fila, setFila] = useState([]);
  const [indice, setIndice] = useState(0);
  const [step, setStep] = useState(0);
  const [item, setItem] = useState(itemVazio());
  const [buscandoImovel, setBuscandoImovel] = useState(false);
  const [resultados, setResultados] = useState([]);
  const [terminado, setTerminado] = useState(false);

  useEffect(() => {
    api
      .get('/config')
      .then(({ data }) => setConfig(data))
      .catch(() => {});
  }, []);

  function atualizarItem(campos) {
    setItem((prev) => ({ ...prev, ...campos }));
  }

  async function prefillPorCodigo(codigo, itemAtual) {
    if (!codigo) return itemAtual;
    try {
      const { data } = await api.get(`/imoveis/${encodeURIComponent(codigo)}`);
      return {
        ...itemAtual,
        codigo,
        imovelEncontrado: data,
        imovelNovo: false,
        proprietario: data.proprietario || '',
        nominalIptu: data.nominalIptu || '',
        inscricaoIptu: data.inscricaoIptu || '',
        dati: data.dati || '',
      };
    } catch (err) {
      if (err?.response?.status === 404) {
        return { ...itemAtual, codigo, imovelEncontrado: null, imovelNovo: true };
      }
      return itemAtual;
    }
  }

  async function handleArquivosChange(e) {
    const arquivos = [...e.target.files];
    if (arquivos.length === 0) return;
    setError('');
    setLoading(true);

    const novaFila = [];
    for (const arquivo of arquivos) {
      try {
        const form = new FormData();
        form.append('arquivo', arquivo);
        const { data } = await api.post('/lancamentos/extrair', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        novaFila.push({ arquivo, extracao: data, erro: null });
      } catch (err) {
        novaFila.push({ arquivo, extracao: null, erro: apiErrorMessage(err) });
      }
    }

    setFila(novaFila);
    setIndice(0);
    setResultados([]);
    setTerminado(false);
    setLoading(false);
    e.target.value = '';

    await abrirItem(novaFila, 0);
  }

  async function abrirItem(novaFila, idx) {
    if (idx >= novaFila.length) {
      setTerminado(true);
      return;
    }
    const entrada = novaFila[idx];
    let base = itemVazio();

    if (entrada.erro) {
      // Sem extração usável - segue pro proximo automaticamente, registrando o erro.
      setResultados((prev) => [
        ...prev,
        { arquivo: entrada.arquivo.name, status: 'erro', mensagem: entrada.erro },
      ]);
      await abrirItem(novaFila, idx + 1);
      return;
    }

    const codigoSugerido = entrada.extracao.codigoSugerido;
    if (codigoSugerido) {
      base = await prefillPorCodigo(codigoSugerido, base);
    }
    setItem(base);
    setIndice(idx);
    setStep(0);
  }

  function escolherTributo(t) {
    if (item.imovelEncontrado) {
      const quemPaga = t === 'IPTU' ? item.imovelEncontrado.quemPagaIptu : item.imovelEncontrado.quemPagaDati;
      atualizarItem({ tributo: t, quemPaga: quemPaga || item.quemPaga });
    } else {
      atualizarItem({ tributo: t });
    }
    setStep(1);
  }

  function escolherFormaPgto(forma) {
    const { resumoParcelas, cotaUnica: cotaUnicaSugerida } = fila[indice].extracao;
    const campos = { formaPgto: forma };

    if (forma === 'Cota única') {
      if (cotaUnicaSugerida.length > 1) {
        atualizarItem({ ...campos, escolhendoCotaUnica: true });
        return;
      }
      campos.cotaUnica = cotaUnicaSugerida.length === 1 ? String(cotaUnicaSugerida[0].valor) : '';
    } else {
      campos.parcela = resumoParcelas.parcela !== null ? String(resumoParcelas.parcela) : '';
      campos.ultimaParcela = resumoParcelas.ultimaParcela !== null ? String(resumoParcelas.ultimaParcela) : '';
    }
    atualizarItem(campos);
    setStep(2);
  }

  function escolherOpcaoCotaUnica(opcao) {
    atualizarItem({ cotaUnica: opcao ? String(opcao.valor) : '', escolhendoCotaUnica: false });
    setStep(2);
  }

  async function buscarImovelManual(codigo) {
    atualizarItem({ codigo });
    if (!codigo.trim()) return;
    setBuscandoImovel(true);
    const atualizado = await prefillPorCodigo(codigo.trim(), item);
    setItem(atualizado);
    setBuscandoImovel(false);
  }

  function valoresValidos() {
    if (item.formaPgto === 'Cota única') return item.cotaUnica !== '' && !isNaN(Number(item.cotaUnica));
    return item.parcela !== '' && !isNaN(Number(item.parcela));
  }

  async function confirmar() {
    setError('');
    setLoading(true);
    try {
      const form = new FormData();
      const arquivo = fila[indice].arquivo;
      form.append('arquivo', arquivo, arquivo.name);
      form.append('codigo', item.codigo.trim());
      form.append('tributo', item.tributo);
      form.append('formaPgto', item.formaPgto);
      form.append('proprietario', item.proprietario);
      form.append('nominalIptu', item.nominalIptu);
      if (item.tributo === 'IPTU') form.append('inscricaoIptu', item.inscricaoIptu);
      if (item.tributo === 'DATI') form.append('dati', item.dati);
      form.append('quemPaga', item.quemPaga);
      form.append('obs', item.obs);

      if (item.formaPgto === 'Cota única') {
        form.append('cotaUnica', item.cotaUnica);
      } else {
        form.append('parcela', item.parcela);
        if (item.ultimaParcela !== '') form.append('ultimaParcela', item.ultimaParcela);
      }

      const { data } = await api.post('/lancamentos', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResultados((prev) => [
        ...prev,
        { arquivo: arquivo.name, codigo: data.codigo, status: 'sucesso', criado: data.created },
      ]);
      await abrirItem(fila, indice + 1);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  function recomecar() {
    setFila([]);
    setIndice(0);
    setStep(0);
    setItem(itemVazio());
    setResultados([]);
    setTerminado(false);
    setError('');
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

  if (fila.length === 0) {
    return (
      <div className="page">
        <h2>Lançar IPTU / DATI</h2>
        <div className="card">
          <h3>Envie o(s) carnê(s) (PDF)</h3>
          <input
            type="file"
            accept="application/pdf"
            multiple
            onChange={handleArquivosChange}
            disabled={loading}
          />
          {loading && <p>Lendo arquivo(s)...</p>}
          {error && <div className="error">{error}</div>}
        </div>
      </div>
    );
  }

  if (terminado) {
    return (
      <div className="page">
        <div className="card success-card">
          <h2>Lançamentos concluídos</h2>
          <p>
            {resultados.filter((r) => r.status === 'sucesso').length} de {resultados.length} carnê(s)
            salvos na planilha.
          </p>
          <ul className="resumo-list">
            {resultados.map((r, i) => (
              <li key={i}>
                {r.status === 'sucesso' ? (
                  <>
                    ✓ {r.arquivo} — código <strong>{r.codigo}</strong>
                    {r.criado ? ' (linha nova)' : ''}
                  </>
                ) : (
                  <>✗ {r.arquivo} — {r.mensagem}</>
                )}
              </li>
            ))}
          </ul>
          <button onClick={recomecar}>Lançar mais carnês</button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <h2>Lançar IPTU / DATI</h2>
      <p className="meta">
        Carnê {indice + 1} de {fila.length} — {fila[indice].arquivo.name}
      </p>
      <div className="steps-indicator">
        {STEPS.map((s, i) => (
          <div key={s} className={`step-dot ${i <= step ? 'active' : ''}`} />
        ))}
      </div>

      {error && <div className="error">{error}</div>}

      {step === 0 && (
        <div className="card">
          <h3>Esse carnê é de qual tributo?</h3>
          <div className="choice-row">
            <button onClick={() => escolherTributo('IPTU')}>IPTU</button>
            <button onClick={() => escolherTributo('DATI')}>DATI</button>
          </div>
        </div>
      )}

      {step === 1 && !item.escolhendoCotaUnica && (
        <div className="card">
          <h3>Cota única ou parcelado?</h3>
          <div className="choice-row">
            <button onClick={() => escolherFormaPgto('Cota única')}>Cota única</button>
            <button onClick={() => escolherFormaPgto('Parcelado')}>Parcelado</button>
          </div>
          <div className="actions-row">
            <button className="link-btn" onClick={() => setStep(0)}>
              ← Voltar
            </button>
          </div>
        </div>
      )}

      {step === 1 && item.escolhendoCotaUnica && (
        <div className="card">
          <h3>O arquivo tem mais de uma opção de cota única. Qual foi usada?</h3>
          <p className="meta">
            É comum o carnê trazer várias guias de pagamento à vista, com valores diferentes
            conforme a data (desconto por antecipação). Escolha a que corresponde ao pagamento
            feito.
          </p>
          <ul className="resumo-list">
            {fila[indice].extracao.cotaUnica.map((opcao, i) => (
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

      {step === 2 && (
        <div className="card">
          <h3>Conferir valor{item.formaPgto === 'Parcelado' ? 'es' : ''}</h3>
          {item.formaPgto === 'Cota única' ? (
            <label>
              Valor da cota única (R$)
              <input
                type="number"
                step="0.01"
                value={item.cotaUnica}
                onChange={(e) => atualizarItem({ cotaUnica: e.target.value })}
              />
            </label>
          ) : (
            <>
              <label>
                Valor da parcela (R$)
                <input
                  type="number"
                  step="0.01"
                  value={item.parcela}
                  onChange={(e) => atualizarItem({ parcela: e.target.value })}
                />
              </label>
              <label>
                Valor da última parcela (R$, deixe igual se não houver diferença)
                <input
                  type="number"
                  step="0.01"
                  value={item.ultimaParcela}
                  onChange={(e) => atualizarItem({ ultimaParcela: e.target.value })}
                />
              </label>
              {config?.listas?.nParcelas && (
                <p className="meta">
                  Total calculado ({config.listas.nParcelas}x):{' '}
                  {formatarMoeda(
                    item.parcela === ''
                      ? null
                      : Number(item.parcela) * (config.listas.nParcelas - 1) +
                          Number(item.ultimaParcela === '' ? item.parcela : item.ultimaParcela)
                  )}
                </p>
              )}
            </>
          )}
          <div className="actions-row">
            <button className="link-btn" onClick={() => setStep(1)}>
              ← Voltar
            </button>
            <button disabled={!valoresValidos()} onClick={() => setStep(3)}>
              Continuar
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="card">
          <h3>Código de identificação do imóvel</h3>
          <label>
            Código (coluna "I" da planilha)
            <input
              value={item.codigo}
              onChange={(e) => atualizarItem({ codigo: e.target.value, imovelEncontrado: null, imovelNovo: false })}
              onBlur={(e) => buscarImovelManual(e.target.value)}
              placeholder="ex: 213"
            />
          </label>
          {buscandoImovel && <p className="meta">Buscando na planilha...</p>}

          {item.imovelEncontrado && (
            <div className="success">Imóvel encontrado: {item.imovelEncontrado.proprietario}</div>
          )}
          {item.imovelNovo && (
            <div className="meta">Código não encontrado na planilha — será criada uma linha nova.</div>
          )}

          {(item.imovelEncontrado || item.imovelNovo) && (
            <>
              <label>
                Proprietário
                <input value={item.proprietario} onChange={(e) => atualizarItem({ proprietario: e.target.value })} />
              </label>
              <label>
                Nome no carnê do IPTU/DATI (se diferente do proprietário)
                <input
                  value={item.nominalIptu}
                  onChange={(e) => atualizarItem({ nominalIptu: e.target.value })}
                  placeholder="deixe em branco se for o mesmo nome"
                />
              </label>
              {item.tributo === 'IPTU' && (
                <label>
                  Inscrição IPTU
                  <input value={item.inscricaoIptu} onChange={(e) => atualizarItem({ inscricaoIptu: e.target.value })} />
                </label>
              )}
              {item.tributo === 'DATI' && (
                <label>
                  Inscrição DATI
                  <input value={item.dati} onChange={(e) => atualizarItem({ dati: e.target.value })} />
                </label>
              )}
            </>
          )}

          <div className="actions-row">
            <button className="link-btn" onClick={() => setStep(2)}>
              ← Voltar
            </button>
            <button
              disabled={!item.codigo.trim() || !(item.imovelEncontrado || item.imovelNovo) || !item.proprietario.trim()}
              onClick={() => setStep(4)}
            >
              Continuar
            </button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="card">
          <h3>Quem paga e confirmação</h3>
          <label>
            Quem paga o {item.tributo}
            <select value={item.quemPaga} onChange={(e) => atualizarItem({ quemPaga: e.target.value })}>
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
            <input value={item.obs} onChange={(e) => atualizarItem({ obs: e.target.value })} />
          </label>

          <ul className="resumo-list">
            <li>
              <strong>Código:</strong> {item.codigo}
            </li>
            <li>
              <strong>Tributo:</strong> {item.tributo}
            </li>
            <li>
              <strong>Forma:</strong> {item.formaPgto}
            </li>
            <li>
              <strong>Valor:</strong>{' '}
              {item.formaPgto === 'Cota única' ? formatarMoeda(item.cotaUnica) : formatarMoeda(item.parcela)}
              {item.formaPgto === 'Parcelado' && item.ultimaParcela !== '' && item.ultimaParcela !== item.parcela && (
                <> (última: {formatarMoeda(item.ultimaParcela)})</>
              )}
            </li>
          </ul>

          <div className="actions-row">
            <button className="link-btn" onClick={() => setStep(3)} disabled={loading}>
              ← Voltar
            </button>
            <button onClick={confirmar} disabled={loading || !item.quemPaga}>
              {loading ? 'Salvando...' : 'Salvar na planilha'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
