import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { consumeLimit, db, transaction } from "./db";
import { RequestError } from "./http";

const COOKIE = "juscelia_admin";
const SESSION_MS = 12 * 60 * 60 * 1000;
const hash = (value: string) => createHash("sha256").update(value).digest();

function password() {
  const secret = process.env.ADMIN_PASSWORD;
  return secret && secret.length >= 16 ? secret : null;
}

const sessionHash = (token: string, secret: string) => hash(`${secret}\0${token}`).toString("hex");

export async function isAdmin() {
  const token = (await cookies()).get(COOKIE)?.value;
  const secret = password();
  if (!secret || !token || !/^[a-f0-9]{64}$/.test(token)) return false;
  const { rowCount } = await db().query(
    "SELECT 1 FROM admin_sessions WHERE token_hash = $1 AND expires_at > $2",
    [sessionHash(token, secret), Date.now()],
  );
  return rowCount === 1;
}

export async function requireAdmin() {
  if (!(await isAdmin())) throw new RequestError(401, "Entre no painel novamente.");
}

export async function signIn(input: unknown) {
  const secret = password();
  if (!secret) throw new RequestError(503, "Defina ADMIN_PASSWORD no servidor com pelo menos 16 caracteres.");
  if (!(await consumeLimit("admin-login", 10, 15 * 60_000))) {
    throw new RequestError(429, "Muitas tentativas. Aguarde 15 minutos.");
  }
  if (typeof input !== "string" || input.length > 1024 || !timingSafeEqual(hash(input), hash(secret))) {
    throw new RequestError(401, "Senha incorreta.");
  }
  const token = randomBytes(32).toString("hex");
  const now = Date.now();
  await transaction(async (client) => {
    await client.query("DELETE FROM admin_sessions WHERE expires_at <= $1", [now]);
    await client.query("DELETE FROM rate_limits WHERE name = 'admin-login'");
    await client.query("INSERT INTO admin_sessions (token_hash, expires_at) VALUES ($1, $2)", [
      sessionHash(token, secret), now + SESSION_MS,
    ]);
  });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_MS / 1000,
  });
}

export async function signOut() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  const secret = password();
  if (token && secret) {
    await db().query("DELETE FROM admin_sessions WHERE token_hash = $1", [sessionHash(token, secret)]);
  }
  jar.delete(COOKIE);
}
