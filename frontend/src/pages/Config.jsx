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
