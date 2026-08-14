import type { Metadata } from "next";

import { PrikazUkrstene } from "@/components/category/prikaz-ukrstene";
import { brojIzPutanje, metaUkrstena } from "@/lib/kategorije-strana";

export const revalidate = 2592000;

type Props = { params: Promise<{ sifra: string; opstina: string; broj: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { sifra, opstina, broj } = await params;
  return metaUkrstena(sifra, opstina, brojIzPutanje(broj));
}

export async function generateStaticParams() {
  return [];
}

export default async function StranaUkrstene({ params }: Props) {
  const { sifra, opstina, broj } = await params;
  return <PrikazUkrstene sifra={sifra} slug={opstina} strana={brojIzPutanje(broj)} />;
}
