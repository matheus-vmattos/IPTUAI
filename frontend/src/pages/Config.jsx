import { useEffect, useState } from 'react';
import { api, apiErrorMessage } from '../api.js';

function textoStatusAtualizacao(status) {
  if (!status) return null;
  switch (status.estado) {
    case 'verificando':
      return 'Verificando atualizações...';
    case 'disponivel':
      return `Nova versão ${status.versao} disponível — baixando...`;
    case 'baixando':
      return `Baixando atualização... ${status.percentual}%`;
    case 'pronto':
      return `Versão ${status.versao} pronta para instalar.`;
    case 'atualizado':
      return 'Você já está com a versão mais recente.';
    case 'erro':
      return `Erro ao verificar atualizações: ${status.mensagem}`;
    default:
      return null;
  }
}

export default function Config() {
  const [config, setConfig] = useState(null);
  const [error, setError] = useState('');
  const [savedMsg, setSavedMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const [versaoApp, setVersaoApp] = useState('');
  const [statusAtualizacao, setStatusAtualizacao] = useState(null);

  const [viradaAberta, setViradaAberta] = useState(false);
  const [novoAno, setNovoAno] = useState('');
  const [confirmado, setConfirmado] = useState(false);
  const [virando, setVirando] = useState(false);
  const [resultadoVirada, setResultadoVirada] = useState(null);

  async function carregar() {
    try {
      const { data } = await api.get('/config');
      setConfig(data);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  useEffect(() => {
    if (!window.electronAPI?.onUpdateStatus) return;
    window.electronAPI.versaoApp?.().then(setVersaoApp);
    const cancelar = window.electronAPI.onUpdateStatus(setStatusAtualizacao);
    return cancelar;
  }, []);

  async function verificarAtualizacoes() {
    if (!window.electronAPI?.verificarAtualizacoes) {
      window.alert('Disponível só no app desktop instalado.');
      return;
    }
    setStatusAtualizacao({ estado: 'verificando' });
    await window.electronAPI.verificarAtualizacoes();
  }

  async function salvar(updates) {
    setError('');
    setLoading(true);
    try {
      const { data } = await api.put('/config', updates);
      setConfig(data);
      setSavedMsg('Salvo.');
      setTimeout(() => setSavedMsg(''), 3000);
      await carregar();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function escolherPlanilha() {
    if (!window.electronAPI?.escolherArquivoExcel) {
      window.alert('Disponível só no app desktop.');
      return;
    }
    const caminho = await window.electronAPI.escolherArquivoExcel();
    if (caminho) await salvar({ xlsxPath: caminho });
  }

  function abrirVirada() {
    setNovoAno(config.listas?.exercicio ? String(Number(config.listas.exercicio) + 1) : '');
    setConfirmado(false);
    setResultadoVirada(null);
    setViradaAberta(true);
  }

  async function confirmarVirada() {
    setError('');
    setVirando(true);
    try {
      const { data } = await api.post('/exercicio/novo', { ano: Number(novoAno) });
      setResultadoVirada(data);
      setViradaAberta(false);
      await carregar();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setVirando(false);
    }
  }

  async function escolherPasta() {
    if (!window.electronAPI?.escolherPasta) {
      window.alert('Disponível só no app desktop.');
      return;
    }
    const caminho = await window.electronAPI.escolherPasta();
    if (caminho) await salvar({ pdfFolder: caminho });
  }

  if (!config) return <div className="page">Carregando...</div>;

  return (
    <div className="page">
      <h2>Configurações</h2>

      {error && <div className="error">{error}</div>}
      {savedMsg && <div className="success">{savedMsg}</div>}

      <section className="card">
        <h3>Planilha (.xlsx)</h3>
        <p className="meta">{config.xlsxPath || 'Nenhuma planilha selecionada.'}</p>
        {config.xlsxPath && !config.xlsxExists && (
          <div className="error">Arquivo não encontrado nesse caminho.</div>
        )}
        <button onClick={escolherPlanilha} disabled={loading}>
          Escolher planilha...
        </button>

        {config.listas && (
          <ul className="resumo-list" style={{ marginTop: 16 }}>
            <li>Exercício: {config.listas.exercicio}</li>
            <li>Nº de parcelas do município: {config.listas.nParcelas}</li>
          </ul>
        )}
        {config.listasErro && <div className="error">{config.listasErro}</div>}
      </section>

      {config.listas && (
        <section className="card">
          <h3>Virada de exercício</h3>
          <p className="meta">
            Exercício atual: <strong>{config.listas.exercicio}</strong>
          </p>

          {resultadoVirada && (
            <div className="success">
              Exercício {resultadoVirada.ano} iniciado — {resultadoVirada.linhasLimpas} imóve(is) tiveram os valores
              limpos. Backup do arquivo anterior salvo em: {resultadoVirada.backupPath}
            </div>
          )}

          {!viradaAberta ? (
            <button onClick={abrirVirada}>Iniciar novo exercício...</button>
          ) : (
            <div className="card" style={{ background: '#fde8e8', marginTop: 12 }}>
              <p>
                Isso vai <strong>limpar, em todos os imóveis</strong>: cota única, parcela, última parcela, quem
                paga, forma de pagamento, link do carnê e os status "salvo"/"lançado" — de IPTU e DATI. Proprietário,
                nome no carnê, inscrições, imóvel de rateio e OBS <strong>continuam</strong> como estão.
              </p>
              <p>Um backup do arquivo atual é salvo automaticamente antes de qualquer alteração.</p>
              <label>
                Novo exercício
                <input type="number" value={novoAno} onChange={(e) => setNovoAno(e.target.value)} />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={confirmado}
                  onChange={(e) => setConfirmado(e.target.checked)}
                  style={{ width: 'auto' }}
                />
                Entendi e quero limpar os valores lançados para começar {novoAno || 'o novo ano'}.
              </label>
              <div className="actions-row">
                <button className="link-btn" onClick={() => setViradaAberta(false)} disabled={virando}>
                  Cancelar
                </button>
                <button onClick={confirmarVirada} disabled={virando || !confirmado || !novoAno}>
                  {virando ? 'Processando...' : 'Confirmar virada de exercício'}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      <section className="card">
        <h3>Pasta para salvar os carnês (PDF)</h3>
        <p className="meta">{config.pdfFolder || 'Nenhuma pasta selecionada.'}</p>
        <button onClick={escolherPasta} disabled={loading}>
          Escolher pasta...
        </button>
      </section>

      <section className="card">
        <h3>Versão do app</h3>
        <p className="meta">{versaoApp ? `Versão instalada: ${versaoApp}` : 'Disponível só no app desktop instalado.'}</p>

        {statusAtualizacao && <p>{textoStatusAtualizacao(statusAtualizacao)}</p>}

        <div className="actions-row">
          <button onClick={verificarAtualizacoes} disabled={statusAtualizacao?.estado === 'verificando'}>
            Verificar atualizações
          </button>
          {statusAtualizacao?.estado === 'pronto' && (
            <button onClick={() => window.electronAPI.instalarAtualizacao()}>Reiniciar e instalar</button>
          )}
        </div>
      </section>
    </div>
  );
}
