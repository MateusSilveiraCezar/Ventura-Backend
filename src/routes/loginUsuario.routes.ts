// routes/usuariosRoutes.ts (ou onde estiver suas rotas)
import { Router } from 'express';
import { loginUsuario } from '../controllers/loginUsuario.controller';

const router = Router();

router.post('/', loginUsuario);

export default router;
