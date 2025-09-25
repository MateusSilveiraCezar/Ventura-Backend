import { Router } from "express";
import { listarTipos } from "../controllers/tipoProcesso.controller";

const tipoProcessoRouter = Router()

tipoProcessoRouter.get('/', listarTipos);

export default tipoProcessoRouter;