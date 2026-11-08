"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { type Gift, type GiftAction } from "@/data/gifts";
import { GuestContributionForm, ReserveForm } from "./GuestForms";

const labels = { pix: "Contribuição via Pix", card: "Contribuição com cartão", shop: "Reserva para compra na Shopee" };

export function GiftActionModal({ gift, method, onClose }: { gift: Gift; method: GiftAction; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);

  return (
    <dialog ref={dialog} onClose={onClose} aria-labelledby="gift-dialog-title"
      className="w-[min(94vw,36rem)] max-h-[90dvh] rounded-3xl border border-sage-200 p-0 text-sage-900 backdrop:bg-black/50">
      <div className="flex items-start justify-between gap-4 bg-sage-800 text-white p-5">
        <div><p className="text-xs text-sage-200">{labels[method]}</p>
          <h2 id="gift-dialog-title" className="font-serif text-xl font-bold">{gift.name}</h2></div>
        <button className="p-1 rounded-lg hover:bg-sage-700" aria-label="Fechar" onClick={() => dialog.current?.close()}><X size={20} /></button>
      </div>
      <div className="p-5">{method === "shop" ? <ReserveForm gift={gift} /> : <GuestContributionForm gift={gift} method={method} />}</div>
    </dialog>
  );
}
