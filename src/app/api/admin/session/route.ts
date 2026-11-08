import { signIn, signOut } from "@/server/auth";
import { handle, readJson, RequestError } from "@/server/http";

export async function POST(request: Request) {
  return handle(async () => {
    await signIn((await readJson(request)).password);
    return { ok: true };
  });
}

export async function DELETE(request: Request) {
  return handle(async () => {
    if (request.headers.get("sec-fetch-site") === "cross-site") throw new RequestError(403, "Origem inválida.");
    await signOut();
    return { ok: true };
  });
}
