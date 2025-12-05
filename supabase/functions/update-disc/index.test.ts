import { assertEquals, assertExists } from 'https://deno.land/std@0.192.0/testing/asserts.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const FUNCTION_URL = Deno.env.get('FUNCTION_URL') || 'http://localhost:54321/functions/v1/update-disc';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || 'http://localhost:54321';
const SUPABASE_ANON_KEY =
  Deno.env.get('SUPABASE_ANON_KEY') ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

Deno.test('update-disc: should return 401 when not authenticated', async () => {
  const response = await fetch(FUNCTION_URL, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ disc_id: '123', mold: 'Updated' }),
  });

  assertEquals(response.status, 401);
});

Deno.test('update-disc: should return 405 for non-PUT requests', async () => {
  const response = await fetch(FUNCTION_URL, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  assertEquals(response.status, 405);
});

Deno.test('update-disc: should return 400 when disc_id is missing', async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Sign up a test user
  const { data: authData } = await supabase.auth.signUp({
    email: `test-${Date.now()}@example.com`,
    password: 'testpassword123',
  });

  const response = await fetch(FUNCTION_URL, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authData.session?.access_token}`,
    },
    body: JSON.stringify({ mold: 'Updated' }),
  });

  assertEquals(response.status, 400);
  const error = await response.json();
  assertExists(error.error);
  assertEquals(error.error, 'disc_id is required');
});

Deno.test('update-disc: should return 404 when disc does not exist', async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Sign up a test user
  const { data: authData } = await supabase.auth.signUp({
    email: `test-${Date.now()}@example.com`,
    password: 'testpassword123',
  });

  const response = await fetch(FUNCTION_URL, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authData.session?.access_token}`,
    },
    body: JSON.stringify({
      disc_id: '00000000-0000-0000-0000-000000000000',
      mold: 'Updated',
    }),
  });

  assertEquals(response.status, 404);
  const error = await response.json();
  assertExists(error.error);
  assertEquals(error.error, 'Disc not found');
});

Deno.test('update-disc: should successfully update owned disc with all fields', async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Sign up a test user
  const { data: authData } = await supabase.auth.signUp({
    email: `test-${Date.now()}@example.com`,
    password: 'testpassword123',
  });

  // Create a disc first
  const createResponse = await fetch(`${SUPABASE_URL}/functions/v1/create-disc`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authData.session?.access_token}`,
    },
    body: JSON.stringify({
      mold: 'Destroyer',
      manufacturer: 'Innova',
      plastic: 'Star',
      weight: 175,
      color: 'Blue',
      flight_numbers: { speed: 12, glide: 5, turn: -1, fade: 3 },
      reward_amount: 5.0,
      notes: 'My favorite disc',
    }),
  });

  const createdDisc = await createResponse.json();
  assertEquals(createResponse.status, 201);
  assertExists(createdDisc.id);

  // Update the disc
  const updateResponse = await fetch(FUNCTION_URL, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authData.session?.access_token}`,
    },
    body: JSON.stringify({
      disc_id: createdDisc.id,
      mold: 'Wraith',
      manufacturer: 'Innova',
      plastic: 'Champion',
      weight: 170,
      color: 'Red',
      flight_numbers: { speed: 11, glide: 5, turn: -1, fade: 3 },
      reward_amount: 10.0,
      notes: 'Updated notes',
    }),
  });

  assertEquals(updateResponse.status, 200);
  const updatedDisc = await updateResponse.json();
  assertEquals(updatedDisc.mold, 'Wraith');
  assertEquals(updatedDisc.name, 'Wraith'); // Name should sync with mold
  assertEquals(updatedDisc.manufacturer, 'Innova');
  assertEquals(updatedDisc.plastic, 'Champion');
  assertEquals(updatedDisc.weight, 170);
  assertEquals(updatedDisc.color, 'Red');
  assertEquals(updatedDisc.flight_numbers.speed, 11);
  assertEquals(updatedDisc.reward_amount, '10.00');
  assertEquals(updatedDisc.notes, 'Updated notes');
});

Deno.test('update-disc: should support partial updates', async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Sign up a test user
  const { data: authData } = await supabase.auth.signUp({
    email: `test-${Date.now()}@example.com`,
    password: 'testpassword123',
  });

  // Create a disc first
  const createResponse = await fetch(`${SUPABASE_URL}/functions/v1/create-disc`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authData.session?.access_token}`,
    },
    body: JSON.stringify({
      mold: 'Destroyer',
      manufacturer: 'Innova',
      plastic: 'Star',
      weight: 175,
      color: 'Blue',
      flight_numbers: { speed: 12, glide: 5, turn: -1, fade: 3 },
      reward_amount: 5.0,
      notes: 'My favorite disc',
    }),
  });

  const createdDisc = await createResponse.json();
  assertEquals(createResponse.status, 201);

  // Update only the mold and plastic
  const updateResponse = await fetch(FUNCTION_URL, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authData.session?.access_token}`,
    },
    body: JSON.stringify({
      disc_id: createdDisc.id,
      mold: 'Wraith',
      plastic: 'Champion',
    }),
  });

  assertEquals(updateResponse.status, 200);
  const updatedDisc = await updateResponse.json();
  assertEquals(updatedDisc.mold, 'Wraith');
  assertEquals(updatedDisc.name, 'Wraith');
  assertEquals(updatedDisc.plastic, 'Champion');
  // Other fields should remain unchanged
  assertEquals(updatedDisc.manufacturer, 'Innova');
  assertEquals(updatedDisc.weight, 175);
  assertEquals(updatedDisc.color, 'Blue');
  assertEquals(updatedDisc.reward_amount, '5.00');
  assertEquals(updatedDisc.notes, 'My favorite disc');
});

Deno.test('update-disc: should validate flight numbers', async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Sign up a test user
  const { data: authData } = await supabase.auth.signUp({
    email: `test-${Date.now()}@example.com`,
    password: 'testpassword123',
  });

  // Create a disc first
  const createResponse = await fetch(`${SUPABASE_URL}/functions/v1/create-disc`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authData.session?.access_token}`,
    },
    body: JSON.stringify({
      mold: 'Destroyer',
      flight_numbers: { speed: 12, glide: 5, turn: -1, fade: 3 },
    }),
  });

  const createdDisc = await createResponse.json();

  // Try to update with invalid flight numbers
  const updateResponse = await fetch(FUNCTION_URL, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authData.session?.access_token}`,
    },
    body: JSON.stringify({
      disc_id: createdDisc.id,
      flight_numbers: { speed: 20, glide: 5, turn: 0, fade: 1 }, // Invalid speed
    }),
  });

  assertEquals(updateResponse.status, 400);
  const error = await updateResponse.json();
  assertExists(error.error);
  assertEquals(error.error, 'Speed must be between 1 and 14');
});

Deno.test("update-disc: should return 403 when trying to update another user's disc", async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Create first user and disc
  const { data: user1Data } = await supabase.auth.signUp({
    email: `test-${Date.now()}@example.com`,
    password: 'testpassword123',
  });

  const createResponse = await fetch(`${SUPABASE_URL}/functions/v1/create-disc`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user1Data.session?.access_token}`,
    },
    body: JSON.stringify({
      mold: 'Destroyer',
      flight_numbers: { speed: 12, glide: 5, turn: -1, fade: 3 },
    }),
  });

  const createdDisc = await createResponse.json();
  assertEquals(createResponse.status, 201);

  // Create second user
  const { data: user2Data } = await supabase.auth.signUp({
    email: `test-${Date.now() + 1}@example.com`,
    password: 'testpassword123',
  });

  // Try to update first user's disc as second user
  const updateResponse = await fetch(FUNCTION_URL, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${user2Data.session?.access_token}`,
    },
    body: JSON.stringify({
      disc_id: createdDisc.id,
      mold: 'Wraith',
    }),
  });

  assertEquals(updateResponse.status, 403);
  const error = await updateResponse.json();
  assertExists(error.error);
  assertEquals(error.error, 'Forbidden: You do not own this disc');
});

Deno.test('update-disc: should keep name in sync with mold', async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Sign up a test user
  const { data: authData } = await supabase.auth.signUp({
    email: `test-${Date.now()}@example.com`,
    password: 'testpassword123',
  });

  // Create a disc
  const createResponse = await fetch(`${SUPABASE_URL}/functions/v1/create-disc`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authData.session?.access_token}`,
    },
    body: JSON.stringify({
      mold: 'Destroyer',
      flight_numbers: { speed: 12, glide: 5, turn: -1, fade: 3 },
    }),
  });

  const createdDisc = await createResponse.json();

  // Update the mold
  const updateResponse = await fetch(FUNCTION_URL, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authData.session?.access_token}`,
    },
    body: JSON.stringify({
      disc_id: createdDisc.id,
      mold: 'Wraith',
    }),
  });

  assertEquals(updateResponse.status, 200);
  const updatedDisc = await updateResponse.json();
  assertEquals(updatedDisc.mold, 'Wraith');
  assertEquals(updatedDisc.name, 'Wraith'); // Name should automatically update to match mold
});
