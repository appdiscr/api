-- Create sticker orders schema for QR code sticker ordering system

-- Create enum for order status
CREATE TYPE sticker_order_status AS ENUM (
  'pending_payment',
  'paid',
  'processing',
  'printed',
  'shipped',
  'delivered',
  'cancelled'
);

-- Create shipping_addresses table
CREATE TABLE shipping_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  street_address TEXT NOT NULL,
  street_address_2 TEXT,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  postal_code TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'US',
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create index on user_id for shipping_addresses
CREATE INDEX idx_shipping_addresses_user_id ON shipping_addresses(user_id);

-- Create sticker_orders table
CREATE TABLE sticker_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  shipping_address_id UUID NOT NULL REFERENCES shipping_addresses(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
  total_price_cents INTEGER NOT NULL CHECK (total_price_cents >= 0),
  status sticker_order_status NOT NULL DEFAULT 'pending_payment',
  stripe_payment_intent_id TEXT,
  stripe_checkout_session_id TEXT,
  order_number TEXT NOT NULL UNIQUE,
  printer_token UUID NOT NULL DEFAULT gen_random_uuid(),
  pdf_storage_path TEXT,
  printed_at TIMESTAMPTZ,
  shipped_at TIMESTAMPTZ,
  tracking_number TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for sticker_orders
CREATE INDEX idx_sticker_orders_user_id ON sticker_orders(user_id);
CREATE INDEX idx_sticker_orders_status ON sticker_orders(status);
CREATE INDEX idx_sticker_orders_created_at ON sticker_orders(created_at DESC);
CREATE INDEX idx_sticker_orders_order_number ON sticker_orders(order_number);
CREATE INDEX idx_sticker_orders_printer_token ON sticker_orders(printer_token);

-- Create sticker_order_items table (links orders to QR codes)
CREATE TABLE sticker_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES sticker_orders(id) ON DELETE CASCADE,
  qr_code_id UUID NOT NULL REFERENCES qr_codes(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(order_id, qr_code_id)
);

-- Create index on order_id for sticker_order_items
CREATE INDEX idx_sticker_order_items_order_id ON sticker_order_items(order_id);
CREATE INDEX idx_sticker_order_items_qr_code_id ON sticker_order_items(qr_code_id);

-- Function to generate order number (e.g., AB-20231217-0001)
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TEXT AS $$
DECLARE
  date_part TEXT;
  seq_num INTEGER;
  order_num TEXT;
BEGIN
  date_part := to_char(now(), 'YYYYMMDD');

  -- Get the next sequence number for today
  SELECT COALESCE(MAX(
    CAST(SPLIT_PART(order_number, '-', 3) AS INTEGER)
  ), 0) + 1
  INTO seq_num
  FROM sticker_orders
  WHERE order_number LIKE 'AB-' || date_part || '-%';

  order_num := 'AB-' || date_part || '-' || LPAD(seq_num::TEXT, 4, '0');

  RETURN order_num;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate order number
CREATE OR REPLACE FUNCTION set_order_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
    NEW.order_number := generate_order_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_order_number
  BEFORE INSERT ON sticker_orders
  FOR EACH ROW
  EXECUTE FUNCTION set_order_number();

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_sticker_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_sticker_orders_updated_at
  BEFORE UPDATE ON sticker_orders
  FOR EACH ROW
  EXECUTE FUNCTION update_sticker_orders_updated_at();

CREATE TRIGGER trigger_update_shipping_addresses_updated_at
  BEFORE UPDATE ON shipping_addresses
  FOR EACH ROW
  EXECUTE FUNCTION update_sticker_orders_updated_at();

-- Ensure only one default address per user
CREATE OR REPLACE FUNCTION ensure_single_default_address()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE shipping_addresses
    SET is_default = false
    WHERE user_id = NEW.user_id
      AND id != NEW.id
      AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_ensure_single_default_address
  AFTER INSERT OR UPDATE ON shipping_addresses
  FOR EACH ROW
  WHEN (NEW.is_default = true)
  EXECUTE FUNCTION ensure_single_default_address();

-- RLS Policies

-- Enable RLS
ALTER TABLE shipping_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE sticker_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE sticker_order_items ENABLE ROW LEVEL SECURITY;

-- Shipping addresses policies
CREATE POLICY "Users can view their own shipping addresses"
  ON shipping_addresses FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own shipping addresses"
  ON shipping_addresses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own shipping addresses"
  ON shipping_addresses FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own shipping addresses"
  ON shipping_addresses FOR DELETE
  USING (auth.uid() = user_id);

-- Sticker orders policies
CREATE POLICY "Users can view their own orders"
  ON sticker_orders FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own orders"
  ON sticker_orders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Note: Updates to orders should go through edge functions with service role
-- to properly manage status transitions

-- Sticker order items policies
CREATE POLICY "Users can view their own order items"
  ON sticker_order_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM sticker_orders
      WHERE sticker_orders.id = sticker_order_items.order_id
        AND sticker_orders.user_id = auth.uid()
    )
  );

-- Create storage bucket for sticker PDFs
INSERT INTO storage.buckets (id, name, public)
VALUES ('sticker-pdfs', 'sticker-pdfs', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policy for sticker PDFs (service role only for write, users can read their own)
CREATE POLICY "Users can view their own sticker PDFs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'sticker-pdfs'
    AND (
      -- Allow access if the path starts with orders/{user_id}/
      (storage.foldername(name))[1] = 'orders'
      AND (storage.foldername(name))[2] = auth.uid()::text
    )
  );

-- Comments for documentation
COMMENT ON TABLE shipping_addresses IS 'User shipping addresses for sticker orders';
COMMENT ON TABLE sticker_orders IS 'QR code sticker orders with payment and fulfillment tracking';
COMMENT ON TABLE sticker_order_items IS 'Links sticker orders to individual QR codes';
COMMENT ON COLUMN sticker_orders.printer_token IS 'Unique token for printer to update order status via email links';
COMMENT ON COLUMN sticker_orders.unit_price_cents IS 'Price per sticker in cents at time of order';
COMMENT ON COLUMN sticker_orders.total_price_cents IS 'Total order price in cents';
