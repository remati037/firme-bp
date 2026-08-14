/**
 * Transliteracija srpske ćirilice u latinicu.
 *
 * Eksplicitna mapa, ne biblioteka koja gađa. Nazivi opština i pravnih formi iz
 * APR-a stižu isključivo ćirilicom, a 10.602 poslovna imena takođe.
 */

const MAPA: Record<string, string> = {
  А: "A", Б: "B", В: "V", Г: "G", Д: "D", Ђ: "Đ", Е: "E", Ж: "Ž", З: "Z",
  И: "I", Ј: "J", К: "K", Л: "L", М: "M", Н: "N", О: "O", П: "P", Р: "R",
  С: "S", Т: "T", Ћ: "Ć", У: "U", Ф: "F", Х: "H", Ц: "C", Ч: "Č", Ш: "Š",
  а: "a", б: "b", в: "v", г: "g", д: "d", ђ: "đ", е: "e", ж: "ž", з: "z",
  и: "i", ј: "j", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", ћ: "ć", у: "u", ф: "f", х: "h", ц: "c", ч: "č", ш: "š",
};

/** Digrafi se pišu velikim ili mešovito, zavisno od slova koje sledi. */
const DIGRAFI: Record<string, [string, string]> = {
  Љ: ["LJ", "Lj"], Њ: ["NJ", "Nj"], Џ: ["DŽ", "Dž"],
  љ: ["lj", "lj"], њ: ["nj", "nj"], џ: ["dž", "dž"],
};

/**
 * Tačno je veliko ćirilično slovo. Opseg А-Ш ne pokriva Ђ, Ј, Љ, Њ, Ћ i Џ,
 * jer oni u Unicode tabeli stoje ispred А, pa se navode posebno.
 */
function jeVelikoCirilicno(znak: string | undefined): boolean {
  return znak !== undefined && /[А-ШЂЈЉЊЋЏ]/.test(znak);
}

export function cirilicaULatinicu(tekst: string): string {
  let rezultat = "";

  for (let i = 0; i < tekst.length; i++) {
    const znak = tekst[i];
    const digraf = DIGRAFI[znak];

    if (digraf) {
      // ЉУБОВИЈА -> LJUBOVIJA, ali Љубовија -> Ljubovija
      rezultat += jeVelikoCirilicno(tekst[i + 1]) ? digraf[0] : digraf[1];
      continue;
    }

    rezultat += MAPA[znak] ?? znak;
  }

  return rezultat;
}
