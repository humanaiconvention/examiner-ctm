import React from 'react';
import clsx from 'clsx';

interface ConsciousnessCoreProps {
  title?: string;
  status?: 'online' | 'offline' | 'booting';
  className?: string;
}

const statusColor: Record<NonNullable<ConsciousnessCoreProps['status']>, string> = {
  online: 'bg-emerald-500',
  offline: 'bg-rose-500',
  booting: 'bg-amber-500 animate-pulse',
};

export function ConsciousnessCore({
  title = 'Consciousness Core',
  status = 'booting',
  className,
}: ConsciousnessCoreProps) {
  return (
    <div
      className={clsx(
        'rounded-xl border border-white/10 bg-gradient-to-br from-slate-900/70 to-slate-800/40 backdrop-blur p-4 shadow-lg flex flex-col gap-3 w-[320px]',
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wide text-slate-200">{title}</h2>
        <span
          className={clsx(
            'inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border border-white/10 uppercase',
            statusColor[status]
          )}
        >
          <span className="w-2 h-2 rounded-full bg-white/80" />
          {status}
        </span>
      </div>
      <div className="text-[11px] leading-relaxed text-slate-400 font-mono">
        <p>Neural lattice syncing...</p>
        <p>Context streams aligning...</p>
        <p>Cognitive anchors stable.</p>
      </div>
      <button
        className="mt-auto text-xs font-medium px-3 py-1.5 rounded-md bg-slate-700/60 hover:bg-slate-600/60 transition border border-white/10"
        onClick={() => console.log('Core pinged at', new Date().toISOString())}
      >
        Ping Core
      </button>
    </div>
  );
}

export default ConsciousnessCore;
