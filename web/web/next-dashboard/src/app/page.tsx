"use client";
import { ConsciousnessCore } from "@/components/tile/ConsciousnessCore";
import { useDashboardStore } from "@/store/dashboardStore";

export default function Home() {
  const { coreStatus, setCoreStatus, metrics, incrementMetric } = useDashboardStore();

  return (
    <main className="min-h-screen flex flex-col items-center gap-10 py-16 px-6 bg-gradient-to-br from-slate-950 via-slate-900 to-black text-slate-100">
      <header className="flex flex-col items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Human AI Dashboard</h1>
        <p className="text-xs text-slate-400 font-mono">Core status: {coreStatus}</p>
      </header>
      <div className="flex flex-wrap gap-8">
        <ConsciousnessCore status={coreStatus} />
        <div className="rounded-xl border border-white/10 bg-slate-900/50 backdrop-blur p-4 w-[320px] flex flex-col gap-3">
          <h2 className="text-sm font-semibold tracking-wide text-slate-200">Metrics</h2>
          <ul className="text-[11px] leading-relaxed text-slate-300 font-mono space-y-1">
            {metrics.map(m => (
              <li key={m.id} className="flex justify-between">
                <span>{m.label}</span>
                <span>{m.value}{m.unit}</span>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button
              className="text-[10px] px-2 py-1 rounded bg-slate-700/60 hover:bg-slate-600/60 border border-white/10"
              onClick={() => incrementMetric('alignment', 1)}
            >+ Alignment</button>
            <button
              className="text-[10px] px-2 py-1 rounded bg-slate-700/60 hover:bg-slate-600/60 border border-white/10"
              onClick={() => incrementMetric('latency', -5)}
            >- Latency</button>
          </div>
          <div className="flex gap-2">
            {(['online','offline','booting'] as const).map(s => (
              <button
                key={s}
                className="text-[10px] px-2 py-1 rounded bg-slate-800/60 hover:bg-slate-700/60 border border-white/10 capitalize"
                onClick={() => setCoreStatus(s)}
              >{s}</button>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
