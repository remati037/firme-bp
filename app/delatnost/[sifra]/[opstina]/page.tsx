import type { Metadata } from "next";

import { PrikazUkrstene } from "@/components/category/prikaz-ukrstene";
import { metaUkrstena } from "@/lib/kategorije-strana";

export const revalidate = 2592000;

type Props = { params: Promise<{ sifra: string; opstina: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { sifra, opstina } = await params;
  return metaUkrstena(sifra, opstina, 1);
}

/**
 * Ukrštenih kombinacija sa 5+ firmi ima 4.826. Ne prerenderuju se: nose manje
 * saobraćaja od osnovnih kategorija, a build bi porastao za red veličine.
 * Prave se na zahtev i ostaju u ISR kešu 30 dana.
 */
export async function generateStaticParams() {
  return [];
}

export default async function UkrstenaStranica({ params }: Props) {
  const { sifra, opstina } = await params;
  return <PrikazUkrstene sifra={sifra} slug={opstina} strana={1} />;
}
