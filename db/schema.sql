CREATE TABLE IF NOT EXISTS gifts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  quota_cents INTEGER,
  pix_enabled BOOLEAN NOT NULL,
  store_url TEXT,
  image_url TEXT,
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at BIGINT NOT NULL
);

ALTER TABLE gifts ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0);
ALTER TABLE gifts ADD COLUMN IF NOT EXISTS mercado_livre_url TEXT;
ALTER TABLE gifts ADD COLUMN IF NOT EXISTS website_url TEXT;

CREATE TABLE IF NOT EXISTS pix (
  id TEXT PRIMARY KEY,
  environment TEXT NOT NULL,
  gift_id TEXT REFERENCES gifts(id),
  gift_name TEXT,
  guest_name TEXT NOT NULL,
  message TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  qr_id TEXT,
  qr_image TEXT,
  qr_payload TEXT,
  provider_payment_id TEXT,
  manual BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (environment, qr_id),
  UNIQUE (environment, provider_payment_id)
);

CREATE INDEX IF NOT EXISTS pix_gift ON pix (environment, gift_id, status);
ALTER TABLE pix ADD COLUMN IF NOT EXISTS method TEXT NOT NULL DEFAULT 'pix' CHECK (method IN ('pix', 'card'));
ALTER TABLE pix ADD COLUMN IF NOT EXISTS checkout_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS pix_checkout ON pix (environment, checkout_id) WHERE checkout_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS reservations (
  id TEXT PRIMARY KEY,
  environment TEXT NOT NULL,
  gift_id TEXT NOT NULL REFERENCES gifts(id),
  gift_name TEXT NOT NULL,
  store_url TEXT NOT NULL,
  guest_name TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS reservations_gift ON reservations (environment, gift_id, status);
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS store TEXT NOT NULL DEFAULT 'shopee'
  CHECK (store IN ('shopee', 'mercado-livre', 'website'));

CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,
  expires_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS rate_limits (
  name TEXT PRIMARY KEY,
  resets_at BIGINT NOT NULL,
  hits INTEGER NOT NULL
);
