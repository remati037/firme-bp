import type { Metadata } from "next";

import { PrikazDelatnosti } from "@/components/category/prikaz-delatnosti";
import { sifreUUpotrebi } from "@/lib/kategorije";
import { metaDelatnost } from "@/lib/kategorije-strana";

export const revalidate = 2592000;

type Props = { params: Promise<{ sifra: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { sifra } = await params;
  return metaDelatnost(sifra, 1);
}

/** Sve delatnosti koje neka firma zaista koristi; ostale nemaju stranicu. */
export async function generateStaticParams() {
  try {
    return (await sifreUUpotrebi()).map((sifra) => ({ sifra }));
  } catch {
    // Build bez pristupa bazi: stranice se prave na zahtev.
    return [];
  }
}

export default async function StranicaDelatnosti({ params }: Props) {
  const { sifra } = await params;
  return <PrikazDelatnosti sifra={sifra} strana={1} />;
}
