import { Router } from "express";
import { 
    listarProcessos,
    buscarProcessoPorId,
    criarProcessoCompleto,
    atualizarProcessoCompleto,
    deletarProcessoCompleto 
} from "../controllers/processos.controller";

const processoRouter = Router();

processoRouter.get('/', listarProcessos);
processoRouter.get('/:id', buscarProcessoPorId);
processoRouter.post('/', criarProcessoCompleto);
processoRouter.put('/:id', atualizarProcessoCompleto);
processoRouter.delete('/:id', deletarProcessoCompleto);

export default processoRouter;