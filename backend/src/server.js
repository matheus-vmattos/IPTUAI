require('dotenv').config();
const express = require('express');
const cors = require('cors');

require('./db'); // garante schema + usuario admin antes de subir rotas

const authRoutes = require('./routes/authRoutes');
const imoveisRoutes = require('./routes/imoveisRoutes');
const iptusRoutes = require('./routes/iptusRoutes');
const parcelasRoutes = require('./routes/parcelasRoutes');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/auth', authRoutes);
app.use('/imoveis', imoveisRoutes);
app.use('/iptus', iptusRoutes);
app.use('/parcelas', parcelasRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Erro interno' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`IPTUAI backend rodando na porta ${PORT}`));
