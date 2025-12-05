import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface DeleteDiscRequest {
  disc_id: string;
}

Deno.serve(async (req) => {
  // Only allow DELETE requests
  if (req.method !== 'DELETE') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Check authentication
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Create Supabase client
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: {
      headers: { Authorization: authHeader },
    },
  });

  // Verify user is authenticated
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Parse request body
  let body: DeleteDiscRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Validate required fields
  if (!body.disc_id || body.disc_id.trim() === '') {
    return new Response(JSON.stringify({ error: 'disc_id is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Verify the disc exists and belongs to the user
  const { data: disc, error: fetchError } = await supabase
    .from('discs')
    .select('id, owner_id')
    .eq('id', body.disc_id)
    .single();

  if (fetchError || !disc) {
    return new Response(JSON.stringify({ error: 'Disc not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (disc.owner_id !== user.id) {
    return new Response(JSON.stringify({ error: 'Forbidden: You do not own this disc' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Delete the disc (cascade will handle related records like photos)
  const { error: deleteError } = await supabase.from('discs').delete().eq('id', body.disc_id);

  if (deleteError) {
    console.error('Database error:', deleteError);
    return new Response(JSON.stringify({ error: 'Failed to delete disc', details: deleteError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ success: true, message: 'Disc deleted successfully' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
