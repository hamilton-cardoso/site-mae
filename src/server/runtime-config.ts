import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";

const keys = ["DATABASE_URL", "ASAAS_ENV", "ASAAS_API_KEY", "ASAAS_PIX_KEY", "ASAAS_WEBHOOK_TOKEN", "ADMIN_PASSWORD"] as const;
let loading: Promise<void> | undefined;

async function loadParameter(arn: string) {
  const region = /^arn:aws:ssm:([a-z0-9-]+):\d{12}:parameter\//.exec(arn)?.[1];
  if (!region) throw new Error("ARN da configuração do servidor inválido.");

  const client = new SSMClient({ region, maxAttempts: 2 });
  try {
    const response = await client.send(
      new GetParameterCommand({ Name: arn, WithDecryption: true }),
      { abortSignal: AbortSignal.timeout(5_000) },
    );
    const settings: Partial<Record<typeof keys[number], unknown>> = JSON.parse(response.Parameter?.Value ?? "{}");
    const entries = keys.map((key) => {
      const value = settings?.[key];
      if (typeof value !== "string" || !value.trim()) throw new Error("Variável ausente na configuração do servidor.");
      return [key, value] as const;
    });
    for (const [key, value] of entries) process.env[key] = value;
  } finally {
    client.destroy();
  }
}

export function loadRuntimeConfig() {
  const arn = process.env.RUNTIME_CONFIG_PARAMETER;
  if (!arn) return;
  loading ??= loadParameter(arn).catch((error: unknown) => {
    loading = undefined;
    console.error("Falha ao carregar a configuração do servidor no Parameter Store.", error instanceof Error ? error.name : "");
    throw new Error("A configuração do servidor está indisponível.");
  });
  return loading;
}
