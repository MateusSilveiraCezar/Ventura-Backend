import { Request, Response } from "express";
import { pool } from "../database/db";
import EmailService from "../services/email.service";
import { N8nService } from "../services/n8n.service"; 

const BASE_URL = "https://www.painelventura.com.br";

export const getTarefasPorUsuario = async (req: Request, res: Response) => {
  const usuarioId = Number(req.params.usuarioId);
  if (!usuarioId) return res.status(400).json({ error: "ID obrigatório" });

  try {
    const query = `
      SELECT e.id, e.nome, e.prazo, e.urgencia, e.status, e.ordem, p.nome AS processo_nome
      FROM etapas e
      JOIN processos p ON p.id = e.processo_id
      WHERE e.usuario_id = $1
        AND (e.status IS NULL OR e.status IN ('em andamento'))
      ORDER BY e.status DESC, e.ordem ASC, e.prazo NULLS LAST;
    `;
    const result = await pool.query(query, [usuarioId]);
    return res.json(result.rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erro ao buscar tarefas" });
  }
};

export const finalizarTarefa = async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: "ID obrigatório" });

  try {
    const result = await pool.query(
      `UPDATE etapas SET status = 'finalizada' WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rowCount === 0) return res.status(404).json({ error: "Tarefa não encontrada" });

    const etapaFinalizada = result.rows[0];

    const nextEtapa = await pool.query(
      `UPDATE etapas SET status = 'em andamento' 
       WHERE processo_id = $1 AND ordem = $2 AND (status IS NULL OR status = 'pendente')
       RETURNING *`,
      [etapaFinalizada.processo_id, etapaFinalizada.ordem + 1]
    );

    if ((nextEtapa.rowCount ?? 0) > 0 && nextEtapa.rows[0].usuario_id) {
      const proxima = nextEtapa.rows[0];

      await pool.query(
        `INSERT INTO notificacoes (usuario_id, etapa_id, mensagem) VALUES ($1, $2, $3)`,
        [proxima.usuario_id, proxima.id, `Você tem uma nova tarefa: ${proxima.nome}`]
      );

      const { rows: usuarioRows } = await pool.query(
        `SELECT email, nome, telefone FROM usuarios WHERE id = $1`,
        [proxima.usuario_id]
      );

      if (usuarioRows.length > 0) {
        const contato = usuarioRows[0];
        
        // Envia email pelo backend (opcional, já que agora vai pro n8n também)
        if (contato.email) {
          const corpoEmail = [
            `Olá ${contato.nome ?? ""},`,
            `Você recebeu uma nova tarefa: ${proxima.nome}.`,
            `Acesse o sistema:`,
            BASE_URL,
          ].join("\n\n");
          
          EmailService.enviarEmail(contato.email, [corpoEmail]).catch(console.error);
        }

        // Webhook N8N
        if (contato.telefone) {
          await N8nService.notificarNovaTarefa({
            nome: contato.nome ?? "Colaborador",
            telefone: contato.telefone,
            email: contato.email, // <--- ADICIONADO AQUI
            tarefa: proxima.nome,
            link: BASE_URL 
          });
        }
      }
    }

    return res.json({ message: "Sucesso", tarefa: etapaFinalizada });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erro ao finalizar" });
  }
};

export const contarEtapasPendentes = async (req: Request, res: Response) => {
  const usuario_id = req.params.usuario_id;
  try {
    const result = await pool.query(
      `SELECT COUNT(*) FROM etapas WHERE usuario_id = $1 AND status IN ('em andamento')`,
      [usuario_id]
    );
    res.json({ quantidade: parseInt(result.rows[0].count, 10) });
  } catch (error) {
    res.status(500).json({ error: "Erro ao contar" });
  }
};