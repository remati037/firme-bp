import type { Metadata } from "next";

import { PrikazOpstine } from "@/components/category/prikaz-opstine";
import { mapaOpstina } from "@/lib/kategorije";
import { metaOpstina } from "@/lib/kategorije-strana";

export const revalidate = 2592000;

type Props = { params: Promise<{ opstina: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { opstina } = await params;
  return metaOpstina(opstina, 1);
}

export async function generateStaticParams() {
  try {
    return [...(await mapaOpstina()).keys()].map((opstina) => ({ opstina }));
  } catch {
    return [];
  }
}

export default async function StranicaOpstine({ params }: Props) {
  const { opstina } = await params;
  return <PrikazOpstine slug={opstina} strana={1} />;
}
