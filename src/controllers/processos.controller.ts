import { Request, Response } from "express";
import { pool } from "../database/db";
import EmailService from "../services/email.service";
import { N8nService } from "../services/n8n.service"; // <--- Novo serviço

const BASE_URL = "https://www.painelventura.com.br";

// Lista todos os processos
export async function listarProcessos(req: Request, res: Response) {
  try {
    const { rows: processos } = await pool.query(`
      SELECT 
        p.id AS processo_id,
        p.nome AS processo_nome,
        p.status AS processo_status,
        c.nome AS cliente_nome,
        COALESCE(
          (SELECT e.nome FROM etapas e WHERE e.processo_id = p.id AND e.status = 'em andamento' LIMIT 1),
          'Concluído'
        ) AS etapa_atual
      FROM processos p
      JOIN clientes c ON c.id = p.cliente_id
      ORDER BY p.id;
    `);

    const processoIds = processos.map(p => p.processo_id);
    if (processoIds.length === 0) return res.json(processos);

    const { rows: todasEtapas } = await pool.query(
      `SELECT id, nome, status, processo_id FROM etapas WHERE processo_id = ANY($1::int[])`,
      [processoIds]
    );

    for (const processo of processos) {
      const etapas = todasEtapas.filter(e => e.processo_id === processo.processo_id);
      (processo as any).etapas = etapas;

      const todasConcluidas = etapas.length > 0 && etapas.every(e => e.status === 'finalizada');

      if (todasConcluidas && processo.processo_status !== 'concluído') {
        await pool.query(`UPDATE processos SET status = 'concluído' WHERE id = $1`, [processo.processo_id]);
        processo.processo_status = 'concluído';
      }
    }
    return res.json(processos);
  } catch (err) {
    console.error("Erro ao listar processos:", err);
    return res.status(500).json({ error: "Erro ao listar processos" });
  }
};

// Buscar processo pelo ID
export const buscarProcessoPorId = async (req: Request, res: Response) => {
  const processo_id = req.params.id;
  try {
    const query = `
      SELECT p.*,
        json_build_object('id', c.id, 'nome', c.nome, 'telefone', c.telefone) AS cliente,
        COALESCE(
          json_agg(
            json_build_object(
              'id', e.id, 'nome', e.nome, 'status', e.status, 'prazo', e.prazo,
              'usuario_id', e.usuario_id, 'urgencia', e.urgencia, 'observacoes', e.observacoes, 'ordem', e.ordem
            ) ORDER BY e.ordem
          ) FILTER (WHERE e.id IS NOT NULL),
          '[]'
        ) AS etapas
      FROM processos p
      JOIN clientes c ON c.id = p.cliente_id
      LEFT JOIN etapas e ON e.processo_id = p.id
      WHERE p.id = $1
      GROUP BY p.id, c.id, c.nome, c.telefone;
    `;
    const result = await pool.query(query, [processo_id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Processo não encontrado' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Erro ao buscar processo:', error);
    res.status(500).json({ error: 'Erro ao buscar processo' });
  }
};

// Criar processo completo
export const criarProcessoCompleto = async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { cliente, processo, etapas } = req.body;
    await client.query("BEGIN");

    // 1. Cliente
    let cliente_id: number;
    const resCli = await client.query(`SELECT id FROM clientes WHERE nome = $1 AND telefone = $2`, [cliente.nome, cliente.telefone]);
    if ((resCli.rowCount ?? 0) > 0) cliente_id = resCli.rows[0].id;
    else {
        const novoCli = await client.query(`INSERT INTO clientes (nome, telefone) VALUES ($1, $2) RETURNING id`, [cliente.nome, cliente.telefone]);
        cliente_id = novoCli.rows[0].id;
    }

    // 2. Processo
    let processo_id: number;
    const resProc = await client.query(`SELECT id FROM processos WHERE cliente_id = $1 AND tipo_id = $2`, [cliente_id, processo.tipo_id]);
    if ((resProc.rowCount ?? 0) > 0) processo_id = resProc.rows[0].id;
    else {
        const novoProc = await client.query(`INSERT INTO processos (nome, tipo_id, cliente_id) VALUES ($1, $2, $3) RETURNING id`, [processo.nome, processo.tipo_id, cliente_id]);
        processo_id = novoProc.rows[0].id;
    }

    // 3. Etapas
    let ordem = 1;
    for (const etapa of etapas) {
      const resEtapa = await client.query(`SELECT * FROM etapas WHERE processo_id = $1 AND nome = $2`, [processo_id, etapa.nome]);
      const statusEtapa = ordem === 1 ? "em andamento" : "pendente";
      let etapa_id: number;

      if ((resEtapa.rowCount ?? 0) > 0) {
        etapa_id = resEtapa.rows[0].id;
        await client.query(
          `UPDATE etapas SET usuario_id = $1, prazo = $2, urgencia = $3, observacoes = $4, status = $5, ordem = $6 WHERE id = $7`,
          [etapa.usuario_id, etapa.prazo, etapa.urgencia, etapa.observacoes, resEtapa.rows[0].status === "finalizada" ? "finalizada" : statusEtapa, ordem, etapa_id]
        );
      } else {
        const novaEtapa = await client.query(
          `INSERT INTO etapas (nome, processo_id, usuario_id, prazo, urgencia, observacoes, ordem, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
          [etapa.nome, processo_id, etapa.usuario_id, etapa.prazo, etapa.urgencia, etapa.observacoes, ordem, statusEtapa]
        );
        etapa_id = novaEtapa.rows[0].id;
      }

      // 4. Notificações
      if (statusEtapa === "em andamento" && etapa.usuario_id) {
        await client.query(
          `INSERT INTO notificacoes (usuario_id, etapa_id, mensagem) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [etapa.usuario_id, etapa_id, `Nova tarefa: ${etapa.nome}`]
        );

        const { rows: usuarioRows } = await client.query(`SELECT email, nome, telefone FROM usuarios WHERE id = $1`, [etapa.usuario_id]);
        if (usuarioRows.length > 0) {
          const contato = usuarioRows[0];
          
          if (contato.email) {
             const corpoEmail = [`Olá ${contato.nome}, tarefa: ${etapa.nome}`, BASE_URL].join("\n\n");
             EmailService.enviarEmail(contato.email, [corpoEmail]).catch(console.error);
          }

          // --- WEBHOOK N8N ---
          if (contato.telefone) {
            await N8nService.notificarNovaTarefa({
              nome: contato.nome ?? "Colaborador",
              telefone: contato.telefone,
              tarefa: etapa.nome,
              processo: processo.nome,
              link: BASE_URL
            });
          }
        }
      }
      ordem++;
    }

    await client.query("COMMIT");
    res.status(201).json({ message: "Processo criado/atualizado com sucesso", cliente_id, processo_id });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Erro ao criar processo:", error);
    res.status(500).json({ error: "Erro ao criar processo completo" });
  } finally {
    client.release();
  }
};

// Atualizar processo completo (PUT)
export const atualizarProcessoCompleto = async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const processo_id = req.params.id;
    const { etapas, cliente, processo } = req.body;

    if (!processo_id) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'ID do processo não fornecido.' });
    }

    await client.query('BEGIN');

    if (cliente) await client.query(`UPDATE clientes SET nome = $1, telefone = $2 WHERE id = (SELECT cliente_id FROM processos WHERE id = $3)`, [cliente.nome, cliente.telefone, processo_id]);
    if (processo) await client.query(`UPDATE processos SET nome = $1, tipo_id = $2 WHERE id = $3`, [processo.nome, processo.tipo_id, processo_id]);

    for (const etapa of etapas) {
      const resEtapa = await client.query(`SELECT id, status, ordem FROM etapas WHERE processo_id = $1 AND nome = $2`, [processo_id, etapa.nome]);
      if ((resEtapa.rowCount ?? 0) > 0) {
        const etapa_id = resEtapa.rows[0].id;
        const statusAtual = resEtapa.rows[0].status;
        let novoStatus = statusAtual;
        if (etapa.status && statusAtual !== 'finalizada') novoStatus = etapa.status;

        await client.query(
          `UPDATE etapas SET usuario_id = $1, prazo = $2, urgencia = $3, observacoes = $4, status = $5, ordem = $6 WHERE id = $7`,
          [etapa.usuario_id, etapa.prazo, etapa.urgencia, etapa.observacoes, novoStatus, resEtapa.rows[0].ordem, etapa_id]
        );

        // Se status mudou para 'em andamento', notifica
        if (novoStatus === "em andamento" && etapa.usuario_id) {
          await client.query(`INSERT INTO notificacoes (usuario_id, etapa_id, mensagem) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [etapa.usuario_id, etapa_id, `Nova tarefa: ${etapa.nome}`]);
          
          const { rows: usuarioRows } = await client.query(`SELECT email, nome, telefone FROM usuarios WHERE id = $1`, [etapa.usuario_id]);
          if (usuarioRows.length > 0) {
            const contato = usuarioRows[0];
            
            if (contato.email) {
                EmailService.enviarEmail(contato.email, [`Nova tarefa: ${etapa.nome}`, BASE_URL].join("\n\n")).catch(console.error);
            }

            // --- WEBHOOK N8N ---
            if (contato.telefone) {
              await N8nService.notificarNovaTarefa({
                nome: contato.nome ?? "Colaborador",
                telefone: contato.telefone,
                tarefa: etapa.nome,
                link: BASE_URL
              });
            }
          }
        }
      }
    }

    await client.query('COMMIT');
    res.status(200).json({ message: 'Processo atualizado com sucesso' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao atualizar:', error);
    res.status(500).json({ error: 'Erro ao atualizar processo completo' });
  } finally {
    client.release();
  }
};

export const deletarProcessoCompleto = async (req: Request, res: Response) => {
  const client = await pool.connect();
  const processo_id = req.params.id;
  try {
    await client.query("BEGIN");
    const result = await client.query(`SELECT cliente_id FROM processos WHERE id = $1`, [processo_id]);
    if (result.rowCount === 0) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Não encontrado" }); }

    const cliente_id = result.rows[0].cliente_id;
    await client.query(`DELETE FROM etapas WHERE processo_id = $1`, [processo_id]);
    await client.query(`DELETE FROM processos WHERE id = $1`, [processo_id]);

    const clienteTemOutros = await client.query(`SELECT COUNT(*) FROM processos WHERE cliente_id = $1`, [cliente_id]);
    const total = parseInt(clienteTemOutros.rows[0].count, 10);
    if (total === 0) await client.query(`DELETE FROM clientes WHERE id = $1`, [cliente_id]);

    await client.query("COMMIT");
    res.status(200).json({ message: "Deletado", processo_id, cliente_deletado: total === 0 });
  } catch (error) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: "Erro ao deletar" });
  } finally {
    client.release();
  }
};