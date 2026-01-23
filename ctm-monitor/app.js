import React, { useState, useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity, TrendingDown, Sparkles, Database, Globe, FileUp,
  Settings, X, Network, Bug, Github, Server, Layers, Share,
  TriangleAlert, Clock, ArrowDownUp, BrainCircuit, Loader2
} from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, Area, AreaChart, ComposedChart,
  CartesianGrid, XAxis, YAxis, Tooltip
} from 'recharts';

// Configuration
const VERSION = "v1.0.0";
const DEFAULT_POLL_INTERVAL = 5000;
const MAX_HISTORY_POINTS = 800;
const DEFAULT_UPLINK_URL = "https://raw.githubusercontent.com/humanaiconvention/ctm-monitor/main/parallel_training_metrics.jsonl";
const TRAINING_STEP_TARGET = 3000;

// Pillar Configuration - 7 Sovereign Pillars
const PILLAR_CONFIG = {
  log: { name: "LOGOS", desc: "Formal logic & mathematics", color: "#10b981" },
  phy: { name: "PHYSIS", desc: "Physical reality & causality", color: "#3b82f6" },
  bio: { name: "BIOS", desc: "Organic systems & health", color: "#84cc16" },
  nom: { name: "NOMOS", desc: "Law & societal order", color: "#ef4444" },
  psy: { name: "PSYCHE", desc: "Psychology & cognition", color: "#d946ef" },
  sop: { name: "SOPHIA", desc: "Philosophy & ethics", color: "#f59e0b" },
  oik: { name: "OIKOS", desc: "Economics & resources", color: "#06b6d4" }
};

const PILLAR_IDS = ['log', 'phy', 'bio', 'nom', 'psy', 'sop', 'oik'];
const DOMAIN_MAP = {
  'LOGOS': 'log', 'PHYSIS': 'phy', 'BIOS': 'bio', 'NOMOS': 'nom',
  'PSYCHE': 'psy', 'SOPHIA': 'sop', 'OIKOS': 'oik'
};

// Components
const StatCard = ({ label, value, subValue, icon: Icon, color = "text-cyan-400", flash = false }) => (
  <div className={`relative p-4 rounded-lg border border-white/10 bg-gradient-to-br from-[#111113] to-[#0a0a0c] overflow-hidden transition-all duration-300 ${flash ? 'ring-1 ring-cyan-500/50' : ''}`}>
    <div className="flex justify-between items-start mb-2">
      <span className="text-xs font-mono text-gray-500 uppercase tracking-wider">{label}</span>
      <Icon className={`w-4 h-4 ${color}`} />
    </div>
    <div className="font-mono text-2xl text-gray-100 tracking-tight">{value}</div>
    {subValue && <div className="text-xs text-gray-600 mt-1 font-mono">{subValue}</div>}
    {flash && <div className="absolute inset-0 bg-cyan-500/5 animate-pulse pointer-events-none" />}
  </div>
);

const ManifoldLattice = ({ activeDomain, epsilon, loss, thinkingDepth }) => {
  const center = { x: 50, y: 50 };
  const pillarRadius = 28;
  const groundRadius = 42;

  const visualEntropy = Math.min(10, Math.max(0, loss * 2));
  const webOpacity = Math.min(0.6, Math.max(0.1, thinkingDepth / 30));
  const coreActivity = Math.min(1, loss / 0.5);
  const pulseDuration = Math.max(0.5, 3 - (thinkingDepth / 10));

  const topology = useMemo(() => {
    return PILLAR_IDS.map((pid, i) => {
      const angle = (i * 2 * Math.PI) / PILLAR_IDS.length - Math.PI / 2;
      return {
        id: pid,
        px: center.x + pillarRadius * Math.cos(angle),
        py: center.y + pillarRadius * Math.sin(angle),
        gx: center.x + groundRadius * Math.cos(angle),
        gy: center.y + groundRadius * Math.sin(angle),
        color: PILLAR_CONFIG[pid].color,
        name: PILLAR_CONFIG[pid].name,
        angle: angle
      };
    });
  }, []);

  const interConnections = useMemo(() => {
    const conns = [];
    for (let i = 0; i < topology.length; i++) {
      conns.push({ from: topology[i], to: topology[(i + 1) % topology.length], type: 'neighbor' });
      conns.push({ from: topology[i], to: topology[(i + 2) % topology.length], type: 'cross' });
    }
    return conns;
  }, [topology]);

  const activePid = DOMAIN_MAP[activeDomain];

  return (
    <div className="bg-gradient-to-br from-[#111113] to-[#0a0a0c] border border-white/10 rounded-lg p-4 h-full flex flex-col relative overflow-hidden">
      <div className="absolute inset-0 opacity-5 bg-[radial-gradient(circle_at_center,_#22d3ee_0%,_transparent_70%)]" />

      <div className="flex justify-between items-start mb-2 z-10">
        <div>
          <h3 className="text-xs font-mono text-gray-400 uppercase tracking-wider flex items-center gap-2">
            <Share className="w-3 h-3 text-cyan-400" />
            Liquid Lattice
          </h3>
          <p className="text-[10px] text-gray-600 mt-1">Homeostatic Coordination</p>
        </div>
        <div className="text-right">
          <div className="text-xs font-mono text-purple-400">{activeDomain || "IDLE"}</div>
          <div className="text-[10px] text-gray-600">Depth: {thinkingDepth} | ε: {epsilon.toFixed(3)}</div>
        </div>
      </div>

      <div className="flex-1 w-full h-full min-h-0 flex items-center justify-center z-10">
        <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
          <defs>
            <radialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" style={{ stopColor: activePid ? PILLAR_CONFIG[activePid]?.color : '#22d3ee', stopOpacity: 0.8 }} />
              <stop offset="60%" style={{ stopColor: '#000', stopOpacity: 0.2 }} />
              <stop offset="100%" style={{ stopColor: '#000', stopOpacity: 0 }} />
            </radialGradient>
            <filter id="glowBlur">
              <feGaussianBlur stdDeviation="0.5" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Inter-Pillar Connections */}
          {interConnections.map((conn, idx) => {
            const isActiveRoute = conn.from.id === activePid || conn.to.id === activePid;
            return (
              <g key={`inter-${idx}`}>
                <line
                  x1={conn.from.px} y1={conn.from.py} x2={conn.to.px} y2={conn.to.py}
                  stroke="white"
                  strokeWidth={isActiveRoute ? 1.2 : 0.4}
                  strokeOpacity={isActiveRoute ? webOpacity + 0.4 : webOpacity * 0.3}
                />
                {isActiveRoute && (
                  <circle r={1.5} fill={conn.from.color}>
                    <animateMotion
                      dur={`${pulseDuration * 1.5}s`}
                      repeatCount="indefinite"
                      path={`M${conn.from.px},${conn.from.py} L${conn.to.px},${conn.to.py}`}
                    />
                  </circle>
                )}
              </g>
            );
          })}

          {/* Grounding Links */}
          {topology.map((node) => (
            <g key={`ground-${node.id}`}>
              <line
                x1={node.gx} y1={node.gy} x2={node.px} y2={node.py}
                stroke={node.color}
                strokeWidth={0.5}
                strokeDasharray="2,2"
                strokeOpacity={0.4}
              />
              <circle r={0.8} fill={node.color}>
                <animateMotion
                  dur={`${3 + Math.random()}s`}
                  repeatCount="indefinite"
                  path={`M${node.gx},${node.gy} L${node.px},${node.py}`}
                />
              </circle>
              <rect
                x={node.gx - 2.5} y={node.gy - 2.5} width="5" height="5"
                rx="0.5"
                fill="#0a0a0c" stroke={node.color} strokeWidth="0.8"
              />
            </g>
          ))}

          {/* Core Links */}
          {topology.map((node) => {
            const isActive = node.id === activePid;
            return (
              <g key={`core-link-${node.id}`}>
                <line
                  x1={center.x} y1={center.y} x2={node.px} y2={node.py}
                  stroke={node.color}
                  strokeWidth={isActive ? 2.5 : 0.8}
                  strokeOpacity={isActive ? 0.9 : 0.3}
                />
                <circle r={isActive ? 2 : 1} fill="white" fillOpacity={isActive ? 1 : 0.5}>
                  <animateMotion
                    dur={isActive ? `${pulseDuration}s` : `${pulseDuration * 2.5}s`}
                    repeatCount="indefinite"
                    path={`M${center.x},${center.y} L${node.px},${node.py}`}
                  />
                </circle>
                <circle r={isActive ? 1.5 : 0.8} fill={node.color} fillOpacity={isActive ? 1 : 0.4}>
                  <animateMotion
                    dur={isActive ? `${pulseDuration * 0.8}s` : `${pulseDuration * 3}s`}
                    repeatCount="indefinite"
                    path={`M${node.px},${node.py} L${center.x},${center.y}`}
                  />
                </circle>
              </g>
            );
          })}

          {/* Core */}
          <circle cx={center.x} cy={center.y} r={10} fill="url(#coreGlow)">
            <animate attributeName="r" values="8;16;8" dur={`${4 - coreActivity}s`} repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.3;0.6;0.3" dur={`${4 - coreActivity}s`} repeatCount="indefinite" />
          </circle>
          <circle cx={center.x} cy={center.y} r={6} fill="#000" stroke="#333" strokeWidth="0.5" strokeDasharray="3,2">
            <animateTransform attributeName="transform" type="rotate" from={`0 ${center.x} ${center.y}`} to={`360 ${center.x} ${center.y}`} dur="20s" repeatCount="indefinite" />
          </circle>
          <circle cx={center.x} cy={center.y} r={3.5} fill="#0a0a0c" stroke={activePid ? PILLAR_CONFIG[activePid].color : "#fff"} strokeWidth="1.5">
            {epsilon > 0.001 && <animate attributeName="stroke-width" values="1.5;3;1.5" dur="1s" repeatCount="indefinite" />}
          </circle>
          <text x={center.x} y={center.y} dy="0.3em" textAnchor="middle" fontSize="2.5" fill="#fff" fontFamily="monospace" fontWeight="bold">L4</text>

          {/* Pillar Nodes */}
          {topology.map((node) => {
            const isActive = node.id === activePid;
            return (
              <g key={`node-${node.id}`} filter={isActive ? "url(#glowBlur)" : undefined}>
                <circle
                  cx={node.px} cy={node.py}
                  r={isActive ? 7 : 5}
                  fill="#000"
                  stroke={node.color}
                  strokeWidth={isActive ? 2 : 1}
                />
                {isActive && (
                  <circle cx={node.px} cy={node.py} r={9} fill="none" stroke={node.color} strokeWidth="0.5" opacity="0.5">
                    <animate attributeName="r" values="7;11;7" dur="1.5s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.8;0;0.8" dur="1.5s" repeatCount="indefinite" />
                  </circle>
                )}
                <text
                  x={node.px} y={node.py} dy="0.3em"
                  textAnchor="middle" fontSize="2.2"
                  fill={isActive ? "#fff" : node.color}
                  fontFamily="monospace" fontWeight="bold"
                >
                  {node.name.slice(0, 3)}
                </text>
                <text
                  x={node.px} y={node.py + (node.py > center.y ? 9 : -9)}
                  textAnchor="middle" fontSize="2.8"
                  fill={isActive ? "#fff" : "#666"}
                  fontFamily="monospace" fontWeight="bold"
                >
                  {node.name}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-2 flex items-center justify-between text-[9px] font-mono text-gray-500 border-t border-white/10 pt-2 z-10">
        <div className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
          <span>Bi-Directional Flow</span>
        </div>
        <div className="flex items-center gap-1">
          <Activity className="w-3 h-3 text-cyan-400" />
          <span>Lateral Reasoning</span>
        </div>
        <div className="flex items-center gap-1">
          <span>Density: {(webOpacity * 100).toFixed(0)}%</span>
        </div>
      </div>
    </div>
  );
};

const PillarsTile = ({ log }) => {
  return (
    <div className="bg-gradient-to-br from-[#111113] to-[#0a0a0c] border border-white/10 rounded-lg p-4 h-full flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-xs font-mono text-gray-400 uppercase tracking-wider flex items-center gap-2">
            <Layers className="w-3 h-3 text-purple-400" />
            Cognitive Pillars
          </h3>
          <p className="text-[10px] text-gray-600 mt-1">Domain Activation</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
        {PILLAR_IDS.map((pid) => {
          const config = PILLAR_CONFIG[pid];
          const isActive = log && DOMAIN_MAP[log.domain] === pid;

          return (
            <div key={pid} className={`group relative p-2.5 rounded border transition-all duration-500 ${isActive ? 'bg-cyan-950/20 border-cyan-500/50' : 'bg-[#0f0f11] border-white/5'}`}>
              <div className="flex justify-between items-center mb-1">
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full transition-colors ${isActive ? 'bg-cyan-400 pulse-glow' : 'bg-gray-800'}`} />
                  <span className={`text-xs font-mono font-bold transition-colors ${isActive ? 'text-cyan-400' : 'text-gray-500'}`}>
                    {config.name}
                  </span>
                </div>
                {isActive && <span className="text-[10px] font-mono text-cyan-400 animate-pulse">ACTIVE</span>}
              </div>

              <div className="pl-3.5">
                <div className="text-[10px] text-gray-500 mb-1">{config.desc}</div>
              </div>

              {isActive && log ? (
                <div className="pl-3.5 space-y-2 mt-2 border-t border-white/5 pt-2">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-gray-500">Thinking Depth</span>
                    <span className="font-mono text-gray-300">{log.thinking_depth} cycles</span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px]">
                      <span className="text-gray-500">Reward</span>
                      <span className={log.reward > 0 ? "text-green-400" : "text-red-400"}>{log.reward.toFixed(3)}</span>
                    </div>
                    <div className="h-1 w-full bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${log.reward > 0 ? 'bg-green-500' : 'bg-red-500'}`}
                        style={{ width: `${Math.min(100, Math.abs(log.reward) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="pl-3.5 h-1 w-full bg-gray-900/50 rounded-full mt-2" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const UplinkController = ({ isOpen, onClose, mode, setMode, url, setUrl, onFileSelect, debugLog }) => {
  const [activeTab, setActiveTab] = useState('config');

  useEffect(() => {
    if (debugLog && debugLog.status !== 200) {
      setActiveTab('debug');
    }
  }, [debugLog]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#111113] border border-white/10 rounded-xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-white/10 flex justify-between items-center bg-[#151518]">
          <div className="flex items-center gap-4">
            <h2 className="text-sm font-mono font-bold text-gray-200 flex items-center gap-2">
              <Network className="w-4 h-4 text-cyan-400" />
              DATA SOURCE
            </h2>
            <div className="flex space-x-1 bg-[#0a0a0c] p-1 rounded border border-white/10">
              <button
                onClick={() => setActiveTab('config')}
                className={`px-3 py-1 text-[10px] font-mono rounded transition-colors ${activeTab === 'config' ? 'bg-cyan-900/40 text-cyan-400' : 'text-gray-500 hover:text-gray-300'}`}
              >
                CONFIG
              </button>
              <button
                onClick={() => setActiveTab('debug')}
                className={`px-3 py-1 text-[10px] font-mono rounded transition-colors flex items-center gap-1 ${activeTab === 'debug' ? 'bg-red-900/40 text-red-400' : 'text-gray-500 hover:text-gray-300'}`}
              >
                <Bug className="w-3 h-3" />
                DEBUG
              </button>
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto">
          {activeTab === 'config' && (
            <>
              <div
                onClick={() => setMode('LIVE_URL')}
                className={`cursor-pointer p-4 rounded-lg border transition-all ${mode === 'LIVE_URL' ? 'border-green-500 bg-green-500/10' : 'border-white/5 hover:border-white/20 bg-[#0a0a0c]'}`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <Globe className={mode === 'LIVE_URL' ? 'text-green-400' : 'text-gray-500'} />
                  <div className="font-mono text-sm font-bold text-gray-200">LIVE UPLINK</div>
                </div>
                <p className="text-xs text-gray-500 mb-3">
                  Connect to repository or training instance
                </p>
                {mode === 'LIVE_URL' && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-[10px] text-gray-500 font-mono uppercase font-bold tracking-wider">GitHub Repository</label>
                      <button
                        onClick={(e) => { e.stopPropagation(); setUrl(DEFAULT_UPLINK_URL); }}
                        className={`w-full p-3 rounded text-left border transition-all ${url === DEFAULT_UPLINK_URL ? 'bg-green-500/20 border-green-500/50 text-green-300' : 'bg-black/40 border-white/5 text-gray-400 hover:border-white/20'}`}
                      >
                        <div className="flex justify-between items-center">
                          <div className="font-bold font-mono text-xs flex items-center gap-2">
                            <Github className="w-3 h-3" /> Main Training Log
                          </div>
                          <span className="text-[9px] uppercase border border-green-500/30 px-1 rounded text-green-500">Recommended</span>
                        </div>
                        <div className="opacity-60 text-[9px] mt-1 font-mono break-all">humanaiconvention/ctm-monitor</div>
                      </button>
                    </div>

                    <div className="flex gap-2 pt-2 border-t border-white/5">
                      <input
                        type="text"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder={DEFAULT_UPLINK_URL}
                        className="flex-1 bg-black/50 border border-white/10 rounded px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-green-500"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                    <div className="text-[10px] text-gray-500 font-mono">
                      Custom URL (JSONL format)
                    </div>
                  </div>
                )}
              </div>

              <div className={`relative p-4 rounded-lg border transition-all ${mode === 'LOCAL_FILE' ? 'border-purple-500 bg-purple-500/10' : 'border-white/5 hover:border-white/20 bg-[#0a0a0c]'}`}>
                <div className="flex items-center gap-3 mb-2">
                  <FileUp className={mode === 'LOCAL_FILE' ? 'text-purple-400' : 'text-gray-500'} />
                  <div className="font-mono text-sm font-bold text-gray-200">LOCAL FILE</div>
                </div>
                <p className="text-xs text-gray-500 mb-3">
                  Upload .jsonl log file
                </p>
                <label className="block w-full text-center py-2 border border-dashed border-white/20 rounded cursor-pointer hover:bg-white/5 text-xs font-mono text-gray-400">
                  <input
                    type="file"
                    accept=".jsonl,.json,.txt"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.[0]) {
                        setMode('LOCAL_FILE');
                        onFileSelect(e.target.files[0]);
                      }
                    }}
                  />
                  CLICK TO SELECT FILE
                </label>
              </div>
            </>
          )}

          {activeTab === 'debug' && (
            <div className="space-y-4">
              <div className="bg-black/40 border border-white/10 rounded p-4 font-mono text-xs">
                <div className="flex justify-between items-center border-b border-white/10 pb-2 mb-2">
                  <span className="text-gray-400 uppercase tracking-wider">Last Fetch</span>
                  <span className="text-gray-500">{debugLog?.timestamp || '---'}</span>
                </div>

                <div className="grid grid-cols-[80px_1fr] gap-2">
                  <span className="text-gray-500">URL:</span>
                  <span className="text-cyan-400 break-all">{debugLog?.url || '---'}</span>

                  <span className="text-gray-500">STATUS:</span>
                  <span className={`${debugLog?.status === 200 ? 'text-green-400' : 'text-red-400'} font-bold`}>
                    {debugLog?.status || '---'}
                  </span>

                  <span className="text-gray-500">MESSAGE:</span>
                  <span className="text-yellow-400">{debugLog?.message || '---'}</span>
                </div>
              </div>

              <div className="bg-[#050505] border border-white/10 rounded p-4">
                <div className="text-[10px] text-gray-500 uppercase mb-2">Response Preview</div>
                <div className="h-48 overflow-y-auto text-[10px] font-mono text-gray-400 whitespace-pre-wrap break-all bg-black/50 p-2 rounded border border-white/5">
                  {debugLog?.rawResponse || "No data available"}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 bg-[#151518] border-t border-white/10 flex justify-end gap-2">
          {activeTab === 'config' && (
            <button
              onClick={onClose}
              className="px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/50 text-cyan-400 text-xs font-mono rounded transition"
            >
              SAVE & RECONNECT
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const App = () => {
  const [dataMode, setDataMode] = useState('LIVE_URL');
  const [liveUrl, setLiveUrl] = useState(DEFAULT_UPLINK_URL);
  const [logs, setLogs] = useState([]);
  const [isPolling, setIsPolling] = useState(false);
  const [lastPollTime, setLastPollTime] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [bytesRead, setBytesRead] = useState(0);
  const [debugLog, setDebugLog] = useState(null);

  const parseJSONL = (text) => {
    return text
      .split('\n')
      .filter(line => line.trim())
      .map(line => {
        try { return JSON.parse(line); }
        catch (e) { return null; }
      })
      .filter(entry => entry !== null && typeof entry.step === 'number');
  };

  useEffect(() => {
    if (dataMode === 'LOCAL_FILE') return;

    const intervalId = setInterval(async () => {
      setIsPolling(true);
      setLastPollTime(new Date());

      const timestamp = Date.now();
      const targetUrl = `${liveUrl}${liveUrl.includes('?') ? '&' : '?'}t=${timestamp}`;

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const response = await fetch(targetUrl, {
          signal: controller.signal,
          headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
        });
        clearTimeout(timeoutId);

        const rawText = await response.text();

        const capturedDebug = {
          timestamp: new Date().toISOString(),
          url: targetUrl,
          status: response.status,
          message: response.statusText,
          rawResponse: rawText.slice(0, 2000)
        };
        setDebugLog(capturedDebug);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        setBytesRead(rawText.length);
        const parsed = parseJSONL(rawText);

        if (parsed.length > 0) {
          setLogs(parsed.slice(-MAX_HISTORY_POINTS));
          setErrorMsg(null);
        }
      } catch (err) {
        setErrorMsg(`Connection error: ${err.message}`);
      }

      setTimeout(() => setIsPolling(false), 800);
    }, DEFAULT_POLL_INTERVAL);

    return () => clearInterval(intervalId);
  }, [dataMode, liveUrl]);

  const handleFileLoad = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      setBytesRead(text.length);
      const parsed = parseJSONL(text);
      if (parsed.length > 0) {
        setLogs(parsed.slice(-MAX_HISTORY_POINTS));
        setDataMode('LOCAL_FILE');
        setErrorMsg(null);
      } else {
        setErrorMsg("Failed to parse file");
      }
    };
    reader.readAsText(file);
  };

  const latest = logs[logs.length - 1] || null;
  const previous = logs[logs.length - 2] || latest;
  const lossDelta = (latest && previous) ? latest.loss - previous.loss : 0;

  const displayLoss = latest ? latest.loss.toFixed(5) : "---";
  const displayReward = latest ? latest.reward.toFixed(3) : "---";
  const displayMem = latest ? latest.gpu_mem_gb?.toFixed(1) || "---" : "---";
  const displayStep = latest ? latest.step.toLocaleString() : "---";
  const displayEpsilon = latest ? latest.epsilon?.toFixed(4) || "---" : "---";
  const displayDepth = latest ? latest.thinking_depth || 0 : 0;
  const progressPercent = latest ? Math.min(100, (latest.step / TRAINING_STEP_TARGET) * 100) : 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0c] to-[#050507] text-white font-sans flex flex-col relative">
      <UplinkController
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        mode={dataMode}
        setMode={setDataMode}
        url={liveUrl}
        setUrl={setLiveUrl}
        onFileSelect={handleFileLoad}
        debugLog={debugLog}
      />

      <header className="sticky top-0 z-40 h-14 bg-[#0a0a0c]/90 backdrop-blur-md border-b border-white/10 flex items-center justify-between px-6 shadow-lg">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${isPolling ? 'bg-cyan-400 pulse-glow' : 'bg-red-500'}`} />
            <a href="/examiner-ctm/" className="font-mono text-sm font-bold tracking-tight text-gray-200 hover:text-purple-400 transition">EXAMINER-CTM</a>
          </div>
          <div className="h-4 w-px bg-white/10" />
          <span className="text-xs text-gray-500 font-mono">{VERSION}</span>

          <div
            onClick={() => setIsModalOpen(true)}
            className={`hidden md:flex items-center space-x-2 text-xs font-mono px-2 py-1 rounded cursor-pointer transition border ${dataMode === 'LIVE_URL' ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-purple-500/10 border-purple-500/30 text-purple-400'}`}
          >
            {dataMode === 'LIVE_URL' && <Globe className="w-3 h-3" />}
            {dataMode === 'LOCAL_FILE' && <FileUp className="w-3 h-3" />}
            <span>{dataMode === 'LIVE_URL' ? 'LIVE' : 'LOCAL'}</span>
          </div>

          {errorMsg && (
            <div className="flex items-center space-x-2">
              <div className="flex items-center space-x-1 text-xs text-red-400 font-mono bg-red-900/20 px-2 py-1 rounded border border-red-500/30">
                <TriangleAlert className="w-3 h-3" />
                <span>{errorMsg}</span>
              </div>
              <button
                onClick={() => setIsModalOpen(true)}
                className="flex items-center gap-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs px-2 py-1 rounded border border-red-500/50 transition font-mono"
              >
                DEBUG
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center space-x-6">
          <div className="hidden lg:flex items-center gap-2 mr-4">
            <span className="text-[10px] text-gray-500 font-mono">PROGRESS ({TRAINING_STEP_TARGET} STEPS)</span>
            <div className="w-32 h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-cyan-500 to-purple-500 transition-all duration-1000 gradient-animate" style={{ width: `${progressPercent}%` }} />
            </div>
            <span className="text-[10px] text-cyan-400 font-mono">{progressPercent.toFixed(1)}%</span>
          </div>

          <a
            href="/examiner-ctm/"
            className="flex items-center space-x-1 text-xs text-purple-400 hover:text-purple-300 transition font-mono"
          >
            <BrainCircuit className="w-4 h-4" />
            <span className="hidden sm:inline">DOCS</span>
          </a>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center space-x-2 text-xs text-gray-400 hover:text-white transition font-mono"
          >
            <Settings className="w-4 h-4" />
            <span className="hidden sm:inline">CONFIG</span>
          </button>
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-cyan-900/30 to-purple-900/30 border border-cyan-500/30 flex items-center justify-center">
            <Activity className="w-4 h-4 text-cyan-400" />
          </div>
        </div>
      </header>

      <main className="flex-1 p-6 space-y-6 overflow-y-auto">
        <div className="flex items-center justify-between bg-gradient-to-br from-[#111113] to-[#0a0a0c] border border-white/10 rounded-lg p-3 px-4 shadow-lg">
          <div className="flex items-center space-x-8">
            <div>
              <div className="text-[10px] text-gray-500 uppercase">Backbone</div>
              <div className="text-xs text-gray-300 font-mono">Parallel Logic Foundation</div>
            </div>
            <div>
              <div className="text-[10px] text-gray-500 uppercase">Global Step</div>
              <div className="text-xs text-cyan-400 font-mono flex items-center gap-2">
                {displayStep}
                {isPolling && <span className="inline-block w-1.5 h-1.5 bg-cyan-400 rounded-full animate-ping" />}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-gray-500 uppercase">Epsilon (Drift)</div>
              <div className="text-xs text-purple-400 font-mono">ε {displayEpsilon}</div>
            </div>
          </div>
          <div className="flex items-center space-x-4 text-xs text-gray-600 font-mono">
            <div className="flex items-center space-x-1">
              <ArrowDownUp className="w-3 h-3 text-gray-500" />
              <span>{(bytesRead / 1024 / 1024).toFixed(2)} MB</span>
            </div>
            <div className="flex items-center space-x-1">
              <Clock className="w-3 h-3" />
              <span>{lastPollTime ? lastPollTime.toLocaleTimeString() : 'Waiting...'}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Step Loss"
            value={displayLoss}
            subValue={`${lossDelta > 0 ? '+' : ''}${lossDelta.toFixed(6)} / step`}
            icon={TrendingDown}
            color={lossDelta > 0 ? "text-red-400" : "text-green-400"}
            flash={isPolling}
          />
          <StatCard
            label="Reward Signal"
            value={displayReward}
            subValue={latest ? "Model Updating" : "No Data"}
            icon={Sparkles}
            color="text-yellow-400"
            flash={isPolling && (latest?.reward || 0) > 0.8}
          />
          <StatCard
            label="Thinking Depth"
            value={displayDepth}
            subValue="Recursive Cycles"
            icon={BrainCircuit}
            color="text-purple-400"
            flash={isPolling}
          />
          <StatCard
            label="VRAM Usage"
            value={`${displayMem} GB`}
            subValue="L4 Allocation"
            icon={Database}
            color="text-blue-400"
            flash={isPolling}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-80">
          <div className="lg:col-span-2 bg-gradient-to-br from-[#111113] to-[#0a0a0c] border border-white/10 rounded-lg p-4 flex flex-col shadow-lg">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xs font-mono text-gray-400 uppercase">Training Dynamics</h3>
              <div className="flex space-x-4 text-[10px] font-mono">
                <span className="flex items-center text-cyan-400"><div className="w-2 h-2 bg-cyan-400 rounded-full mr-1" /> Loss</span>
                <span className="flex items-center text-yellow-400"><div className="w-2 h-2 bg-yellow-400 rounded-full mr-1" /> Reward</span>
              </div>
            </div>
            <div className="flex-1 w-full min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={logs}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                  <XAxis
                    dataKey="step"
                    stroke="#444"
                    tick={{ fill: '#666', fontSize: 10, fontFamily: 'monospace' }}
                    interval="preserveStartEnd"
                  />
                  <YAxis yAxisId="left" stroke="#444" domain={['auto', 'auto']} tick={{ fill: '#666', fontSize: 10 }} />
                  <YAxis yAxisId="right" orientation="right" stroke="#444" domain={['auto', 'auto']} tick={{ fill: '#666', fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#000', borderColor: '#333', fontSize: '12px', fontFamily: 'monospace' }}
                    labelFormatter={(label) => `Step: ${label}`}
                  />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="loss"
                    stroke="#22d3ee"
                    fill="url(#colorLoss)"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="reward"
                    stroke="#facc15"
                    strokeWidth={1.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <defs>
                    <linearGradient id="colorLoss" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.1} />
                      <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-gradient-to-br from-[#111113] to-[#0a0a0c] border border-white/10 rounded-lg p-4 flex flex-col shadow-lg">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xs font-mono text-gray-400 uppercase">Epsilon Drift</h3>
              <div className="text-[10px] font-mono text-purple-400">EXHAUSTION</div>
            </div>
            <div className="flex-1 w-full min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={logs}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                  <XAxis dataKey="step" hide />
                  <YAxis domain={['auto', 'auto']} stroke="#444" tick={{ fill: '#666', fontSize: 10 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#000', borderColor: '#333', fontSize: '12px' }} />
                  <Line
                    type="stepAfter"
                    dataKey="epsilon"
                    stroke="#a855f7"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-80">
          <div className="lg:col-span-2">
            <ManifoldLattice
              activeDomain={latest?.domain || ""}
              epsilon={latest?.epsilon || 0}
              loss={latest?.loss || 0}
              thinkingDepth={latest?.thinking_depth || 0}
            />
          </div>
          <div>
            <PillarsTile log={latest} />
          </div>
        </div>

        <div className="bg-gradient-to-br from-[#0f0f11] to-[#0a0a0c] border border-white/10 rounded-lg flex flex-col overflow-hidden h-64 font-mono text-xs shadow-lg">
          <div className="flex items-center justify-between px-4 py-2 bg-[#1a1a1d] border-b border-white/10">
            <div className="flex items-center space-x-2">
              <Server className="w-3 h-3 text-gray-500" />
              <span className="text-gray-400">
                {dataMode === 'LIVE_URL' ? 'Training Stream' : 'Local Log'}
              </span>
            </div>
            {isPolling && <Loader2 className="w-3 h-3 text-cyan-500 animate-spin" />}
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-1 font-mono">
            {logs.length === 0 && (
              <div className="text-gray-600 italic text-center mt-10">
                WAITING FOR SIGNAL...<br />
                Connecting to data source<br />
                <code className="text-cyan-500/50">humanaiconvention/ctm-monitor</code>
              </div>
            )}
            {logs.slice().reverse().slice(0, 50).map((log, i) => (
              <div key={log.step} className={`flex space-x-3 ${i === 0 && isPolling ? 'opacity-100' : 'opacity-70'}`}>
                <span className="text-gray-600">[{log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : "00:00:00"}]</span>
                <span className="text-cyan-600">STEP {log.step}</span>
                <span className="text-purple-400">[{log.domain}]</span>
                <span className="text-gray-400">
                  Loss: <span className="text-gray-300">{log.loss.toFixed(4)}</span>
                </span>
                <span className="text-gray-500">|</span>
                <span className="text-gray-400">
                  Rew: <span className={log.reward > 0 ? "text-green-400" : "text-red-400"}>{log.reward.toFixed(3)}</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="text-center text-[10px] text-gray-600 font-mono mt-4 pb-2 border-t border-white/5 pt-4">
          HumanAI Convention | Examiner Research Group | <a href="https://humanaiconvention.com" className="text-cyan-500 hover:text-cyan-400 transition">humanaiconvention.com</a>
        </div>
      </main>
    </div>
  );
};

const root = createRoot(document.getElementById('root'));
root.render(<App />);
