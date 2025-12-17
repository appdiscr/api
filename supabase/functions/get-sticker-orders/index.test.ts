import { assertEquals, assertExists } from 'https://deno.land/std@0.192.0/testing/asserts.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const FUNCTION_URL = Deno.env.get('FUNCTION_URL') || 'http://localhost:54321/functions/v1/get-sticker-orders';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || 'http://localhost:54321';
const SUPABASE_ANON_KEY =
  Deno.env.get('SUPABASE_ANON_KEY') ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

Deno.test('get-sticker-orders: should return 405 for non-GET requests', async () => {
  const response = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  assertEquals(response.status, 405);
  const data = await response.json();
  assertEquals(data.error, 'Method not allowed');
});

Deno.test('get-sticker-orders: should return 401 when not authenticated', async () => {
  const response = await fetch(FUNCTION_URL, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  assertEquals(response.status, 401);
  const data = await response.json();
  assertEquals(data.error, 'Missing authorization header');
});

Deno.test('get-sticker-orders: should return empty array when user has no orders', async () => {
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

    assertEquals(response.status, 200);
    const data = await response.json();
    assertEquals(data.orders, []);
  } finally {
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
  }
});

Deno.test('get-sticker-orders: should return user orders with shipping address', async () => {
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
  const { data: address, error: addrError } = await supabaseAdmin
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

  if (addrError) throw addrError;

  // Create order
  const { data: order, error: orderError } = await supabaseAdmin
    .from('sticker_orders')
    .insert({
      user_id: authData.user.id,
      shipping_address_id: address.id,
      quantity: 10,
      unit_price_cents: 100,
      total_price_cents: 1000,
      status: 'pending_payment',
    })
    .select()
    .single();

  if (orderError) throw orderError;

  try {
    const response = await fetch(FUNCTION_URL, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authData.session.access_token}`,
      },
    });

    assertEquals(response.status, 200);
    const data = await response.json();
    assertEquals(data.orders.length, 1);
    assertEquals(data.orders[0].id, order.id);
    assertEquals(data.orders[0].quantity, 10);
    assertEquals(data.orders[0].status, 'pending_payment');
    assertExists(data.orders[0].order_number);
    assertExists(data.orders[0].shipping_address);
    assertEquals(data.orders[0].shipping_address.city, 'Test City');
  } finally {
    await supabaseAdmin.from('sticker_orders').delete().eq('id', order.id);
    await supabaseAdmin.from('shipping_addresses').delete().eq('id', address.id);
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
  }
});

Deno.test('get-sticker-orders: should only return orders for authenticated user', async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Create user 1
  const { data: user1Auth, error: user1Error } = await supabase.auth.signUp({
    email: `user1-${Date.now()}@example.com`,
    password: 'testpassword123',
  });

  if (user1Error || !user1Auth.session || !user1Auth.user) {
    throw user1Error || new Error('No session');
  }

  // Create user 2
  const { data: user2Auth, error: user2Error } = await supabase.auth.signUp({
    email: `user2-${Date.now()}@example.com`,
    password: 'testpassword123',
  });

  if (user2Error || !user2Auth.user) {
    throw user2Error || new Error('No user');
  }

  // Create shipping addresses
  const { data: addr1 } = await supabaseAdmin
    .from('shipping_addresses')
    .insert({
      user_id: user1Auth.user.id,
      name: 'User 1',
      street_address: '123 Test St',
      city: 'City 1',
      state: 'TS',
      postal_code: '12345',
      country: 'US',
    })
    .select()
    .single();

  const { data: addr2 } = await supabaseAdmin
    .from('shipping_addresses')
    .insert({
      user_id: user2Auth.user.id,
      name: 'User 2',
      street_address: '456 Other St',
      city: 'City 2',
      state: 'TS',
      postal_code: '67890',
      country: 'US',
    })
    .select()
    .single();

  // Create orders for both users
  const { data: order1 } = await supabaseAdmin
    .from('sticker_orders')
    .insert({
      user_id: user1Auth.user.id,
      shipping_address_id: addr1!.id,
      quantity: 5,
      unit_price_cents: 100,
      total_price_cents: 500,
    })
    .select()
    .single();

  const { data: order2 } = await supabaseAdmin
    .from('sticker_orders')
    .insert({
      user_id: user2Auth.user.id,
      shipping_address_id: addr2!.id,
      quantity: 15,
      unit_price_cents: 100,
      total_price_cents: 1500,
    })
    .select()
    .single();

  try {
    // User 1 should only see their order
    const response = await fetch(FUNCTION_URL, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user1Auth.session.access_token}`,
      },
    });

    assertEquals(response.status, 200);
    const data = await response.json();
    assertEquals(data.orders.length, 1);
    assertEquals(data.orders[0].id, order1!.id);
    assertEquals(data.orders[0].quantity, 5);
  } finally {
    await supabaseAdmin.from('sticker_orders').delete().eq('id', order1!.id);
    await supabaseAdmin.from('sticker_orders').delete().eq('id', order2!.id);
    await supabaseAdmin.from('shipping_addresses').delete().eq('id', addr1!.id);
    await supabaseAdmin.from('shipping_addresses').delete().eq('id', addr2!.id);
    await supabaseAdmin.auth.admin.deleteUser(user1Auth.user.id);
    await supabaseAdmin.auth.admin.deleteUser(user2Auth.user.id);
  }
});
