import dotenv from 'dotenv';

dotenv.config();


import express from 'express';
import usuariosRouter from './routes/usuarios.routes';
import cors from 'cors';
import loginUsuario from './routes/loginUsuario.routes';
import tipoProcessoRouter from './routes/tiposProcesso.routes';
import processoRouter from './routes/processo.routes';
import etapasRouter from "./routes/etapas.routes";
import etapas1Router from './routes/etapas1.routes'
import dashboardRouter from './routes/dashboard.routes'


dotenv.config();

console.clear();

const app = express();
const port = process.env.PORT || 3000;
const frontendUrl = process.env.FRONTEND_URL || 'https://www.painelventura.com.br';

// Configura CORS para permitir o frontend em todas as rotas
app.use(cors({
  origin: frontendUrl,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
}));

// Middleware para log (opcional)
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  if (req.method === 'POST' || req.method === 'PUT') {
    console.log('Body:', req.body);
  }
  next();
});

// Middleware para interpretar JSON no body
app.use(express.json());

// Rotas
app.use('/usuarios', usuariosRouter);
app.use('/login', loginUsuario);
app.use('/tipos-processo', tipoProcessoRouter);
app.use('/processo', processoRouter);
app.use('/etapas', etapasRouter);
app.use('/etapa', etapas1Router);
app.use('/dashboard', dashboardRouter);

app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});
