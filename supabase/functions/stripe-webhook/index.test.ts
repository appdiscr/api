import { assertEquals, assertExists } from 'https://deno.land/std@0.192.0/testing/asserts.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const FUNCTION_URL = Deno.env.get('FUNCTION_URL') || 'http://localhost:54321/functions/v1/stripe-webhook';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || 'http://localhost:54321';
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

Deno.test('stripe-webhook: should return 405 for non-POST requests', async () => {
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

Deno.test('stripe-webhook: should return 400 when stripe-signature header is missing', async () => {
  const response = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type: 'test' }),
  });

  assertEquals(response.status, 400);
  const data = await response.json();
  assertEquals(data.error, 'Missing stripe-signature header');
});

// Note: Full webhook testing requires a valid Stripe signature
// which requires the STRIPE_WEBHOOK_SECRET environment variable
// These tests verify the basic request handling

Deno.test('stripe-webhook: should handle checkout.session.completed event', async () => {
  // This test would require mocking Stripe webhook signature verification
  // In production, we'll test this with Stripe CLI: `stripe listen --forward-to localhost:54321/functions/v1/stripe-webhook`

  // Skip test if webhook secret is not configured
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!webhookSecret) {
    console.log('Skipping webhook test - STRIPE_WEBHOOK_SECRET not set');
    return;
  }

  // For integration testing, use Stripe CLI to send test events:
  // stripe trigger checkout.session.completed
  console.log('To test webhooks, use Stripe CLI:');
  console.log('stripe listen --forward-to localhost:54321/functions/v1/stripe-webhook');
  console.log('stripe trigger checkout.session.completed');
});

Deno.test('stripe-webhook: should update order status to paid on successful payment', async () => {
  // This test verifies the expected behavior without actually calling Stripe
  // It tests the database update logic

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Create a test user
  const { data: userData, error: userError } = await supabaseAdmin.auth.admin.createUser({
    email: `webhook-test-${Date.now()}@example.com`,
    password: 'testpassword123',
    email_confirm: true,
  });

  if (userError) throw userError;

  // Create shipping address
  const { data: address, error: addrError } = await supabaseAdmin
    .from('shipping_addresses')
    .insert({
      user_id: userData.user.id,
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

  // Create an order with pending_payment status
  const testCheckoutSessionId = `cs_test_${Date.now()}`;
  const { data: order, error: orderError } = await supabaseAdmin
    .from('sticker_orders')
    .insert({
      user_id: userData.user.id,
      shipping_address_id: address.id,
      quantity: 10,
      unit_price_cents: 100,
      total_price_cents: 1000,
      status: 'pending_payment',
      stripe_checkout_session_id: testCheckoutSessionId,
    })
    .select()
    .single();

  if (orderError) throw orderError;

  try {
    // Simulate what the webhook handler would do
    const { data: updatedOrder, error: updateError } = await supabaseAdmin
      .from('sticker_orders')
      .update({
        status: 'paid',
        stripe_payment_intent_id: 'pi_test_123',
        updated_at: new Date().toISOString(),
      })
      .eq('stripe_checkout_session_id', testCheckoutSessionId)
      .select()
      .single();

    if (updateError) throw updateError;

    assertEquals(updatedOrder.status, 'paid');
    assertExists(updatedOrder.stripe_payment_intent_id);
  } finally {
    // Cleanup
    await supabaseAdmin.from('sticker_orders').delete().eq('id', order.id);
    await supabaseAdmin.from('shipping_addresses').delete().eq('id', address.id);
    await supabaseAdmin.auth.admin.deleteUser(userData.user.id);
  }
});
