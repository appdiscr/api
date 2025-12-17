import { assertEquals, assertExists } from 'https://deno.land/std@0.192.0/testing/asserts.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const FUNCTION_URL = Deno.env.get('FUNCTION_URL') || 'http://localhost:54321/functions/v1/generate-sticker-pdf';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || 'http://localhost:54321';
const SUPABASE_ANON_KEY =
  Deno.env.get('SUPABASE_ANON_KEY') ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

Deno.test('generate-sticker-pdf: should return 405 for non-POST requests', async () => {
  const response = await fetch(FUNCTION_URL, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  assertEquals(response.status, 405);
  const data = await response.json();
  assertEquals(data.error, 'Method not allowed');
});

Deno.test('generate-sticker-pdf: should return 400 when order_id is missing', async () => {
  const response = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });

  assertEquals(response.status, 400);
  const data = await response.json();
  assertEquals(data.error, 'Missing required field: order_id');
});

Deno.test('generate-sticker-pdf: should return 404 when order not found', async () => {
  const response = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ order_id: '00000000-0000-0000-0000-000000000000' }),
  });

  assertEquals(response.status, 404);
  const data = await response.json();
  assertEquals(data.error, 'Order not found');
});

Deno.test('generate-sticker-pdf: should return 400 when order has no QR codes', async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Create test user
  const { data: authData, error: signUpError } = await supabase.auth.signUp({
    email: `test-${Date.now()}@example.com`,
    password: 'testpassword123',
  });

  if (signUpError || !authData.user) {
    throw signUpError || new Error('No user');
  }

  // Create shipping address
  const { data: address } = await supabaseAdmin
    .from('shipping_addresses')
    .insert({
      user_id: authData.user.id,
      name: 'Test User',
      street_address: '123 Test St',
      city: 'Test City',
      state: 'TS',
      postal_code: '12345',
      country: 'US',
    })
    .select()
    .single();

  // Create order with paid status but no QR codes
  const { data: order } = await supabaseAdmin
    .from('sticker_orders')
    .insert({
      user_id: authData.user.id,
      shipping_address_id: address!.id,
      quantity: 5,
      unit_price_cents: 100,
      total_price_cents: 500,
      status: 'paid',
    })
    .select()
    .single();

  try {
    const response = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ order_id: order!.id }),
    });

    assertEquals(response.status, 400);
    const data = await response.json();
    assertEquals(data.error, 'No QR codes found for this order');
  } finally {
    await supabaseAdmin.from('sticker_orders').delete().eq('id', order!.id);
    await supabaseAdmin.from('shipping_addresses').delete().eq('id', address!.id);
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
  }
});

Deno.test('generate-sticker-pdf: should generate PDF for order with QR codes', async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Create test user
  const { data: authData, error: signUpError } = await supabase.auth.signUp({
    email: `test-${Date.now()}@example.com`,
    password: 'testpassword123',
  });

  if (signUpError || !authData.user) {
    throw signUpError || new Error('No user');
  }

  // Create shipping address
  const { data: address } = await supabaseAdmin
    .from('shipping_addresses')
    .insert({
      user_id: authData.user.id,
      name: 'Test User',
      street_address: '123 Test St',
      city: 'Test City',
      state: 'TS',
      postal_code: '12345',
      country: 'US',
    })
    .select()
    .single();

  // Create order with processing status
  const { data: order } = await supabaseAdmin
    .from('sticker_orders')
    .insert({
      user_id: authData.user.id,
      shipping_address_id: address!.id,
      quantity: 2,
      unit_price_cents: 100,
      total_price_cents: 200,
      status: 'processing',
    })
    .select()
    .single();

  // Create QR codes
  const qrCodes: { id: string }[] = [];
  for (let i = 0; i < 2; i++) {
    const { data: qrCode } = await supabaseAdmin
      .from('qr_codes')
      .insert({
        short_code: `PDF${Date.now()}${i}`.slice(0, 8),
        status: 'generated',
        assigned_to: authData.user.id,
      })
      .select()
      .single();
    qrCodes.push(qrCode!);

    // Create order item
    await supabaseAdmin.from('sticker_order_items').insert({
      order_id: order!.id,
      qr_code_id: qrCode!.id,
    });
  }

  try {
    const response = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ order_id: order!.id }),
    });

    assertEquals(response.status, 200);
    const data = await response.json();
    assertEquals(data.success, true);
    assertExists(data.pdf_url);
    assertExists(data.pdf_storage_path);

    // Verify order was updated with PDF path
    const { data: updatedOrder } = await supabaseAdmin
      .from('sticker_orders')
      .select('pdf_storage_path')
      .eq('id', order!.id)
      .single();

    assertExists(updatedOrder?.pdf_storage_path);
  } finally {
    // Cleanup
    await supabaseAdmin.from('sticker_order_items').delete().eq('order_id', order!.id);
    for (const qr of qrCodes) {
      await supabaseAdmin.from('qr_codes').delete().eq('id', qr.id);
    }
    await supabaseAdmin.from('sticker_orders').delete().eq('id', order!.id);
    await supabaseAdmin.from('shipping_addresses').delete().eq('id', address!.id);
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
  }
});

Deno.test('generate-sticker-pdf: should not regenerate PDF if already exists', async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Create test user
  const { data: authData, error: signUpError } = await supabase.auth.signUp({
    email: `test-${Date.now()}@example.com`,
    password: 'testpassword123',
  });

  if (signUpError || !authData.user) {
    throw signUpError || new Error('No user');
  }

  // Create shipping address
  const { data: address } = await supabaseAdmin
    .from('shipping_addresses')
    .insert({
      user_id: authData.user.id,
      name: 'Test User',
      street_address: '123 Test St',
      city: 'Test City',
      state: 'TS',
      postal_code: '12345',
      country: 'US',
    })
    .select()
    .single();

  // Create order with existing PDF path
  const { data: order } = await supabaseAdmin
    .from('sticker_orders')
    .insert({
      user_id: authData.user.id,
      shipping_address_id: address!.id,
      quantity: 1,
      unit_price_cents: 100,
      total_price_cents: 100,
      status: 'processing',
      pdf_storage_path: 'orders/existing.pdf',
    })
    .select()
    .single();

  try {
    const response = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ order_id: order!.id }),
    });

    assertEquals(response.status, 400);
    const data = await response.json();
    assertEquals(data.error, 'PDF already generated for this order');
  } finally {
    await supabaseAdmin.from('sticker_orders').delete().eq('id', order!.id);
    await supabaseAdmin.from('shipping_addresses').delete().eq('id', address!.id);
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
  }
});
