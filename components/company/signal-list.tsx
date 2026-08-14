import { AlertTriangle, Check, CircleAlert } from "lucide-react";

import type { Signal } from "@/lib/signali";

/**
 * Signali. Boje po težini: crveno kritično, žuto upozorenje, zeleno "sve čisto".
 * Signali se računaju u kodu (`lib/signali.ts`) i renderuju serverski.
 */
const STIL: Record<Signal["tezina"], string> = {
  crit: "border-[#fecaca] bg-[#fef2f2] text-[#991b1b] dark:border-[#3f1d1d] dark:bg-[#1c1010] dark:text-[#fca5a5]",
  warn: "border-[#fde68a] bg-[#fffbeb] text-[#92400e] dark:border-[#3d3113] dark:bg-[#1e180c] dark:text-[#fcd34d]",
  ok: "border-[#a7f3d0] bg-[#ecfdf5] text-[#065f46] dark:border-[#123528] dark:bg-[#0c1f17] dark:text-[#6ee7b7]",
};

const IKONA: Record<Signal["tezina"], typeof Check> = {
  crit: CircleAlert,
  warn: AlertTriangle,
  ok: Check,
};

export function SignalList({ signali }: { signali: Signal[] }) {
  return (
    <ul className="list-none space-y-2.5">
      {signali.map((signal) => {
        const Ikona = IKONA[signal.tezina];
        return (
          <li
            key={signal.naslov}
            className={`flex items-start gap-3 rounded-ui border px-3.5 py-3 text-sm ${STIL[signal.tezina]}`}
          >
            <Ikona size={16} strokeWidth={2.2} className="mt-0.5 shrink-0" aria-hidden />
            <span>
              <b className="font-semibold">{signal.naslov}.</b> {signal.tekst}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
