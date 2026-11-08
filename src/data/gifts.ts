export const CATEGORIES = [
  "Eletrodomésticos",
  "Panelas & Preparo",
  "Mesa Posta",
  "Café & Organização",
] as const;

export type GiftCategory = (typeof CATEGORIES)[number];

export interface GiftInput {
  name: string;
  category: GiftCategory;
  description: string;
  priceCents: number;
  quantity?: number;
  quotaCents: number | null;
  pixEnabled: boolean;
  storeUrl: string | null;
  imageUrl: string | null;
}

export interface Gift extends GiftInput {
  id: string;
  archived: boolean;
  quantity: number;
  raisedCents: number;
  pixTargetCents: number;
  availableCents: number;
  availableUnits: number;
  status: "available" | "reserved" | "purchased" | "received" | "funded";
  canReserve: boolean;
  canPay: boolean;
}

export type PixStatus = "creating" | "pending" | "received" | "expired" | "failed" | "refunded" | "review";

export interface PixTicket {
  id: string;
  amountCents: number;
  expiresAt: number;
  status: PixStatus;
  sandbox: boolean;
  image?: string;
  payload?: string;
}

export type ReservationStatus = "reserved" | "purchased" | "received" | "cancelled" | "expired";

export interface ReservationTicket {
  id: string;
  giftName: string;
  storeUrl: string;
  expiresAt: number;
  status: ReservationStatus;
}

export interface AdminPayment {
  id: string;
  guestName: string;
  giftName: string | null;
  message: string;
  amountCents: number;
  status: PixStatus;
  createdAt: number;
  providerPaymentId: string | null;
  manual: boolean;
}

export interface AdminReservation extends ReservationTicket {
  guestName: string;
  message: string;
  createdAt: number;
}

export const EVENT_INFO = {
  honoreeName: "Juscélia",
  title: "Chá de Cozinha da Juscélia",
  subtitle:
    "Cada detalhe da cozinha nova está sendo preparado com muito amor! Escolha um presente, contribua com uma cota ou envie um carinho em dinheiro via Pix.",
  date: "05 de dezembro de 2026 às 15h30",
  location: "IAIE - Rua Robert Campim, 146",
};

export const brl = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

export const formatDate = (time: number) =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(time);

export function parseAmount(value: string) {
  const normalized = value.trim().replace(",", ".");
  return /^\d+(\.\d{1,2})?$/.test(normalized) ? Math.round(Number(normalized) * 100) : 0;
}
