import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { generateShortCodes } from '../_shared/short-code.ts';
import { withSentry } from '../_shared/with-sentry.ts';

/**
 * Generate Order QR Codes Function
 *
 * Generates unique QR codes for a paid sticker order.
 * This is typically called after payment confirmation via webhook.
 *
 * POST /generate-order-qr-codes
 * Body: { order_id: string }
 *
 * Returns:
 * - Array of generated QR codes
 */

const handler = async (req: Request): Promise<Response> => {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Parse request body
  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { order_id } = body;

  // Validate required fields
  if (!order_id) {
    return new Response(JSON.stringify({ error: 'Missing required field: order_id' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Use service role for database operations
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  // Get order
  const { data: order, error: orderError } = await supabaseAdmin
    .from('sticker_orders')
    .select('id, user_id, quantity, status')
    .eq('id', order_id)
    .single();

  if (orderError || !order) {
    return new Response(JSON.stringify({ error: 'Order not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Check if order is in paid status
  if (order.status !== 'paid') {
    return new Response(JSON.stringify({ error: 'Order must be in paid status to generate QR codes' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Check if QR codes already exist for this order
  const { count: existingCount } = await supabaseAdmin
    .from('sticker_order_items')
    .select('*', { count: 'exact', head: true })
    .eq('order_id', order_id);

  if (existingCount && existingCount > 0) {
    return new Response(JSON.stringify({ error: 'QR codes already generated for this order' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Generate unique short codes
  const shortCodes = generateShortCodes(order.quantity);

  // Verify all short codes are unique in database (retry if collision)
  let attempts = 0;
  const maxAttempts = 3;
  let validCodes: string[] = [];

  while (attempts < maxAttempts) {
    const codesToCheck = attempts === 0 ? shortCodes : generateShortCodes(order.quantity);

    // Check for existing codes
    const { data: existingCodes } = await supabaseAdmin
      .from('qr_codes')
      .select('short_code')
      .in('short_code', codesToCheck);

    const existingSet = new Set(existingCodes?.map((c) => c.short_code) || []);

    if (existingSet.size === 0) {
      validCodes = codesToCheck;
      break;
    }

    // Filter out existing codes and regenerate
    validCodes = codesToCheck.filter((code) => !existingSet.has(code));
    const needed = order.quantity - validCodes.length;

    if (needed > 0) {
      const additionalCodes = generateShortCodes(needed * 2); // Generate extra to account for potential collisions
      for (const code of additionalCodes) {
        if (!existingSet.has(code) && validCodes.length < order.quantity) {
          validCodes.push(code);
        }
      }
    }

    if (validCodes.length >= order.quantity) {
      break;
    }

    attempts++;
  }

  if (validCodes.length < order.quantity) {
    console.error('Failed to generate unique short codes after max attempts');
    return new Response(JSON.stringify({ error: 'Failed to generate unique QR codes' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Create QR codes
  const qrCodeData = validCodes.slice(0, order.quantity).map((code) => ({
    short_code: code,
    status: 'generated',
    assigned_to: order.user_id,
  }));

  const { data: qrCodes, error: qrError } = await supabaseAdmin.from('qr_codes').insert(qrCodeData).select();

  if (qrError || !qrCodes || qrCodes.length !== order.quantity) {
    console.error('Failed to create QR codes:', qrError);
    return new Response(JSON.stringify({ error: 'Failed to create QR codes' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Create order items linking QR codes to order
  const orderItemsData = qrCodes.map((qrCode) => ({
    order_id: order.id,
    qr_code_id: qrCode.id,
  }));

  const { error: itemsError } = await supabaseAdmin.from('sticker_order_items').insert(orderItemsData);

  if (itemsError) {
    console.error('Failed to create order items:', itemsError);
    // Cleanup created QR codes
    await supabaseAdmin
      .from('qr_codes')
      .delete()
      .in(
        'id',
        qrCodes.map((qr) => qr.id)
      );
    return new Response(JSON.stringify({ error: 'Failed to link QR codes to order' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Update order status to processing
  const { error: updateError } = await supabaseAdmin
    .from('sticker_orders')
    .update({
      status: 'processing',
      updated_at: new Date().toISOString(),
    })
    .eq('id', order_id);

  if (updateError) {
    console.error('Failed to update order status:', updateError);
    // Non-fatal error, QR codes were generated successfully
  }

  return new Response(
    JSON.stringify({
      success: true,
      qr_codes: qrCodes.map((qr) => ({
        id: qr.id,
        short_code: qr.short_code,
        status: qr.status,
        assigned_to: qr.assigned_to,
      })),
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
};

Deno.serve(withSentry(handler));
