const path = require('path');
const fs = require('fs');
const { createClient } = require('@libsql/client');
const bcrypt = require('bcryptjs');

const TURSO_URL = process.env.TURSO_DATABASE_URL;
const LOCAL_DB_PATH = process.env.DB_PATH || './data/iptuai.db';
const url = TURSO_URL || `file:${LOCAL_DB_PATH}`;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!TURSO_URL) {
  fs.mkdirSync(path.dirname(LOCAL_DB_PATH), { recursive: true });
}

const client = createClient(authToken ? { url, authToken } : { url });

async function run(sql, args = []) {
  const result = await client.execute({ sql, args });
  return { lastInsertRowid: Number(result.lastInsertRowid ?? 0), changes: result.rowsAffected };
}

async function get(sql, args = []) {
  const result = await client.execute({ sql, args });
  return result.rows[0] || null;
}

async function all(sql, args = []) {
  const result = await client.execute({ sql, args });
  return result.rows;
}

const SCHEMA = `
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
    arquivo_blob BLOB NOT NULL,
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
`;

async function ensureAdminUser() {
  const row = await get('SELECT COUNT(*) AS n FROM users');
  if (row.n > 0) return;

  const email = process.env.ADMIN_EMAIL || 'admin@iptuai.local';
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  const hash = bcrypt.hashSync(password, 10);
  await run('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)', [
    'Administrador',
    email,
    hash,
  ]);
  console.log(`Usuario admin criado: ${email} (defina ADMIN_EMAIL/ADMIN_PASSWORD no .env para customizar)`);
}

async function init() {
  await client.executeMultiple(SCHEMA);
  try {
    await client.execute('PRAGMA foreign_keys = ON');
  } catch {
    // nem todo backend remoto do libSQL aceita pragmas via HTTP - segue sem quebrar
  }
  await ensureAdminUser();
}

module.exports = { client, get, all, run, init };
