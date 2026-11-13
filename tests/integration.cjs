const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { randomUUID } = require("node:crypto");
const { spawn } = require("node:child_process");
const { Client } = require("pg");

async function main() {
  const root = path.resolve(__dirname, "..");
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "juscelia-integration-"));
  const stateFile = path.join(temporary, "provider.json");
  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl || new URL(databaseUrl).hostname.includes("-pooler.")) {
    throw new Error("Configure TEST_DATABASE_URL com a conexão direta de um banco de testes.");
  }
  const schema = "qa_" + randomUUID().replaceAll("-", "");
  const appDatabaseUrl = new URL(databaseUrl);
  appDatabaseUrl.searchParams.set("options", "-c search_path=" + schema);
  const database = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 10_000 });
  async function row(sql, params) {
    return (await database.query(sql, params)).rows[0];
  }
  const state = { payments: {}, failQr: false };
  const saveState = () => fs.writeFileSync(stateFile, JSON.stringify(state));
  saveState();

  const port = await new Promise((resolve) => {
    const listener = net.createServer();
    listener.listen(0, "127.0.0.1", () => {
      const port = listener.address().port;
      listener.close(() => resolve(port));
    });
  });
  const base = "http://127.0.0.1:" + port;
  const password = "fixture-panel-password-only";
  const webhookToken = "fixture-webhook-token-isolated-server-only";
  let logs = "";
  let child;
  let schemaCreated = false;
  let cookie = "";

  async function request(method, route, body, expected = 200, auth = false, extraHeaders = {}) {
    const response = await fetch(base + route, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(auth ? { Cookie: cookie } : {}),
        ...extraHeaders,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = await response.json();
    assert.equal(response.status, expected, method + " " + route + " " + JSON.stringify(result));
    return { result, response };
  }

  try {
    await database.connect();
    await database.query(`CREATE SCHEMA "${schema}"`);
    schemaCreated = true;
    await database.query(`SET search_path TO "${schema}"`);
    await database.query(fs.readFileSync(path.join(root, "db/schema.sql"), "utf8"));

    child = spawn(process.execPath, [
      path.join(root, "node_modules/next/dist/bin/next"), "start", "-H", "127.0.0.1", "-p", String(port),
    ], {
      cwd: root,
      windowsHide: true,
      env: {
        ...process.env,
        // Keep the user's .env files out of the test process.
        __NEXT_PROCESSED_ENV: "true",
        NODE_ENV: "production",
        NODE_OPTIONS: '--require="' + path.join(__dirname, "asaas-fixture.cjs").replaceAll("\\", "/") + '"',
        ASAAS_FIXTURE_STATE: stateFile,
        DATABASE_URL: appDatabaseUrl.href,
        ASAAS_ENV: "sandbox",
        ASAAS_API_KEY: "$aact_hmlg_integration_fixture",
        ASAAS_PIX_KEY: "fixture-pix-key",
        ASAAS_WEBHOOK_TOKEN: webhookToken,
        ASAAS_CARD_RETURN_ORIGIN: "https://fixture.example",
        ADMIN_PASSWORD: password,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (data) => { logs = (logs + data).slice(-8000); });
    child.stderr.on("data", (data) => { logs = (logs + data).slice(-8000); });

    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      if (child.exitCode != null) throw new Error("Server exited before readiness.");
      try {
        const response = await fetch(base);
        if (response.ok) { ready = true; break; }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    assert(ready, "Server did not become ready.");
    await request("POST", "/api/admin", { action: "archiveGift", id: randomUUID(), archived: true }, 401);
    await request("POST", "/api/admin/session", { password: "incorrect" }, 401);
    const login = await request("POST", "/api/admin/session", { password });
    cookie = login.response.headers.get("set-cookie").split(";")[0];
    assert(login.response.headers.get("set-cookie").includes("HttpOnly"));
    assert(login.response.headers.get("set-cookie").includes("Secure"));

    const giftBody = {
      action: "saveGift", name: "Jogo de panelas", category: "Panelas & Preparo",
      description: "Presente do teste local", priceCents: 1000, quotaCents: 500,
      imageUrl: null, pixEnabled: true, storeUrl: "https://br.shp.ee/teste",
    };
    const { id: giftId } = (await request("POST", "/api/admin", giftBody, 200, true)).result;
    const pixRequest = (giftId, amountCents = 1000) => ({
      id: randomUUID(), giftId, amountCents, guestName: "Convidado Privado QA", message: "Recado privado QA",
    });
    const first = pixRequest(giftId);
    const firstTicket = (await request("POST", "/api/pix", first)).result;
    assert.equal(firstTicket.status, "pending");
    assert(firstTicket.payload && firstTicket.image);
    const replay = (await request("POST", "/api/pix", first)).result;
    assert.equal(replay.payload, firstTicket.payload);
    assert.equal(Number((await row("SELECT count(*) AS n FROM pix")).n), 1);
    await request("POST", "/api/pix", pixRequest(giftId), 409);
    await request("POST", "/api/reservas", { id: randomUUID(), giftId, guestName: "Outro convidado" }, 409);
    await request("POST", "/api/pix", { ...pixRequest(giftId), amountCents: 1.1 }, 400);
    await request("POST", "/api/webhooks/asaas", { event: "PAYMENT_RECEIVED" }, 401);

    state.payments.pay_fixture = {
      id: "pay_fixture", pixQrCodeId: "qr_" + first.id, billingType: "PIX", status: "RECEIVED", value: 10,
    };
    saveState();
    const event = { event: "PAYMENT_RECEIVED", payment: { id: "pay_fixture", value: 9999 } };
    await request("POST", "/api/webhooks/asaas", event, 200, false, { "asaas-access-token": webhookToken });
    await request("POST", "/api/webhooks/asaas", event, 200, false, { "asaas-access-token": webhookToken });
    assert.equal((await request("GET", "/api/pix/" + first.id)).result.status, "received");
    assert.equal(Number((await row("SELECT sum(amount_cents) AS n FROM pix WHERE status='received'")).n), 1000);
    const publicPage = await (await fetch(base)).text();
    assert(!publicPage.includes("Convidado Privado QA") && !publicPage.includes("Recado privado QA"));
    assert(publicPage.includes("04 de dezembro de 2026 às 18h30") && publicPage.includes("IAIE - Rua Robert Campim, 146"));
    await request("POST", "/api/admin", { ...giftBody, id: giftId, priceCents: 1500 }, 409, true);

    state.payments.pay_fixture.status = "REFUNDED";
    saveState();
    await request("POST", "/api/webhooks/asaas", { event: "PAYMENT_REFUNDED", payment: { id: "pay_fixture" } }, 200, false, { "asaas-access-token": webhookToken });
    await request("POST", "/api/webhooks/asaas", event, 200, false, { "asaas-access-token": webhookToken });
    assert.equal((await request("GET", "/api/pix/" + first.id)).result.status, "refunded");

    const reservation = { id: randomUUID(), giftId, guestName: "Convidado da Shopee" };
    const legacyReservation = (await request("POST", "/api/reservas", reservation)).result;
    assert.equal(legacyReservation.store, "shopee");
    assert.equal(legacyReservation.storeUrl, giftBody.storeUrl);
    const { created_at: reservationCreatedAt } = await row("SELECT created_at FROM reservations WHERE id=$1", [reservation.id]);
    assert.equal(legacyReservation.expiresAt - Number(reservationCreatedAt), 48 * 60 * 60_000);
    const mercadoLivreUrl = "https://mercadolivre.com/sec/qa-mercado-livre";
    const websiteUrl = "https://loja.example/presente?origem=cha";
    await request("POST", "/api/admin", { ...giftBody, id: giftId, mercadoLivreUrl, websiteUrl }, 200, true);
    await request("POST", "/api/reservas", { ...reservation, store: "mercado-livre" }, 409);
    await request("POST", "/api/reservas", { ...reservation, id: randomUUID(), store: "website" }, 409);
    await request("POST", "/api/reservas", reservation);
    await request("POST", "/api/pix", pixRequest(giftId), 409);
    await request("PATCH", "/api/reservas/" + reservation.id, { action: "received" }, 400);
    await database.query("UPDATE reservations SET expires_at=$1 WHERE id=$2", [Date.now() - 60_000, reservation.id]);
    await request("PATCH", "/api/reservas/" + reservation.id, { action: "purchased" }, 409);
    const confirmPurchase = { action: "confirmReservationPurchase", id: reservation.id };
    await request("POST", "/api/admin", confirmPurchase, 401);
    const replacement = { ...reservation, id: randomUUID(), guestName: "Outro convidado" };
    await request("POST", "/api/reservas", replacement);
    await request("POST", "/api/admin", confirmPurchase, 409, true);
    assert.equal((await row("SELECT status FROM reservations WHERE id=$1", [replacement.id])).status, "reserved");
    await request("PATCH", "/api/reservas/" + replacement.id, { action: "cancelled" });
    await request("POST", "/api/admin", confirmPurchase, 200, true);
    await request("POST", "/api/admin", confirmPurchase, 200, true);
    assert.equal((await row("SELECT status FROM reservations WHERE id=$1", [reservation.id])).status, "purchased");
    await request("POST", "/api/reservas", { ...replacement, id: randomUUID() }, 409);
    await request("PATCH", "/api/reservas/" + reservation.id, { action: "cancelled" }, 409);
    await request("POST", "/api/admin", { action: "receiveGift", id: reservation.id }, 200, true);
    assert.equal((await row("SELECT status FROM reservations WHERE id=$1", [reservation.id])).status, "received");
    await request("POST", "/api/admin", { action: "archiveGift", id: giftId, archived: true }, 200, true);
    assert(!(await (await fetch(base)).text()).includes("Jogo de panelas"));

    const { id: secondGift } = (await request("POST", "/api/admin", { ...giftBody, name: "Cafeteira" }, 200, true)).result;
    const competition = await Promise.all([1, 2].map(async () => {
      const response = await fetch(base + "/api/pix", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pixRequest(secondGift)),
      });
      return response.status;
    }));
    assert.deepEqual(competition.sort(), [200, 409]);
    assert.equal(Number((await row("SELECT count(*) AS n FROM pix WHERE gift_id=$1 AND status='pending'", [secondGift])).n), 1);
    const pending = await row("SELECT id FROM pix WHERE gift_id=$1 AND status='pending'", [secondGift]);
    await database.query("UPDATE pix SET expires_at=$1 WHERE id=$2", [Date.now() - 180_000, pending.id]);
    await request("POST", "/api/reservas", { id: randomUUID(), giftId: secondGift, guestName: "Reserva após expiração" });
    assert.equal((await row("SELECT status FROM pix WHERE id=$1", [pending.id])).status, "expired");

    const { id: contestedGift } = (await request("POST", "/api/admin", { ...giftBody, name: "Jogo de copos" }, 200, true)).result;
    const contested = await Promise.all([
      ["/api/pix", pixRequest(contestedGift)],
      ["/api/reservas", { id: randomUUID(), giftId: contestedGift, guestName: "Convidado da Shopee" }],
    ].map(async ([route, body]) => {
      const response = await fetch(base + route, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      return response.status;
    }));
    assert.deepEqual(contested.sort(), [200, 409]);

    await request("POST", "/api/admin", { ...giftBody, quantity: 0 }, 400, true);
    await request("POST", "/api/admin", { ...giftBody, mercadoLivreUrl: "https://mercadolivre.com.br.example/item" }, 400, true);
    await request("POST", "/api/admin", { ...giftBody, websiteUrl: "http://loja.example/item" }, 400, true);
    await request("POST", "/api/admin", { ...giftBody, pixEnabled: false, storeUrl: null }, 400, true);
    const twoUnits = { ...giftBody, name: "Lixeira de teste", quantity: 2, mercadoLivreUrl, websiteUrl };
    const { id: twoUnitGift } = (await request("POST", "/api/admin", twoUnits, 200, true)).result;
    assert((await (await fetch(base)).text()).includes("Shopee · Mercado Livre · Site da loja"));
    const storeUrls = { shopee: giftBody.storeUrl, "mercado-livre": mercadoLivreUrl, website: websiteUrl };
    const claims = Object.keys(storeUrls).map((store) => ({
      id: randomUUID(), giftId: twoUnitGift, guestName: "Convidado da lista", message: "Recado da reserva QA", store,
    }));
    const claimStatuses = await Promise.all(claims.map(async (body) => {
      const response = await fetch(base + "/api/reservas", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (response.ok) {
        const ticket = await response.json();
        assert.equal(ticket.store, body.store);
        assert.equal(ticket.storeUrl, storeUrls[body.store]);
      }
      return response.status;
    }));
    const accepted = claims.filter((_, index) => claimStatuses[index] === 200);
    assert.deepEqual(claimStatuses.sort(), [200, 200, 409]);
    await request("POST", "/api/admin", { ...twoUnits, id: twoUnitGift, quantity: 1 }, 409, true);
    await request("POST", "/api/admin", { ...twoUnits, id: twoUnitGift, quantity: undefined }, 200, true);
    assert.equal((await row("SELECT quantity FROM gifts WHERE id=$1", [twoUnitGift])).quantity, 2);
    await request("PATCH", "/api/reservas/" + accepted[0].id, { action: "cancelled" });
    assert((await (await fetch(base)).text()).includes("1 de 2 unidades disponíveis para reserva"));
    await request("POST", "/api/pix", pixRequest(twoUnitGift, 500));
    await request("POST", "/api/reservas", { ...claims[0], id: randomUUID() }, 409);
    await request("POST", "/api/pix", pixRequest(twoUnitGift, 501), 409);
    await request("POST", "/api/pix", pixRequest(twoUnitGift, 500));

    const websiteOnly = { ...giftBody, name: "Presente do site da loja", pixEnabled: false, storeUrl: null, websiteUrl };
    const { id: websiteGift } = (await request("POST", "/api/admin", websiteOnly, 200, true)).result;
    await request("POST", "/api/admin", { ...websiteOnly, id: websiteGift, websiteUrl: undefined }, 200, true);
    const websiteReservation = { id: randomUUID(), giftId: websiteGift, guestName: "Convidado do site da loja" };
    await request("POST", "/api/reservas", { ...websiteReservation, store: "mercado-livre" }, 404);
    await request("POST", "/api/reservas", { ...websiteReservation, store: "loja-invalida" }, 400);
    const websiteTicket = (await request("POST", "/api/reservas", { ...websiteReservation, store: "website" })).result;
    assert.equal(websiteTicket.storeUrl, websiteUrl);
    const websitePage = await (await fetch(base + "/reserva/" + websiteTicket.id)).text();
    assert(websitePage.includes("Abrir site da loja") && websitePage.includes(websiteUrl));

    const { id: cardGift } = (await request("POST", "/api/admin", { ...giftBody, name: "Presente no cartão", priceCents: 2011 }, 200, true)).result;
    const card = { ...pixRequest(cardGift, 2011), message: "Recado cartão QA" };
    const belowCardMinimum = await request("POST", "/api/cartao", { ...card, amountCents: 1999 }, 400);
    assert(belowCardMinimum.result.error.includes("20,00"));
    const checkout = (await request("POST", "/api/cartao", card)).result;
    assert.equal(checkout.status, "pending");
    assert.equal(checkout.checkoutUrl, "https://sandbox.asaas.com/checkoutSession/show?id=" + card.id);
    assert.equal((await request("POST", "/api/cartao", card)).result.checkoutUrl, checkout.checkoutUrl);
    await request("POST", "/api/pix", pixRequest(cardGift), 409);
    await request("POST", "/api/reservas", { id: randomUUID(), giftId: cardGift, guestName: "Reserva concorrente" }, 409);
    await request("GET", "/api/pix/" + card.id, undefined, 404);
    const callback = await (await fetch(base + "/cartao/" + card.id)).text();
    assert(callback.includes("Aguardando confirmação do cartão"));
    const cardWebhook = (event, data, expected = 200) => request(
      "POST", "/api/webhooks/asaas", { event, ...data }, expected, false, { "asaas-access-token": webhookToken },
    );
    const checkoutEvent = { checkout: { id: card.id, status: "PAID" } };
    await request("POST", "/api/webhooks/asaas", { event: "CHECKOUT_PAID", ...checkoutEvent }, 401);
    const unrelatedCheckout = randomUUID();
    for (let index = 0; index < 100; index++) {
      const id = "pay_other_" + index;
      state.payments[id] = { id, checkoutSession: unrelatedCheckout, billingType: "CREDIT_CARD", status: "CONFIRMED", value: 20.11 };
    }
    saveState();
    await cardWebhook("CHECKOUT_PAID", checkoutEvent, 503);
    state.payments.pay_card1 = { id: "pay_card1", checkoutSession: card.id, billingType: "CREDIT_CARD", status: "CONFIRMED", value: 10.05 };
    saveState();
    await cardWebhook("CHECKOUT_PAID", checkoutEvent, 503);
    state.payments.pay_card2 = { ...state.payments.pay_card1, id: "pay_card2", value: 10.06 };
    saveState();
    await database.query("UPDATE pix SET status='expired', expires_at=$1 WHERE id=$2", [Date.now() - 180_000, card.id]);
    await request("POST", "/api/admin", { action: "reconcilePayment", id: card.id }, 200, true);
    assert.equal((await request("GET", "/api/cartao/" + card.id)).result.status, "received");
    await cardWebhook("CHECKOUT_PAID", checkoutEvent);
    await cardWebhook("CHECKOUT_PAID", checkoutEvent);
    assert.equal((await request("GET", "/api/cartao/" + card.id)).result.status, "received");
    assert.equal(Number((await row("SELECT sum(amount_cents) AS total FROM pix WHERE gift_id=$1 AND status='received'", [cardGift])).total), 2011);
    await cardWebhook("PAYMENT_REFUNDED", { payment: state.payments.pay_card1 }, 503);
    state.payments.pay_card1.status = "REFUNDED";
    saveState();
    await cardWebhook("PAYMENT_REFUNDED", { payment: state.payments.pay_card1 });
    assert.equal((await request("GET", "/api/cartao/" + card.id)).result.status, "review");
    state.payments.pay_card2.status = "REFUNDED";
    saveState();
    await cardWebhook("PAYMENT_REFUNDED", { payment: state.payments.pay_card2 });
    await cardWebhook("CHECKOUT_PAID", checkoutEvent);
    assert.equal((await request("GET", "/api/cartao/" + card.id)).result.status, "refunded");
    const nextCard = pixRequest(cardGift, 2000);
    await request("POST", "/api/cartao", nextCard);
    await cardWebhook("CHECKOUT_CANCELED", { checkout: { id: nextCard.id } });
    assert.equal((await request("GET", "/api/cartao/" + nextCard.id)).result.status, "expired");
    await request("POST", "/api/reservas", { id: randomUUID(), giftId: cardGift, guestName: "Reserva liberada" });
    const freeCard = pixRequest(undefined, 2000);
    await request("POST", "/api/cartao", freeCard);
    assert.equal((await request("GET", "/api/cartao/" + freeCard.id)).result.amountCents, 2000);

    const free = pixRequest(undefined, 300);
    const freeTicket = (await request("POST", "/api/pix", free)).result;
    state.payments.pay_mismatch = {
      id: "pay_mismatch", pixQrCodeId: "qr_" + free.id, billingType: "PIX", status: "RECEIVED", value: 1,
    };
    saveState();
    await request("POST", "/api/webhooks/asaas", { event: "PAYMENT_RECEIVED", payment: { id: "pay_mismatch" } }, 200, false, { "asaas-access-token": webhookToken });
    assert.equal((await request("GET", "/api/pix/" + freeTicket.id)).result.status, "review");

    const partial = pixRequest(undefined, 500);
    await request("POST", "/api/pix", partial);
    state.payments.pay_partial = {
      id: "pay_partial", pixQrCodeId: "qr_" + partial.id, billingType: "PIX", status: "RECEIVED", value: 5,
      refunds: [{ status: "DONE", value: 1 }],
    };
    saveState();
    await request("POST", "/api/webhooks/asaas", { event: "PAYMENT_PARTIALLY_REFUNDED", payment: { id: "pay_partial" } }, 200, false, { "asaas-access-token": webhookToken });
    await request("POST", "/api/webhooks/asaas", { event: "PAYMENT_RECEIVED", payment: { id: "pay_partial" } }, 200, false, { "asaas-access-token": webhookToken });
    assert.equal((await request("GET", "/api/pix/" + partial.id)).result.status, "review");

    state.failQr = true;
    saveState();
    const failing = pixRequest(undefined, 100);
    await request("POST", "/api/pix", failing, 503);
    assert.equal((await row("SELECT status FROM pix WHERE id=$1", [failing.id])).status, "failed");
    state.failQr = false;
    saveState();
    const { id: previewGift } = (await request("POST", "/api/admin", { ...giftBody, name: "Conjunto de xícaras", priceCents: 12000, quotaCents: 3000 }, 200, true)).result;
    assert(previewGift);
    const panel = await fetch(base + "/painel", { headers: { Cookie: cookie } });
    assert.equal(panel.status, 200);
    const panelPage = await panel.text();
    const totals = await row(`
      SELECT (SELECT count(*)::int FROM gifts) AS gifts,
        (SELECT count(*)::int FROM pix WHERE environment = 'sandbox') AS payments,
        (SELECT count(*)::int FROM reservations WHERE environment = 'sandbox') AS reservations,
        (SELECT count(*)::int FROM pix WHERE environment = 'sandbox' AND btrim(message) <> '') +
        (SELECT count(*)::int FROM reservations WHERE environment = 'sandbox' AND btrim(message) <> '') AS messages
    `);
    for (const [label, total] of [
      ["Presentes", totals.gifts],
      ["Pagamentos e doações", totals.payments],
      ["Reservas", totals.reservations],
      ["Recados", totals.messages],
    ]) {
      assert(panelPage.includes(`aria-label="${label}, ${total} ${total === 1 ? "registro" : "registros"}"`));
    }
    assert(panelPage.includes("Recado privado QA") && panelPage.includes("Recado da reserva QA"));
    assert(panelPage.includes("Cartão aprovado") && panelPage.includes("Recado cartão QA"));
    const loginPage = await (await fetch(base + "/painel")).text();
    assert(!loginPage.includes("Recado privado QA") && !loginPage.includes("Recado da reserva QA"));
    assert.equal((await fetch(base + "/pix/" + first.id)).status, 200);
    assert.equal((await fetch(base + "/reserva/" + reservation.id)).status, 200);
    await request("DELETE", "/api/admin/session", undefined, 200, true);
    await request("POST", "/api/admin", { action: "archiveGift", id: previewGift, archived: true }, 401, true);
    console.log("PASS event info, login, admin CRUD, private messages, Pix QR, card checkout and installments, webhook authentication and duplication, authoritative amounts, refunds, reservations, multi-unit capacity, concurrent claims, expiry reconciliation, provider failure.");

    if (process.argv.includes("--preview")) {
      console.log("QA preview " + base);
      console.log("Fixture panel password " + password);
      await new Promise((resolve) => {
        process.stdin.resume();
        process.stdin.once("data", resolve);
      });
      process.stdin.pause();
    }
  } catch (error) {
    console.error(logs);
    throw error;
  } finally {
    if (child && child.exitCode == null && child.signalCode == null) {
      await new Promise((resolve) => {
        child.once("exit", resolve);
        child.kill();
      });
    }
    try {
      if (schemaCreated) await database.query(`DROP SCHEMA "${schema}" CASCADE`);
    } finally {
      await database.end();
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
