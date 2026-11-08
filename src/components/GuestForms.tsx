"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { brl, CARD_MIN_CENTS, formatDate, parseAmount, type CardTicket, type Gift, type PaymentMethod, type PixTicket, type ReservationTicket } from "@/data/gifts";
import { api, errorText } from "@/data/client";

function GuestFields() {
  return (
    <>
      <label className="field-label">Seu nome<input className="field" name="guestName" required maxLength={100} autoComplete="name" /></label>
      <label className="field-label">Recado para a Juscélia (opcional)<textarea className="field" name="message" rows={2} maxLength={500} /></label>
    </>
  );
}

function CopyButton({ value, label }: { value: () => string; label: string }) {
  const [feedback, setFeedback] = useState("");
  return <div>
    <button type="button" className="btn-secondary" onClick={async () => {
      try { await navigator.clipboard.writeText(value()); setFeedback("Copiado!"); }
      catch { setFeedback("Use o campo ou link acima para copiar."); }
    }}>{label}</button>
    {feedback && <p role="status" className="text-xs text-sage-700 mt-1">{feedback}</p>}
  </div>;
}

const pixLabels = {
  creating: "Preparando seu Pix",
  pending: "Aguardando Pix",
  received: "Pix recebido. Obrigada pelo carinho!",
  expired: "O QR Code expirou.",
  failed: "O QR Code não pôde ser gerado.",
  refunded: "Pix estornado.",
  review: "Pix em revisão pela organização do chá.",
};

export function PixView({ initial, standalone = false }: { initial: PixTicket; standalone?: boolean }) {
  const router = useRouter();
  const [pix, setPix] = useState(initial);
  const [now, setNow] = useState(() => Date.now());
  const [offline, setOffline] = useState(false);
  const waiting = pix.status === "pending" || pix.status === "creating";

  useEffect(() => {
    if (!waiting) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await api<PixTicket>("/api/pix/" + initial.id);
        if (!active) return;
        setPix((previous) => ({ ...previous, ...next }));
        setOffline(false);
        if (next.status === "received") router.refresh();
      } catch {
        if (active) setOffline(true);
      } finally {
        if (active) {
          setNow(Date.now());
          timer = setTimeout(poll, 4000);
        }
      }
    };
    timer = setTimeout(poll, 2500);
    return () => { active = false; clearTimeout(timer); };
  }, [initial.id, router, waiting]);

  const path = "/pix/" + pix.id;
  const canPay = pix.status === "pending" && pix.expiresAt > now && pix.image && pix.payload;

  return (
    <div className="space-y-3">
      <p className="text-lg font-bold" role="status">{pixLabels[pix.status]}</p>
      <p className="text-sm">{brl(pix.amountCents)} {pix.sandbox && "· Pagamento simulado"}</p>
      {canPay && pix.payload && (
        <div className="space-y-2">
          <img src={"data:image/png;base64," + pix.image} alt="QR Code Pix" className="mx-auto w-48 h-48 object-contain" />
          <p className="text-sm text-sage-700">Válido até {formatDate(pix.expiresAt)} (horário de Brasília).</p>
          <label className="field-label">Pix Copia e Cola<input className="field" readOnly value={pix.payload} onFocus={(event) => event.currentTarget.select()} /></label>
          <CopyButton label="Copiar código Pix" value={() => pix.payload!} />
        </div>
      )}
      {waiting && pix.expiresAt <= now && <p className="text-sm">O prazo do QR terminou. Estamos conferindo se houve pagamento.</p>}
      {offline && <p role="status" className="text-sm text-amber-800">Conexão indisponível. Vamos tentar consultar novamente.</p>}
      {!standalone && <Link className="text-sm font-semibold underline" href={path}>Abrir link para acompanhar o Pix</Link>}
    </div>
  );
}

export function GuestContributionForm({ gift, method }: { gift?: Gift; method: PaymentMethod }) {
  const router = useRouter();
  const [pix, setPix] = useState<PixTicket | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef<string | null>(null);
  const maximum = Math.min(gift?.availableCents ?? 1_000_000, 1_000_000);
  const minimum = method === "card" ? CARD_MIN_CENTS : 1;
  const amount = gift ? Math.min(Math.max(gift.quotaCents ?? maximum, minimum), maximum) : 0;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      requestId.current ??= crypto.randomUUID();
      const input = {
        id: requestId.current, giftId: gift?.id, guestName: form.get("guestName"),
        message: form.get("message"), amountCents: parseAmount(String(form.get("amount") || "")),
      };
      if (method === "card") {
        const result = await api<CardTicket>("/api/cartao", "POST", input);
        if (result.status === "creating") throw new Error("O checkout está sendo preparado. Tente novamente em alguns segundos.");
        if (result.status === "expired" || result.status === "failed") {
          requestId.current = null;
          throw new Error("O checkout expirou ou ficou indisponível. Gere outro para continuar.");
        }
        if (result.checkoutUrl) window.location.assign(result.checkoutUrl);
        else router.push("/cartao/" + result.id);
        return;
      }
      const result = await api<PixTicket>("/api/pix", "POST", input);
      if (result.status === "creating") throw new Error("Seu QR está sendo preparado. Aguarde alguns segundos e tente novamente.");
      if (result.status === "failed" || result.status === "expired") {
        requestId.current = null;
        throw new Error("Este QR venceu. Tente gerar um novo.");
      }
      setPix(result);
      router.refresh();
    } catch (error) { setError(errorText(error)); }
    finally { setBusy(false); }
  }

  if (pix) return <PixView initial={pix} />;

  return (
    <form className="space-y-3" onSubmit={submit} onChange={() => { if (!busy) requestId.current = null; }}>
      <fieldset className="space-y-3" disabled={busy}>
        <GuestFields />
        <label className="field-label">Valor em reais
          <input className="field" name="amount" type="number" inputMode="decimal" required step="0.01" min={minimum / 100}
            max={maximum / 100} defaultValue={amount ? (amount / 100).toFixed(2) : undefined} />
        </label>
        {gift && <p className="text-xs text-sage-700">Valor disponível para contribuir {brl(gift.availableCents)}.</p>}
        {method === "card" && <p className="text-xs text-sage-700">A partir de {brl(CARD_MIN_CENTS)}, à vista ou em até 2x.</p>}
        <button className="btn-primary" type="submit">{busy ? "Preparando…" : method === "card" ? "Continuar no Asaas" : "Gerar QR Code Pix"}</button>
      </fieldset>
      {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    </form>
  );
}

const cardLabels = {
  creating: "Preparando seu checkout",
  pending: "Aguardando confirmação do cartão",
  received: "Pagamento aprovado. Obrigada pelo carinho!",
  expired: "O checkout foi encerrado.",
  failed: "O checkout ficou indisponível.",
  refunded: "Pagamento estornado.",
  review: "Pagamento em revisão pela organização do chá.",
};

export function CardView({ initial }: { initial: CardTicket }) {
  const [ticket, setTicket] = useState(initial);
  const [offline, setOffline] = useState(false);
  const waiting = ticket.status === "pending" || ticket.status === "creating";

  useEffect(() => {
    if (!waiting) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await api<CardTicket>("/api/cartao/" + initial.id);
        if (active) {
          setTicket(next);
          setOffline(false);
        }
      } catch {
        if (active) setOffline(true);
      } finally {
        if (active) timer = setTimeout(poll, 5000);
      }
    };
    timer = setTimeout(poll, 2000);
    return () => { active = false; clearTimeout(timer); };
  }, [initial.id, waiting]);

  return (
    <div className="space-y-3">
      <p className="text-lg font-bold" role="status">{cardLabels[ticket.status]}</p>
      <p className="text-sm">{brl(ticket.amountCents)}{ticket.sandbox && " · Pagamento simulado"}</p>
      {ticket.checkoutUrl && <a className="btn-secondary" href={ticket.checkoutUrl}>Voltar ao checkout do Asaas</a>}
      {offline && <p role="status" className="text-sm text-amber-800">Conexão indisponível. Vamos tentar consultar novamente.</p>}
    </div>
  );
}

const reservationLabels = {
  reserved: "Presente reservado",
  purchased: "Compra informada. Obrigada!",
  received: "Presente recebido pela Juscélia",
  expired: "A reserva expirou",
  cancelled: "Reserva cancelada",
};

export function ReservationView({ initial, standalone = false }: { initial: ReservationTicket; standalone?: boolean }) {
  const router = useRouter();
  const [reservation, setReservation] = useState(initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (reservation.status !== "reserved") return;
    const timer = window.setTimeout(() => {
      setReservation((current) => current.status === "reserved" ? { ...current, status: "expired" } : current);
      router.refresh();
    }, Math.max(0, reservation.expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [reservation.status, reservation.expiresAt, router]);

  async function update(action: "purchased" | "cancelled") {
    setBusy(true);
    setError("");
    try {
      setReservation(await api("/api/reservas/" + reservation.id, "PATCH", { action }));
      router.refresh();
    } catch (error) { setError(errorText(error)); }
    finally { setBusy(false); }
  }

  const path = "/reserva/" + reservation.id;
  return (
    <div className="space-y-4">
      <p className="font-bold text-lg" role="status">{reservationLabels[reservation.status]}</p>
      {reservation.status === "reserved" && <>
        <p className="text-sm">Reservado até {formatDate(reservation.expiresAt)}. Guarde o link privado para voltar e avisar quando comprar.</p>
        <div className="flex gap-2 flex-wrap">
          <a className="btn-primary" href={reservation.storeUrl} target="_blank" rel="noopener noreferrer">Abrir Shopee</a>
          <button className="btn-secondary" type="button" onClick={() => update("purchased")} disabled={busy}>Já comprei</button>
          <button className="btn-secondary" type="button" onClick={() => update("cancelled")} disabled={busy}>Cancelar reserva</button>
        </div>
      </>}
      {!standalone && <Link className="block text-sm font-semibold underline" href={path}>Abrir link privado da reserva</Link>}
      {reservation.status === "reserved" && <CopyButton label="Copiar link da reserva" value={() => window.location.origin + path} />}
      {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    </div>
  );
}

export function ReserveForm({ gift }: { gift: Gift }) {
  const router = useRouter();
  const [reservation, setReservation] = useState<ReservationTicket | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      requestId.current ??= crypto.randomUUID();
      setReservation(await api("/api/reservas", "POST", {
        id: requestId.current, giftId: gift.id, guestName: form.get("guestName"), message: form.get("message"),
      }));
      router.refresh();
    } catch (error) { setError(errorText(error)); }
    finally { setBusy(false); }
  }

  if (reservation) return <ReservationView initial={reservation} />;
  return (
    <form className="space-y-3" onSubmit={submit} onChange={() => { if (!busy) requestId.current = null; }}>
      <p className="text-sm text-sage-700">A reserva separa uma unidade para você por 24 horas.</p>
      <fieldset className="space-y-3" disabled={busy}>
        <GuestFields />
        <button className="btn-primary" type="submit">{busy ? "Reservando…" : "Reservar presente"}</button>
      </fieldset>
      {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    </form>
  );
}
