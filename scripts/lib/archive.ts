import { createReadStream } from "node:fs";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import type { SupabaseClient } from "@supabase/supabase-js";

export const BUCKET = "snapshots";

/**
 * Bucket mora da postoji i pre prvog pokretanja na čistom okruženju,
 * jer mesečni cron nema ručni korak. Privatan je, sirovi preseci nisu javni.
 */
export async function osigurajBucket(supabase: SupabaseClient): Promise<void> {
  const { data, error } = await supabase.storage.getBucket(BUCKET);
  if (data && !error) return;

  const { error: greskaKreiranja } = await supabase.storage.createBucket(BUCKET, { public: false });

  // Trka između dva pokretanja nije greška; bucket je tu, a to je jedino bitno.
  if (greskaKreiranja && !/already exists/i.test(greskaKreiranja.message)) {
    throw new Error(`Ne mogu da napravim bucket ${BUCKET}: ${greskaKreiranja.message}`);
  }

  console.log(`  Napravljen privatan bucket "${BUCKET}".`);
}

/** Gzipuje lokalni fajl i uploaduje ga. Vraća veličinu gzipovanog sadržaja. */
export async function arhiviraj(
  supabase: SupabaseClient,
  lokalniPut: string,
  ciljniPut: string,
): Promise<number> {
  const delovi: Buffer[] = [];
  const gzip = createGzip();

  gzip.on("data", (deo: Buffer) => delovi.push(deo));
  await pipeline(createReadStream(lokalniPut), gzip);

  const sadrzaj = Buffer.concat(delovi);

  const { error } = await supabase.storage.from(BUCKET).upload(ciljniPut, sadrzaj, {
    contentType: "application/gzip",
    upsert: true, // ponovno pokretanje uz --force sme da pregazi isti presek
  });

  if (error) throw new Error(`Upload ${ciljniPut} nije uspeo: ${error.message}`);

  return sadrzaj.length;
}
