// src/database/db.ts
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

export const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  ssl: process.env.DB_SSL === 'require' ? { rejectUnauthorized: false } : false,
  max: 20, // Máximo de conexões simultâneas
  idleTimeoutMillis: 30000, // 30s antes de liberar conexão ociosa
  connectionTimeoutMillis: 5000, // 5s para tentar conectar
});

// Teste rápido de conexão ao iniciar o backend
pool.connect()
  .then(client => {
    console.log('✅ Conectado ao banco de dados!');
    client.release();
  })
  .catch(err => {
    console.error('❌ Erro ao conectar no banco de dados:', err);
  });
