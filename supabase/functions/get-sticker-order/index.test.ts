import { assertEquals, assertExists } from 'https://deno.land/std@0.192.0/testing/asserts.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const FUNCTION_URL = Deno.env.get('FUNCTION_URL') || 'http://localhost:54321/functions/v1/get-sticker-order';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || 'http://localhost:54321';
const SUPABASE_ANON_KEY =
  Deno.env.get('SUPABASE_ANON_KEY') ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

Deno.test('get-sticker-order: should return 405 for non-GET requests', async () => {
  const response = await fetch(`${FUNCTION_URL}?order_id=test`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  assertEquals(response.status, 405);
  const data = await response.json();
  assertEquals(data.error, 'Method not allowed');
});

Deno.test('get-sticker-order: should return 401 when not authenticated', async () => {
  const response = await fetch(`${FUNCTION_URL}?order_id=test`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  assertEquals(response.status, 401);
  const data = await response.json();
  assertEquals(data.error, 'Missing authorization header');
});

Deno.test('get-sticker-order: should return 400 when order_id is missing', async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: authData, error: signUpError } = await supabase.auth.signUp({
    email: `test-${Date.now()}@example.com`,
    password: 'testpassword123',
  });

  if (signUpError || !authData.session || !authData.user) {
    throw signUpError || new Error('No session');
  }

  try {
    const response = await fetch(FUNCTION_URL, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authData.session.access_token}`,
      },
    });

    assertEquals(response.status, 400);
    const data = await response.json();
    assertEquals(data.error, 'Missing order_id parameter');
  } finally {
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
  }
});

Deno.test('get-sticker-order: should return 404 when order not found', async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: authData, error: signUpError } = await supabase.auth.signUp({
    email: `test-${Date.now()}@example.com`,
    password: 'testpassword123',
  });

  if (signUpError || !authData.session || !authData.user) {
    throw signUpError || new Error('No session');
  }

  try {
    const response = await fetch(`${FUNCTION_URL}?order_id=00000000-0000-0000-0000-000000000000`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authData.session.access_token}`,
      },
    });

    assertEquals(response.status, 404);
    const data = await response.json();
    assertEquals(data.error, 'Order not found');
  } finally {
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
  }
});

Deno.test('get-sticker-order: should return 403 when accessing another user order', async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Create user 1 (will try to access)
  const { data: user1Auth, error: user1Error } = await supabase.auth.signUp({
    email: `user1-${Date.now()}@example.com`,
    password: 'testpassword123',
  });

  if (user1Error || !user1Auth.session || !user1Auth.user) {
    throw user1Error || new Error('No session');
  }

  // Create user 2 (owns the order)
  const { data: user2Auth, error: user2Error } = await supabase.auth.signUp({
    email: `user2-${Date.now()}@example.com`,
    password: 'testpassword123',
  });

  if (user2Error || !user2Auth.user) {
    throw user2Error || new Error('No user');
  }

  // Create shipping address for user 2
  const { data: address } = await supabaseAdmin
    .from('shipping_addresses')
    .insert({
      user_id: user2Auth.user.id,
      name: 'User 2',
      street_address: '123 Test St',
      city: 'Test City',
      state: 'TS',
      postal_code: '12345',
      country: 'US',
    })
    .select()
    .single();

  // Create order for user 2
  const { data: order } = await supabaseAdmin
    .from('sticker_orders')
    .insert({
      user_id: user2Auth.user.id,
      shipping_address_id: address!.id,
      quantity: 10,
      unit_price_cents: 100,
      total_price_cents: 1000,
    })
    .select()
    .single();

  try {
    // User 1 tries to access user 2's order
    const response = await fetch(`${FUNCTION_URL}?order_id=${order!.id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user1Auth.session.access_token}`,
      },
    });

    assertEquals(response.status, 403);
    const data = await response.json();
    assertEquals(data.error, 'You do not have access to this order');
  } finally {
    await supabaseAdmin.from('sticker_orders').delete().eq('id', order!.id);
    await supabaseAdmin.from('shipping_addresses').delete().eq('id', address!.id);
    await supabaseAdmin.auth.admin.deleteUser(user1Auth.user.id);
    await supabaseAdmin.auth.admin.deleteUser(user2Auth.user.id);
  }
});

Deno.test('get-sticker-order: should return order with items and QR codes', async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: authData, error: signUpError } = await supabase.auth.signUp({
    email: `test-${Date.now()}@example.com`,
    password: 'testpassword123',
  });

  if (signUpError || !authData.session || !authData.user) {
    throw signUpError || new Error('No session');
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

  // Create QR codes
  const { data: qr1 } = await supabaseAdmin
    .from('qr_codes')
    .insert({
      short_code: `TEST${Date.now()}A`,
      status: 'active',
      assigned_to: authData.user.id,
    })
    .select()
    .single();

  const { data: qr2 } = await supabaseAdmin
    .from('qr_codes')
    .insert({
      short_code: `TEST${Date.now()}B`,
      status: 'active',
      assigned_to: authData.user.id,
    })
    .select()
    .single();

  // Create order
  const { data: order } = await supabaseAdmin
    .from('sticker_orders')
    .insert({
      user_id: authData.user.id,
      shipping_address_id: address!.id,
      quantity: 2,
      unit_price_cents: 100,
      total_price_cents: 200,
      status: 'paid',
    })
    .select()
    .single();

  // Create order items
  await supabaseAdmin.from('sticker_order_items').insert([
    { order_id: order!.id, qr_code_id: qr1!.id },
    { order_id: order!.id, qr_code_id: qr2!.id },
  ]);

  try {
    const response = await fetch(`${FUNCTION_URL}?order_id=${order!.id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authData.session.access_token}`,
      },
    });

    assertEquals(response.status, 200);
    const data = await response.json();

    assertExists(data.order);
    assertEquals(data.order.id, order!.id);
    assertEquals(data.order.quantity, 2);
    assertEquals(data.order.status, 'paid');
    assertExists(data.order.order_number);
    assertExists(data.order.shipping_address);
    assertEquals(data.order.shipping_address.city, 'Test City');
    assertExists(data.order.items);
    assertEquals(data.order.items.length, 2);
    assertExists(data.order.items[0].qr_code);
    assertExists(data.order.items[0].qr_code.short_code);
  } finally {
    await supabaseAdmin.from('sticker_order_items').delete().eq('order_id', order!.id);
    await supabaseAdmin.from('sticker_orders').delete().eq('id', order!.id);
    await supabaseAdmin.from('qr_codes').delete().eq('id', qr1!.id);
    await supabaseAdmin.from('qr_codes').delete().eq('id', qr2!.id);
    await supabaseAdmin.from('shipping_addresses').delete().eq('id', address!.id);
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
  }
});
