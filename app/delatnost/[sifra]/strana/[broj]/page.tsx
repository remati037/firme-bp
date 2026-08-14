import type { Metadata } from "next";

import { PrikazDelatnosti } from "@/components/category/prikaz-delatnosti";
import { brojIzPutanje, metaDelatnost } from "@/lib/kategorije-strana";

export const revalidate = 2592000;

type Props = { params: Promise<{ sifra: string; broj: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { sifra, broj } = await params;
  return metaDelatnost(sifra, brojIzPutanje(broj));
}

/** Strane 2+ se prave na zahtev i ostaju u ISR kešu; ima ih previše za build. */
export async function generateStaticParams() {
  return [];
}

export default async function StranaDelatnosti({ params }: Props) {
  const { sifra, broj } = await params;
  return <PrikazDelatnosti sifra={sifra} strana={brojIzPutanje(broj)} />;
}
