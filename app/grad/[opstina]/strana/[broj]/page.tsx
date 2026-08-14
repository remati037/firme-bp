import type { Metadata } from "next";

import { PrikazOpstine } from "@/components/category/prikaz-opstine";
import { brojIzPutanje, metaOpstina } from "@/lib/kategorije-strana";

export const revalidate = 2592000;

type Props = { params: Promise<{ opstina: string; broj: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { opstina, broj } = await params;
  return metaOpstina(opstina, brojIzPutanje(broj));
}

export async function generateStaticParams() {
  return [];
}

export default async function StranaOpstine({ params }: Props) {
  const { opstina, broj } = await params;
  return <PrikazOpstine slug={opstina} strana={brojIzPutanje(broj)} />;
}
