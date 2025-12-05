import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  // Only allow GET requests
  if (req.method !== 'GET') {
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

  // Fetch user's discs with photos
  const { data: discs, error: discsError } = await supabase
    .from('discs')
    .select(
      `
      *,
      photos:disc_photos(id, storage_path, photo_type, created_at)
    `
    )
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false });

  if (discsError) {
    console.error('Database error:', discsError);
    return new Response(JSON.stringify({ error: 'Failed to fetch discs', details: discsError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Generate signed URLs for all photos
  const discsWithPhotoUrls = await Promise.all(
    (discs || []).map(async (disc) => {
      const photosWithUrls = await Promise.all(
        (disc.photos || []).map(
          async (photo: { id: string; storage_path: string; photo_type: string; created_at: string }) => {
            const { data: urlData, error: urlError } = await supabase.storage
              .from('disc-photos')
              .createSignedUrl(photo.storage_path, 3600); // 1 hour expiry

            if (urlError) {
              console.error(`Failed to create signed URL for photo ${photo.id}:`, urlError);
              console.error(`  Storage path: ${photo.storage_path}`);
              console.error(`  Error details:`, urlError);
            }

            if (!urlData?.signedUrl) {
              console.warn(`No signed URL created for photo ${photo.id} at ${photo.storage_path}`);
            }

            return {
              ...photo,
              photo_url: urlData?.signedUrl || null,
            };
          }
        )
      );

      // Filter out photos without valid URLs (file might have been deleted from storage)
      const validPhotos = photosWithUrls.filter((p) => p.photo_url);

      return {
        ...disc,
        photos: validPhotos,
      };
    })
  );

  return new Response(JSON.stringify(discsWithPhotoUrls), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
