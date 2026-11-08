import { GiftList } from "@/components/GiftList";
import { asaasEnvironment } from "@/server/asaas";
import { listGifts } from "@/server/gifts";
import { loadRuntimeConfig } from "@/server/runtime-config";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await loadRuntimeConfig();
  return <GiftList gifts={await listGifts()} sandbox={asaasEnvironment() === "sandbox"} />;
}
