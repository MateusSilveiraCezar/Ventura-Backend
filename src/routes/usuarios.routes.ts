import { Router } from 'express';
import {
  listarUsuarios,
  criarUsuario,
  atualizarUsuario,
  deletarUsuario,
  resetarSenha
} from '../controllers/usuarios.controller';

const usuariosRouter = Router();

usuariosRouter.get('/', listarUsuarios);
usuariosRouter.post('/', criarUsuario);
usuariosRouter.put('/:id', atualizarUsuario);
usuariosRouter.delete('/:id', deletarUsuario);
usuariosRouter.post('/reset-password', resetarSenha);

export default usuariosRouter;
