import { useEffect, useState } from 'react';
import { api, apiErrorMessage } from '../api.js';

export default function Config() {
  const [config, setConfig] = useState(null);
  const [error, setError] = useState('');
  const [savedMsg, setSavedMsg] = useState('');
  const [loading, setLoading] = useState(false);

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
    </div>
  );
}
