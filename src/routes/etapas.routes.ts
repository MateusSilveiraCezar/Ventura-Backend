import { Router } from "express";
import { getTarefasPorUsuario, finalizarTarefa } from "../controllers/notificacoes.controller"; // ou outro controller que você atualizou


const router = Router();

// Rota para pegar todas as etapas pendentes de um usuário
router.get("/:usuarioId", getTarefasPorUsuario);
router.put("/finalizar/:id", finalizarTarefa);

export default router;
