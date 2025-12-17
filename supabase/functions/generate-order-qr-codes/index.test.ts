import { assertEquals, assertExists } from 'https://deno.land/std@0.192.0/testing/asserts.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const FUNCTION_URL = Deno.env.get('FUNCTION_URL') || 'http://localhost:54321/functions/v1/generate-order-qr-codes';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || 'http://localhost:54321';
const SUPABASE_ANON_KEY =
  Deno.env.get('SUPABASE_ANON_KEY') ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

Deno.test('generate-order-qr-codes: should return 405 for non-POST requests', async () => {
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

Deno.test('generate-order-qr-codes: should return 400 when order_id is missing', async () => {
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

Deno.test('generate-order-qr-codes: should return 404 when order not found', async () => {
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

Deno.test('generate-order-qr-codes: should return 400 when order is not paid', async () => {
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

  // Create order with pending_payment status
  const { data: order } = await supabaseAdmin
    .from('sticker_orders')
    .insert({
      user_id: authData.user.id,
      shipping_address_id: address!.id,
      quantity: 5,
      unit_price_cents: 100,
      total_price_cents: 500,
      status: 'pending_payment',
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
    assertEquals(data.error, 'Order must be in paid status to generate QR codes');
  } finally {
    await supabaseAdmin.from('sticker_orders').delete().eq('id', order!.id);
    await supabaseAdmin.from('shipping_addresses').delete().eq('id', address!.id);
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
  }
});

Deno.test('generate-order-qr-codes: should generate QR codes for paid order', async () => {
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

  // Create order with paid status
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

    assertEquals(response.status, 200);
    const data = await response.json();
    assertEquals(data.success, true);
    assertExists(data.qr_codes);
    assertEquals(data.qr_codes.length, 5);

    // Verify each QR code has required fields
    for (const qrCode of data.qr_codes) {
      assertExists(qrCode.id);
      assertExists(qrCode.short_code);
      assertEquals(qrCode.short_code.length, 8);
      assertEquals(qrCode.status, 'generated');
      assertEquals(qrCode.assigned_to, authData.user.id);
    }

    // Verify order items were created
    const { data: orderItems } = await supabaseAdmin.from('sticker_order_items').select('*').eq('order_id', order!.id);

    assertEquals(orderItems?.length, 5);

    // Verify order status was updated to processing
    const { data: updatedOrder } = await supabaseAdmin
      .from('sticker_orders')
      .select('status')
      .eq('id', order!.id)
      .single();

    assertEquals(updatedOrder?.status, 'processing');

    // Cleanup QR codes
    for (const qrCode of data.qr_codes) {
      await supabaseAdmin.from('qr_codes').delete().eq('id', qrCode.id);
    }
  } finally {
    await supabaseAdmin.from('sticker_order_items').delete().eq('order_id', order!.id);
    await supabaseAdmin.from('sticker_orders').delete().eq('id', order!.id);
    await supabaseAdmin.from('shipping_addresses').delete().eq('id', address!.id);
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
  }
});

Deno.test('generate-order-qr-codes: should return 400 when QR codes already generated', async () => {
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

  // Create order with processing status (already has QR codes)
  const { data: order } = await supabaseAdmin
    .from('sticker_orders')
    .insert({
      user_id: authData.user.id,
      shipping_address_id: address!.id,
      quantity: 3,
      unit_price_cents: 100,
      total_price_cents: 300,
      status: 'processing',
    })
    .select()
    .single();

  // Create existing QR code and order item
  const { data: qrCode } = await supabaseAdmin
    .from('qr_codes')
    .insert({
      short_code: `EXISTING${Date.now()}`.slice(0, 8),
      status: 'generated',
      assigned_to: authData.user.id,
    })
    .select()
    .single();

  await supabaseAdmin.from('sticker_order_items').insert({
    order_id: order!.id,
    qr_code_id: qrCode!.id,
  });

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
    assertEquals(data.error, 'QR codes already generated for this order');
  } finally {
    await supabaseAdmin.from('sticker_order_items').delete().eq('order_id', order!.id);
    await supabaseAdmin.from('qr_codes').delete().eq('id', qrCode!.id);
    await supabaseAdmin.from('sticker_orders').delete().eq('id', order!.id);
    await supabaseAdmin.from('shipping_addresses').delete().eq('id', address!.id);
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
  }
});
