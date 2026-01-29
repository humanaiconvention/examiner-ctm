import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity, TrendingDown, Sparkles, Database, BrainCircuit, Loader2
} from 'lucide-react';

const VERSION = "v1.0.0";
const DEFAULT_POLL_INTERVAL = 5000;
const MAX_HISTORY_POINTS = 800;
const DEFAULT_UPLINK_URL = "./data/metrics.jsonl";

const App = () => {
  const [logs, setLogs] = useState([]);
  const [isPolling, setIsPolling] = useState(false);
  const [lastPollTime, setLastPollTime] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  const parseJSONL = (text) => {
    return text
      .split('\n')
      .filter(line => line.trim())
      .map(line => {
        try {
          const cleaned = line.replace(/:\s*NaN/g, ': null');
          return JSON.parse(cleaned);
        } catch (e) { return null; }
      })
      .filter(entry => entry !== null && typeof entry.step === 'number');
  };

  useEffect(() => {
    const intervalId = setInterval(async () => {
      setIsPolling(true);
      setLastPollTime(new Date());

      const timestamp = Date.now();
      const targetUrl = `${DEFAULT_UPLINK_URL}?t=${timestamp}`;

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const response = await fetch(targetUrl, {
          signal: controller.signal,
          headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
        });
        clearTimeout(timeoutId);

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const rawText = await response.text();
        const parsed = parseJSONL(rawText);

        if (parsed.length > 0) {
          setLogs(parsed.slice(-MAX_HISTORY_POINTS));
          setErrorMsg(null);
        }
      } catch (err) {
        console.error('[CTM] Fetch error:', err);
        setErrorMsg(`Connection error: ${err.message}`);
      }

      setTimeout(() => setIsPolling(false), 800);
    }, DEFAULT_POLL_INTERVAL);

    return () => clearInterval(intervalId);
  }, []);

  const latest = logs[logs.length - 1] || null;
  const displayLoss = latest ? (latest.loss == null ? "NaN" : latest.loss.toFixed(5)) : "---";
  const displayReward = latest ? (latest.reward != null ? latest.reward.toFixed(3) : "---") : "---";
  const displayStep = latest ? latest.step.toLocaleString() : "---";
  const displayEpsilon = latest ? latest.epsilon?.toFixed(4) || "---" : "---";
  const displayDepth = latest ? latest.thinking_depth || 0 : 0;

  // Calculate min/max for charts
  const validLosses = logs.filter(l => l.loss != null).map(l => l.loss);
  const minLoss = validLosses.length > 0 ? Math.min(...validLosses) : 0;
  const maxLoss = validLosses.length > 0 ? Math.max(...validLosses) : 100;

  const rewards = logs.map(l => l.reward || 0);
  const minReward = Math.min(...rewards);
  const maxReward = Math.max(...rewards);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0c] to-[#050507] text-white font-sans p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-mono font-bold text-cyan-400">EXAMINER-CTM</h1>
            <p className="text-xs text-gray-500 font-mono mt-1">{VERSION}</p>
          </div>
          <div className={`flex items-center gap-2 px-3 py-1 rounded border ${isPolling ? 'border-green-500/50 bg-green-500/10' : 'border-red-500/50 bg-red-500/10'}`}>
            <div className={`w-2 h-2 rounded-full ${isPolling ? 'bg-green-400' : 'bg-red-400'} animate-pulse`} />
            <span className="text-xs text-gray-400">{isPolling ? 'LIVE' : 'IDLE'}</span>
          </div>
        </div>

        {/* Error Display */}
        {errorMsg && (
          <div className="p-4 bg-red-900/20 border border-red-500/30 rounded-lg text-red-400 text-sm font-mono">
            {errorMsg}
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-[#111113] border border-white/10 rounded-lg">
            <div className="text-[10px] text-gray-500 uppercase mb-2">Step</div>
            <div className="text-2xl font-mono text-cyan-400">{displayStep}</div>
          </div>
          <div className="p-4 bg-[#111113] border border-white/10 rounded-lg">
            <div className="text-[10px] text-gray-500 uppercase mb-2">Loss</div>
            <div className="text-2xl font-mono text-gray-300">{displayLoss}</div>
          </div>
          <div className="p-4 bg-[#111113] border border-white/10 rounded-lg">
            <div className="text-[10px] text-gray-500 uppercase mb-2">Reward</div>
            <div className="text-2xl font-mono text-yellow-400">{displayReward}</div>
          </div>
          <div className="p-4 bg-[#111113] border border-white/10 rounded-lg">
            <div className="text-[10px] text-gray-500 uppercase mb-2">Depth</div>
            <div className="text-2xl font-mono text-purple-400">{displayDepth}</div>
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Loss Chart */}
          <div className="p-4 bg-[#111113] border border-white/10 rounded-lg">
            <h3 className="text-xs font-mono text-gray-400 uppercase mb-4">Loss Trajectory</h3>
            <div className="h-48 bg-[#0a0a0c] rounded border border-white/5 p-2 relative">
              <svg width="100%" height="100%" viewBox="0 0 400 200">
                {/* Grid */}
                {[0, 50, 100, 150, 200].map(y => (
                  <line key={`h${y}`} x1="0" y1={y} x2="400" y2={y} stroke="#222" strokeWidth="1" strokeDasharray="2,2" />
                ))}
                {[0, 100, 200, 300, 400].map(x => (
                  <line key={`v${x}`} x1={x} y1="0" x2={x} y2="200" stroke="#222" strokeWidth="1" strokeDasharray="2,2" />
                ))}

                {/* Loss Line */}
                {logs.length > 1 && (
                  <polyline
                    points={logs.map((l, i) => {
                      const x = (i / Math.max(1, logs.length - 1)) * 400;
                      const loss = l.loss != null ? l.loss : minLoss;
                      const y = 200 - ((loss - minLoss) / Math.max(1, maxLoss - minLoss)) * 200;
                      return `${x},${y}`;
                    }).join(' ')}
                    fill="none"
                    stroke="#22d3ee"
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                  />
                )}

                {/* Axis Labels */}
                <text x="5" y="195" fontSize="10" fill="#666" fontFamily="monospace">{minLoss.toFixed(1)}</text>
                <text x="5" y="15" fontSize="10" fill="#666" fontFamily="monospace">{maxLoss.toFixed(1)}</text>
              </svg>
            </div>
            <div className="text-[10px] text-gray-500 mt-2">Current: {displayLoss}</div>
          </div>

          {/* Reward Chart */}
          <div className="p-4 bg-[#111113] border border-white/10 rounded-lg">
            <h3 className="text-xs font-mono text-gray-400 uppercase mb-4">Reward Signal</h3>
            <div className="h-48 bg-[#0a0a0c] rounded border border-white/5 p-2 relative">
              <svg width="100%" height="100%" viewBox="0 0 400 200">
                {/* Grid */}
                {[0, 50, 100, 150, 200].map(y => (
                  <line key={`h${y}`} x1="0" y1={y} x2="400" y2={y} stroke="#222" strokeWidth="1" strokeDasharray="2,2" />
                ))}
                {[0, 100, 200, 300, 400].map(x => (
                  <line key={`v${x}`} x1={x} y1="0" x2={x} y2="200" stroke="#222" strokeWidth="1" strokeDasharray="2,2" />
                ))}

                {/* Reward Line */}
                {logs.length > 1 && (
                  <polyline
                    points={logs.map((l, i) => {
                      const x = (i / Math.max(1, logs.length - 1)) * 400;
                      const reward = l.reward || 0;
                      const y = 200 - ((reward - minReward) / Math.max(1, maxReward - minReward)) * 200;
                      return `${x},${y}`;
                    }).join(' ')}
                    fill="none"
                    stroke="#facc15"
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                  />
                )}

                {/* Axis Labels */}
                <text x="5" y="195" fontSize="10" fill="#666" fontFamily="monospace">{minReward.toFixed(2)}</text>
                <text x="5" y="15" fontSize="10" fill="#666" fontFamily="monospace">{maxReward.toFixed(2)}</text>
              </svg>
            </div>
            <div className="text-[10px] text-gray-500 mt-2">Current: {displayReward}</div>
          </div>
        </div>

        {/* Domains */}
        <div className="p-4 bg-[#111113] border border-white/10 rounded-lg">
          <h3 className="text-xs font-mono text-gray-400 uppercase mb-4">Active Domain</h3>
          <div className="text-lg font-mono">
            <span className="text-cyan-400">{latest?.domain || "---"}</span>
            <span className="text-gray-500 ml-4">ε: {displayEpsilon}</span>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="p-4 bg-[#111113] border border-white/10 rounded-lg">
          <h3 className="text-xs font-mono text-gray-400 uppercase mb-4">Recent Entries</h3>
          <div className="space-y-1 max-h-48 overflow-y-auto font-mono text-[10px]">
            {logs.length === 0 && <div className="text-gray-600">Waiting for data...</div>}
            {logs.slice().reverse().slice(0, 30).map((log, i) => (
              <div key={log.step + i} className="text-gray-400 flex space-x-3">
                <span className="text-gray-600 min-w-max">[{log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : "00:00:00"}]</span>
                <span className="text-cyan-400">Step {log.step}</span>
                <span className="text-purple-400">{log.domain}</span>
                <span className="text-gray-500">Loss: {log.loss == null ? "NaN" : log.loss.toFixed(2)}</span>
                <span className={log.reward > 0 ? "text-green-400" : "text-red-400"}>Rew: {log.reward.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-[10px] text-gray-600 font-mono pt-4 border-t border-white/5">
          HumanAI Convention | Examiner Research Group | Last update: {lastPollTime?.toLocaleTimeString() || 'Waiting...'}
        </div>
      </div>
    </div>
  );
};

console.log('[CTM] Starting app...');
try {
  const rootEl = document.getElementById('root');
  const root = createRoot(rootEl);
  root.render(<App />);
  console.log('[CTM] App rendered');
} catch (e) {
  console.error('[CTM] Render error:', e);
  document.body.innerHTML = `<pre style="color:red;padding:20px">ERROR: ${e.message}\n${e.stack}</pre>`;
}
