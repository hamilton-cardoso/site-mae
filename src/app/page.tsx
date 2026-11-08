import { GiftList } from "@/components/GiftList";
import { asaasEnvironment } from "@/server/asaas";
import { listGifts } from "@/server/gifts";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  return <GiftList gifts={await listGifts()} sandbox={asaasEnvironment() === "sandbox"} />;
}
