import { Request, Response } from 'express';
import { pool } from '../database/db';
import bcrypt from 'bcrypt';

export const listarUsuarios = async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT * FROM usuarios');
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar usuários' });
  }
};

export const listarFuncionarios = async (req: Request, res: Response) => {
  try {
    // A consulta agora usa WHERE para filtrar pela coluna 'role' com o valor 'funcionario'
    const result = await pool.query("SELECT * FROM usuarios WHERE role = 'funcionario'");
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar funcionários' });
  }
};

export const criarUsuario = async (req: Request, res: Response) => {
  const { nome, email, telefone, senha, role } = req.body;

  try {
    // Gera o hash da senha com 10 rounds
    const senha_hash = await bcrypt.hash(senha, 10);

    const result = await pool.query(
      `INSERT INTO usuarios (nome, email, telefone, senha_hash, role)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [nome, email, telefone, senha_hash, role]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao criar usuário' });
  }
};

export const atualizarUsuario = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { nome, email, telefone, senha, role } = req.body;

  try {
    // Se senha foi enviada, gera o hash, senão mantém o hash antigo
    let senha_hash;

    if (senha) {
      senha_hash = await bcrypt.hash(senha, 10);
    } else {
      // Busca o hash atual no banco para não perder a senha
      const usuario = await pool.query('SELECT senha_hash FROM usuarios WHERE id = $1', [id]);
      if (usuario.rows.length === 0) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }
      senha_hash = usuario.rows[0].senha_hash;
    }

    const result = await pool.query(
      `UPDATE usuarios
       SET nome=$1, email=$2, telefone=$3, senha_hash=$4, role=$5
       WHERE id=$6 RETURNING *`,
      [nome, email, telefone, senha_hash, role, id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao atualizar usuário' });
  }
};

export const deletarUsuario = async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  try {
    await pool.query('DELETE FROM usuarios WHERE id = $1', [id]);
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao deletar usuário' });
  }
};

// Redefinir senha
export const resetarSenha = async (req: Request, res: Response) => {
  const { email, newPassword } = req.body;

  if (!email || !newPassword) {
    return res.status(400).json({ message: 'E-mail e nova senha são obrigatórios.' });
  }

  try {
    // 1. Hasheia a nova senha com 10 rounds
    const senha_hash = await bcrypt.hash(newPassword, 10);

    // 2. Atualiza a senha no banco de dados usando o email como filtro
    const result = await pool.query(
      `UPDATE usuarios SET senha_hash = $1 WHERE email = $2 RETURNING *`,
      [senha_hash, email]
    );

    // 3. Verifica se algum usuário foi encontrado e atualizado
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Usuário não encontrado.' });
    }

    // 4. Envia uma resposta de sucesso
    res.status(200).json({ message: 'Senha redefinida com sucesso!' });

  } catch (error) {
    console.error('Erro ao redefinir a senha:', error);
    res.status(500).json({ message: 'Erro interno do servidor.' });
  }
};