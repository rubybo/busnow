import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { hashToken } from "./crypto.ts";

const ALPHABET = "23456789";
const LENGTH = 5;
const TTL_MS = 5 * 60 * 1000;
const MAX_CHALLENGES = 500;

/** 5×7 glyphs, left pixel is the high bit of each row. */
const FONT: Record<string, number[]> = {
  "2": [0b01110, 0b10001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
  "3": [0b01110, 0b10001, 0b00001, 0b00110, 0b00001, 0b10001, 0b01110],
  "4": [0b00100, 0b01100, 0b10100, 0b10010, 0b11111, 0b00010, 0b00010],
  "5": [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  "6": [0b01110, 0b10000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  "7": [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  "8": [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  "9": [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00001, 0b01110],
};

type Challenge = { hash: string; exp: number };

const challenges: Map<string, Challenge> = ((globalThis as { busnowCaptcha?: Map<string, Challenge> }).busnowCaptcha ??=
  new Map());

function code(): string {
  return Array.from({ length: LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
}

function svg(value: string): string {
  const cell = 4;
  const glyphW = 5 * cell;
  const gap = 10;
  const width = 16 + value.length * glyphW + (value.length - 1) * gap + 16;
  const height = 64;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">`,
    `<rect width="${width}" height="${height}" fill="#f2f2f2"/>`,
  ];
  for (let i = 0; i < 6; i += 1) {
    const y = randomInt(8, height - 8);
    parts.push(
      `<path d="M0 ${y} C ${width / 3} ${y + randomInt(-8, 9)}, ${(width * 2) / 3} ${y + randomInt(-8, 9)}, ${width} ${y}" fill="none" stroke="#0d0d0d" stroke-opacity="0.18" stroke-width="1.5"/>`,
    );
  }
  value.split("").forEach((char, index) => {
    const rows = FONT[char];
    if (!rows) return;
    const originX = 16 + index * (glyphW + gap) + randomInt(-1, 2);
    const originY = 14 + randomInt(-2, 3);
    rows.forEach((bits, row) => {
      for (let col = 0; col < 5; col += 1) {
        if ((bits & (1 << (4 - col))) === 0) continue;
        parts.push(
          `<rect x="${originX + col * cell}" y="${originY + row * cell}" width="${cell - 0.6}" height="${cell - 0.6}" fill="#0d0d0d"/>`,
        );
      }
    });
  });
  parts.push("</svg>");
  return parts.join("");
}

export function createChallenge(): { id: string; svg: string; code: string } {
  const now = Date.now();
  for (const [id, item] of challenges) {
    if (item.exp <= now) challenges.delete(id);
  }
  while (challenges.size >= MAX_CHALLENGES) {
    const oldest = challenges.keys().next().value;
    if (!oldest) break;
    challenges.delete(oldest);
  }
  const value = code();
  const id = randomBytes(16).toString("hex");
  challenges.set(id, { hash: hashToken(value), exp: now + TTL_MS });
  return { id, svg: svg(value), code: value };
}

export function verifyCaptcha(id: unknown, answer: unknown): boolean {
  if (typeof id !== "string" || typeof answer !== "string") return false;
  const item = challenges.get(id);
  challenges.delete(id);
  if (!item || item.exp <= Date.now()) return false;
  const given = hashToken(answer.trim());
  const actual = Buffer.from(given);
  const expected = Buffer.from(item.hash);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
