import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { MapaStranica, METRIKE, type MetrikaMape } from "@/components/mapa/mapa-stranica";
import { apsolutniUrl, BREND } from "@/lib/site";

export const revalidate = 2592000;
export const dynamicParams = false;

export function generateStaticParams() {
  return (Object.keys(METRIKE) as MetrikaMape[]).map((metrika) => ({ metrika }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ metrika: string }>;
}): Promise<Metadata> {
  const { metrika } = await params;
  if (!(metrika in METRIKE)) return {};
  const m = METRIKE[metrika as MetrikaMape];
  const naslov = `${m.naslov} po okruzima u Srbiji | ${BREND}`;
  const opis = `${m.opis}. Interaktivna mapa okruga iz poslednjeg preseka Agencije za privredne registre.`;
  return {
    title: naslov,
    description: opis,
    alternates: { canonical: apsolutniUrl(`/mapa/${metrika}`) },
    // PoC: stranica se ne indeksira dok se ne potvrdi koncept i ruta (SEO.md).
    robots: { index: false, follow: true },
  };
}

export default async function MapaMetrika({
  params,
}: {
  params: Promise<{ metrika: string }>;
}) {
  const { metrika } = await params;
  if (!(metrika in METRIKE)) notFound();
  return <MapaStranica metrika={metrika as MetrikaMape} />;
}
