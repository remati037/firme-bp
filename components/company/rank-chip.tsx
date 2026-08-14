import { formatBroj } from "@/lib/format";

/**
 * "Top 5% u delatnosti po prihodu".
 *
 * Prikazuje se samo ako firma ima rang, dakle ako je predala izveštaj sa
 * prihodom. Procenat se zaokružuje naviše, da firma nikad ne dobije bolju
 * poziciju nego što je ima.
 */
export function RankChip({
  rang,
  ukupno,
  gde,
}: {
  rang: number | null | undefined;
  ukupno: number | null | undefined;
  gde: string;
}) {
  if (!rang || !ukupno || ukupno < 5) return null;

  const procenat = Math.max(1, Math.ceil((rang / ukupno) * 100));

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-[3px] text-xs font-semibold text-accent-strong">
      <span aria-hidden>▲</span>
      Top {formatBroj(procenat)}% {gde} po prihodu
    </span>
  );
}
