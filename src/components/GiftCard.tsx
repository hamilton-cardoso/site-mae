import { Coins, Gift as GiftIcon, ShoppingBag } from "lucide-react";
import { brl, type Gift } from "@/data/gifts";

const labels = { available: "Disponível", funded: "Meta atingida", reserved: "Reservado", purchased: "Compra informada", received: "Presente recebido" };

export function GiftCard({ gift, onSelect }: { gift: Gift; onSelect: (method: "pix" | "shop") => void }) {
  const progress = gift.pixTargetCents > 0
    ? Math.min(100, Math.round(gift.raisedCents / gift.pixTargetCents * 100))
    : 0;
  const available = gift.canPay || gift.canReserve;
  const label = gift.status === "available" && !available ? "Aguardando Pix" : labels[gift.status];

  return (
    <article className="bg-white border border-sage-200 rounded-3xl overflow-hidden flex flex-col">
      <div className="relative h-44 bg-sage-100 flex items-center justify-center">
        {gift.imageUrl ? (
          <img src={gift.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" className="absolute inset-0 w-full h-full object-cover" />
        ) : <GiftIcon size={40} className="text-sage-400" />}
        <span className="absolute left-3 top-3 rounded-full px-3 py-1 bg-white text-xs font-semibold">{gift.category}</span>
      </div>
      <div className="p-5 flex flex-col flex-1 gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-terracotta-700">{label}</p>
          <h3 className="font-serif text-xl font-bold text-sage-900 mt-1">{gift.name}</h3>
          <p className="text-sm text-sage-700 mt-1">{gift.description}</p>
        </div>
        <div className="mt-auto space-y-3">
          <div className="flex justify-between gap-2 items-baseline text-sm">
            <span className="text-sage-700">{gift.quantity > 1 ? "Valor por unidade" : "Valor estimado"}</span><strong>{brl(gift.priceCents)}</strong>
          </div>
          {gift.quantity > 1 && <p className="text-sm text-sage-700">
            {gift.storeUrl ? `${gift.availableUnits} de ${gift.quantity} unidades disponíveis para reserva` : `${gift.quantity} unidades na lista`}
          </p>}
          {gift.pixEnabled && gift.pixTargetCents > 0 && (
            <div className="space-y-1 text-xs text-sage-700">
              <progress className="w-full h-2 block accent-sage-700" aria-label="Meta do presente" value={progress} max={100} />
              <p>{brl(gift.raisedCents)} recebidos</p>
            </div>
          )}
          {available && <div className="flex flex-wrap gap-2">
            {gift.canPay && <button type="button" className="btn-primary" onClick={() => onSelect("pix")}><Coins size={16} /> Contribuir via Pix</button>}
            {gift.canReserve && <button type="button" className="btn-secondary" onClick={() => onSelect("shop")}><ShoppingBag size={16} /> {gift.quantity > 1 ? "Reservar 1 unidade" : "Reservar presente"}</button>}
          </div>}
        </div>
      </div>
    </article>
  );
}
