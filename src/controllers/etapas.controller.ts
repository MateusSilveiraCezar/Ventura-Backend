import { Request, Response } from 'express';
import { pool } from "../database/db";

export const getEtapasPorProcesso = async (req: Request, res: Response) => {
  const { processoId } = req.params;

  // Forçar conversão para número
  const processoIdNum = parseInt(processoId, 10);
  if (isNaN(processoIdNum)) {
    return res.status(400).json({ error: 'ID do processo inválido' });
  }

  try {
    // Verifica se o processo existe
    const processoResult = await pool.query(
      'SELECT id, nome FROM processos WHERE id = $1',
      [processoIdNum]
    );

    if (processoResult.rows.length === 0) {
      return res.status(404).json({ error: 'Processo não encontrado' });
    }

    // Busca todas as etapas do processo, trazendo o nome do usuário responsável
    const etapasResult = await pool.query(
      `SELECT 
        e.nome,
        e.status,
        u.nome AS responsavel
      FROM etapas e
      LEFT JOIN usuarios u ON u.id = e.usuario_id
      WHERE e.processo_id = $1
      ORDER BY e.ordem`,
      [processoIdNum]
    );

    console.log('Etapas do DB:', etapasResult.rows);

    // Lista de etapas fixas
    const etapasFixas = [
      'Documentação', 'Análise', 'Contrato', 'Planilha', 'Assinatura C.', 'Carta de AP.', 'Imobzi',
      'Vistoria', 'Assinatura V.', 'Garantia', 'Pagamento', 'Contrato ADM', 'Entrega',
      'Seguro INC.', 'Troca T.'
    ];

    // Preencher etapas que ainda não foram cadastradas no DB
    const etapasCompletas = etapasFixas.map((nome) => {
      const etapa = etapasResult.rows.find((e) => e.nome === nome);
      return {
        nome,
        status: etapa?.status || 'pendente',
        responsavel: etapa?.responsavel || 'Não atribuído'
      };
    });

    return res.json({
      processo_id: processoResult.rows[0].id,
      processo_nome: processoResult.rows[0].nome,
      etapas: etapasCompletas
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao buscar etapas do processo' });
  }
};
