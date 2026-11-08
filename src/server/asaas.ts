import { timingSafeEqual } from "node:crypto";
import { RequestError } from "./http";

export const QR_LIFETIME_SECONDS = 1800;

export function asaasEnvironment(): "sandbox" | "production" {
  const mode = process.env.ASAAS_ENV || "sandbox";
  if (mode !== "sandbox" && mode !== "production") {
    throw new RequestError(503, "Ambiente do Pix inválido.");
  }
  return mode;
}

export function webhookToken() {
  const token = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!token || token.length < 32) {
    throw new RequestError(503, "O webhook do Pix ainda não está configurado.");
  }
  return token;
}

export function validateWebhook(request: Request) {
  const expected = Buffer.from(webhookToken());
  const supplied = Buffer.from(request.headers.get("asaas-access-token") || "");
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    throw new RequestError(401, "Token do webhook inválido.");
  }
}

function config() {
  const live = asaasEnvironment() === "production";
  const key = process.env.ASAAS_API_KEY;
  if (!key?.startsWith(live ? "$aact_prod_" : "$aact_hmlg_")) {
    throw new RequestError(503, "A chave de API do Pix ainda não está configurada para este ambiente.");
  }
  return {
    key,
    base: live ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3",
  };
}

async function asaas<T>(path: string, body?: object): Promise<T> {
  const { key, base } = config();
  try {
    const response = await fetch(base + path, {
      method: body ? "POST" : "GET",
      headers: {
        access_token: key,
        "User-Agent": "ChaDaJuscelia/1.0",
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (response.ok) return (await response.json()) as T;
    console.error("Asaas retornou HTTP", response.status);
  } catch {
    console.error("Falha de comunicação com a API do Asaas.");
  }
  throw new RequestError(503, "O Pix está temporariamente indisponível. Tente novamente.");
}

export interface AsaasPayment {
  id: string;
  pixQrCodeId?: string;
  billingType: string;
  status: string;
  value: number;
  refunds?: { status: string; value: number }[] | null;
}

export function validatePixConfig() {
  config();
  webhookToken();
  if (!process.env.ASAAS_PIX_KEY?.trim()) {
    throw new RequestError(503, "A chave Pix recebedora ainda não está configurada.");
  }
}

export async function createQr(id: string, amountCents: number) {
  const qr = await asaas<{ id: string; encodedImage: string; payload: string }>("/pix/qrCodes/static", {
    addressKey: process.env.ASAAS_PIX_KEY,
    description: "Presente para o chá da Juscélia",
    value: amountCents / 100,
    format: "ALL",
    expirationSeconds: QR_LIFETIME_SECONDS,
    allowsMultiplePayments: false,
    externalReference: id,
  });
  if (!qr.id || !qr.encodedImage || !qr.payload) {
    throw new RequestError(503, "O Asaas não retornou um QR Code válido.");
  }
  return qr;
}

export const readPayment = (id: string) => asaas<AsaasPayment>(`/payments/${encodeURIComponent(id)}`);

export async function findQrPayments(qrId: string) {
  const result = await asaas<{ data: AsaasPayment[]; hasMore: boolean }>(
    `/payments?pixQrCodeId=${encodeURIComponent(qrId)}&limit=10`,
  );
  if (!Array.isArray(result.data) || result.hasMore) {
    throw new RequestError(503, "Não foi possível conciliar o Pix vencido.");
  }
  return result.data;
}
