import { assertEquals } from 'https://deno.land/std@0.192.0/testing/asserts.ts';
import { generateShortCode, generateShortCodes } from './short-code.ts';

Deno.test('generateShortCode: should generate 12 character code', () => {
  const code = generateShortCode();
  assertEquals(code.length, 12);
});

Deno.test('generateShortCode: should only contain valid characters', () => {
  const validChars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  for (let i = 0; i < 100; i++) {
    const code = generateShortCode();
    for (const char of code) {
      assertEquals(validChars.includes(char), true, `Invalid character: ${char}`);
    }
  }
});

Deno.test('generateShortCode: should not contain ambiguous characters', () => {
  const ambiguousChars = '0O1lI';

  for (let i = 0; i < 100; i++) {
    const code = generateShortCode();
    for (const char of code) {
      assertEquals(ambiguousChars.includes(char), false, `Ambiguous character found: ${char}`);
    }
  }
});

Deno.test('generateShortCode: should generate different codes each time', () => {
  const codes = new Set<string>();
  for (let i = 0; i < 100; i++) {
    codes.add(generateShortCode());
  }
  // With 8 character codes from 30 characters, collision probability is very low
  // We expect at least 95 unique codes out of 100
  assertEquals(codes.size >= 95, true, `Expected at least 95 unique codes, got ${codes.size}`);
});

Deno.test('generateShortCodes: should generate requested number of codes', () => {
  const codes = generateShortCodes(10);
  assertEquals(codes.length, 10);
});

Deno.test('generateShortCodes: should generate all unique codes', () => {
  const codes = generateShortCodes(50);
  const uniqueCodes = new Set(codes);
  assertEquals(uniqueCodes.size, 50);
});

Deno.test('generateShortCodes: should handle single code request', () => {
  const codes = generateShortCodes(1);
  assertEquals(codes.length, 1);
  assertEquals(codes[0].length, 12);
});

Deno.test('generateShortCodes: should handle large batch request', () => {
  const codes = generateShortCodes(100);
  assertEquals(codes.length, 100);
  const uniqueCodes = new Set(codes);
  assertEquals(uniqueCodes.size, 100);
});
