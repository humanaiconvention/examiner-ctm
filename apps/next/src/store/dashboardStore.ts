import { create } from 'zustand';

interface Metric {
  id: string;
  label: string;
  value: number;
  unit?: string;
}

interface DashboardState {
  metrics: Metric[];
  coreStatus: 'online' | 'offline' | 'booting';
  incrementMetric: (id: string, delta?: number) => void;
  setCoreStatus: (status: DashboardState['coreStatus']) => void;
}

export const useDashboardStore = create<DashboardState>((set) => ({
  metrics: [
    { id: 'alignment', label: 'Alignment Coherence', value: 42, unit: '%' },
    { id: 'latency', label: 'Cognitive Latency', value: 120, unit: 'ms' },
  ],
  coreStatus: 'booting',
  incrementMetric: (id, delta = 1) =>
    set((state) => ({
      metrics: state.metrics.map((m) =>
        m.id === id ? { ...m, value: m.value + delta } : m
      ),
    })),
  setCoreStatus: (status) => set({ coreStatus: status }),
}));
