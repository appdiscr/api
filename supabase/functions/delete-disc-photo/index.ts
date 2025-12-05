import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

  // Create Supabase client for auth (with user's token)
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: { Authorization: authHeader },
    },
  });

  // Create admin client for storage operations (bypasses RLS)
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

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
  let body: { photo_id: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { photo_id } = body;

  // Validate required field
  if (!photo_id) {
    return new Response(JSON.stringify({ error: 'photo_id is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Get photo record and verify ownership
  const { data: photo, error: photoError } = await supabase
    .from('disc_photos')
    .select('*, disc:discs(owner_id)')
    .eq('id', photo_id)
    .single();

  if (photoError || !photo) {
    return new Response(JSON.stringify({ error: 'Photo not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Verify user owns the disc
  if (photo.disc.owner_id !== user.id) {
    return new Response(JSON.stringify({ error: 'You do not own this photo' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  console.log('Deleting photo:', {
    photoId: photo_id,
    storagePath: photo.storage_path,
    userId: user.id,
  });

  // Delete from storage (use admin client to bypass RLS)
  const { error: storageError } = await supabaseAdmin.storage.from('disc-photos').remove([photo.storage_path]);

  if (storageError) {
    console.error('Storage deletion error:', storageError);
    // Continue with DB deletion even if storage fails
    // (file might already be deleted or not exist)
  }

  // Delete from database
  const { error: dbError } = await supabase.from('disc_photos').delete().eq('id', photo_id);

  if (dbError) {
    console.error('Database deletion error:', dbError);
    return new Response(JSON.stringify({ error: 'Failed to delete photo record', details: dbError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(
    JSON.stringify({
      success: true,
      message: 'Photo deleted successfully',
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
});
