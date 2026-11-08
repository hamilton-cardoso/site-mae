// Loaded only into the isolated integration-test server.
const fs = require("node:fs");
const originalFetch = globalThis.fetch;
const stateFile = process.env.ASAAS_FIXTURE_STATE;
if (!stateFile || process.env.ASAAS_API_KEY !== "$aact_hmlg_integration_fixture") {
  throw new Error("The Asaas fixture requires an isolated test environment.");
}

globalThis.fetch = async function (input, options = {}) {
  const url = new URL(typeof input === "string" ? input : input.url);
  if (url.hostname === "api.asaas.com") throw new Error("Production access is forbidden in integration tests.");
  if (url.hostname !== "api-sandbox.asaas.com") return originalFetch(input, options);
  const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  if (options.method === "POST" && url.pathname === "/v3/pix/qrCodes/static") {
    if (state.failQr) return Response.json({}, { status: 503 });
    const body = JSON.parse(options.body);
    if (!body.addressKey || body.allowsMultiplePayments !== false || body.expirationSeconds !== 1800) {
      return Response.json({}, { status: 400 });
    }
    return Response.json({
      id: "qr_" + body.externalReference,
      encodedImage: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZe8AAAAASUVORK5CYII=",
      payload: "sandbox-pix-fixture-" + body.externalReference,
    });
  }
  if (options.method === "POST" && url.pathname === "/v3/checkouts") {
    const body = JSON.parse(options.body);
    const item = body.items?.[0];
    const installments = item?.value >= 10;
    const callback = "https://fixture.example/cartao/" + body.externalReference;
    if (body.billingTypes?.join() !== "CREDIT_CARD" || body.minutesToExpire !== 30 ||
        body.chargeTypes?.join() !== (installments ? "DETACHED,INSTALLMENT" : "DETACHED") ||
        body.installment?.maxInstallmentCount !== (installments ? 2 : undefined) ||
        item?.quantity !== 1 || item.value < 5 || typeof item.name !== "string" || item.name.length > 30 ||
        body.callback?.successUrl !== callback || body.callback?.cancelUrl !== callback || body.callback?.expiredUrl !== callback) {
      return Response.json({}, { status: 400 });
    }
    return Response.json({ id: body.externalReference });
  }
  if (url.pathname === "/v3/payments") {
    const key = url.searchParams.has("checkoutSession") ? "checkoutSession" : "pixQrCodeId";
    return Response.json({
      data: Object.values(state.payments).filter((payment) => payment[key] === url.searchParams.get(key)),
      hasMore: false,
    });
  }
  const payment = state.payments[url.pathname.split("/").at(-1)];
  return payment ? Response.json(payment) : Response.json({}, { status: 404 });
};
