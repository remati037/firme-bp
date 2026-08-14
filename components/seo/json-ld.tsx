/**
 * JSON-LD blok.
 *
 * Renderuje se na serveru, u početnom HTML-u. `</script>` u podacima se
 * neutrališe, inače bi poslovno ime sa tim nizom moglo da prekine skriptu.
 */
export function JsonLd({ podaci }: { podaci: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(podaci).replace(/</g, "\\u003c"),
      }}
    />
  );
}

/** Uklanja polja bez vrednosti, da JSON-LD ne sadrži null-ove. */
export function bezPraznih<T extends Record<string, unknown>>(objekat: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(objekat).filter(([, v]) => v !== null && v !== undefined && v !== ""),
  ) as Partial<T>;
}
