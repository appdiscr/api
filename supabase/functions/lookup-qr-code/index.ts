import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Lookup QR Code Function
 *
 * Public endpoint (no auth required) that looks up a disc by its QR code.
 * Returns disc info for display to finders without exposing owner's private info.
 * If authenticated user is the owner, returns is_owner: true so app can redirect.
 *
 * GET /lookup-qr-code?code=ABC123
 *
 * Returns:
 * - found: boolean
 * - disc: { id, name, photo_url, owner_display_name, reward_amount } (if found)
 * - has_active_recovery: boolean (if found)
 * - is_owner: boolean (if authenticated and owns the disc)
 * - is_claimable: boolean (if disc has no owner and can be claimed)
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Get QR code from query params
  const url = new URL(req.url);
  const code = url.searchParams.get('code');

  if (!code) {
    return new Response(JSON.stringify({ error: 'Missing code parameter' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Create Supabase client with service role key for read access
  // (bypasses RLS since this is a public lookup endpoint)
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Check if user is authenticated (optional - for owner detection)
  let currentUserId: string | null = null;
  const authHeader = req.headers.get('Authorization');
  if (authHeader) {
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();
    currentUserId = user?.id ?? null;
  }

  // Look up the QR code
  const { data: qrCode, error: qrError } = await supabase
    .from('qr_codes')
    .select('id, short_code, status, assigned_to')
    .eq('short_code', code.toUpperCase())
    .single();

  if (qrError || !qrCode) {
    return new Response(JSON.stringify({ found: false }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Check if QR code is assigned (has a disc)
  if (qrCode.status !== 'assigned' && qrCode.status !== 'active') {
    return new Response(JSON.stringify({ found: false }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Get the disc associated with this QR code
  const { data: disc, error: discError } = await supabase
    .from('discs')
    .select(
      `
      id,
      name,
      manufacturer,
      mold,
      plastic,
      color,
      reward_amount,
      owner_id,
      photos:disc_photos(id, storage_path)
    `
    )
    .eq('qr_code_id', qrCode.id)
    .single();

  // Get owner display name from profile (separate query to avoid FK issues)
  // If disc has no owner, it's claimable (was abandoned)
  let ownerDisplayName = 'Anonymous';
  const isClaimable = disc?.owner_id === null;

  if (isClaimable) {
    ownerDisplayName = 'No Owner - Available to Claim';
  } else if (disc?.owner_id) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, username, full_name, display_preference')
      .eq('id', disc.owner_id)
      .single();
    if (profile) {
      // Use display preference to determine what to show
      if (profile.display_preference === 'full_name' && profile.full_name) {
        ownerDisplayName = profile.full_name;
      } else if (profile.username) {
        ownerDisplayName = profile.username;
      } else if (profile.email) {
        // Fallback to email username part
        ownerDisplayName = profile.email.split('@')[0];
      }
    }
  }

  if (discError || !disc) {
    return new Response(JSON.stringify({ found: false }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Check for active recovery events
  const { data: activeRecovery } = await supabase
    .from('recovery_events')
    .select('id')
    .eq('disc_id', disc.id)
    .in('status', ['found', 'meetup_proposed', 'meetup_confirmed'])
    .limit(1)
    .maybeSingle();

  // Get first photo URL if available
  let photoUrl = null;
  if (disc.photos && disc.photos.length > 0) {
    const { data: urlData } = await supabase.storage
      .from('disc-photos')
      .createSignedUrl(disc.photos[0].storage_path, 3600); // 1 hour expiry
    photoUrl = urlData?.signedUrl || null;
  }

  // Check if current user is the owner
  const isOwner = currentUserId !== null && currentUserId === disc.owner_id;

  // Return disc info without sensitive owner data
  return new Response(
    JSON.stringify({
      found: true,
      disc: {
        id: disc.id,
        name: disc.name,
        manufacturer: disc.manufacturer,
        mold: disc.mold,
        plastic: disc.plastic,
        color: disc.color,
        reward_amount: disc.reward_amount,
        owner_display_name: ownerDisplayName,
        photo_url: photoUrl,
      },
      has_active_recovery: !!activeRecovery,
      is_owner: isOwner,
      is_claimable: isClaimable,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
});
