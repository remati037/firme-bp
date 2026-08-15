/**
 * DeepSeek klijent.
 *
 * DeepSeek nema svoj SDK — izlaže OpenAI-kompatibilan endpoint, pa ide preko
 * običnog `fetch`-a. Namerno se NE uvodi `openai` paket: koristi se jedan
 * poziv bez tokova, alata i slika, a paket bi doneo zavisnost koju bi neko
 * kasnije lako pomešao sa pravim OpenAI provajderom.
 */

import { PrivremenaGreska, saPonavljanjem, type Klijent, type Odgovor, type Zahtev } from "./provajder";
import type { Model } from "./modeli";

const ENDPOINT = "https://api.deepseek.com/chat/completions";

/** Odgovor se čeka najviše ovoliko; bez ovoga jedan zaglavljen poziv drži ceo prolaz. */
const ISTEK_MS = 120_000;

type DeepSeekOdgovor = {
  choices?: { message?: { content?: string | null }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
};

export function deepseekKlijent(naziv: string, model: Model): Klijent {
  const kljuc = process.env.DEEPSEEK_API_KEY;
  if (!kljuc) {
    throw new Error(
      "DEEPSEEK_API_KEY nije postavljen. Upiši ga u .env.local ili u GitHub secrets.",
    );
  }

  return {
    naziv,
    model,
    posalji: (zahtev) => saPonavljanjem(() => jedanPoziv(kljuc, naziv, zahtev), `DeepSeek ${naziv}`),
  };
}

async function jedanPoziv(kljuc: string, model: string, zahtev: Zahtev): Promise<Odgovor> {
  const prekid = AbortSignal.timeout(ISTEK_MS);

  let odgovor: Response;
  try {
    odgovor = await fetch(ENDPOINT, {
      method: "POST",
      signal: prekid,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${kljuc}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: zahtev.maxTokena,
        messages: [
          { role: "system", content: zahtev.sistem },
          { role: "user", content: zahtev.korisnik },
        ],
      }),
    });
  } catch (greska) {
    // Mrežni prekid i istek vremena su po prirodi prolazni.
    throw new PrivremenaGreska(
      `mrežna greška: ${greska instanceof Error ? greska.message : String(greska)}`,
    );
  }

  if (!odgovor.ok) {
    const telo = await odgovor.text().catch(() => "");

    // 429 i 5xx se ponavljaju; 400/401/402/404 su trajni i pucaju odmah, jer
    // je uzrok neispravan ključ, prazan račun ili pogrešno ime modela.
    if (odgovor.status === 429 || odgovor.status >= 500) {
      const zaglavlje = odgovor.headers.get("retry-after");
      const cekaj = zaglavlje ? Number(zaglavlje) * 1000 : undefined;
      throw new PrivremenaGreska(`HTTP ${odgovor.status}: ${telo.slice(0, 300)}`, cekaj);
    }

    throw new Error(`DeepSeek HTTP ${odgovor.status}: ${telo.slice(0, 500)}`);
  }

  const telo = (await odgovor.json()) as DeepSeekOdgovor;

  if (telo.error?.message) {
    throw new Error(`DeepSeek: ${telo.error.message}`);
  }

  const tekst = telo.choices?.[0]?.message?.content?.trim();
  if (!tekst) {
    // Prazan sadržaj uz uspešan HTTP status je prolazna pojava kod svih
    // provajdera; ponavljanje je ispravnije od upisa praznog sažetka u bazu.
    throw new PrivremenaGreska("prazan odgovor bez teksta");
  }

  return {
    tekst,
    ulazTokena: telo.usage?.prompt_tokens ?? 0,
    izlazTokena: telo.usage?.completion_tokens ?? 0,
  };
}
