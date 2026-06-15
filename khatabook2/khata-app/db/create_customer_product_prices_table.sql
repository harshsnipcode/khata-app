-- Customer-specific product pricing table
-- Allows setting custom prices per product for individual customers
-- If no row exists for a customer+product, the default product sale_price is used

CREATE TABLE IF NOT EXISTS customer_product_prices (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  custom_price NUMERIC NOT NULL CHECK (custom_price >= 0),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE (customer_id, product_id)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_customer_prices_customer_id ON customer_product_prices(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_prices_product_id ON customer_product_prices(product_id);

-- Enable realtime for live sync
ALTER PUBLICATION supabase_realtime ADD TABLE customer_product_prices;
