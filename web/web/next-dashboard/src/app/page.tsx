import Image from "next/image";

export default function Home() {
  return (
    <div className="font-sans grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20">
      <main className="flex flex-col gap-[32px] row-start-2 items-center sm:items-start">
        <Image
          className="dark:invert"
          src="/next.svg"
          alt="Next.js logo"
          width={180}
          height={38}
          priority
        />
        <ol className="font-mono list-inside list-decimal text-sm/6 text-center sm:text-left">
          <li className="mb-2 tracking-[-.01em]">
            Get started by editing{" "}
            <code className="bg-black/[.05] dark:bg-white/[.06] font-mono font-semibold px-1 py-0.5 rounded">
              src/app/page.tsx
            </code>
            .
          </li>
          <li className="tracking-[-.01em]">
            import { ConsciousnessCore } from "@/components/Tile/ConsciousnessCore";

            export default function Home() {
              return (
                <main className="min-h-screen flex flex-col items-center justify-start gap-10 py-16 px-6 bg-gradient-to-br from-slate-900 via-slate-950 to-black text-slate-100">
                  <h1 className="text-2xl font-semibold tracking-tight">Human AI Dashboard</h1>
                  <div className="flex flex-wrap gap-8">
                    <ConsciousnessCore status="online" />
                  </div>
                </main>
              );
            }
              className="dark:invert"
