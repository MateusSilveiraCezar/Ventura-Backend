// controllers/notificacoes.controller.ts
import { Request, Response } from "express";
import { pool } from "../database/db";
import EmailService from "../services/email.service";
import WhatsappService from "../services/whatsapp.service"; // integração WA

// Buscar todas as tarefas pendentes ou em andamento de um usuário
export const getTarefasPorUsuario = async (req: Request, res: Response) => {
  const usuarioId = Number(req.params.usuarioId);
  if (!usuarioId)
    return res.status(400).json({ error: "ID do usuário é obrigatório" });

  try {
    const query = `
      SELECT 
        e.id,
        e.nome,
        e.prazo,
        e.urgencia,
        e.status,
        e.ordem,
        p.nome AS processo_nome
      FROM etapas e
      JOIN processos p ON p.id = e.processo_id
      WHERE e.usuario_id = $1
        AND (e.status IS NULL OR e.status IN ('em andamento'))
      ORDER BY 
        e.status DESC,
        e.ordem ASC,
        e.prazo NULLS LAST;
    `;
    const result = await pool.query(query, [usuarioId]);
    return res.json(result.rows);
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ error: "Erro ao buscar tarefas do usuário" });
  }
};

// Finalizar uma tarefa
export const finalizarTarefa = async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: "ID da tarefa é obrigatório" });

  try {
    // 1) Finalizar etapa atual
    const result = await pool.query(
      `UPDATE etapas
       SET status = 'finalizada'
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Tarefa não encontrada" });
    }

    const etapaFinalizada = result.rows[0];

    // 2) Atualizar próxima etapa para 'em andamento'
    const nextEtapa = await pool.query(
      `UPDATE etapas
       SET status = 'em andamento'
       WHERE processo_id = $1
         AND ordem = $2
         AND (status IS NULL OR status = 'pendente')
       RETURNING *`,
      [etapaFinalizada.processo_id, etapaFinalizada.ordem + 1]
    );

    // 3) Criar notificação + enviar e-mail + WhatsApp
    if ((nextEtapa.rowCount ?? 0) > 0 && nextEtapa.rows[0].usuario_id) {
      const proxima = nextEtapa.rows[0];

      // Salva notificação no banco
      await pool.query(
        `INSERT INTO notificacoes (usuario_id, etapa_id, mensagem)
         VALUES ($1, $2, $3)`,
        [
          proxima.usuario_id,
          proxima.id,
          `Você tem uma nova tarefa: ${proxima.nome} no processo`,
        ]
      );

      // Busca contato do usuário responsável (email + telefone)
      const { rows: usuarioRows } = await pool.query(
        `SELECT email, nome, telefone FROM usuarios WHERE id = $1`,
        [proxima.usuario_id]
      );

      if (usuarioRows.length > 0) {
        const contato = usuarioRows[0] as {
          email?: string;
          nome?: string;
          telefone?: string;
        };

        // Base do seu painel/app
        const BASE_URL = "https://www.painelventura.com";

        // URL COMPLETA (para e-mail) — clique vai direto para a etapa
        const urlCompleta = `${BASE_URL}/processos/${proxima.processo_id}/etapas/${proxima.id}`;

        // SUFIXO para o botão DINÂMICO do template ({{1}})
        // Se seu botão for ESTÁTICO, envie a URL COMPLETA no parameters (ver comentário mais abaixo).
        const urlSuffix = `processos/${proxima.processo_id}/etapas/${proxima.id}`;

        const assuntoEmail = `Nova tarefa: ${proxima.nome}`;
        const corpoEmail = [
          `Olá ${contato.nome ?? ""},`,
          `Você recebeu uma nova tarefa: ${proxima.nome}.`,
          `Acesse o sistema para mais detalhes:`,
          urlCompleta,
        ].join("\n\n");

        // Executa os envios em paralelo; falha de um canal não bloqueia o outro
        const jobs: Promise<any>[] = [];

        // E-mail
        if (contato.email) {
          jobs.push(EmailService.enviarEmail(contato.email, [corpoEmail]));
        }

        // WhatsApp (template aprovado)
        if (contato.telefone) {
          jobs.push(
            WhatsappService.sendTemplate({
              to: contato.telefone,
              template: "aviso_funcionario", // nome do template no Manager
              lang: "pt_BR",
              // Corpo do template:
              // "Olá {{1}}, você recebeu uma nova tarefa: {{2}}. Acesse o sistema para mais detalhes."
              bodyParams: [contato.nome ?? "", proxima.nome],
              // Botão de URL DINÂMICA — o template tem base + {{1}}
              buttonParams: [
                {
                  index: 0,
                  sub_type: "url",
                  parameters: [urlSuffix], // <<<< só o sufixo "{{1}}"
                },
              ],

              // >>> SE O SEU BOTÃO FOR **ESTÁTICO** (sem {{1}}) <<<
              // troque o bloco acima por:
              // buttonParams: [
              //   { index: 0, sub_type: "url", parameters: [urlCompleta] },
              // ],
            })
          );
        }

        const results = await Promise.allSettled(jobs);
        results.forEach((r, i) => {
          if (r.status === "fulfilled") {
            if (i === 0 && contato.email)
              console.log(`📧 E-mail enviado para ${contato.email}`);
            if (i !== 0 && contato.telefone)
              console.log(
                `💬 WhatsApp (template) enviado para ${contato.telefone}`
              );
          } else {
            console.error(`❌ Falha ao notificar (canal ${i}):`, r.reason);
          }
        });
      }
    }

    return res.json({
      message: "Tarefa finalizada com sucesso",
      tarefa: etapaFinalizada,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erro ao finalizar tarefa" });
  }
};

// Contar etapas pendentes
export const contarEtapasPendentes = async (req: Request, res: Response) => {
  const usuario_id = req.params.usuario_id; // ou pegar do JWT

  try {
    const result = await pool.query(
      `SELECT COUNT(*) 
       FROM etapas 
       WHERE usuario_id = $1 AND status IN ('em andamento')`,
      [usuario_id]
    );

    res.json({ quantidade: parseInt(result.rows[0].count, 10) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao contar etapas pendentes" });
  }
};
