import { Heart } from "lucide-react";
import { GuestPixForm } from "./GuestForms";

export function FreeDonationSection() {
  return (
    <section id="doar-dinheiro" className="scroll-mt-24 max-w-6xl mx-auto px-4 sm:px-6">
      <div className="rounded-3xl border border-sage-200 bg-white p-6 sm:p-9 grid md:grid-cols-2 gap-7">
        <div>
          <Heart className="text-terracotta-600 mb-3" />
          <h2 className="font-serif text-3xl font-bold text-sage-900">Um carinho em dinheiro</h2>
          <p className="text-sm text-sage-700 mt-2 max-w-sm">Escolha um valor e deixe um recado para a Juscélia. O site confirma automaticamente quando o Pix chegar.</p>
        </div>
        <GuestPixForm />
      </div>
    </section>
  );
}
