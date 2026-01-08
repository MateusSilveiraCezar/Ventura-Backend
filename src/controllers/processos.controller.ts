import { Request, Response } from "express";
import { pool } from "../database/db";
import EmailService from "../services/email.service";
import WhatsappService from "../services/whatsapp.service";

// URL Base limpa
const BASE_URL = "https://www.painelventura.com.br";

// Lista todos os processos com etapas e já atualiza status se concluído
export async function listarProcessos(req: Request, res: Response) {
  try {
    const { rows: processos } = await pool.query(`
      SELECT 
        p.id AS processo_id,
        p.nome AS processo_nome,
        p.status AS processo_status,
        c.nome AS cliente_nome,
        COALESCE(
          (
            SELECT e.nome
            FROM etapas e
            WHERE e.processo_id = p.id 
              AND e.status = 'em andamento'
            LIMIT 1
          ),
          'Concluído'
        ) AS etapa_atual
      FROM processos p
      JOIN clientes c 
        ON c.id = p.cliente_id
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
      SELECT 
        p.*,
        json_build_object(
          'id', c.id,
          'nome', c.nome,
          'telefone', c.telefone
        ) AS cliente,
        COALESCE(
          json_agg(
            json_build_object(
              'id', e.id,
              'nome', e.nome,
              'status', e.status,
              'prazo', e.prazo,
              'usuario_id', e.usuario_id,
              'urgencia', e.urgencia,
              'observacoes', e.observacoes,
              'ordem', e.ordem
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

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Processo não encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Erro ao buscar processo por id:', error);
    res.status(500).json({ error: 'Erro ao buscar processo' });
  }
};

// Criar processo completo
export const criarProcessoCompleto = async (req: Request, res: Response) => {
  const client = await pool.connect();

  try {
    const { cliente, processo, etapas } = req.body;

    await client.query("BEGIN");

    // 1️⃣ Verificar se cliente já existe
    const clienteExistente = await client.query(
      `SELECT id FROM clientes WHERE nome = $1 AND telefone = $2`,
      [cliente.nome, cliente.telefone]
    );

    let cliente_id: number;
    if ((clienteExistente.rowCount ?? 0) > 0) {
      cliente_id = clienteExistente.rows[0].id;
    } else {
      const clienteResult = await client.query(
        `INSERT INTO clientes (nome, telefone) VALUES ($1, $2) RETURNING id`,
        [cliente.nome, cliente.telefone]
      );
      cliente_id = clienteResult.rows[0].id;
    }

    // 2️⃣ Verificar se já existe processo para esse cliente e tipo
    let processo_id: number;
    const processoExistente = await client.query(
      `SELECT id FROM processos WHERE cliente_id = $1 AND tipo_id = $2`,
      [cliente_id, processo.tipo_id]
    );

    if ((processoExistente.rowCount ?? 0) > 0) {
      processo_id = processoExistente.rows[0].id;
    } else {
      const processoResult = await client.query(
        `INSERT INTO processos (nome, tipo_id, cliente_id) VALUES ($1, $2, $3) RETURNING id`,
        [processo.nome, processo.tipo_id, cliente_id]
      );
      processo_id = processoResult.rows[0].id;
    }

    // 3️⃣ Criar ou atualizar etapas
    let ordem = 1;
    for (const etapa of etapas) {
      const etapaExistente = await client.query(
        `SELECT * FROM etapas WHERE processo_id = $1 AND nome = $2`,
        [processo_id, etapa.nome]
      );

      const statusEtapa = ordem === 1 ? "em andamento" : "pendente";
      let etapa_id: number;

      if ((etapaExistente.rowCount ?? 0) > 0) {
        // Atualiza etapa existente
        etapa_id = etapaExistente.rows[0].id;
        await client.query(
          `UPDATE etapas 
           SET usuario_id = $1, prazo = $2, urgencia = $3, observacoes = $4, status = $5, ordem = $6
           WHERE id = $7`,
          [
            etapa.usuario_id ?? etapaExistente.rows[0].usuario_id,
            etapa.prazo ?? etapaExistente.rows[0].prazo,
            etapa.urgencia ?? etapaExistente.rows[0].urgencia,
            etapa.observacoes ?? etapaExistente.rows[0].observacoes,
            etapaExistente.rows[0].status === "finalizada" ? "finalizada" : statusEtapa,
            ordem,
            etapa_id
          ]
        );
      } else {
        // Cria nova etapa
        const etapaResult = await client.query(
          `INSERT INTO etapas (nome, processo_id, usuario_id, prazo, urgencia, observacoes, ordem, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
          [
            etapa.nome,
            processo_id,
            etapa.usuario_id,
            etapa.prazo,
            etapa.urgencia,
            etapa.observacoes,
            ordem,
            statusEtapa
          ]
        );
        etapa_id = etapaResult.rows[0].id;
      }

      // 4️⃣ Notificação + e-mail + WhatsApp (para a 1ª etapa "em andamento")
      if (statusEtapa === "em andamento" && etapa.usuario_id) {
        await client.query(
          `INSERT INTO notificacoes (usuario_id, etapa_id, mensagem)
           VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [
            etapa.usuario_id,
            etapa_id,
            `Você tem uma nova tarefa: ${etapa.nome} no processo ${processo.nome}`
          ]
        );

        const { rows: usuarioRows } = await client.query(
          `SELECT email, nome, telefone FROM usuarios WHERE id = $1`,
          [etapa.usuario_id]
        );

        if (usuarioRows.length > 0) {
          const contato = usuarioRows[0] as { email?: string; nome?: string; telefone?: string };

          const corpoEmail = [
            `Olá ${contato.nome ?? ""},`,
            `Você recebeu a tarefa: ${etapa.nome} no processo ${processo.nome}.`,
            `Acesse o sistema para mais detalhes:`,
            BASE_URL,
          ].join("\n\n");

          const jobs: Promise<any>[] = [];
          if (contato.email) {
            jobs.push(EmailService.enviarEmail(contato.email, [corpoEmail]));
          }

          if (contato.telefone) {
            jobs.push(
              WhatsappService.sendTemplate({
                to: contato.telefone,
                template: "aviso_funcionario",
                lang: "pt_BR",
                bodyParams: [contato.nome ?? "", etapa.nome], 
                buttonParams: [
                  { 
                    index: 0, 
                    sub_type: "url", 
                    parameters: ["/"] // FIX: Envia apenas "/" para o link base
                  }, 
                ],
              })
            );
          }

          await Promise.allSettled(jobs);
        }
      }

      ordem++;
    }

    await client.query("COMMIT");

    res.status(201).json({
      message: "Processo criado/atualizado com sucesso",
      cliente_id,
      processo_id
    });

  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Erro ao criar processo completo:", error);
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
      return res.status(400).json({ error: 'ID do processo não fornecido na URL.' });
    }

    await client.query('BEGIN');

    if (cliente) {
      await client.query(
        `UPDATE clientes SET nome = $1, telefone = $2 WHERE id = (SELECT cliente_id FROM processos WHERE id = $3)`,
        [cliente.nome, cliente.telefone, processo_id]
      );
    }

    if (processo) {
      await client.query(
        `UPDATE processos SET nome = $1, tipo_id = $2 WHERE id = $3`,
        [processo.nome, processo.tipo_id, processo_id]
      );
    }

    for (const etapa of etapas) {
      const etapaExistente = await client.query(
        `SELECT id, status, ordem FROM etapas WHERE processo_id = $1 AND nome = $2`,
        [processo_id, etapa.nome]
      );

      if ((etapaExistente.rowCount ?? 0) > 0) {
        const etapa_id = etapaExistente.rows[0].id;
        const statusAtual = etapaExistente.rows[0].status;

        let novoStatus = statusAtual;
        if (etapa.status && statusAtual !== 'finalizada') {
          novoStatus = etapa.status;
        }

        await client.query(
          `UPDATE etapas
           SET usuario_id = $1, prazo = $2, urgencia = $3, observacoes = $4,
               status = $5, ordem = $6
           WHERE id = $7`,
          [
            etapa.usuario_id,
            etapa.prazo,
            etapa.urgencia,
            etapa.observacoes,
            novoStatus,
            etapaExistente.rows[0].ordem,
            etapa_id
          ]
        );

        // Se o status mudou para 'em andamento', dispara notificação
        if (novoStatus === "em andamento" && etapa.usuario_id) {
          await client.query(
            `INSERT INTO notificacoes (usuario_id, etapa_id, mensagem)
             VALUES ($1, $2, $3)
             ON CONFLICT DO NOTHING`,
            [
              etapa.usuario_id,
              etapa_id,
              `Você tem uma nova tarefa: ${etapa.nome}`
            ]
          );

          const { rows: usuarioRows } = await client.query(
            `SELECT email, nome, telefone FROM usuarios WHERE id = $1`,
            [etapa.usuario_id]
          );

          if (usuarioRows.length > 0) {
            const contato = usuarioRows[0] as { email?: string; nome?: string; telefone?: string };

            const corpoEmail = [
              `Olá ${contato.nome ?? ""},`,
              `Você recebeu uma nova tarefa: ${etapa.nome}.`,
              `Acesse o sistema para mais detalhes:`,
              BASE_URL,
            ].join("\n\n");

            const jobs: Promise<any>[] = [];
            if (contato.email) {
              jobs.push(EmailService.enviarEmail(contato.email, [corpoEmail]));
            }

            if (contato.telefone) {
              jobs.push(
                WhatsappService.sendTemplate({
                  to: contato.telefone,
                  template: "aviso_funcionario",
                  lang: "pt_BR",
                  bodyParams: [contato.nome ?? "", etapa.nome],
                  buttonParams: [
                    { 
                      index: 0, 
                      sub_type: "url", 
                      parameters: ["/"] // FIX: Envia apenas "/" para o link base
                    }, 
                  ],
                })
              );
            }

            await Promise.allSettled(jobs);
          }
        }
      }
    }

    await client.query('COMMIT');
    res.status(200).json({ message: 'Processo atualizado com sucesso' });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao atualizar processo completo:', error);
    res.status(500).json({ error: 'Erro ao atualizar processo completo' });
  } finally {
    client.release();
  }
};

// Deletar processo completo
export const deletarProcessoCompleto = async (req: Request, res: Response) => {
  const client = await pool.connect();
  const processo_id = req.params.id;

  try {
    await client.query("BEGIN");

    const result = await client.query(
      `SELECT cliente_id FROM processos WHERE id = $1`,
      [processo_id]
    );

    if (result.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Processo não encontrado" });
    }

    const cliente_id = result.rows[0].cliente_id;

    await client.query(`DELETE FROM etapas WHERE processo_id = $1`, [processo_id]);
    await client.query(`DELETE FROM processos WHERE id = $1`, [processo_id]);

    const clienteTemOutros = await client.query(
      `SELECT COUNT(*) FROM processos WHERE cliente_id = $1`,
      [cliente_id]
    );

    const total = parseInt(clienteTemOutros.rows[0].count, 10);

    if (total === 0) {
      await client.query(`DELETE FROM clientes WHERE id = $1`, [cliente_id]);
    }

    await client.query("COMMIT");

    res.status(200).json({
      message: "Processo deletado com sucesso",
      processo_id,
      cliente_deletado: total === 0
    });

  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Erro ao deletar processo:", error);
    res.status(500).json({ error: "Erro ao deletar processo" });
  } finally {
    client.release();
  }
};