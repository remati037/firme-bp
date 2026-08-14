import { ImageResponse } from "next/og";

import { ucitajFirmu } from "@/lib/firma-podaci";
import { formatBroj, formatRSDKompaktno } from "@/lib/format";
import { imeOpstine, kratkoIme } from "@/lib/prikaz";

/**
 * OG slika za deljenje u Viber, WhatsApp i na društvenim mrežama (SEO.md §11).
 * Generiše se na serveru i kešira sa stranicom.
 */
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Podaci o firmi iz APR registra";

export default async function OgSlika({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const podaci = await ucitajFirmu(slug);

  const ime = podaci ? kratkoIme(podaci.firma) : "Firma";
  const opstina = podaci ? imeOpstine(podaci.firma.opstina) : "";
  const fi = podaci?.poslednjaFinansija;
  const prihod = fi?.ukupni_prihodi ?? 0;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background: "linear-gradient(135deg, #4f46e5 0%, #312e81 100%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 26, opacity: 0.85 }}>
          <div style={{ width: 16, height: 16, borderRadius: 5, background: "#ffffff" }} />
          firme.biznisprice.com
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: ime.length > 28 ? 60 : 74, fontWeight: 700, lineHeight: 1.1 }}>
            {ime}
          </div>
          {opstina ? (
            <div style={{ fontSize: 30, opacity: 0.85 }}>{opstina}</div>
          ) : null}
        </div>

        <div style={{ display: "flex", gap: 56 }}>
          <Podatak
            naslov={prihod > 0 ? `Prihod ${fi?.godina ?? ""}` : "Finansijski izveštaj"}
            vrednost={prihod > 0 ? formatRSDKompaktno(prihod) : "nije predat"}
          />
          {fi?.prosecan_broj_zaposlenih ? (
            <Podatak naslov="Zaposleni" vrednost={formatBroj(fi.prosecan_broj_zaposlenih)} />
          ) : null}
          <Podatak naslov="Izvor" vrednost="APR" />
        </div>
      </div>
    ),
    size,
  );
}

function Podatak({ naslov, vrednost }: { naslov: string; vrednost: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: 22, opacity: 0.75, textTransform: "uppercase", letterSpacing: 1 }}>
        {naslov}
      </div>
      <div style={{ fontSize: 40, fontWeight: 700 }}>{vrednost}</div>
    </div>
  );
}
