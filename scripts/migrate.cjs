const fs = require("node:fs");
const path = require("node:path");
const { loadEnvConfig } = require("@next/env");
const { Client } = require("pg");

async function main() {
  loadEnvConfig(path.resolve(__dirname, ".."));
  const connectionString = process.env.DATABASE_URL_UNPOOLED;
  if (!connectionString || new URL(connectionString).hostname.includes("-pooler.")) {
    throw new Error("Configure DATABASE_URL_UNPOOLED com a conexão direta do banco.");
  }
  const schema = fs.readFileSync(path.join(__dirname, "../db/schema.sql"), "utf8");
  const client = new Client({ connectionString, connectionTimeoutMillis: 10_000 });
  try {
    await client.connect();
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(4964707538716701995)");
    await client.query(schema);
    await client.query("COMMIT");
    console.log("Esquema PostgreSQL aplicado.");
  } catch (error) {
    throw new Error("Falha ao aplicar o esquema PostgreSQL (" + (error.code || error.name) + ").");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof TypeError ? "URL do PostgreSQL inválida." : error.message);
  process.exitCode = 1;
});
