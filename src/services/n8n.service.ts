import axios from "axios";

// ⚠️ COLOQUE AQUI A URL DO SEU WEBHOOK (Production URL) DO N8N
const N8N_WEBHOOK_URL = "https://n8n.mapech.com.br/webhook-test/ventura";

export const N8nService = {
  async notificarNovaTarefa(dados: {
    nome: string;
    telefone: string;
    tarefa: string;
    processo?: string;
    link: string;
  }) {
    try {
      // Envia como POST. O n8n receberá isso no Body.
      await axios.post(N8N_WEBHOOK_URL, dados);
      console.log(`🚀 Webhook n8n disparado com sucesso para ${dados.telefone}`);
    } catch (error) {
      console.error("❌ Erro ao chamar webhook n8n:", error);
    }
  },
};