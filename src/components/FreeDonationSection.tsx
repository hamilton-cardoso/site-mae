import { Heart } from "lucide-react";
import { useState } from "react";
import { type PaymentMethod } from "@/data/gifts";
import { GuestContributionForm } from "./GuestForms";

export function FreeDonationSection({ cardEnabled }: { cardEnabled: boolean }) {
  const [method, setMethod] = useState<PaymentMethod>("pix");
  return (
    <section id="doar-dinheiro" className="scroll-mt-24 max-w-6xl mx-auto px-4 sm:px-6">
      <div className="rounded-3xl border border-sage-200 bg-white p-6 sm:p-9 grid md:grid-cols-2 gap-7">
        <div>
          <Heart className="text-terracotta-600 mb-3" />
          <h2 className="font-serif text-3xl font-bold text-sage-900">Um carinho em dinheiro</h2>
          <p className="text-sm text-sage-700 mt-2 max-w-sm">Escolha um valor e deixe um recado para a Juscélia. A confirmação do pagamento é automática.</p>
        </div>
        <div className="space-y-3">
          {cardEnabled && <div className="flex flex-wrap gap-2" role="group" aria-label="Forma de pagamento">
            <button type="button" className={method === "pix" ? "btn-primary" : "btn-secondary"} aria-pressed={method === "pix"} onClick={() => setMethod("pix")}>Pix</button>
            <button type="button" className={method === "card" ? "btn-primary" : "btn-secondary"} aria-pressed={method === "card"} onClick={() => setMethod("card")}>Cartão em até 2x</button>
          </div>}
          <GuestContributionForm key={method} method={method} />
        </div>
      </div>
    </section>
  );
}
