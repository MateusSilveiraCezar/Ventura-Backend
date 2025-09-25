// controllers/loginController.ts
import { Request, Response } from 'express';
import { pool } from '../database/db';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'secreto123'; // de preferência, use variável de ambiente

export const loginUsuario = async (req: Request, res: Response) => {
  const { email, senha } = req.body;

  try {
    // Verifica se o usuário existe
    const result = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
    const usuario = result.rows[0];

    if (!usuario) {
      return res.status(401).json({ error: 'Email ou senha incorretos' });
    }

    // Compara senha informada com hash no banco
    const senhaValida = await bcrypt.compare(senha, usuario.senha_hash);
    if (!senhaValida) {
      return res.status(401).json({ error: 'Email ou senha incorretos' });
    }

    // Gera token JWT
    const token = jwt.sign(
      { id: usuario.id, email: usuario.email, role: usuario.role },
      JWT_SECRET,
      { expiresIn: '2h' }
    );

    // Retorna dados do usuário e token
    res.json({
      user: {
        id: usuario.id,
        email: usuario.email,
        role: usuario.role,
        nome: usuario.nome,
      },
      token,
    });
  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ error: 'Erro interno no servidor' });
  }
};
