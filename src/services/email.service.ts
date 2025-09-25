import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config(); // Garante que as variáveis de ambiente estão carregadas antes da criação da instância

class EmailService {
  private transporter;

  constructor() {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.error("⚠️ EMAIL_USER ou EMAIL_PASS não estão definidos no .env");
      throw new Error("Credenciais de e-mail ausentes");
    }

    this.transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
  }

  async enviarEmail(destinatario: string, tarefas: string[]) {
    if (!destinatario) {
      console.error("Destinatário não informado");
      return;
    }

    console.log(`📧 Tentando enviar e-mail para: ${destinatario}`);
    console.log("📋 Tarefas a enviar:", tarefas);

    try {
      const info = await this.transporter.sendMail({
        from: `"Sistema Imobiliária" <${process.env.EMAIL_USER}>`,
        to: destinatario,
        subject: "Tarefas em andamento",
        html: `
          <h2>Olá!</h2>
          <p>Você possui as seguintes tarefas em andamento:</p>
          <ul>
            ${tarefas.map(t => `<li>${t}</li>`).join("")}
          </ul>
        `
      });

      console.log(`✅ E-mail enviado com sucesso para ${destinatario}`);
      console.log("Mensagem ID:", info.messageId);
      return info;
    } catch (err) {
      console.error("❌ Erro ao enviar e-mail:", err);
      throw err; // relança para ser tratado no controller
    }
  }
}

// Exporta uma instância pronta
export default new EmailService();
