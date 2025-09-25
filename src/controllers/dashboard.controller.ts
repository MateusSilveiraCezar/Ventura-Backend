import { Request, Response } from 'express';
import { pool } from '../database/db';

export const getDashboardData = async (req: Request, res: Response) => {
    try {
        // Consultas ao Banco de Dados ajustadas para a sua tabela 'processos'
        // -------------------------------------------------------------
        
        // 1. Contagem de Processos Ativos
        const ativosResult = await pool.query(`
            SELECT COUNT(*)::integer FROM processos WHERE status != 'concluído'
        `);
        const processosAtivos = ativosResult.rows[0].count;

        // 2. Contagem de Processos Concluídos
        const concluidosResult = await pool.query(`
            SELECT COUNT(*)::integer FROM processos WHERE status = 'concluído'
        `);
        const processosConcluidos = concluidosResult.rows[0].count;

        // 3. Dados para o Gráfico de Barras (Atividade Mensal)
        // **Este trecho assume que você tem uma coluna de data de criação, como 'created_at'.
        // **Ajuste o nome da coluna se for diferente.**
        const barDataResult = await pool.query(`
            SELECT
                TO_CHAR(created_at, 'Mon') AS name,
                COUNT(*)::integer AS value
            FROM
                processos
            GROUP BY
                name
            ORDER BY
                MIN(created_at);
        `);
        const barData = barDataResult.rows;

        // 4. Dados para o Gráfico de Pizza (Status de Processos)
        // Agrupando por status, como na sua tabela
        const pieDataResult = await pool.query(`
            SELECT
                status AS name,
                COUNT(*)::integer AS value
            FROM
                processos
            GROUP BY
                status;
        `);

        // Formatar os dados para o gráfico de pizza, adicionando as cores
        const statusColors: { [key: string]: string } = {
            'em andamento': '#003a74',
            'concluído': '#0058a5',
            'pendente': '#0078d4',
            'analise': '#FFD700', // Adicionei 'analise' do seu screenshot
        };

        const pieData = pieDataResult.rows.map(item => ({
            name: item.name,
            value: item.value,
            color: statusColors[item.name] || '#ccc' // Cor padrão se o status não estiver no mapa
        }));

        // 5. Dados para a Tabela (Processos Recentes)
        // Usando as colunas 'id', 'nome' e 'status' da sua tabela
        // **Adicione a coluna de data (ex: created_at) e o nome do responsável se existirem.**
        const processesDataResult = await pool.query(`
            SELECT
                id,
                nome AS type, 
                status,
                created_at AS "creationDate"
            FROM
                processos
            ORDER BY
                created_at DESC
            LIMIT 5;
        `);
        const processesData = processesDataResult.rows;

        // 6. Resposta Final
        const dashboardData = {
            summary: {
                ativos: processosAtivos,
                concluidos: processosConcluidos,
            },
            barData: barData,
            pieData: pieData,
            processesData: processesData,
        };

        res.status(200).json(dashboardData);

    } catch (error) {
        console.error('Erro ao buscar dados do dashboard:', error);
        res.status(500).json({ message: 'Erro ao buscar dados do dashboard.' });
    }
};