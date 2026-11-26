import { expect } from "vitest";
import { PrismaClient } from "@prisma/client";

/**
 * Integration tests run against a real, seeded MySQL or MariaDB. They create
 * and delete rows and write audit entries that can never be removed, so point
 * them at a throwaway database, never production:
 *
 *   DATABASE_URL="$TEST_DATABASE_URL" pnpm db:deploy && DATABASE_URL="$TEST_DATABASE_URL" pnpm db:seed
 *   TEST_DATABASE_URL="mysql://user:pass@host:3306/test_db" pnpm test:db
 *
 * (`docker compose up -d mariadb` gives a local one.) They skip themselves
 * when TEST_DATABASE_URL is not set, so the unit suite still runs anywhere,
 * including CI without a database.
 */
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "";
export const dbAvailable = TEST_DATABASE_URL.length > 0;

let client: PrismaClient | undefined;

export function db(): PrismaClient {
  client ??= new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL } } });
  return client;
}

export async function disconnect() {
  await client?.$disconnect();
  client = undefined;
}

/**
 * Asserts that a statement is rejected by the database, then reconnects.
 *
 * The client is recycled afterwards so a failed statement can never leave a
 * half-used connection behind for the next test. The reconnect is harmless.
 */
export async function expectRejected(run: () => Promise<unknown>) {
  let threw = false;
  try {
    await run();
  } catch {
    threw = true;
  }
  await disconnect();
  expect(threw, "expected the database to reject this statement").toBe(true);
}

/** Unique suffix so re-runs never collide with earlier test rows. */
export const uniq = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
