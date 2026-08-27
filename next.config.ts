import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Self-hosted deploy (Hetzner + Coolify, odluka 27.08.2026).
   *
   * `standalone` pakuje minimalan server i samo one module koje build stvarno
   * koristi. Bez toga image nosi ceo `node_modules` (621 MB) uz `.next` (506 MB).
   * Prerenderovane stranice ostaju u `.next/server/app`, gde ih i ISR dopisuje —
   * zato je to jedina putanja koja ide na trajan volumen.
   */
  output: "standalone",

  /**
   * `X-Powered-By: Next.js` na 133k stranica ne radi ništa osim što objavljuje
   * stek. Na Vercelu ga je platforma slala svejedno; sada je izbor naš.
   */
  poweredByHeader: false,
};

export default nextConfig;
