const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const DB_PATH = process.env.DB_PATH || './data/iptuai.db';
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS imoveis (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT NOT NULL UNIQUE,
    endereco TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS iptus (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    imovel_id INTEGER NOT NULL REFERENCES imoveis(id) ON DELETE CASCADE,
    exercicio TEXT,
    tipo_pagamento TEXT NOT NULL CHECK (tipo_pagamento IN ('unica', 'parcelado')),
    forma_pagamento TEXT NOT NULL CHECK (forma_pagamento IN ('imobiliaria', 'repassado')),
    arquivo_nome TEXT NOT NULL,
    arquivo_path TEXT NOT NULL,
    created_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS parcelas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    iptu_id INTEGER NOT NULL REFERENCES iptus(id) ON DELETE CASCADE,
    numero INTEGER NOT NULL,
    valor REAL NOT NULL,
    vencimento TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'pago')),
    paid_at TEXT,
    UNIQUE(iptu_id, numero)
  );
`);

function ensureAdminUser() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (count > 0) return;

  const email = process.env.ADMIN_EMAIL || 'admin@iptuai.local';
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)').run(
    'Administrador',
    email,
    hash
  );
  console.log(`Usuario admin criado: ${email} (defina ADMIN_EMAIL/ADMIN_PASSWORD no .env para customizar)`);
}

ensureAdminUser();

module.exports = db;
