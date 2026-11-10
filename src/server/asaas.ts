import { timingSafeEqual } from "node:crypto";
import { RequestError } from "./http";

export const QR_LIFETIME_SECONDS = 1800;
export const CARD_CHECKOUT_MINUTES = 30;

export function asaasEnvironment(): "sandbox" | "production" {
  const mode = process.env.ASAAS_ENV || "sandbox";
  if (mode !== "sandbox" && mode !== "production") {
    throw new RequestError(503, "Ambiente de pagamentos inválido.");
  }
  return mode;
}

export function webhookToken() {
  const token = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!token || token.length < 32) {
    throw new RequestError(503, "O webhook do Asaas ainda não está configurado.");
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
    throw new RequestError(503, "A chave de API do Asaas ainda não está configurada para este ambiente.");
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
  throw new RequestError(503, "O pagamento está temporariamente indisponível. Tente novamente.");
}

export interface AsaasPayment {
  id: string;
  pixQrCodeId?: string;
  checkoutSession?: string | null;
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

export function cardReturnOrigin() {
  const value = process.env.ASAAS_CARD_RETURN_ORIGIN;
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (value === url.origin || value === url.origin + "/") ? url.origin : null;
  } catch {
    return null;
  }
}

export function validateCardConfig() {
  const origin = cardReturnOrigin();
  if (!origin) throw new RequestError(503, "Pagamento com cartão indisponível.");
  config();
  webhookToken();
  return origin;
}

export const isCheckoutId = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);

export async function createCardCheckout(id: string, amountCents: number, origin: string) {
  const returnUrl = origin + "/cartao/" + id;
  const checkout = await asaas<{ id: string }>("/checkouts", {
    billingTypes: ["CREDIT_CARD"],
    chargeTypes: ["DETACHED", "INSTALLMENT"],
    installment: { maxInstallmentCount: 2 },
    minutesToExpire: CARD_CHECKOUT_MINUTES,
    externalReference: id,
    callback: { successUrl: returnUrl, cancelUrl: returnUrl, expiredUrl: returnUrl },
    items: [{ name: "Chá da Juscélia", description: "Contribuição para o chá de cozinha", quantity: 1, value: amountCents / 100 }],
  });
  if (!isCheckoutId(checkout.id)) throw new RequestError(503, "O Asaas não retornou um checkout válido.");
  return checkout.id;
}

export function cardCheckoutUrl(id: string) {
  const host = asaasEnvironment() === "sandbox" ? "sandbox.asaas.com" : "asaas.com";
  return "https://" + host + "/checkoutSession/show?id=" + encodeURIComponent(id);
}

export async function findCheckoutPayments(id: string, createdAt: number, expiresAt: number) {
  const day = 86_400_000;
  const date = (timestamp: number) => new Date(timestamp).toISOString().slice(0, 10);
  // Asaas can omit confirmed installments when the checkoutSession query filter is used.
  // Look up card charges around checkout creation and match the returned session ID exactly.
  const query = new URLSearchParams({
    billingType: "CREDIT_CARD",
    "dateCreated[ge]": date(createdAt - day),
    "dateCreated[le]": date(expiresAt + day),
    limit: "100",
  });
  const payments: AsaasPayment[] = [];
  let offset = 0;
  for (let page = 0; page < 3; page++) {
    query.set("offset", String(offset));
    const result = await asaas<{ data: AsaasPayment[]; hasMore: boolean }>("/payments?" + query);
    if (!Array.isArray(result.data) || typeof result.hasMore !== "boolean" || (result.hasMore && !result.data.length)) break;
    for (const payment of result.data) {
      if (payment.checkoutSession !== id) continue;
      if (payment.billingType !== "CREDIT_CARD" || !Number.isFinite(payment.value) || payment.value <= 0) {
        throw new RequestError(503, "O Asaas retornou cobranças incompatíveis com o checkout.");
      }
      payments.push(payment);
    }
    if (!result.hasMore) return payments;
    offset += result.data.length;
  }
  throw new RequestError(503, "Não foi possível conferir todas as cobranças do checkout no Asaas.");
}
