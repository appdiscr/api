import { assertEquals, assertExists } from 'https://deno.land/std@0.192.0/testing/asserts.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const FUNCTION_URL = Deno.env.get('FUNCTION_URL') || 'http://localhost:54321/functions/v1/create-disc';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || 'http://localhost:54321';
const SUPABASE_ANON_KEY =
  Deno.env.get('SUPABASE_ANON_KEY') ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

Deno.test('create-disc: should return 401 when not authenticated', async () => {
  const response = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: 'Test Disc' }),
  });

  assertEquals(response.status, 401);
});

Deno.test('create-disc: should return 400 when name is missing', async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Sign up a test user
  const { data: authData } = await supabase.auth.signUp({
    email: `test-${Date.now()}@example.com`,
    password: 'testpassword123',
  });

  const response = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authData.session?.access_token}`,
    },
    body: JSON.stringify({}),
  });

  assertEquals(response.status, 400);
  const error = await response.json();
  assertExists(error.error);
});

Deno.test('create-disc: should create disc with minimal data', async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Sign up a test user
  const { data: authData } = await supabase.auth.signUp({
    email: `test-${Date.now()}@example.com`,
    password: 'testpassword123',
  });

  const response = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authData.session?.access_token}`,
    },
    body: JSON.stringify({
      name: 'Test Disc',
      flight_numbers: { speed: 7, glide: 5, turn: 0, fade: 1 },
    }),
  });

  assertEquals(response.status, 201);
  const data = await response.json();
  assertExists(data.id);
  assertEquals(data.name, 'Test Disc');
  assertEquals(data.owner_id, authData.user?.id);
});

Deno.test('create-disc: should create disc with all fields', async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Sign up a test user
  const { data: authData } = await supabase.auth.signUp({
    email: `test-${Date.now()}@example.com`,
    password: 'testpassword123',
  });

  const discData = {
    name: 'Innova Destroyer',
    manufacturer: 'Innova',
    mold: 'Destroyer',
    plastic: 'Star',
    weight: 175,
    color: 'Blue',
    flight_numbers: { speed: 12, glide: 5, turn: -1, fade: 3 },
    reward_amount: 500,
    notes: 'My favorite disc!',
  };

  const response = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authData.session?.access_token}`,
    },
    body: JSON.stringify(discData),
  });

  assertEquals(response.status, 201);
  const data = await response.json();
  assertExists(data.id);
  assertEquals(data.name, discData.name);
  assertEquals(data.manufacturer, discData.manufacturer);
  assertEquals(data.mold, discData.mold);
  assertEquals(data.plastic, discData.plastic);
  assertEquals(data.weight, discData.weight);
  assertEquals(data.color, discData.color);
  assertEquals(data.reward_amount, discData.reward_amount);
  assertEquals(data.notes, discData.notes);
  assertEquals(data.owner_id, authData.user?.id);
});

Deno.test('create-disc: should validate flight numbers', async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Sign up a test user
  const { data: authData } = await supabase.auth.signUp({
    email: `test-${Date.now()}@example.com`,
    password: 'testpassword123',
  });

  const response = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authData.session?.access_token}`,
    },
    body: JSON.stringify({
      name: 'Test Disc',
      flight_numbers: { speed: 20, glide: 5, turn: 0, fade: 1 }, // Invalid speed
    }),
  });

  assertEquals(response.status, 400);
  const error = await response.json();
  assertExists(error.error);
});
