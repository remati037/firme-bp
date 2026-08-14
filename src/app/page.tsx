import Image from "next/image";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 p-8">
      <Image
        src="/bp-logo.png"
        alt="Biznis priče"
        width={300}
        height={167}
        priority
        className="w-56 sm:w-72 h-auto"
      />
      <p className="text-base sm:text-lg tracking-wide text-neutral-400">
        Uskoro više informacija
      </p>
    </main>
  );
}
