/**
 * Short Code Generation Utility
 *
 * Generates unique alphanumeric short codes for QR codes.
 * Excludes ambiguous characters (0, O, 1, l, I) for better readability.
 */

// Alphabet excluding ambiguous characters
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 12;

/**
 * Generate a random short code
 * @returns A random 12-character alphanumeric string
 */
export function generateShortCode(): string {
  let result = '';
  const randomValues = new Uint32Array(CODE_LENGTH);
  crypto.getRandomValues(randomValues);

  for (let i = 0; i < CODE_LENGTH; i++) {
    result += ALPHABET[randomValues[i] % ALPHABET.length];
  }

  return result;
}

/**
 * Batch generate unique short codes
 * @param count Number of codes to generate
 * @returns Array of unique short codes
 */
export function generateShortCodes(count: number): string[] {
  const codes = new Set<string>();

  while (codes.size < count) {
    codes.add(generateShortCode());
  }

  return Array.from(codes);
}
