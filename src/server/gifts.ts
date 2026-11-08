import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { AdminPayment, AdminReservation, Gift, GiftInput, ReservationStatus, ReservationTicket } from "@/data/gifts";
import { asaasEnvironment } from "./asaas";
import { db, transaction } from "./db";
import { RequestError } from "./http";

export const QR_GRACE_MS = 120_000;
const RESERVATION_MS = 24 * 60 * 60_000;

type GiftRow = Pick<Gift, "id" | "name" | "category" | "description"> & {
  price_cents: number;
  quantity: number;
  quota_cents: number | null;
  pix_enabled: boolean;
  store_url: string | null;
  image_url: string | null;
  archived: boolean;
};

type ReservationRow = {
  id: string;
  gift_id: string;
  gift_name: string;
  store_url: string;
  guest_name: string;
  message: string;
  status: Exclude<ReservationStatus, "expired">;
  created_at: number;
  expires_at: number;
};

type Allocation = {
  raised: number;
  held: number;
  reserved: number;
  purchased: number;
  received: number;
};

const allocationJoins = `
  LEFT JOIN LATERAL (
    SELECT
      coalesce(sum(amount_cents) FILTER (WHERE status = 'received'), 0) AS raised,
      coalesce(sum(amount_cents) FILTER (
        WHERE status = 'review' OR (status = 'pending' AND ($2 OR expires_at > $3))
          OR (status = 'creating' AND expires_at > $4)
      ), 0) AS held
    FROM pix WHERE gift_id = gifts.id AND environment = $1
  ) AS totals ON true
  LEFT JOIN LATERAL (
    SELECT
      count(*) FILTER (WHERE status = 'reserved' AND expires_at > $4) AS reserved,
      count(*) FILTER (WHERE status = 'purchased') AS purchased,
      count(*) FILTER (WHERE status = 'received') AS received
    FROM reservations
    WHERE gift_id = gifts.id AND environment = $1
  ) AS booking ON true
`;

export function availableCapacity(gift: GiftRow, allocation: Allocation) {
  const shopUnits = allocation.reserved + allocation.purchased + allocation.received;
  const pixTargetCents = (gift.quantity - shopUnits) * gift.price_cents;
  return {
    shopUnits,
    pixTargetCents,
    availableCents: pixTargetCents - allocation.raised - allocation.held,
  };
}

export async function allocation(client: PoolClient, giftId: string) {
  const now = Date.now();
  const { rows: [row] } = await client.query<Allocation>(`
    SELECT raised, held, reserved, purchased, received FROM gifts ${allocationJoins} WHERE gifts.id = $5
  `, [asaasEnvironment(), true, now - QR_GRACE_MS, now, giftId]);
  return row;
}

export async function lockGift(client: PoolClient, id: string) {
  const { rows: [gift] } = await client.query<GiftRow>(
    "SELECT * FROM gifts WHERE id = $1 FOR NO KEY UPDATE", [id],
  );
  return gift as GiftRow | undefined;
}

export async function listGifts(includeArchived = false): Promise<Gift[]> {
  const now = Date.now();
  const { rows } = await db().query<GiftRow & Allocation>(`
    SELECT gifts.*, raised, held, reserved, purchased, received FROM gifts ${allocationJoins}
    WHERE ($5 OR NOT archived) ORDER BY created_at DESC
  `, [asaasEnvironment(), false, now - QR_GRACE_MS, now, includeArchived]);

  return rows.map((gift) => {
    const { pixTargetCents, availableCents: remaining } = availableCapacity(gift, gift);
    const availableCents = Math.max(0, remaining);
    const availableUnits = Math.floor(availableCents / gift.price_cents);
    const status = gift.raised < pixTargetCents ? "available"
      : gift.reserved > 0 ? "reserved"
      : gift.purchased > 0 ? "purchased"
      : pixTargetCents === 0 ? "received" : "funded";
    return {
      id: gift.id, name: gift.name, category: gift.category, description: gift.description,
      priceCents: gift.price_cents, quantity: gift.quantity, quotaCents: gift.quota_cents, pixEnabled: gift.pix_enabled,
      storeUrl: gift.store_url, imageUrl: gift.image_url, archived: gift.archived,
      raisedCents: gift.raised, pixTargetCents, availableCents, availableUnits, status,
      canReserve: !gift.archived && Boolean(gift.store_url) && availableUnits > 0,
      canPay: !gift.archived && gift.pix_enabled && availableCents > 0,
    };
  });
}

export async function saveGift(input: GiftInput, giftId?: string) {
  const values = [
    input.name, input.category, input.description, input.priceCents, input.quotaCents,
    input.pixEnabled, input.storeUrl, input.imageUrl,
  ];
  if (!giftId) {
    const id = randomUUID();
    await db().query(`
      INSERT INTO gifts (name, category, description, price_cents, quota_cents, pix_enabled, store_url, image_url, quantity, id, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [...values, input.quantity ?? 1, id, Date.now()]);
    return id;
  }

  return transaction(async (client) => {
    const old = await lockGift(client, giftId);
    if (!old) throw new RequestError(404, "Presente não encontrado.");
    const committed = await allocation(client, giftId);
    const quantity = input.quantity ?? old.quantity;
    const { shopUnits, availableCents } = availableCapacity({ ...old, quantity }, committed);
    const termsChanged = input.priceCents !== old.price_cents || input.quotaCents !== old.quota_cents
      || input.pixEnabled !== old.pix_enabled || input.storeUrl !== old.store_url;
    if (termsChanged && (committed.raised + committed.held > 0 || shopUnits > 0)) {
      throw new RequestError(409, "Este presente já tem Pix ou reserva. Você ainda pode ajustar a quantidade e os dados de exibição.");
    }
    if (quantity < old.quantity && availableCents < 0) {
      throw new RequestError(409, "A quantidade precisa comportar as unidades já reservadas e os valores comprometidos via Pix.");
    }
    await client.query(`
      UPDATE gifts SET name = $1, category = $2, description = $3, price_cents = $4, quota_cents = $5,
        pix_enabled = $6, store_url = $7, image_url = $8, quantity = $9 WHERE id = $10
    `, [...values, quantity, giftId]);
    return giftId;
  });
}

export async function archiveGift(id: string, archived: boolean) {
  const { rowCount } = await db().query("UPDATE gifts SET archived = $1 WHERE id = $2", [archived, id]);
  if (!rowCount) throw new RequestError(404, "Presente não encontrado.");
}

async function findReservation(id: string, client: Pick<PoolClient, "query"> = db()) {
  const { rows: [row] } = await client.query<ReservationRow>(
    "SELECT * FROM reservations WHERE id = $1 AND environment = $2", [id, asaasEnvironment()],
  );
  return row as ReservationRow | undefined;
}

function toTicket(row: ReservationRow): ReservationTicket {
  return {
    id: row.id, giftName: row.gift_name, storeUrl: row.store_url, expiresAt: row.expires_at,
    status: row.status === "reserved" && row.expires_at <= Date.now() ? "expired" : row.status,
  };
}

export async function reservationTicket(id: string) {
  const row = await findReservation(id);
  if (!row) throw new RequestError(404, "Reserva não encontrada.");
  return toTicket(row);
}

export function reserve(id: string, giftId: string, name: string, message: string) {
  return transaction(async (client) => {
    const gift = await lockGift(client, giftId);
    function replay(row: ReservationRow | undefined) {
      if (row?.gift_id === giftId && row.guest_name === name && row.message === message) return toTicket(row);
      throw new RequestError(409, "Já existe uma reserva com este identificador.");
    }

    const prior = await findReservation(id, client);
    if (prior) return replay(prior);
    if (!gift || gift.archived || !gift.store_url) throw new RequestError(404, "Presente indisponível.");
    const { availableCents } = availableCapacity(gift, await allocation(client, giftId));
    if (availableCents < gift.price_cents) throw new RequestError(409, "Não há unidade disponível para reservar.");
    const now = Date.now();
    const { rows: [row] } = await client.query<ReservationRow>(`
      INSERT INTO reservations (id, environment, gift_id, gift_name, store_url, guest_name, message, status, expires_at, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'reserved', $8, $9)
      ON CONFLICT (id) DO NOTHING RETURNING *
    `, [id, asaasEnvironment(), gift.id, gift.name, gift.store_url, name, message, now + RESERVATION_MS, now]);
    return row ? toTicket(row) : replay(await findReservation(id, client));
  });
}

export function updateReservation(id: string, action: "purchased" | "received" | "cancelled", admin = false) {
  return transaction(async (client) => {
    const prior = await findReservation(id, client);
    if (!prior) throw new RequestError(404, "Reserva não encontrada.");
    await lockGift(client, prior.gift_id);
    const row = await findReservation(id, client);
    if (!row) throw new RequestError(404, "Reserva não encontrada.");
    const current = toTicket(row);
    if (current.status === action) return current;
    const allowed = action === "received"
      ? admin && current.status === "purchased"
      : current.status === "reserved" || (admin && action === "cancelled" && current.status === "purchased");
    if (!allowed) throw new RequestError(409, "A reserva já expirou ou mudou de estado.");
    await client.query("UPDATE reservations SET status = $1 WHERE id = $2", [action, id]);
    return { ...current, status: action };
  });
}

export async function adminSnapshot() {
  const environment = asaasEnvironment();
  const [gifts, payments, reservations] = await Promise.all([
    listGifts(true),
    db().query<AdminPayment & { expiresAt: number }>(`
      SELECT id, guest_name AS "guestName", gift_name AS "giftName", message, amount_cents AS "amountCents",
        status, created_at AS "createdAt", provider_payment_id AS "providerPaymentId", manual, expires_at AS "expiresAt"
      FROM pix WHERE environment = $1 ORDER BY created_at DESC
    `, [environment]),
    db().query<ReservationRow>("SELECT * FROM reservations WHERE environment = $1 ORDER BY created_at DESC", [environment]),
  ]);
  return {
    environment,
    gifts,
    payments: payments.rows.map(({ expiresAt, ...payment }): AdminPayment => ({
      ...payment,
      status: payment.status === "creating" && expiresAt <= Date.now() ? "failed" : payment.status,
    })),
    reservations: reservations.rows.map((row): AdminReservation => ({
      ...toTicket(row), guestName: row.guest_name, message: row.message, createdAt: row.created_at,
    })),
  };
}

export async function addManualDonation(name: string, amountCents: number, message: string) {
  await db().query(`
    INSERT INTO pix (id, environment, guest_name, message, amount_cents, status, expires_at, created_at, manual)
    VALUES ($1, $2, $3, $4, $5, 'received', 0, $6, true)
  `, [randomUUID(), asaasEnvironment(), name, message, Date.now()]);
}
