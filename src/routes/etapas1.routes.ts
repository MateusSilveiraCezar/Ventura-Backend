import { Router } from "express";
import { getEtapasPorProcesso } from "../controllers/etapas.controller";

const router = Router();

router.get('/:processoId', getEtapasPorProcesso);

export default router;