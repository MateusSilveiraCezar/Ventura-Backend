import { Request, Response } from "express";
import { pool } from "../database/db";

export const listarTipos =async (req: Request, res: Response) => {
    try {
        const result = await pool.query('SELECT * FROM tipos_processo')
        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao buscar tipos de processos'})
    }
};