import { assertEquals, assertExists } from 'https://deno.land/std@0.192.0/testing/asserts.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const FUNCTION_URL = Deno.env.get('FUNCTION_URL') || 'http://localhost:54321/functions/v1/update-order-status';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || 'http://localhost:54321';
const SUPABASE_ANON_KEY =
  Deno.env.get('SUPABASE_ANON_KEY') ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

Deno.test('update-order-status: should return 405 for non-POST requests', async () => {
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

Deno.test('update-order-status: should return 400 when printer_token is missing', async () => {
  const response = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status: 'printed' }),
  });

  assertEquals(response.status, 400);
  const data = await response.json();
  assertEquals(data.error, 'Missing required field: printer_token');
});

Deno.test('update-order-status: should return 400 when status is missing', async () => {
  const response = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ printer_token: '00000000-0000-0000-0000-000000000000' }),
  });

  assertEquals(response.status, 400);
  const data = await response.json();
  assertEquals(data.error, 'Missing required field: status');
});

Deno.test('update-order-status: should return 400 when status is invalid', async () => {
  const response = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      printer_token: '00000000-0000-0000-0000-000000000000',
      status: 'invalid_status',
    }),
  });

  assertEquals(response.status, 400);
  const data = await response.json();
  assertEquals(data.error, 'Invalid status');
});

Deno.test('update-order-status: should return 404 when order not found by printer_token', async () => {
  const response = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      printer_token: '00000000-0000-0000-0000-000000000000',
      status: 'printed',
    }),
  });

  assertEquals(response.status, 404);
  const data = await response.json();
  assertEquals(data.error, 'Order not found');
});

Deno.test('update-order-status: should update order status to printed', async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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
      body: JSON.stringify({
        printer_token: order!.printer_token,
        status: 'printed',
      }),
    });

    assertEquals(response.status, 200);
    const data = await response.json();
    assertEquals(data.success, true);
    assertEquals(data.order.status, 'printed');
    assertExists(data.order.printed_at);

    // Verify in database
    const { data: updatedOrder } = await supabaseAdmin
      .from('sticker_orders')
      .select()
      .eq('id', order!.id)
      .single();

    assertEquals(updatedOrder?.status, 'printed');
    assertExists(updatedOrder?.printed_at);
  } finally {
    await supabaseAdmin.from('sticker_orders').delete().eq('id', order!.id);
    await supabaseAdmin.from('shipping_addresses').delete().eq('id', address!.id);
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
  }
});

Deno.test('update-order-status: should update order status to shipped with tracking number', async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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

  // Create order with printed status
  const { data: order } = await supabaseAdmin
    .from('sticker_orders')
    .insert({
      user_id: authData.user.id,
      shipping_address_id: address!.id,
      quantity: 5,
      unit_price_cents: 100,
      total_price_cents: 500,
      status: 'printed',
      printed_at: new Date().toISOString(),
    })
    .select()
    .single();

  try {
    const response = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        printer_token: order!.printer_token,
        status: 'shipped',
        tracking_number: '1Z999AA10123456784',
      }),
    });

    assertEquals(response.status, 200);
    const data = await response.json();
    assertEquals(data.success, true);
    assertEquals(data.order.status, 'shipped');
    assertEquals(data.order.tracking_number, '1Z999AA10123456784');
    assertExists(data.order.shipped_at);

    // Verify in database
    const { data: updatedOrder } = await supabaseAdmin
      .from('sticker_orders')
      .select()
      .eq('id', order!.id)
      .single();

    assertEquals(updatedOrder?.status, 'shipped');
    assertEquals(updatedOrder?.tracking_number, '1Z999AA10123456784');
    assertExists(updatedOrder?.shipped_at);
  } finally {
    await supabaseAdmin.from('sticker_orders').delete().eq('id', order!.id);
    await supabaseAdmin.from('shipping_addresses').delete().eq('id', address!.id);
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
  }
});

Deno.test('update-order-status: should require tracking_number when setting status to shipped', async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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

  // Create order with printed status
  const { data: order } = await supabaseAdmin
    .from('sticker_orders')
    .insert({
      user_id: authData.user.id,
      shipping_address_id: address!.id,
      quantity: 5,
      unit_price_cents: 100,
      total_price_cents: 500,
      status: 'printed',
    })
    .select()
    .single();

  try {
    const response = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        printer_token: order!.printer_token,
        status: 'shipped',
        // Missing tracking_number
      }),
    });

    assertEquals(response.status, 400);
    const data = await response.json();
    assertEquals(data.error, 'tracking_number is required when marking as shipped');
  } finally {
    await supabaseAdmin.from('sticker_orders').delete().eq('id', order!.id);
    await supabaseAdmin.from('shipping_addresses').delete().eq('id', address!.id);
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
  }
});

Deno.test('update-order-status: should reject invalid status transitions', async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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

  // Create order with pending_payment status (not yet paid)
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
    // Try to mark as shipped directly (skipping paid, processing, printed)
    const response = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        printer_token: order!.printer_token,
        status: 'shipped',
        tracking_number: '1Z999AA10123456784',
      }),
    });

    assertEquals(response.status, 400);
    const data = await response.json();
    assertEquals(data.error, 'Invalid status transition from pending_payment to shipped');
  } finally {
    await supabaseAdmin.from('sticker_orders').delete().eq('id', order!.id);
    await supabaseAdmin.from('shipping_addresses').delete().eq('id', address!.id);
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
  }
});
