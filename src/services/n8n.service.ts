import axios from "axios";

// ⚠️ URL do seu Webhook n8n
const N8N_WEBHOOK_URL = "https://n8n.mapech.com.br/webhook/ventura";

export const N8nService = {
  async notificarNovaTarefa(dados: {
    nome: string;
    telefone: string;
    email?: string; // <--- Novo campo opcional
    tarefa: string;
    processo?: string;
    link: string;
  }) {
    try {
      await axios.post(N8N_WEBHOOK_URL, dados);
      console.log(`🚀 Webhook n8n disparado para ${dados.telefone}`);
    } catch (error) {
      console.error("❌ Erro ao chamar webhook n8n:", error);
    }
  },
};