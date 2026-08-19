const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { signToken, requireAuth } = require('../auth');

const router = express.Router();

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Informe email e senha' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Credenciais invalidas' });
  }

  const token = signToken(user);
  res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
});

// Cria novos usuarios da equipe. Exige estar autenticado, para que apenas
// quem ja tem acesso ao app possa convidar outras pessoas.
router.post('/users', requireAuth, (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Informe nome, email e senha' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Senha deve ter ao menos 6 caracteres' });
  }

  const emailNorm = email.toLowerCase().trim();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(emailNorm);
  if (existing) {
    return res.status(409).json({ error: 'Ja existe um usuario com este email' });
  }

  const hash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)')
    .run(name.trim(), emailNorm, hash);

  res.status(201).json({ id: info.lastInsertRowid, name, email: emailNorm });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ id: req.user.sub, email: req.user.email, name: req.user.name });
});

module.exports = router;
