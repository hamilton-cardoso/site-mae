import type { PoolClient } from "pg";
import type { PixStatus, PixTicket } from "@/data/gifts";
import {
  asaasEnvironment, createQr, findQrPayments, QR_LIFETIME_SECONDS, readPayment, validatePixConfig,
  type AsaasPayment,
} from "./asaas";
import { db, transaction } from "./db";
import { allocation, availableCapacity, lockGift, QR_GRACE_MS } from "./gifts";
import { RequestError } from "./http";

interface PixRow {
  id: string;
  gift_id: string | null;
  guest_name: string;
  message: string;
  amount_cents: number;
  status: PixStatus;
  expires_at: number;
  qr_id: string | null;
  qr_image: string | null;
  qr_payload: string | null;
  provider_payment_id: string | null;
}

async function findPix(id: string, client?: PoolClient) {
  const { rows: [row] } = await (client ?? db()).query<PixRow>(
    "SELECT * FROM pix WHERE id = $1 AND environment = $2 AND NOT manual" + (client ? " FOR UPDATE" : ""),
    [id, asaasEnvironment()],
  );
  return row as PixRow | undefined;
}

async function pixForQr(qrId: string) {
  const { rows: [row] } = await db().query<PixRow>(
    "SELECT * FROM pix WHERE qr_id = $1 AND environment = $2", [qrId, asaasEnvironment()],
  );
  return row as PixRow | undefined;
}

function ticket(row: PixRow, includeQr = false): PixTicket {
  const expired = row.expires_at <= Date.now();
  return {
    id: row.id,
    amountCents: row.amount_cents,
    status: expired && row.status === "creating" ? "failed" : row.status,
    expiresAt: row.expires_at,
    sandbox: asaasEnvironment() === "sandbox",
    ...(includeQr && row.status === "pending" && !expired && row.qr_image && row.qr_payload
      ? { image: row.qr_image, payload: row.qr_payload }
      : {}),
  };
}

const settledStatuses = ["RECEIVED", "REFUNDED", "PARTIALLY_REFUNDED"];

async function applyPayment(payment: AsaasPayment, prior: PixRow, partialRefund = false) {
  if (payment.billingType !== "PIX" || payment.pixQrCodeId !== prior.qr_id || !settledStatuses.includes(payment.status)) return;
  const providerStatus = payment.status;
  const needsRefundReview = partialRefund || providerStatus === "PARTIALLY_REFUNDED"
    || (providerStatus !== "REFUNDED" && Boolean(payment.refunds?.length));

  await transaction(async (client) => {
    const gift = prior.gift_id ? await lockGift(client, prior.gift_id) : undefined;
    const row = await findPix(prior.id, client);
    if (!row || row.status === "refunded") return;
    if (row.status === "review" && providerStatus !== "REFUNDED") return;
    const valueMatches = typeof payment.value === "number" && Math.round(payment.value * 100) === row.amount_cents;
    const conflictingPayment = Boolean(row.provider_payment_id && row.provider_payment_id !== payment.id);
    let status: PixStatus = "review";
    if (valueMatches && !conflictingPayment && !needsRefundReview) {
      status = providerStatus === "REFUNDED" ? "refunded" : "received";
      if (status === "received" && row.status === "expired" && row.gift_id) {
        if (!gift || row.amount_cents > availableCapacity(gift, await allocation(client, row.gift_id)).availableCents) {
          status = "review";
        }
      }
    }
    await client.query(`
      UPDATE pix SET status = $1, provider_payment_id = coalesce(provider_payment_id, $2),
        qr_image = NULL, qr_payload = NULL WHERE id = $3
    `, [status, payment.id, row.id]);
  });
}

export async function processWebhook(body: Record<string, unknown>) {
  if (body.event !== "PAYMENT_RECEIVED" && body.event !== "PAYMENT_REFUNDED"
    && body.event !== "PAYMENT_PARTIALLY_REFUNDED") return;
  const event = body.payment as Partial<AsaasPayment> | undefined;
  if (!event?.id || typeof event.id !== "string" || !/^pay_[a-zA-Z0-9_-]{1,100}$/.test(event.id)) {
    throw new RequestError(400, "Identificador de pagamento inválido.");
  }
  if (event.billingType && event.billingType !== "PIX") return;
  if (event.pixQrCodeId && !(await pixForQr(event.pixQrCodeId))) return;
  const payment = await readPayment(event.id);
  if (payment.id !== event.id) throw new RequestError(503, "O Asaas retornou outra cobrança.");
  if (!payment.pixQrCodeId) return;
  const pix = await pixForQr(payment.pixQrCodeId);
  if (!pix) return;
  if (body.event === "PAYMENT_REFUNDED" && payment.status !== "REFUNDED") {
    throw new RequestError(503, "Estorno ainda em processamento.");
  }
  if (body.event !== "PAYMENT_REFUNDED" && !settledStatuses.includes(payment.status)) {
    throw new RequestError(503, "Recebimento ainda em processamento.");
  }
  await applyPayment(payment, pix, body.event === "PAYMENT_PARTIALLY_REFUNDED" && payment.status !== "REFUNDED");
}

async function reconcileExpired(row: PixRow) {
  if (row.status !== "pending" || !row.qr_id || row.expires_at + QR_GRACE_MS > Date.now()) return;
  const payments = await findQrPayments(row.qr_id);
  if (payments.some((payment) => payment.pixQrCodeId !== row.qr_id || payment.billingType !== "PIX")) {
    throw new RequestError(503, "O Asaas retornou dados de outro Pix.");
  }
  for (const payment of payments) await applyPayment(payment, row);
  if (payments.length === 0) {
    await db().query(
      "UPDATE pix SET status = 'expired', qr_image = NULL, qr_payload = NULL WHERE id = $1 AND status = 'pending'",
      [row.id],
    );
  }
}

export async function reconcileGift(giftId: string) {
  const { rows } = await db().query<PixRow>(`
    SELECT * FROM pix WHERE gift_id = $1 AND environment = $2 AND status = 'pending' AND expires_at <= $3
    ORDER BY expires_at LIMIT 10
  `, [giftId, asaasEnvironment(), Date.now() - QR_GRACE_MS]);
  await Promise.all(rows.map(reconcileExpired));
}

export async function getPix(id: string) {
  const row = await findPix(id);
  if (!row) throw new RequestError(404, "Pix não encontrado.");
  await reconcileExpired(row);
  return ticket(await findPix(id) ?? row);
}

export async function pixPage(id: string) {
  const row = await findPix(id);
  return row ? ticket(row, true) : null;
}

export async function reconcilePix(id: string) {
  const row = await findPix(id);
  if (!row?.qr_id) throw new RequestError(404, "QR Code não encontrado.");
  if (row.status === "pending" && row.expires_at + QR_GRACE_MS <= Date.now()) {
    await reconcileExpired(row);
    return;
  }
  const payments = await findQrPayments(row.qr_id);
  for (const payment of payments) await applyPayment(payment, row);
}

export async function startPix(id: string, giftId: string | null, name: string, message: string, amount: number) {
  async function replay(prior: PixRow | undefined) {
    if (!prior || prior.gift_id !== giftId || prior.guest_name !== name
      || prior.message !== message || prior.amount_cents !== amount) {
      throw new RequestError(409, "Já existe um Pix com este identificador.");
    }
    await reconcileExpired(prior);
    return ticket(await findPix(id) ?? prior, true);
  }

  const prior = await findPix(id);
  if (prior) return replay(prior);
  validatePixConfig();
  if (giftId) await reconcileGift(giftId);

  const created = await transaction(async (client) => {
    const gift = giftId ? await lockGift(client, giftId) : undefined;
    if (await findPix(id, client)) return false;
    if (giftId) {
      if (!gift || gift.archived || !gift.pix_enabled) throw new RequestError(404, "Presente indisponível para Pix.");
      const { availableCents } = availableCapacity(gift, await allocation(client, giftId));
      if (amount > availableCents) {
        throw new RequestError(409, "O presente mudou de disponibilidade. Atualize a lista e tente novamente.");
      }
    }
    const now = Date.now();
    const { rowCount } = await client.query(`
      INSERT INTO pix (id, environment, gift_id, gift_name, guest_name, message, amount_cents, status, expires_at, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'creating', $8, $9)
      ON CONFLICT (id) DO NOTHING
    `, [id, asaasEnvironment(), giftId, gift?.name ?? null, name, message, amount, now + 60_000, now]);
    return rowCount === 1;
  });
  if (!created) return replay(await findPix(id));

  try {
    const expiresAt = Date.now() + QR_LIFETIME_SECONDS * 1000;
    const qr = await createQr(id, amount);
    const row = await transaction(async (client) => {
      if (giftId) await lockGift(client, giftId);
      const { rows: [pending] } = await client.query<PixRow>(`
        UPDATE pix SET qr_id = $1, qr_image = $2, qr_payload = $3, expires_at = $4, status = 'pending'
        WHERE id = $5 AND status = 'creating' AND expires_at > $6
        RETURNING *
      `, [qr.id, qr.encodedImage, qr.payload, expiresAt, id, Date.now()]);
      if (!pending) throw new RequestError(503, "A geração do Pix venceu. Tente novamente.");
      return pending;
    });
    return ticket(row, true);
  } catch (error) {
    await db().query("UPDATE pix SET status = 'failed' WHERE id = $1 AND status = 'creating'", [id]);
    throw error;
  }
}
