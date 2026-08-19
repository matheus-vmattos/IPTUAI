const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { signToken, requireAuth } = require('../auth');
const asyncHandler = require('../asyncHandler');

const router = express.Router();

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Informe email e senha' });
    }

    const user = await db.get('SELECT * FROM users WHERE email = ?', [
      email.toLowerCase().trim(),
    ]);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Credenciais invalidas' });
    }

    const token = signToken(user);
    res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
  })
);

// Cria novos usuarios da equipe. Exige estar autenticado, para que apenas
// quem ja tem acesso ao app possa convidar outras pessoas.
router.post(
  '/users',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Informe nome, email e senha' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Senha deve ter ao menos 6 caracteres' });
    }

    const emailNorm = email.toLowerCase().trim();
    const existing = await db.get('SELECT id FROM users WHERE email = ?', [emailNorm]);
    if (existing) {
      return res.status(409).json({ error: 'Ja existe um usuario com este email' });
    }

    const hash = bcrypt.hashSync(password, 10);
    const info = await db.run(
      'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
      [name.trim(), emailNorm, hash]
    );

    res.status(201).json({ id: info.lastInsertRowid, name, email: emailNorm });
  })
);

router.get('/me', requireAuth, (req, res) => {
  res.json({ id: req.user.sub, email: req.user.email, name: req.user.name });
});

module.exports = router;
