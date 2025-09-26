import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config(); // Garante que as variáveis de ambiente estão carregadas localmente

class EmailService {
  private transporter;

  constructor() {
    const emailUser = process.env.EMAIL_USER;
    const emailPass = process.env.EMAIL_PASS;
    const emailHost = process.env.EMAIL_HOST;
    // Tenta usar a porta 587 por padrão se não estiver definida
    const emailPort = process.env.EMAIL_PORT ? parseInt(process.env.EMAIL_PORT, 10) : 587; 

    if (!emailUser || !emailPass || !emailHost) {
      console.error("⚠️ Credenciais de e-mail (USER, PASS ou HOST) não estão definidas nas variáveis de ambiente.");
      // Lança erro apenas se não estiver em ambiente de produção (onde o Render injeta as variáveis)
      if (process.env.NODE_ENV !== 'production') {
          throw new Error("Credenciais de e-mail ausentes. Verifique o .env");
      }
    }

    // Configuração SMTP Flexível
    this.transporter = nodemailer.createTransport({
      host: emailHost, // <-- O Render precisa de um host que aceite conexões
      port: emailPort,   // <-- A porta deve ser permitida pelo Render (ex: 2525)
      secure: emailPort === 465, // Use SSL/TLS se for a porta 465
      auth: {
        user: emailUser,
        pass: emailPass,
      },
      // Adiciona um timeout maior para evitar que o NodeMailer desista muito rápido
      connectionTimeout: 10000, // 10 segundos
    });

    console.log(`✅ Transportador SMTP configurado para Host: ${emailHost}:${emailPort}`);
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
      // O erro 'ETIMEDOUT' virá daqui se o Render bloquear a porta.
      throw err; // relança para ser tratado no controller
    }
  }
}

// Exporta uma instância pronta
export default new EmailService();