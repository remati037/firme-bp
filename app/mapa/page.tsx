import { redirect } from "next/navigation";

/** PoC mapa okruga — podrazumevana metrika je broj firmi. */
export default function MapaPocetna() {
  redirect("/mapa/firme");
}
