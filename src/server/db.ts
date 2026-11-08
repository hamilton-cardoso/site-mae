import { Pool, types, type PoolClient } from "pg";
import { RequestError } from "./http";

let pool: Pool | undefined;

export function db() {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new RequestError(503, "Configure a conexão com o PostgreSQL.");
  pool = new Pool({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 10_000,
    types: {
      getTypeParser(oid, format) {
        // Timestamp em milissegundos e totais em centavos ficam dentro da faixa segura de Number.
        if (oid === types.builtins.INT8 && format === "text") return Number;
        return types.getTypeParser(oid, format);
      },
    },
  });
  pool.on("error", () => console.error("Conexão ociosa com o PostgreSQL foi interrompida."));
  return pool;
}

export async function transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await db().connect();
  let discard = false;
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      discard = true;
    }
    throw error;
  } finally {
    client.release(discard);
  }
}

export async function consumeLimit(name: string, max: number, interval: number) {
  const now = Date.now();
  const { rows: [row] } = await db().query<{ hits: number }>(`
    INSERT INTO rate_limits (name, resets_at, hits) VALUES ($1, $2, 1)
    ON CONFLICT(name) DO UPDATE SET
      hits = CASE WHEN rate_limits.resets_at <= $3 THEN 1 ELSE rate_limits.hits + 1 END,
      resets_at = CASE WHEN rate_limits.resets_at <= $3 THEN excluded.resets_at ELSE rate_limits.resets_at END
    RETURNING hits
  `, [name, now + interval, now]);
  return row.hits <= max;
}
