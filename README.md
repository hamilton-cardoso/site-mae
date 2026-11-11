# Chá de Cozinha da Juscélia

Lista de presentes em Next.js 16, React 19, TypeScript, Tailwind e PostgreSQL. Requer Node.js 24 ou superior.

## Executar

```sh
npm install
```

A lista fica em `http://localhost:3000` e o painel em `/painel`. Os presentes são cadastrados pelo painel.

Copie `.env.example` para `.env.local` e preencha as variáveis. A senha do painel deve ter pelo menos 16 caracteres. O token do webhook deve ter pelo menos 32 caracteres aleatórios. A chave de API do Asaas começa com um dólar, que deve ser escapado como `\$` no arquivo de ambiente do Next.js.

```dotenv
ASAAS_ENV=sandbox
ASAAS_API_KEY=\$aact_hmlg_substitua_pela_sua_chave
ASAAS_PIX_KEY=sua_chave_pix_aleatoria_do_sandbox
ASAAS_WEBHOOK_TOKEN=seu_token_aleatorio_com_pelo_menos_32_caracteres
ADMIN_PASSWORD=sua_senha_com_pelo_menos_16_caracteres
DATABASE_URL=
DATABASE_URL_UNPOOLED=
```

Use as duas URLs da branch Neon `dev` no desenvolvimento. O site consulta a URL com pool em `DATABASE_URL`. A migração usa a conexão direta em `DATABASE_URL_UNPOOLED`. O arquivo `.env.local` é ignorado pelo Git.

Aplique o esquema antes de iniciar o servidor.

```sh
npm run db:migrate
npm run dev
```

## Funcionalidades

- Cadastro, edição e arquivamento de presentes, com foto por URL HTTPS, categoria, descrição, valor-alvo, cota sugerida e links opcionais para Shopee, Mercado Livre e o site da loja.
- Pix para cotas ou doações livres. Cada contribuição gera um QR Code estático individual do Asaas com valor fixo, validade de 30 minutos e uso único.
- Cartão para cotas ou doações livres em checkout hospedado pelo Asaas. O valor mínimo é R$ 20, tanto à vista quanto em até duas parcelas.
- Confirmação pelo webhook, com token e consulta autenticada ao Asaas. O valor, o identificador do QR e o status recebido são conferidos antes de contabilizar.
- Identificador único da contribuição para repetir uma requisição sem criar outro QR Code. Recebimentos repetidos são atualizados no mesmo registro.
- Cotas pendentes bloqueiam o valor reservado. Após o vencimento e uma margem de dois minutos, o servidor consulta o Asaas antes de liberar o saldo para outro convidado.
- Reservas em lojas externas com prazo de 48 horas. O convidado escolhe a loja e recebe um link privado para avisar que comprou ou cancelar a reserva. A organização confirma o recebimento do presente pelo painel.
- Cada reserva ocupa uma unidade, independentemente da loja escolhida. As cotas via Pix e cartão usam o mesmo saldo e a lista só aceita uma nova reserva quando há saldo para uma unidade inteira.
- A aba **Recados** do painel reúne as mensagens das contribuições e reservas.
- Login do painel com cookie HttpOnly, expiração e limitação de tentativas. O painel mostra Pix, doações lançadas manualmente e reservas separadamente, com exportação CSV.
- Estornos totais atualizam o recebimento. Valores divergentes, pagamentos conflitantes e estornos parciais são sinalizados para revisão no Asaas.
- A branch `dev` do Neon guarda os dados de teste. A branch `main` guarda o catálogo e os registros oficiais.

## Webhook do Asaas

Depois de disponibilizar o servidor em HTTPS, configure no ambiente correspondente do Asaas um webhook com a URL abaixo.

```text
https://seu-dominio/api/webhooks/asaas
```

Use o mesmo valor de `ASAAS_WEBHOOK_TOKEN` como token de autenticação do webhook. O Asaas o envia no cabeçalho `asaas-access-token`. Habilite os eventos `PAYMENT_RECEIVED`, `PAYMENT_REFUNDED` e `PAYMENT_PARTIALLY_REFUNDED`.

Para habilitar o cartão, acrescente `CHECKOUT_PAID`, `CHECKOUT_CANCELED`, `CHECKOUT_EXPIRED`, `PAYMENT_CONFIRMED`, `PAYMENT_CHARGEBACK_REQUESTED`, `PAYMENT_CHARGEBACK_DISPUTE` e `PAYMENT_AWAITING_CHARGEBACK_REVERSAL` ao webhook. Configure `ASAAS_CARD_RETURN_ORIGIN` com a origem HTTPS do site. No Amplify, coloque essa origem no parâmetro de execução junto com as outras variáveis do Asaas.

O servidor retorna sucesso somente depois de processar ou reconhecer o evento. Erros temporários retornam erro para permitir o reenvio pelo Asaas. O botão **Consultar Asaas** no painel permite reconciliar um recebimento pendente.

Os QR Codes do Sandbox usam pagamentos simulados. O desenvolvimento e as verificações locais não exigem uma segunda conta Sandbox.

## Colocar em produção

Configure todas as variáveis da conta oficial no servidor.

1. Altere `ASAAS_ENV` para `production`.
2. Informe a chave de API oficial e a chave Pix vinculada à conta oficial.
3. Defina o token do webhook oficial e cadastre a URL HTTPS no Asaas de produção.
4. Defina a senha do painel e as URLs PostgreSQL da branch `main`. Aplique o esquema em `main` com `npm run db:migrate`, usando a URL direta dessa branch.
5. Execute `npm run build` e `npm start`, usando HTTPS no proxy da hospedagem.
6. Confira os dados reais de data e local em `src/data/gifts.ts`. Esses textos foram mantidos do protótipo.
7. Faça o teste real de valor baixo acordado antes de compartilhar o site com os convidados.

## Verificações

```sh
npm run typecheck
npm run build
```

Para executar `npm run test:integration`, defina `TEST_DATABASE_URL` com a URL direta da branch `dev`. O teste aplica o esquema em um namespace temporário, simula o Asaas e remove o namespace ao terminar.

O recebimento real e a entrega de webhooks pelo Asaas em produção dependem da conta e da URL pública configuradas.

## AWS Amplify Hosting

O `amplify.yml` seleciona Node.js 24 e compila o aplicativo SSR. Na branch oficial do Amplify, defina `RUNTIME_CONFIG_PARAMETER` com o ARN de um parâmetro `SecureString` do AWS Systems Manager Parameter Store.

O parâmetro deve conter um objeto JSON com `DATABASE_URL` (conexão com pool da branch oficial), `ADMIN_PASSWORD`, `ASAAS_ENV`, `ASAAS_API_KEY`, `ASAAS_PIX_KEY` e `ASAAS_WEBHOOK_TOKEN`. O papel IAM de SSR Compute precisa de `ssm:GetParameter` para esse parâmetro. O build recebe apenas o ARN e o servidor lê os valores em execução.

Para aplicar o esquema em produção, use a conexão direta da branch oficial em `DATABASE_URL_UNPOOLED` com `npm run db:migrate`.
