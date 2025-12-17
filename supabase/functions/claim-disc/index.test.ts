import { assertEquals, assertExists } from 'https://deno.land/std@0.192.0/testing/asserts.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const FUNCTION_URL = Deno.env.get('FUNCTION_URL') || 'http://localhost:54321/functions/v1/claim-disc';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || 'http://localhost:54321';
const SUPABASE_ANON_KEY =
  Deno.env.get('SUPABASE_ANON_KEY') ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

Deno.test('claim-disc: should return 405 for non-POST requests', async () => {
  const response = await fetch(FUNCTION_URL, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  assertEquals(response.status, 405);
  const data = await response.json();
  assertEquals(data.error, 'Method not allowed');
});

Deno.test('claim-disc: should return 401 when not authenticated', async () => {
  const response = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ disc_id: 'test' }),
  });

  assertEquals(response.status, 401);
  const data = await response.json();
  assertEquals(data.error, 'Missing authorization header');
});

Deno.test('claim-disc: should return 400 when disc_id is missing', async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: authData, error: signUpError } = await supabase.auth.signUp({
    email: `test-${Date.now()}@example.com`,
    password: 'testpassword123',
  });

  if (signUpError || !authData.session) {
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
    assertEquals(data.error, 'disc_id is required');
  } finally {
    await supabaseAdmin.auth.admin.deleteUser(authData.user!.id);
  }
});

Deno.test('claim-disc: should return 404 when disc not found', async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: authData, error: signUpError } = await supabase.auth.signUp({
    email: `test-${Date.now()}@example.com`,
    password: 'testpassword123',
  });

  if (signUpError || !authData.session) {
    throw signUpError || new Error('No session');
  }

  try {
    const response = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authData.session.access_token}`,
      },
      body: JSON.stringify({ disc_id: '00000000-0000-0000-0000-000000000000' }),
    });

    assertEquals(response.status, 404);
    const data = await response.json();
    assertEquals(data.error, 'Disc not found');
  } finally {
    await supabaseAdmin.auth.admin.deleteUser(authData.user!.id);
  }
});

Deno.test('claim-disc: should return 400 when disc already has an owner', async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Create owner
  const { data: ownerAuth, error: ownerError } = await supabase.auth.signUp({
    email: `owner-${Date.now()}@example.com`,
    password: 'testpassword123',
  });
  if (ownerError || !ownerAuth.user) throw ownerError || new Error('No user');

  // Create claimer
  const { data: claimerAuth, error: claimerError } = await supabase.auth.signUp({
    email: `claimer-${Date.now()}@example.com`,
    password: 'testpassword123',
  });
  if (claimerError || !claimerAuth.session || !claimerAuth.user) {
    throw claimerError || new Error('No session');
  }

  // Create disc with owner
  const { data: disc, error: discError } = await supabaseAdmin
    .from('discs')
    .insert({ owner_id: ownerAuth.user.id, name: 'Test Disc', mold: 'Destroyer' })
    .select()
    .single();
  if (discError) throw discError;

  try {
    const response = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${claimerAuth.session.access_token}`,
      },
      body: JSON.stringify({ disc_id: disc.id }),
    });

    assertEquals(response.status, 400);
    const data = await response.json();
    assertEquals(data.error, 'This disc already has an owner and cannot be claimed');
  } finally {
    await supabaseAdmin.from('discs').delete().eq('id', disc.id);
    await supabaseAdmin.auth.admin.deleteUser(ownerAuth.user.id);
    await supabaseAdmin.auth.admin.deleteUser(claimerAuth.user.id);
  }
});

Deno.test('claim-disc: user can successfully claim an ownerless disc', async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Create claimer
  const { data: claimerAuth, error: claimerError } = await supabase.auth.signUp({
    email: `claimer-${Date.now()}@example.com`,
    password: 'testpassword123',
  });
  if (claimerError || !claimerAuth.session || !claimerAuth.user) {
    throw claimerError || new Error('No session');
  }

  // Create disc with no owner
  const { data: disc, error: discError } = await supabaseAdmin
    .from('discs')
    .insert({
      owner_id: null,
      name: 'Abandoned Disc',
      mold: 'Destroyer',
      manufacturer: 'Innova',
      plastic: 'Star',
      color: 'Blue',
    })
    .select()
    .single();
  if (discError) throw discError;

  try {
    const response = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${claimerAuth.session.access_token}`,
      },
      body: JSON.stringify({ disc_id: disc.id }),
    });

    assertEquals(response.status, 200);
    const data = await response.json();
    assertEquals(data.success, true);
    assertExists(data.disc);
    assertEquals(data.disc.id, disc.id);
    assertEquals(data.disc.name, 'Abandoned Disc');

    // Verify disc owner_id was updated
    const { data: updatedDisc } = await supabaseAdmin.from('discs').select('owner_id').eq('id', disc.id).single();
    assertEquals(updatedDisc?.owner_id, claimerAuth.user.id);
  } finally {
    await supabaseAdmin.from('discs').delete().eq('id', disc.id);
    await supabaseAdmin.auth.admin.deleteUser(claimerAuth.user.id);
  }
});

Deno.test('claim-disc: claiming closes abandoned recovery events', async () => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Create original owner (who will abandon)
  const { data: originalOwnerAuth, error: originalOwnerError } = await supabase.auth.signUp({
    email: `originalowner-${Date.now()}@example.com`,
    password: 'testpassword123',
  });
  if (originalOwnerError || !originalOwnerAuth.user) throw originalOwnerError || new Error('No user');

  // Create finder
  const { data: finderAuth, error: finderError } = await supabase.auth.signUp({
    email: `finder-${Date.now()}@example.com`,
    password: 'testpassword123',
  });
  if (finderError || !finderAuth.user) throw finderError || new Error('No user');

  // Create claimer
  const { data: claimerAuth, error: claimerError } = await supabase.auth.signUp({
    email: `claimer-${Date.now()}@example.com`,
    password: 'testpassword123',
  });
  if (claimerError || !claimerAuth.session || !claimerAuth.user) {
    throw claimerError || new Error('No session');
  }

  // Create disc with no owner (already abandoned)
  const { data: disc, error: discError } = await supabaseAdmin
    .from('discs')
    .insert({ owner_id: null, name: 'Abandoned Disc', mold: 'Destroyer' })
    .select()
    .single();
  if (discError) throw discError;

  // Create abandoned recovery event
  const { data: recovery, error: recoveryError } = await supabaseAdmin
    .from('recovery_events')
    .insert({
      disc_id: disc.id,
      finder_id: finderAuth.user.id,
      status: 'abandoned',
      found_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (recoveryError) throw recoveryError;

  try {
    const response = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${claimerAuth.session.access_token}`,
      },
      body: JSON.stringify({ disc_id: disc.id }),
    });

    assertEquals(response.status, 200);

    // Verify recovery status was updated to 'recovered'
    const { data: updatedRecovery } = await supabaseAdmin
      .from('recovery_events')
      .select('status, recovered_at')
      .eq('id', recovery.id)
      .single();
    assertEquals(updatedRecovery?.status, 'recovered');
    assertExists(updatedRecovery?.recovered_at);
  } finally {
    await supabaseAdmin.from('recovery_events').delete().eq('id', recovery.id);
    await supabaseAdmin.from('discs').delete().eq('id', disc.id);
    await supabaseAdmin.auth.admin.deleteUser(originalOwnerAuth.user.id);
    await supabaseAdmin.auth.admin.deleteUser(finderAuth.user.id);
    await supabaseAdmin.auth.admin.deleteUser(claimerAuth.user.id);
  }
});
