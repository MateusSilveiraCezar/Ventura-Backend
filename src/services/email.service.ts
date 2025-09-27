import sgMail from '@sendgrid/mail';
import dotenv from "dotenv";

// Importante: Não tente ler o .env em produção, confie apenas no Render.
if (process.env.NODE_ENV !== 'production') {
    dotenv.config(); 
}

class EmailService {
  private apiKey: string;
  private fromEmail: string;

  constructor() {
    // Para a API REST, o EMAIL_PASS deve ser a chave de API do SendGrid.
    this.apiKey = process.env.EMAIL_PASS as string; 
    // O EMAIL_USER será o endereço "De" que o SendGrid irá autenticar.
    this.fromEmail = process.env.EMAIL_USER as string; 
    
    if (!this.apiKey || !this.fromEmail) {
      console.error("⚠️ SendGrid API Key ou FROM EMAIL não estão definidos. Verifique as variáveis do Render.");
      if (process.env.NODE_ENV !== 'production') {
          throw new Error("Credenciais do SendGrid ausentes.");
      }
    }

    // Configura o SendGrid SDK com a chave de API.
    // Esta configuração usa HTTPS, o que o Render não bloqueia.
    sgMail.setApiKey(this.apiKey);

    console.log(`✅ Transportador SendGrid via API configurado.`);
  }

  /**
   * Envia o e-mail usando a API REST do SendGrid.
   */
  async enviarEmail(destinatario: string, tarefas: string[]) {
    if (!destinatario) {
      console.error("Destinatário não informado");
      return;
    }

    console.log(`📧 Tentando enviar e-mail via API para: ${destinatario}`);

    const msg = {
      to: destinatario,
      from: {
        email: this.fromEmail,
        name: "Sistema Imobiliária Ventura"
      },
      subject: "Tarefas em Andamento",
      html: `
        <h2>Olá!</h2>
        <p>Você possui as seguintes tarefas em andamento:</p>
        <ul>
          ${tarefas.map(t => `<li>${t}</li>`).join("")}
        </ul>
      `,
    };

    try {
      // O método send() realiza uma requisição HTTPS (Porta 443) para os servidores do SendGrid.
      await sgMail.send(msg);

      console.log(`✅ E-mail enviado com sucesso via SendGrid API para ${destinatario}`);
      return { success: true };
    } catch (error: any) {
      // A API REST retorna erros como 401 ou 403, não ETIMEDOUT.
      const errorMessage = error.response?.body?.errors?.[0]?.message || error.message;
      console.error("❌ Erro ao enviar e-mail via API:", errorMessage);
      throw new Error(`Falha no envio de e-mail via API: ${errorMessage}`);
    }
  }
}

// Exporta uma instância pronta
export default new EmailService();