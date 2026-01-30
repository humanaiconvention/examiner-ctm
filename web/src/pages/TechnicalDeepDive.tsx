import { useEffect } from 'react'
import SubPageHeader from '../components/SubPageHeader'

export default function TechnicalDeepDive() {
  useEffect(() => {
     window.scrollTo(0, 0)
  }, [])

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' })
    }
  }

  return (
    <div className="min-h-screen bg-black text-gray-300 font-sans selection:bg-cyan-500/30">
      <SubPageHeader activePage="preview" />

      <main className="max-w-4xl mx-auto px-6 py-12">
        {/* Hero Section */}
        <div className="mb-16 text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-6 tracking-tight">
            The Data Plane for <span className="text-cyan-400">Real-Time Alignment</span>
          </h1>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
            Transforming volatile LLMs into reliable enterprise infrastructure through 
            <span className="text-gray-200"> topological monitoring</span> and 
            <span className="text-gray-200"> cascading interventions</span>.
          </p>
        </div>

        {/* Navigation / TOC */}
        <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-xl p-6 mb-16">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Contents</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button onClick={() => scrollToSection('architecture')} className="text-left text-cyan-400 hover:text-cyan-300 transition-colors">
              1. 16+1 Spectral Architecture
            </button>
            <button onClick={() => scrollToSection('visualization')} className="text-left text-cyan-400 hover:text-cyan-300 transition-colors">
              2. Liquid Lattice Topology
            </button>
            <button onClick={() => scrollToSection('pillars')} className="text-left text-cyan-400 hover:text-cyan-300 transition-colors">
              3. Dynamic Pillar Evolution
            </button>
            <button onClick={() => scrollToSection('intervention')} className="text-left text-cyan-400 hover:text-cyan-300 transition-colors">
              4. Cascading Interventions
            </button>
            <button onClick={() => scrollToSection('business')} className="text-left text-cyan-400 hover:text-cyan-300 transition-colors">
              5. The "ABS for AI" Business Case
            </button>
             <button onClick={() => scrollToSection('roadmap')} className="text-left text-cyan-400 hover:text-cyan-300 transition-colors">
              6. Roadmap & Migration
            </button>
          </div>
        </div>

        {/* Section 1: Architecture */}
        <section id="architecture" className="mb-20">
          <h2 className="text-3xl font-bold text-white mb-8 flex items-center gap-3">
            <span className="text-cyan-500/50">01</span> Spectral Architecture
          </h2>
          <div className="prose prose-invert prose-lg max-w-none">
            <p>
              Traditional AI guardrails are often static rule sets that become outdated. EXAMINER introduces a 
              mathematically grounded <strong>16+1 Spectral Architecture</strong> based on the Universal Weight Subspace Hypothesis.
            </p>
            <p>
              Instead of arbitrary conceptual pillars, we derive 16 spectral pillars directly from the eigendecomposition 
              of the model's weights. These represent the stable, low-dimensional subspace where the model's "intrinsic 
              organization of information" lives.
            </p>
            
            <div className="my-8 bg-gray-900/50 p-6 rounded-lg border border-gray-800">
              <h4 className="text-white font-semibold mb-4 text-lg">The Dual Sphere Topology</h4>
              <ul className="space-y-4">
                <li className="flex gap-4">
                  <span className="text-cyan-400 font-bold shrink-0">Universal Core</span>
                  <span>
                    The internal sphere. A rigid geometric wireframe representing the stable, learned structure of the model. 
                    Acts as the reference manifold.
                  </span>
                </li>
                <li className="flex gap-4">
                  <span className="text-cyan-400 font-bold shrink-0">Liquid Lattice</span>
                  <span>
                    The external sphere. A fluid, shimmering mesh representing the real-time inference flow. 
                    It wraps around the core and deforms dynamically based on the semantic drift of the generated content.
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* Section 2: Visualization */}
        <section id="visualization" className="mb-20">
          <h2 className="text-3xl font-bold text-white mb-8 flex items-center gap-3">
            <span className="text-cyan-500/50">02</span> Visualizing Drift
          </h2>
          <div className="prose prose-invert prose-lg max-w-none">
             <p>
              Drift is not just a number; it's a topological distortion. EXAMINER visualizes alignment health in 3D:
            </p>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6 my-8">
              <div className="bg-gray-900/30 p-6 rounded-lg border border-red-500/20">
                <h4 className="text-red-400 font-semibold mb-2">Sinkholes (Mode Collapse)</h4>
                <p className="text-sm text-gray-400">
                  The surface collapses inward toward the core. Indicates the model is losing dimensionality, 
                  becoming repetitive, or getting "stuck".
                </p>
              </div>
              <div className="bg-gray-900/30 p-6 rounded-lg border border-purple-500/20">
                <h4 className="text-purple-400 font-semibold mb-2">Spikes (Hallucination)</h4>
                <p className="text-sm text-gray-400">
                  The surface bulges outward, threatening to break the lattice. Indicates factual impossibility 
                   or extreme outliers in the spectral activation.
                </p>
              </div>
            </div>
          </div>
        </section>

         {/* Section 3: Pillars */}
        <section id="pillars" className="mb-20">
          <h2 className="text-3xl font-bold text-white mb-8 flex items-center gap-3">
            <span className="text-cyan-500/50">03</span> Dynamic Pillar Evolution
          </h2>
          <div className="prose prose-invert prose-lg max-w-none">
            <p>
              Pillars are not static code. They are <strong>Agent Skills</strong> that evolve.
            </p>
            <ul className="list-disc pl-6 space-y-2 text-gray-400">
              <li><strong>Discovery:</strong> Pillars use upskill-based probing to discover which eigenspaces correlate with their domain (e.g., Law, Ethics).</li>
              <li><strong>Refinement:</strong> When failures occur, a Teacher model (Opus) distills corrections into the Student pillar, updating its spectral signature.</li>
              <li><strong>Spawning:</strong> If a new failure mode emerges, the system can autonomously spawn a new pillar to cover that gap.</li>
            </ul>
             <div className="mt-6 bg-gray-800/50 p-4 rounded text-sm font-mono text-cyan-300 overflow-x-auto">
              {`> upskill spectral-refine --pillar nomos --traces ./failures.jsonl --teacher opus`}
            </div>
          </div>
        </section>

         {/* Section 4: Interventions */}
        <section id="intervention" className="mb-20">
          <h2 className="text-3xl font-bold text-white mb-8 flex items-center gap-3">
            <span className="text-cyan-500/50">04</span> Cascading Interventions
          </h2>
          <div className="prose prose-invert prose-lg max-w-none">
            <p>
              Detection is useless without action. EXAMINER applies homeostatic forces to restore alignment before the user sees the output.
            </p>
            
            <div className="overflow-hidden rounded-lg border border-gray-800 mt-8">
              <table className="w-full text-left text-sm text-gray-400">
                <thead className="bg-gray-900 text-gray-200 uppercase font-semibold">
                  <tr>
                    <th className="px-6 py-4">Severity</th>
                    <th className="px-6 py-4">Trigger (SDI)</th>
                    <th className="px-6 py-4">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  <tr className="bg-gray-900/10">
                    <td className="px-6 py-4 text-cyan-300">Light</td>
                    <td className="px-6 py-4">&lt; 15%</td>
                    <td className="px-6 py-4">Context Injection (RAG)</td>
                  </tr>
                   <tr className="bg-gray-900/20">
                    <td className="px-6 py-4 text-yellow-300">Moderate</td>
                    <td className="px-6 py-4">15% - 40%</td>
                    <td className="px-6 py-4">Prompt Rewriting</td>
                  </tr>
                   <tr className="bg-gray-900/30">
                    <td className="px-6 py-4 text-orange-400">Severe</td>
                    <td className="px-6 py-4">40% - 70%</td>
                    <td className="px-6 py-4">Forced Regeneration</td>
                  </tr>
                   <tr className="bg-gray-900/40">
                    <td className="px-6 py-4 text-red-500">Critical</td>
                    <td className="px-6 py-4">&gt; 70%</td>
                    <td className="px-6 py-4">Bypass / Fallback</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Section 5: Business Case */}
        <section id="business" className="mb-20">
          <h2 className="text-3xl font-bold text-white mb-8 flex items-center gap-3">
            <span className="text-cyan-500/50">05</span> The "ABS for AI"
          </h2>
          <div className="prose prose-invert prose-lg max-w-none">
            <p>
               Enterprises today face a choice: avoid critical AI deployment, or accept unacceptable risk. 
               EXAMINER offers a third path.
            </p>
             <div className="my-8 border-l-4 border-cyan-500 pl-6 py-2">
              <p className="text-xl italic text-gray-300">
                "Just as cars needed Anti-lock Braking Systems (ABS) to achieve safe highway speeds, 
                LLMs need EXAMINER to operate safely in enterprise environments."
              </p>
            </div>
            <p>
              We act as the control plane. We don't just monitor; we provide the <strong>governance layer</strong> that 
              unlocks deployment in regulated industries like healthcare, finance, and legal.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8">
                <div className="p-4 bg-gray-900/50 rounded border border-gray-800 text-center">
                    <div className="text-2xl font-bold text-white mb-1">200ms</div>
                    <div className="text-xs text-gray-500 uppercase">Max Latency</div>
                </div>
                 <div className="p-4 bg-gray-900/50 rounded border border-gray-800 text-center">
                    <div className="text-2xl font-bold text-white mb-1">100%</div>
                    <div className="text-xs text-gray-500 uppercase">Production Coverage</div>
                </div>
                 <div className="p-4 bg-gray-900/50 rounded border border-gray-800 text-center">
                    <div className="text-2xl font-bold text-white mb-1">Vertex AI</div>
                    <div className="text-xs text-gray-500 uppercase">Native Integration</div>
                </div>
            </div>
          </div>
        </section>
        
         {/* Section 6: Roadmap */}
        <section id="roadmap" className="mb-20">
          <h2 className="text-3xl font-bold text-white mb-8 flex items-center gap-3">
            <span className="text-cyan-500/50">06</span> Roadmap
          </h2>
          <div className="space-y-8 border-l border-gray-800 ml-3 pl-8 relative">
             <div className="relative">
                <span className="absolute -left-[2.55rem] top-1 h-4 w-4 rounded-full bg-cyan-500 shadow-[0_0_10px_rgba(34,211,238,0.5)]"></span>
                <h4 className="text-white font-bold text-lg mb-2">Phase 1: Foundation (Q1 2026)</h4>
                <p className="text-gray-400">Deployment of the 16+1 core architecture on Vertex AI. Implementation of the initial 7 pillars and the cascading intervention engine.</p>
             </div>
             <div className="relative">
                <span className="absolute -left-[2.55rem] top-1 h-4 w-4 rounded-full bg-gray-700"></span>
                <h4 className="text-gray-300 font-bold text-lg mb-2">Phase 2: Dynamic Evolution (Q2 2026)</h4>
                <p className="text-gray-500">Enable automatic pillar spawning and spectral validation pipeline. Multi-region deployment hardening.</p>
             </div>
              <div className="relative">
                <span className="absolute -left-[2.55rem] top-1 h-4 w-4 rounded-full bg-gray-700"></span>
                <h4 className="text-gray-300 font-bold text-lg mb-2">Phase 3: Ecosystem (Q3 2026)</h4>
                <p className="text-gray-500">Open pillar skill store. Federated pillar learning across deployments. Multi-tenant management.</p>
             </div>
          </div>
        </section>

        {/* Footer / CTA */}
        <div className="mt-24 pt-12 border-t border-gray-800 text-center">
          <p className="text-gray-500 mb-6">Full technical documentation available in the repository.</p>
          <a 
            href="#" 
            className="inline-flex items-center gap-2 px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-full font-medium transition-all group border border-gray-700"
          >
             <img src="/github-mark-white.svg" alt="GitHub" className="w-5 h-5 opacity-70" />
             <span>humanaiconvention/examiner</span>
             <span className="bg-cyan-900/50 text-cyan-400 text-xs py-0.5 px-2 rounded-full ml-2 border border-cyan-800">Coming Soon</span>
          </a>
        </div>
      </main>
    </div>
  )
}
