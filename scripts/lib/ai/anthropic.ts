/**
 * Anthropic klijent preko zvaničnog SDK-a.
 *
 * Podrazumevani model je Haiku 4.5 jer CLAUDE.md traži najjeftiniji dostupan
 * model. Prošireno razmišljanje se NE uključuje: zadatak je prepričavanje
 * prosleđenih brojeva u dva pasusa, tu razmišljanje ne donosi kvalitet, a
 * naplaćuje se kao izlaz.
 *
 * `maxRetries: 0` je namerno — SDK ume sam da ponavlja, ali onda bi dva
 * provajdera imala različito ponašanje pri kvaru i različit ispis u logu.
 * Ponavljanje je na jednom mestu, u `saPonavljanjem`.
 */

import Anthropic from "@anthropic-ai/sdk";

import { PrivremenaGreska, saPonavljanjem, type Klijent, type Odgovor, type Zahtev } from "./provajder";
import type { Model } from "./modeli";

export function anthropicKlijent(naziv: string, model: Model): Klijent {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY nije postavljen. Upiši ga u .env.local ili u GitHub secrets.",
    );
  }

  const klijent = new Anthropic({ maxRetries: 0 });

  return {
    naziv,
    model,
    posalji: (zahtev) =>
      saPonavljanjem(() => jedanPoziv(klijent, naziv, zahtev), `Anthropic ${naziv}`),
  };
}

async function jedanPoziv(
  klijent: Anthropic,
  model: string,
  zahtev: Zahtev,
): Promise<Odgovor> {
  let odgovor: Anthropic.Message;

  try {
    odgovor = await klijent.messages.create({
      model,
      max_tokens: zahtev.maxTokena,
      system: zahtev.sistem,
      messages: [{ role: "user", content: zahtev.korisnik }],
    });
  } catch (greska) {
    // Redosled je od najužeg ka najširem: 429 i 5xx se ponavljaju, prekid veze
    // takođe, a 400/401/403/404 su trajni i moraju da puknu odmah.
    if (greska instanceof Anthropic.RateLimitError) {
      throw new PrivremenaGreska(`rate limit: ${greska.message}`);
    }
    if (greska instanceof Anthropic.InternalServerError) {
      throw new PrivremenaGreska(`server: ${greska.message}`);
    }
    if (greska instanceof Anthropic.APIConnectionError) {
      throw new PrivremenaGreska(`veza: ${greska.message}`);
    }
    throw greska;
  }

  // Odbijanje iz bezbednosnih razloga stiže kao HTTP 200 sa praznim sadržajem.
  // Bez ove provere bi `content[0]` bio undefined i pao bi na nerazumljivoj
  // grešci umesto da jasno kaže šta se desilo.
  if (odgovor.stop_reason === "refusal") {
    throw new Error(`Anthropic je odbio zahtev za model ${model}.`);
  }

  const tekst = odgovor.content
    .filter((blok): blok is Anthropic.TextBlock => blok.type === "text")
    .map((blok) => blok.text)
    .join("")
    .trim();

  if (!tekst) {
    throw new PrivremenaGreska("prazan odgovor bez teksta");
  }

  return {
    tekst,
    ulazTokena: odgovor.usage.input_tokens,
    izlazTokena: odgovor.usage.output_tokens,
  };
}
