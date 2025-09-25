// services/whatsapp.service.ts
import axios from "axios";

const WA_TOKEN = process.env.META_WHATSAPP_TOKEN!;
const WA_PHONE_NUMBER_ID = process.env.META_WHATSAPP_PHONE_NUMBER_ID!;
const WA_GRAPH_VERSION = process.env.META_WHATSAPP_GRAPH_VERSION || "v20.0";

function toE164(brNumberLike: string): string {
  const digits = (brNumberLike || "").replace(/\D/g, "");
  return digits.startsWith("55") ? digits : `55${digits}`;
}

type ButtonParam = {
  index: number;            // 0 = primeiro botão do template
  sub_type: "url";          // botão do tipo URL
  parameters: string[];     // variáveis do botão (normalmente só 1)
};

export default class WhatsappService {
  static async sendTemplate(params: {
    to: string;
    template: string;          // nome do template
    lang?: string;             // ex.: "pt_BR"
    bodyParams?: string[];     // variáveis do corpo
    headerParamsText?: string[];
    buttonParams?: ButtonParam[];
  }) {
    const {
      to,
      template,
      lang = "pt_BR",
      bodyParams = [],
      headerParamsText = [],
      buttonParams = [],
    } = params;

    const components: any[] = [];

    if (headerParamsText.length) {
      components.push({
        type: "header",
        parameters: headerParamsText.map((t) => ({ type: "text", text: t })),
      });
    }

    if (bodyParams.length) {
      components.push({
        type: "body",
        parameters: bodyParams.map((t) => ({ type: "text", text: t })),
      });
    }

    if (buttonParams.length) {
      for (const b of buttonParams) {
        components.push({
          type: "button",
          sub_type: b.sub_type, // "url"
          index: String(b.index),
          parameters: b.parameters.map((t) => ({ type: "text", text: t })),
        });
      }
    }

    const payload = {
      messaging_product: "whatsapp",
      to: toE164(to),
      type: "template",
      template: {
        name: template,
        language: { code: lang },
        ...(components.length ? { components } : {}),
      },
    };

    try {
      console.log("➡️ Enviando WA payload:", JSON.stringify(payload, null, 2));

      const resp = await axios.post(
        `https://graph.facebook.com/${WA_GRAPH_VERSION}/${WA_PHONE_NUMBER_ID}/messages`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${WA_TOKEN}`,
            "Content-Type": "application/json",
          },
          timeout: 20000,
          validateStatus: () => true, // deixa passar qualquer status
        }
      );

      console.log("⬅️ WA response status:", resp.status);
      console.log("⬅️ WA response data:", JSON.stringify(resp.data, null, 2));

      if (resp.status < 200 || resp.status >= 300) {
        throw new Error(`WA API error ${resp.status}: ${JSON.stringify(resp.data)}`);
      }

      return resp.data;
    } catch (err: any) {
      console.error("🟥 Erro ao enviar mensagem WA:", err?.message);
      if (err?.response) {
        console.error("🟥 WA response status:", err.response.status);
        console.error("🟥 WA response data:", JSON.stringify(err.response.data, null, 2));
      }
      throw err;
    }
  }

  static async sendText(to: string, message: string) {
    const payload = {
      messaging_product: "whatsapp",
      to: toE164(to),
      type: "text",
      text: { body: message },
    };

    try {
      console.log("➡️ Enviando WA text payload:", JSON.stringify(payload, null, 2));

      const resp = await axios.post(
        `https://graph.facebook.com/${WA_GRAPH_VERSION}/${WA_PHONE_NUMBER_ID}/messages`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${WA_TOKEN}`,
            "Content-Type": "application/json",
          },
          timeout: 20000,
          validateStatus: () => true,
        }
      );

      console.log("⬅️ WA text response status:", resp.status);
      console.log("⬅️ WA text response data:", JSON.stringify(resp.data, null, 2));

      if (resp.status < 200 || resp.status >= 300) {
        throw new Error(`WA API error ${resp.status}: ${JSON.stringify(resp.data)}`);
      }

      return resp.data;
    } catch (err: any) {
      console.error("🟥 Erro ao enviar mensagem WA (texto):", err?.message);
      if (err?.response) {
        console.error("🟥 WA text response status:", err.response.status);
        console.error("🟥 WA text response data:", JSON.stringify(err.response.data, null, 2));
      }
      throw err;
    }
  }
}
