require('dotenv').config();
const express = require('express');
const cors = require('cors');

const configRoutes = require('./routes/configRoutes');
const imoveisRoutes = require('./routes/imoveisRoutes');
const lancamentosRoutes = require('./routes/lancamentosRoutes');
const proprietariosRoutes = require('./routes/proprietariosRoutes');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/config', configRoutes);
app.use('/imoveis', imoveisRoutes);
app.use('/lancamentos', lancamentosRoutes);
app.use('/proprietarios', proprietariosRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Erro interno' });
});

// Backend local, sem login/multiusuário: roda só na máquina de quem está
// usando o app e nunca precisa ficar acessível pela rede.
const PORT = process.env.PORT || 4317;
const HOST = '127.0.0.1';

app.listen(PORT, HOST, () => {
  console.log(`IPTUAI backend local rodando em http://${HOST}:${PORT}`);
});
