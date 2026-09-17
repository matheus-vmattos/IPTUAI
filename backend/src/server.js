require('dotenv').config();
const express = require('express');
const cors = require('cors');

const excelStore = require('./excelStore');
const configRoutes = require('./routes/configRoutes');
const imoveisRoutes = require('./routes/imoveisRoutes');
const lancamentosRoutes = require('./routes/lancamentosRoutes');
const proprietariosRoutes = require('./routes/proprietariosRoutes');
const exercicioRoutes = require('./routes/exercicioRoutes');
const rateiosRoutes = require('./routes/rateiosRoutes');
const pendenciasRoutes = require('./routes/pendenciasRoutes');
const provisaoRoutes = require('./routes/provisaoRoutes');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ ok: true }));

// Modo somente leitura: pra dar acesso de visualização a alguém sem risco de
// mexer nos dados reais. Bloqueia toda escrita nos dados da planilha, mas
// deixa /config passar (é de lá que se liga/desliga o próprio modo).
app.use(async (req, res, next) => {
  if (req.method === 'GET' || req.path.startsWith('/config')) return next();
  try {
    const config = await excelStore.readConfig();
    if (config.modoLeitura) {
      return res.status(403).json({ error: 'Modo somente leitura ativado — lançamentos e edições estão desativados.' });
    }
    next();
  } catch (err) {
    next(err);
  }
});

app.use('/config', configRoutes);
app.use('/imoveis', imoveisRoutes);
app.use('/lancamentos', lancamentosRoutes);
app.use('/proprietarios', proprietariosRoutes);
app.use('/exercicio', exercicioRoutes);
app.use('/rateios', rateiosRoutes);
app.use('/pendencias', pendenciasRoutes);
app.use('/provisao', provisaoRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  const body = { error: err.message || 'Erro interno' };
  if (err.candidatos) body.candidatos = err.candidatos;
  res.status(err.status || 500).json(body);
});

// Backend local, sem login/multiusuário: roda só na máquina de quem está
// usando o app e nunca precisa ficar acessível pela rede.
const PORT = process.env.PORT || 4317;
const HOST = '127.0.0.1';

app.listen(PORT, HOST, () => {
  console.log(`IPTUAI backend local rodando em http://${HOST}:${PORT}`);
});
