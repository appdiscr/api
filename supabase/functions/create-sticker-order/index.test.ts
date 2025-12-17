import { assertEquals, assertExists } from 'https://deno.land/std@0.192.0/testing/asserts.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const FUNCTION_URL = Deno.env.get('FUNCTION_URL') || 'http://localhost:54321/functions/v1/create-sticker-order';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || 'http://localhost:54321';
const SUPABASE_ANON_KEY =
  Deno.env.get('SUPABASE_ANON_KEY') ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

Deno.test('create-sticker-order: should return 405 for non-POST requests', async () => {
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

Deno.test('create-sticker-order: should return 401 when not authenticated', async () => {
  const response = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ quantity: 10 }),
  });

  assertEquals(response.status, 401);
  const data = await response.json();
  assertEquals(data.error, 'Missing authorization header');
});

Deno.test('create-sticker-order: should return 400 when quantity is missing', async () => {
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
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authData.session.access_token}`,
      },
      body: JSON.stringify({}),
    });

    assertEquals(response.status, 400);
    const data = await response.json();
    assertEquals(data.error, 'Missing required field: quantity');
  } finally {
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
  }
});

Deno.test('create-sticker-order: should return 400 when quantity is invalid', async () => {
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
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authData.session.access_token}`,
      },
      body: JSON.stringify({ quantity: 0 }),
    });

    assertEquals(response.status, 400);
    const data = await response.json();
    assertEquals(data.error, 'Quantity must be at least 1');
  } finally {
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
  }
});

Deno.test('create-sticker-order: should return 400 when shipping_address is missing', async () => {
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
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authData.session.access_token}`,
      },
      body: JSON.stringify({ quantity: 10 }),
    });

    assertEquals(response.status, 400);
    const data = await response.json();
    assertEquals(data.error, 'Missing required field: shipping_address');
  } finally {
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
  }
});

Deno.test('create-sticker-order: should return 400 when shipping_address fields are incomplete', async () => {
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
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authData.session.access_token}`,
      },
      body: JSON.stringify({
        quantity: 10,
        shipping_address: {
          name: 'Test User',
          // Missing street_address, city, state, postal_code
        },
      }),
    });

    assertEquals(response.status, 400);
    const data = await response.json();
    assertEquals(data.error, 'Missing shipping address field: street_address');
  } finally {
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
  }
});

Deno.test('create-sticker-order: should create order and return checkout URL', async () => {
  // Note: This test requires STRIPE_SECRET_KEY to be set
  // In local dev without Stripe, this will fail - that's expected
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!stripeKey) {
    console.log('Skipping Stripe checkout test - STRIPE_SECRET_KEY not set');
    return;
  }

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
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authData.session.access_token}`,
      },
      body: JSON.stringify({
        quantity: 10,
        shipping_address: {
          name: 'Test User',
          street_address: '123 Test St',
          city: 'Test City',
          state: 'TS',
          postal_code: '12345',
          country: 'US',
        },
      }),
    });

    assertEquals(response.status, 200);
    const data = await response.json();
    assertExists(data.checkout_url);
    assertExists(data.order_id);
    assertExists(data.order_number);

    // Verify order was created in database
    const { data: order } = await supabaseAdmin.from('sticker_orders').select('*').eq('id', data.order_id).single();

    assertExists(order);
    assertEquals(order?.quantity, 10);
    assertEquals(order?.status, 'pending_payment');
    assertExists(order?.stripe_checkout_session_id);

    // Cleanup
    await supabaseAdmin.from('sticker_orders').delete().eq('id', data.order_id);
    const { data: addr } = await supabaseAdmin
      .from('shipping_addresses')
      .select('id')
      .eq('user_id', authData.user.id)
      .single();
    if (addr) {
      await supabaseAdmin.from('shipping_addresses').delete().eq('id', addr.id);
    }
  } finally {
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
  }
});

Deno.test('create-sticker-order: should use existing shipping address if provided', async () => {
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  if (!stripeKey) {
    console.log('Skipping Stripe checkout test - STRIPE_SECRET_KEY not set');
    return;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: authData, error: signUpError } = await supabase.auth.signUp({
    email: `test-${Date.now()}@example.com`,
    password: 'testpassword123',
  });

  if (signUpError || !authData.session || !authData.user) {
    throw signUpError || new Error('No session');
  }

  // Create shipping address first
  const { data: address } = await supabaseAdmin
    .from('shipping_addresses')
    .insert({
      user_id: authData.user.id,
      name: 'Existing Address',
      street_address: '456 Existing St',
      city: 'Existing City',
      state: 'EX',
      postal_code: '67890',
      country: 'US',
    })
    .select()
    .single();

  try {
    const response = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authData.session.access_token}`,
      },
      body: JSON.stringify({
        quantity: 5,
        shipping_address_id: address!.id,
      }),
    });

    assertEquals(response.status, 200);
    const data = await response.json();
    assertExists(data.checkout_url);
    assertExists(data.order_id);

    // Verify order uses the existing address
    const { data: order } = await supabaseAdmin
      .from('sticker_orders')
      .select('shipping_address_id')
      .eq('id', data.order_id)
      .single();

    assertEquals(order?.shipping_address_id, address!.id);

    // Cleanup
    await supabaseAdmin.from('sticker_orders').delete().eq('id', data.order_id);
  } finally {
    await supabaseAdmin.from('shipping_addresses').delete().eq('id', address!.id);
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
  }
});
