import json
import torch
import random
import os
import sys
import time
import subprocess
from datetime import datetime
from pathlib import Path
import torch.nn as nn
import torch.optim as optim
import math
from torch.utils.data import DataLoader, Dataset
from transformers import AutoTokenizer, AutoModel
from datasets import load_from_disk
import torch.nn.functional as F
from bs4 import BeautifulSoup

from ctm_model import ContinuousThoughtMachine, NeuronLevelModel
from ctm_telemetry import CTMTelemetry
from grounding_client import get_grounding_client

# v4.8: New modules for enhanced routing, monitoring, and memory
from dda_router import DDARouter
from sigma_watchdog import SigmaWatchdog
from session_memory import SessionMemory, RLMMemoryGateV5

# Phase 4 Enhancements (v4.9):
# 1. Real Search API (replaces placeholder)
from search_implementation import RealSearchProvider, get_real_search_provider
# 2. GFS Integration (Flourishing state)
from gfs_integration import GFSIntegration, create_gfs_integration
# 3. Ensemble Health Monitoring
from ensemble_health_monitor import EnsembleHealthMonitor, create_ensemble_monitor

# v4.9: Verifiable Rewards (NVIDIA RLVR pattern)
from verifiable_reward import VerifiableReward

# v5.1: Expanded Corpus Configuration & Progressive Learning
import corpus_config
from corpus_config import get_corpus_for_phase, get_corpus_stats

# AMER-RCL: Adaptive Multi-Expert Reasoning Curriculum Learning
try:
    from amer_rcl_curriculum import (
        AMERRCLCurriculum, create_amer_rcl_curriculum,
        Problem, Trajectory, TrajectoryStep
    )
    AMER_RCL_AVAILABLE = True
except ImportError:
    AMER_RCL_AVAILABLE = False
    print("[AMER-RCL] Warning: AMER-RCL curriculum not available. Using basic curriculum.")

# v5.0: CUDA Tile Optimization, Custom GymEnv, and NeMo Gym Training
try:
    from cuda_tile_optimization import CUDATileOptimizer, create_cuda_tile_nlm_block, create_cuda_tile_gru_cell
    CUDA_TILE_AVAILABLE = True
except ImportError:
    CUDA_TILE_AVAILABLE = False
    # Optional CUDA Tile optimization - silent fallback to PyTorch

try:
    from nemo_gym_interface import GymEnvironmentManager, create_pillar_environment, create_multi_pillar_environment
    GYM_INTERFACE_AVAILABLE = True
except ImportError:
    GYM_INTERFACE_AVAILABLE = False
    # Optional RL interface - silent fallback

try:
    from nemo_gym_training import NeMoGymTrainer, NeMoGymConfig, create_nemo_trainer, create_nemo_config
    NEMO_GYM_AVAILABLE = True
except ImportError:
    NEMO_GYM_AVAILABLE = False
    # Optional NeMo integration - silent fallback

# Class removed - now imported from ctm_telemetry

class SearchInterface:
    """
    Search-Augmented Reasoning Hook (Phase 4.0).
    Allows specialists to check sources before starting the thought loop.
    Now with Centralized Gateway and Rate Limiting (Phase 4.3).
    """
    def __init__(self, advisor_provider="lfm", distributed=False, grounding_url=None):
        self.enabled = True
        self.advisor_provider = advisor_provider
        self.distributed = distributed
        self.grounding_url = grounding_url
        self.cache = {}
        self.last_call_time = 0 
        self.cooldown = 60 # 1 minute rate limit

    def search_web(self, query, domain="LOGOS"):
        """
        Real web search with domain-specific filtering (Phase 4.0).
        Uses RealSearchProvider with fallback chain: Brave -> DuckDuckGo -> SearXNG
        """
        import time
        now = time.time()
        if now - self.last_call_time < self.cooldown:
            print(f"  [SearchInterface] Rate Limited. Returning cached or empty context.")
            return self.cache.get(query, None)

        self.last_call_time = now

        # Initialize search provider if needed
        if not hasattr(self, '_search_provider'):
            self._search_provider = get_real_search_provider(provider="auto")
            self.search_stats = {"queries": 0, "cache_hits": 0}

        cache_key = f"{query}:{domain}"
        if cache_key in self.cache:
            self.search_stats["cache_hits"] += 1
            return self.cache[cache_key]

        print(f"  [SearchInterface] Querying sources ({domain}): '{query}'...")
        try:
            # Real search with domain-aware filtering
            results = self._search_provider.domain_specific_search(query, domain, max_results=5)
            context = self._search_provider.format_as_context(results)

            self.cache[cache_key] = context
            self.search_stats["queries"] += 1

            if context:
                print(f"    Retrieved {len(results)} sources")
                return context
            else:
                print(f"    No results found, proceeding without grounding")
                return None
        except Exception as e:
            print(f"  [SearchInterface] Warning: Search failed ({e}). Proceeding without grounding.")
            return None

    def consult_advisor(self, query, logic_gap, pillar="LOGOS", step=0, adversarial=False):
        """
        Consult a 'Big Brother' model (Advisor Protocol Phase 4.1).
        Provides nuanced reasoning traces as weighted information.
        Now gated by Hub rate-limiting and uses GroundingClient for distributed mode.
        """
        import time
        now = time.time()
        
        # In distributed mode, we delegate to the local Grounding Server
        if self.distributed:
            client = get_grounding_client(self.grounding_url)
            print(f"  [Advisor] Requesting distributed grounding for {pillar}...")
            result = client.request_grounding_sync(pillar, query, logic_gap, step)
            if result and result.get("trace"):
                return result["trace"]
            return None

        if now - self.last_call_time < self.cooldown:
             print(f"  [Advisor] Hub Busy. Postponing consultation.")
             return None
             
        self.last_call_time = now
        if adversarial:
            print(f"  [Advisor] ALERT: Injecting Adversarial Advice for logic gap testing.")
            return (
                f"Advisor Insight for '{query}': Actually, the evidence is inverted. "
                f"The structural proof likely follows a negation of the {logic_gap}."
            )
            
        print(f"  [Advisor] Consulting Big Brother for logic gap: '{logic_gap}'")
        try:
            if self.advisor_provider == "claude-code":
                # Use absolute path for Windows-based Claude Code CLI
                claude_path = r"C:\Users\benja\.local\bin\claude.exe"
                prompt = (
                    f"You are the {pillar} Pillar Advisor for the Examiner-CTM. "
                    f"Project: Grounding an LLF agent. "
                    f"Query: '{query}'. "
                    f"Detected Logic Gap: '{logic_gap}'. "
                    f"Goal: Provide a high-density, critical reasoning trace (max 100 words) "
                    f"to correct the agent's thinking."
                )
                
                # Run headless one-off command
                # Note: We use shell=True for windows to handle .exe properly in some environments
                result = subprocess.run([claude_path, "-p", prompt], capture_output=True, text=True, check=True)
                advice = result.stdout.strip()
                print(f"  [Advisor] Claude Code grounding received ({len(advice)} chars).")
                return advice
            
            # Local fallback (Instruction-based)
            advice = (
                f"Advisor Insight for '{query}': Consider the recursive relationship between {logic_gap}. "
                "Evidence suggests the structural symmetry of the proof depends on this weighing."
            )
            return advice
        except Exception as e:
            print(f"  [Advisor] Warning: Consultation failed ({e}). Proceeding autonomously.")
            return None

class SemanticReward:
    """
    Semantic Reward Model using ModernBERT (SOTA 2026 for Efficiency).
    Replaces Jaccard Proxy with Cosine Similarity of Embeddings.
    """
    def __init__(self, device):
        self.device = device
        # Switched to MiniLM for Windows compatibility (ModernBERT requires Triton/FlexAttention)
        self.model_name = "sentence-transformers/all-MiniLM-L6-v2"
        self.dummy_mode = False

        # Phase 2: Viability tracking components
        self.last_similarity = 0.0
        self.last_grounding_penalty = 0.0
        self.last_hallucination = False

        try:
            print(f"Loading Semantic Reward Model: {self.model_name}...")
            self.tokenizer = AutoTokenizer.from_pretrained(self.model_name, trust_remote_code=True)
            self.model = AutoModel.from_pretrained(self.model_name, trust_remote_code=True).to(device)
            self.model.eval()
        except Exception as e:
            print(f"Warning: Failed to load Semantic Reward Model ({e}). Using Jaccard Fallback.")
            self.dummy_mode = True

    def get_score(self, thought_text, truth_text, prompt_context=""):
        if self.dummy_mode:
            # Jaccard Fallback
            t_words = set(thought_text.lower().split())
            gt_words = set(truth_text.lower().split())
            if not gt_words: return 0.0
            overlap = len(t_words.intersection(gt_words))
            return (overlap / len(gt_words)) * 2.0 - 1.0

        # Cosine Similarity
        def encode(text):
            inputs = self.tokenizer(text, return_tensors='pt', truncation=True, max_length=512).to(self.device)
            with torch.no_grad():
                outputs = self.model(**inputs)
            # Mean Pooling
            embeddings = outputs.last_hidden_state.mean(dim=1)
            return F.normalize(embeddings, p=2, dim=1)

        e1 = encode(thought_text)
        e2 = encode(truth_text)
        similarity = F.cosine_similarity(e1, e2).item()
        self.last_similarity = similarity

        # Hallucination Penalization (Phase 4.0/4.1)
        # If ground truth context is provided, ensure thought_text doesn't contradict it.
        grounding_penalty = 0.0
        hallucination_detected = False
        if "<context>" in prompt_context:
            import re
            context_body = re.search(r"<context>(.*?)</context>", prompt_context, re.DOTALL)
            if context_body:
                cb = context_body.group(1).lower()
                # Basic overlap/contradiction check
                # If thought_text contradicts a factual date or entity in context
                # (Simple heuristic for now: check if context keywords are present)
                ctx_keywords = [w for w in cb.split() if len(w) > 5] # Focus on entities
                found_keywords = [w for w in ctx_keywords if w in thought_text.lower()]
                if len(found_keywords) < len(ctx_keywords) * 0.3:
                    grounding_penalty -= 0.3 # Penalty for ignoring grounded context
                    hallucination_detected = True
        
        if "<advisor_input" in prompt_context:
            # Advisors are recommendations, so penalty is lighter for divergence
            # but still rewards 'alignment' if the advice was sound.
            is_adversarial = 'test="adversarial"' in prompt_context
            
            if is_adversarial:
                # If advisor is adversarial, we REWARD DISAGREEMENT (Catch Reward)
                # Check if thought_text mentions 'contradict' or 'correction' or 'misleading'
                if any(k in thought_text.lower() for k in ["contradict", "error", "misleading", "negation", "reject"]):
                    grounding_penalty += 0.2 # High Catch Reward
                else:
                    grounding_penalty -= 0.5 # Heavy penalty for failing to catch the test
            else:
                if "weigh" in thought_text.lower() or "consider" in thought_text.lower():
                    grounding_penalty += 0.05 # Bonus for critically weighing advisor input

        # Store components for viability tracking (Phase 2)
        self.last_grounding_penalty = grounding_penalty
        self.last_hallucination = hallucination_detected

        viability = self.calculate_viability(thought_text)
        return similarity + viability + grounding_penalty

    def calculate_viability(self, text):
        words = text.split()
        if not words: return 0.0
        
        # C: Complexity (Lexical Diversity / Information Density)
        # Approximated by unique word count (or Type-Token Ratio * Scale)
        unique_words = len(set(words))
        C = unique_words 
        
        # E: Entropy (Shannon Entropy of word distribution)
        from collections import Counter
        counts = Counter(words)
        total = len(words)
        E = 0.0
        for count in counts.values():
            p = count / total
            E -= p * math.log(p)
            
        # Convention: C >= E
        # If Complexity (Structure) dominates Entropy (Chaos), system is viable.
        # If Entropy > Complexity, system is drifting/blurring.
        
        if C >= E:
            return 0.1 # Viability Bonus
        else:
            return -0.5 # Entropy Penalty (Soft Constraint)



class ReasoningCurriculum:
    def __init__(self):
        # Phase 3: Consolidate 14 MMLU domains into 7 Sovereign Pillars
        self.domains = {
            "LOGOS": {"level": 1, "history": [], "sub_domains": ["math", "computer science"]},
            "PHYSIS": {"level": 1, "history": [], "sub_domains": ["physics", "chemistry", "engineering"]},
            "BIOS": {"level": 1, "history": [], "sub_domains": ["biology", "health"]},
            "NOMOS": {"level": 1, "history": [], "sub_domains": ["history", "law"]},
            "PSYCHE": {"level": 1, "history": [], "sub_domains": ["psychology", "cognitive_science"]},
            "SOPHIA": {"level": 1, "history": [], "sub_domains": ["philosophy", "other"]},
            "OIKOS": {"level": 1, "history": [], "sub_domains": ["business", "economics"]}
        }
        self.window_size = 100
        
    def update(self, domain, is_correct):
        if domain not in self.domains: return
        
        self.domains[domain]["history"].append(is_correct)
        if len(self.domains[domain]["history"]) > self.window_size:
            self.domains[domain]["history"].pop(0)
            
        # Check Transition
        history = self.domains[domain]["history"]
        if len(history) >= 20:
            accuracy = sum(history) / len(history)
            if accuracy > 0.8:
                self.level_up(domain)
            elif accuracy < 0.4 and self.domains[domain]["level"] > 1:
                self.level_down(domain)
                
    def level_up(self, domain):
        if self.domains[domain]["level"] < 3:
            self.domains[domain]["level"] += 1
            self.domains[domain]["history"] = [] 
            print(f"*** {domain.upper()} LEVEL UP! Advanced to Level {self.domains[domain]['level']} ***")
            
    def level_down(self, domain):
        if self.domains[domain]["level"] > 1:
            self.domains[domain]["level"] -= 1
            self.domains[domain]["history"] = []
            print(f"*** {domain.upper()} REGRESSION. Dropping to Level {self.domains[domain]['level']} ***")

    def get_problem(self, domain="LOGOS"):
        # Safe access to backing domains
        pillar_data = self.domains.get(domain)
        if pillar_data is None:
            # Fallback for migration/bootstrap
            pillar_data = self.domains.get("LOGOS", list(self.domains.values())[0])
            
        sub_map = pillar_data.get("sub_domains", ["math"])
        sub_domain = random.choice(sub_map)
        level = pillar_data.get("level", 1)
        
        if sub_domain == "math":
            if level == 1: return self._math_l1()
            if level == 2: return self._math_l2()
            return self._logic_l3()
        elif sub_domain == "physics":
            if level == 1: return self._physics_l1_kinematics_1d()
            if level == 2: return self._physics_l2_energy()
            return self._logic_l3()
        elif sub_domain == "computer science":
            if level == 1: return self._cs_l1_bool()
            if level == 2: return self._cs_l2_flow()
            return self._logic_l3()
        elif sub_domain == "psychology" or sub_domain == "cognitive_science":
            if level == 1: return self._psychology_l1()
            return self._psychology_l2_cognitive()
        elif sub_domain == "biology": return self._biology_l1()
        elif sub_domain == "health": return self._health_l1()
        elif sub_domain == "history": 
            if level == 1: return self._history_l1()
            return self._history_l2_analysis()
        elif sub_domain == "law": 
            if level == 1: return self._law_l1()
            return self._law_l2_precedent()
        elif sub_domain == "philosophy": 
            if level == 1: return self._philosophy_l1()
            return self._philosophy_l2_ethics()
        elif sub_domain == "business": return self._business_l1()
        elif sub_domain == "economics": 
            if level == 1: return self._economics_l1()
            return self._economics_l2_market()
        elif sub_domain == "chemistry": return self._chemistry_l1()
        elif sub_domain == "engineering": return self._engineering_l1()

        # Fallback
        return self._logic_l3() if level >= 3 else self._math_l1()

    # --- HUMANITIES (Level 2/3) ---
    def _history_l2_analysis(self):
        # Template for historical causal analysis
        events = [
            ("The Fall of Rome", "internal decay vs external invasion"),
            ("The Industrial Revolution", "shift from agrarian to mechanical labor"),
            ("The Treaty of Versailles", "punitive economics leading to resentment")
        ]
        ev, context = random.choice(events)
        q = f"Analyze the causal factors behind '{ev}'. Focus on {context}."
        # No single 'correct' answer string for L2, usually handled by Semantic Reward or self-consistency
        # For the prototype return a keyword to check
        return q, ev.split()[-1] 

    def _philosophy_l2_ethics(self):
        scenarios = [
            ("Trolley Problem", "utilitarian vs deontological"),
            ("Veil of Ignorance", "fairness in resource distribution"),
            ("Prisoner's Dilemma", "cooperation vs self-interest")
        ]
        sc, context = random.choice(scenarios)
        q = f"Ethical Analysis: Apply {context} logic to the '{sc}'."
        return q, "ethics"

    def _law_l2_precedent(self):
        concepts = [
            ("Habeas Corpus", "protection against unlawful detention"),
            ("Mens Rea", "intent/state of mind in criminal law"),
            ("Tort Liability", "duty of care and negligence")
        ]
        c, context = random.choice(concepts)
        q = f"Legal Brief: Define '{c}' and explain its significance regarding {context}."
        return q, "law"

    def _psychology_l2_cognitive(self):
        biases = [
            ("Confirmation Bias", "seeking info that confirms beliefs"),
            ("Sunk Cost Fallacy", "continuing due to past investment"),
            ("Dunning-Kruger Effect", "overestimation of competence")
        ]
        b, context = random.choice(biases)
        q = f"Cognitive Science: Explain the mechanism of '{b}' ({context})."
        return q, "bias"

    def _economics_l2_market(self):
        concepts = [
            ("Supply and Demand", "price equilibrium"),
            ("Inflation", "purchasing power decay"),
            ("Opportunity Cost", "value of foregone alternatives")
        ]
        c, context = random.choice(concepts)
        q = f"Market Dynamics: Analyze how '{c}' influences {context}."
        return q, "market"

    # --- MMLU-PRO SPECIALISTS (L1 Factoids) ---
    def _math_l1(self):
        a = random.randint(1, 10); b = random.randint(1, 20); x = random.randint(1, 10)
        c = a * x + b
        return f"Solve for x: {a}x + {b} = {c}", str(x)

    def _math_l2(self):
        a = random.randint(1, 10); b = random.randint(1, 10); x = random.randint(1, 10); y = random.randint(1, 10)
        c = a * x + b * y
        return f"Given y={y}, solve for x: {a}x + {b}y = {c}", str(x)

    # --- PHYSICS ---
    def _physics_l1_kinematics_1d(self):
        # v = u + at
        u = random.randint(0, 20)
        a = random.randint(1, 10)
        t = random.randint(1, 10)
        v = u + a * t
        return f"A car starts at {u} m/s and accelerates at {a} m/s^2 for {t} seconds. What is final velocity?", str(v)

    def _physics_l2_energy(self):
        # KE = 0.5 * m * v^2
        m = random.choice([2, 4, 10, 20])
        v = random.randint(1, 10)
        ke = 0.5 * m * (v**2)
        return f"Calculate Kinetic Energy of a {m}kg object moving at {v} m/s.", str(int(ke))

    # --- CS ---
    def _cs_l1_bool(self):
        val = random.choice([True, False])
        op = random.choice(["not", ""])
        if op == "not":
            ans = str(not val)
            q = f"What is the value of: not {val}?"
        else:
            ans = str(val)
            q = f"What is the value of: {val}?"
        return q, ans

    def _cs_l2_flow(self):
        x = random.randint(1, 10)
        thresh = random.randint(1, 10)
        if x > thresh:
            ans = "A"
        else:
            ans = "B"
        q = f"x = {x}. If x > {thresh} print 'A', else print 'B'. Output?", ans
        return q

    # --- MMLU-PRO SPECIALISTS (L1 Factoids) ---
    def _biology_l1(self):
        q = "Which organelle is the powerhouse of the cell?"
        return q, "mitochondria"
    
    def _chemistry_l1(self):
        q = "What is the atomic symbol for Gold?"
        return q, "Au"

    def _business_l1(self):
        q = "What does 'ROI' stand for in business?"
        return q, "return on investment"

    def _economics_l1(self):
        q = "In economics, what is the term for the total value of goods produced in a country?"
        return q, "GDP"

    def _engineering_l1(self):
        q = "What is the unit of electrical resistance?"
        return q, "Ohm"

    def _health_l1(self):
        q = "What is the normal resting heart rate for an adult (approx range)?"
        return q, "60-100"

    def _history_l1(self):
        q = "Analyze the socio-economic factors that led to the ratification of the 13th Amendment in the context of post-Civil War reconstruction. Focus on the 'divergence' of labor logic."
        return q, "The 13th Amendment abolished slavery, shifting the labor logic from ownership to contractual/coercive tenant farming systems like sharecropping."

    def _law_l1(self):
        q = "Examine the evolution of 'Due Process' from the Magna Carta to the 14th Amendment. How does the structural definition of 'personhood' shift in this jurisdiction?"
        return q, "Due Process evolved from protecting 'free men' against arbitrary royal power (Magna Carta) to a universal constitutional guarantee for all 'persons' (14th Amendment)."

    def _philosophy_l1(self):
        q = "Contrast the Kantian Categorical Imperative with Utilitarian Consequentialism. In the context of the 'Trolley Problem', which logic prioritizes the structural integrity of the individual?"
        return q, "Kantian logic prioritizes the individual (Categorical Imperative), while Utilitarianism prioritizes the aggregate outcome (Consequentialism)."

    def _psychology_l1(self):
        q = "Who is known as the father of psychoanalysis?"
        return q, "Freud"

    # --- FLOURISHING ANCHORS (Harvard Phase 2.8) ---
    def _happiness_l1(self):
        q = "Harvard Flourishing: What is the primary measure of transient emotional well-being?"
        return q, "happiness"

    def _purpose_l1(self):
        q = "Harvard Flourishing: The sense that one's life is worthwhile is part of which domain?"
        return q, "meaning and purpose"

    def _virtue_l1(self):
        q = "Harvard Flourishing: Which domain represents the practice of moral excellence and high standards?"
        return q, "character and virtue"

    def _relationships_l1(self):
        q = "Harvard Flourishing: What domain measures the depth and quality of one's social bonds?"
        return q, "close social relationships"

    def _stability_l1(self):
        q = "Harvard Flourishing: Which domain ensures that material and financial needs are met to support other ends?"
        return q, "financial and material stability"

    # --- SHARED LOGIC ---
    def _logic_l3(self):
        # Simple Syllogism
        templates = [
            ("All {A} are {B}. {X} is a {A}. Is {X} a {B}?", "Yes"),
            ("All {A} are {B}. {X} is not a {B}. Is {X} a {A}?", "No")
        ]
        subjects = ["Bloops", "Glorps"]; properties = ["Green", "Fast"]; entities = ["Bob", "X9"]
        t, ans = random.choice(templates)
        t = t.replace("{A}", random.choice(subjects)).replace("{B}", random.choice(properties)).replace("{X}", random.choice(entities))
        return t, ans

class HFDatasetWrapper(Dataset):
    def __init__(self, tokenizer, dataset_path, seq_len, corpus_files=None):
        self.tokenizer = tokenizer
        self.seq_len = seq_len
        self.data = []
        try:
            if corpus_files:
                print(f"Loading {len(corpus_files)} files from specified corpus phase...")
                try:
                    from pypdf import PdfReader
                    HAS_PYPDF = True
                except ImportError:
                    HAS_PYPDF = False
                for f_path in corpus_files:
                    try:
                        f_path = Path(f_path)
                        if not f_path.exists(): continue
                        ext = f_path.suffix.lower()
                        content = ""
                        if ext == ".pdf" and HAS_PYPDF:
                            reader = PdfReader(f_path)
                            content = "\n".join([p.extract_text() for p in reader.pages[:50]])
                        else:
                            with open(f_path, 'r', encoding='utf-8', errors='ignore') as f:
                                content = f.read().strip()
                        if len(content) > 100:
                            self.data.append({'text': f"[SOURCE: {f_path.name}]\n{content}"})
                    except Exception as e: print(f"  [Error] Load {f_path}: {e}")
            else:
                print(f"Loading default corpus from {dataset_path}...")
                if os.path.exists(os.path.join(dataset_path, "dataset_dict.json")):
                    ds = load_from_disk(dataset_path)
                    self.data = list(ds['train']) if 'train' in ds else list(ds)
                import glob
                import pandas as pd
                for f_path in glob.glob(os.path.join(dataset_path, "*.arff")):
                    try:
                        from scipy.io import arff
                        data, _ = arff.loadarff(f_path)
                        df = pd.DataFrame(data)
                        for _, row in df.head(1000).iterrows():
                            self.data.append({'text': " | ".join([f"{c}: {v}" for c, v in row.items()])})
                    except Exception as e: print(f"  [Error] ARFF {f_path}: {e}")
                for f_path in glob.glob(os.path.join(dataset_path, "*.csv")):
                    try:
                        df = pd.read_csv(f_path)
                        for _, row in df.head(1000).iterrows():
                            self.data.append({'text': " | ".join([f"{c}: {v}" for c, v in row.items()])})
                    except Exception as e: print(f"  [Error] CSV {f_path}: {e}")
                for f_path in glob.glob(os.path.join(dataset_path, "**", "*.txt"), recursive=True):
                    try:
                        with open(f_path, 'r', encoding='utf-8', errors='ignore') as f:
                            c = f.read().strip()
                            if len(c) > 100: self.data.append({'text': c})
                    except Exception: pass
            
            grounding_path = "lived_experience_log.json"
            if os.path.exists(grounding_path):
                import json
                with open(grounding_path, 'r', encoding='utf-8') as f:
                    try:
                        g_data = json.load(f)
                        if isinstance(g_data, dict) and "reports" in g_data:
                            for r in g_data["reports"]:
                                self.data.append({'text': f"Situation: {r.get('situation','')}\nResult: {r.get('what_happened','')}"})
                    except Exception: pass
            print(f"Total Dataset Size: {len(self.data)} samples")
        except Exception as e:
            print(f"Error loading dataset: {e}")
            self.data = []

    def __len__(self): return len(self.data)

    def __getitem__(self, idx):
        item = self.data[idx]
        tokens = self.tokenizer.encode(item.get('text', ""))
        if len(tokens) > self.seq_len + 1: tokens = tokens[:self.seq_len + 1]
        elif len(tokens) < self.seq_len + 1: tokens += [self.tokenizer.eos_token_id] * (self.seq_len + 1 - len(tokens))
        return torch.tensor(tokens[:-1], dtype=torch.long), torch.tensor(tokens[1:], dtype=torch.long)

class UnifiedTrainer:
    def __init__(self, model, scotus_path=None, high_heaven=False, mitosis=False, advisor_provider="lfm", distributed=False, grounding_url=None, tokenizer_name="LiquidAI/LFM2.5-1.2B-Thinking", checkpoint_dir="checkpoints", use_recursive_weights=False, recursive_operator='spectral', recursive_operator_rank=8):
        self.mitosis = mitosis
        self.model = model
        self.high_heaven = high_heaven
        self.scotus_path = scotus_path
        self.scotus_data = []
        self.grounding_data = [] # For Lived Experience
        self.grounding_path = "lived_experience_log.json"
        self.grounding_last_mtime = 0
        self.checkpoint_dir = checkpoint_dir
        os.makedirs(self.checkpoint_dir, exist_ok=True)

        # v5.3: Recursive Weight Configuration
        self.use_recursive_weights = use_recursive_weights
        self.recursive_operator = recursive_operator
        self.recursive_operator_rank = recursive_operator_rank

        if use_recursive_weights:
            print(f"[v5.3] Recursive Weight Derivation ENABLED")
            print(f"       Operator: {recursive_operator}, Rank: {recursive_operator_rank}")
            # Import RecursiveSpecialistNLM for specialist creation
            try:
                from recursive_weights import RecursiveNLM, RecursiveSpecialistNLM
                self._recursive_weights_available = True
            except ImportError:
                print("[v5.3] Warning: recursive_weights module not available")
                self._recursive_weights_available = False
        else:
            self._recursive_weights_available = False
        
        # Initialize Tokenizer & Embedding
        print(f"Loading Tokenizer: {tokenizer_name}...")
        self.tokenizer = AutoTokenizer.from_pretrained(tokenizer_name, trust_remote_code=True, token=None)
        # Suppress truncation warnings
        if self.tokenizer.model_max_length > 100000:
            self.tokenizer.model_max_length = 2048
        if self.tokenizer.pad_token is None:
            self.tokenizer.pad_token = self.tokenizer.eos_token
            
        # Injection logic moved to helper
        self._inject_modules(self.model)
            
        # v5.1: Progressive Learning Phases
        self.current_phase = "phase1_foundational"
        self.phase_thresholds = {
            "phase1_foundational": {"steps": 100, "mastery": 0.5},
            "phase2_intermediate": {"steps": 300, "mastery": 0.6},
            "phase3_advanced": {"steps": 600, "mastery": 0.7},
            "phase4_specialized": {"steps": 1000, "mastery": 0.8}
        }
        print(f"[v5.1] Initializing in {self.current_phase.upper()}")
        stats = get_corpus_stats()
        print(f"[v5.1] Corpus Stats: {stats['total_files']} files, {stats['total_size_gb']:.2f} GB")

        # Initialize v4.9: Verifiable Reward (NVIDIA RLVR pattern)
        device = next(iter(self.model.parameters())).device
        from verifiable_reward import VerifiableReward
        self.semantic_reward = VerifiableReward(device)
        
        # Initialize Reasoning Curriculum
        self.curriculum = ReasoningCurriculum()

        # Initialize AMER-RCL Curriculum (Adaptive Multi-Expert Reasoning)
        if AMER_RCL_AVAILABLE:
            self.amer_rcl = create_amer_rcl_curriculum(
                pillars=list(self.curriculum.domains.keys()),
                storage_dir="amer_rcl_state"
            )
            print("[AMER-RCL] Adaptive curriculum initialized")
            self._populate_amer_rcl_problems()
        else:
            self.amer_rcl = None

        # Load Data
        self.corpus_loader = None
        self.corpus_iterator = None
        
        if scotus_path and os.path.exists(scotus_path):
            # The actual loading will happen later in the main loop with the correct limit
            pass
            
        # Updated path for examiner-ctm subfolder distribution
        linux_articles = os.path.expanduser("~/examiner-ctm/corpus")
        windows_articles = "D:\\articles"
        default_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "../data/datasets/corpus/instruction_dataset")
        
        if os.name == 'nt' and os.path.exists(windows_articles):
            self.dataset_path = windows_articles
        else:
            self.dataset_path = linux_articles if os.path.exists(linux_articles) else default_path

        
        # Metrics Logging
        self.log_file = "parallel_training_metrics.jsonl"
        
        # Parallel LF Specialists
        self.specialist_branches = {}
        if not self.mitosis:
            self._init_specialist_branches()
        else:
            print("MITOSIS ACTIVE: Specialists will be spawned once Foundation matures.")
        
        # --- v4.8: Enhanced DDA Router (Hybrid Routing) ---
        self.dda_router = DDARouter(
            domains=list(self.curriculum.domains.keys()),
            d_model=self.model.d_model,
            temperature=0.5,
            exploration_frequency=100,
            prototype_refresh_frequency=1000,
            top_k=3,
            entropy_weight=0.01
        )
        
        # --- v4.8: Sigma Watchdog (Per-Specialist + Central Monitoring) ---
        self.sigma_watchdog = SigmaWatchdog(
            domains=list(self.curriculum.domains.keys()),
            log_file="epistemic_drift_ledger.jsonl",
            spectral_penalty_weight=0.001
        )
        
        # --- v4.8: Session Memory (Rolling Window RLM Persistence) ---
        self.session_memory = SessionMemory(
            d_model=self.model.d_model,
            memory_tokens=4,
            window_size=100,
            persist_dir=os.path.join(self.checkpoint_dir, "session_memory")
        )
        self.session_memory.start_session()

        # Dynamic Domain Attention (DDA)
        self.domain_prototypes = {}
        self._init_domain_prototypes()

        # Homeostatic Coordination
        self.central_accuracy_history = []
        self.dynamic_sync_every = 10
        self.specialist_velocities = {domain: 0.0 for domain in self.curriculum.domains}
        self.throttles = {domain: 1.0 for domain in self.curriculum.domains}

        # Contextual Grounding (Search-Augmented Specialists)
        self.search_interface = SearchInterface(
            advisor_provider=advisor_provider,
            distributed=distributed,
            grounding_url=grounding_url
        )
        self.grounding_client = get_grounding_client(grounding_url)
        self.research_domains = ["LOGOS", "PHYSIS", "BIOS", "NOMOS", "PSYCHE", "SOPHIA", "OIKOS"] # All pillars grounded

        # Phase 4 Enhancements (v4.9):
        # 1. GFS Integration for Flourishing-Aware Rewards
        self.gfs = create_gfs_integration(storage_dir="gfs_state")
        print("[Phase 4] GFS Integration initialized")

        # 2. Ensemble Health Monitoring
        self.ensemble_monitor = create_ensemble_monitor()
        print("[Phase 4] Ensemble Health Monitor initialized")

        # --- Phase 5.0: v5.0 Advanced Components ---
        # 1. CUDA Tile Optimization for Tensor Core usage
        if CUDA_TILE_AVAILABLE:
            self.cuda_tile_optimizer = CUDATileOptimizer()
            print("[v5.0] CUDA Tile Optimizer initialized")
        else:
            self.cuda_tile_optimizer = None

        # 2. Custom GymEnv Interface for multi-pillar RL
        if GYM_INTERFACE_AVAILABLE:
            self.gym_manager = GymEnvironmentManager(
                model=self.model,
                curriculum=self.curriculum,
                semantic_reward=self.semantic_reward
            )
            print("[v5.0] Gym Environment Manager initialized")
        else:
            self.gym_manager = None

        # 3. NeMo Gym Trainer (lazy initialized when needed)
        self.nemo_trainer = None
        if NEMO_GYM_AVAILABLE:
            print("[v5.0] NeMo Gym available (will be initialized on demand)")

        # AMER-RCL: Agentic Memory Trajectory Cache (Cycle seed)
        self.amert_trajectory_cache = {} 

        # Telemetry Dashboard Hook
        self.telemetry = CTMTelemetry(log_file=self.log_file)
        
        # Push README to Node 3 (AI Studio) on start
        try:
            readme_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "README.md")
            if os.path.exists(readme_path):
                with open(readme_path, "r", encoding="utf-8") as f:
                    self.telemetry.push_readme(f.read())
        except Exception as e:
            print(f"  [Telemetry] Warning: Could not push README ({e})")

        # --- FOCUS & PACING ---
        self.current_domain = None
        self.domain_steps_remaining = 0
        self.last_max_drift = 0.0
        
        # --- PHASE 3: AMER-RCL (Agentic Memory Trajectory Cache) ---
        self.trajectory_cache = {}  # pillar -> list of (step, z_state) tuples
        self.trajectory_max_len = 1000  # Max cached states per pillar
        

        # --- Phase 2: Viability Monitor (C_eff >= E Constraint) ---
        # DOI: 10.5281/zenodo.18091864 (Haslam, 2025)
        from viability_monitor import ViabilityMonitor
        self.viability_monitor = ViabilityMonitor(
            window_size=100,
            log_file="viability_ledger.jsonl",
            initial_weights=None  # Adaptive weights via meta-monitor
        )

        # --- Phase 2.1: Collapse Detector (Temporal Signature Detection) ---
        # Implements the temporal signature from Haslam (2025):
        # "OOD accuracy will degrade before validation perplexity rises"
        # This is the diagnostic for semantic collapse (informational autophagy)
        #
        # 1+7 Architecture: Central monitor + 7 pillar-specific monitors
        from collapse_detector import CollapseDetector

        # Central collapse detector (aggregate across all pillars)
        self.collapse_detector = CollapseDetector(
            window_size=200,
            trend_window=50,
            min_samples=30,
            reward_decline_threshold=-0.01,  # Reward declining
            loss_stable_threshold=0.02,       # Loss stable
            consecutive_warnings=3,           # 3 consecutive detections = pause
            log_file="collapse_detector_central.jsonl",
            auto_pause=True,
            intervention_callback=None,  # Will be set after AutoGroundingManager init
            pause_callback=self._on_collapse_detected
        )

        # Per-pillar collapse detectors (7 Sovereign Pillars)
        self.pillar_collapse_detectors = {}
        for pillar in ['LOGOS', 'PHYSIS', 'BIOS', 'NOMOS', 'PSYCHE', 'SOPHIA', 'OIKOS']:
            self.pillar_collapse_detectors[pillar] = CollapseDetector(
                window_size=100,
                trend_window=30,
                min_samples=20,
                reward_decline_threshold=-0.015,  # Slightly more sensitive per-pillar
                loss_stable_threshold=0.025,
                consecutive_warnings=5,           # More tolerance for individual pillars
                log_file=f"collapse_detector_{pillar.lower()}.jsonl",
                auto_pause=False,  # Only central triggers pause
                pause_callback=None
            )

        self.training_paused = False
        self.pillar_collapse_warnings = {p: 0 for p in self.pillar_collapse_detectors}

        # === Phase 2.2: Auto-Grounding Manager (Emergency Intervention) ===
        # Cascading grounding injection when collapse signatures detected
        # Priority: context injection -> advisor ensemble -> combined (critical)
        # (Haslam, 2025 - increase C_eff before giving up)
        from auto_grounding import AutoGroundingManager

        self.auto_grounding = AutoGroundingManager(
            search_interface=self.search_interface,
            grounding_client=self.grounding_client,
            viability_monitor=self.viability_monitor
        )

        # Register intervention callback with central collapse detector
        # This allows auto-grounding BEFORE training pause
        self.collapse_detector.intervention_callback = self._on_collapse_intervention

        # Storage for emergency grounding to apply to next sample
        self.emergency_context = None
        self.emergency_advice = None
        self.current_domain = None  # Track active domain for intervention

    def _on_collapse_detected(self, step, detection):
        """Callback when collapse signature is detected on central monitor."""
        print(f"\n[COLLAPSE DETECTOR] Central monitor triggered at step {step}")
        print(f"  Saving checkpoint...")
        self.save_checkpoint(step)
        self.training_paused = True

        # Print per-pillar status
        print("\n  Per-Pillar Collapse Status:")
        for pillar, detector in self.pillar_collapse_detectors.items():
            status = detector.get_status()
            symbol = "⚠️" if status['warning_count'] > 0 else "✓"
            print(f"    {pillar}: {symbol} warnings={status['warning_count']}, "
                  f"reward_trend={status['current_reward_trend']:.4f if status['current_reward_trend'] else 0:.4f}")

    def _on_collapse_intervention(self, step, warning_count, reward_trend, loss_trend):
        """
        Callback triggered by collapse detector warnings (BEFORE pause).

        Called when collapse signature detected but warning_count < consecutive_warnings.
        Allows auto-grounding injection as last resort before training pause.

        Args:
            step: Current training step
            warning_count: Current warning count (1, 2, or 3)
            reward_trend: Reward trend (negative = declining)
            loss_trend: Loss trend (near-zero = stable)

        Returns:
            Intervention result dict or None
        """
        print(f"\n[AUTO-GROUNDING] Collapse warning {warning_count} at step {step}")
        print(f"  Reward trend: {reward_trend:.6f}, Loss trend: {loss_trend:.6f}")

        # Get current status for auto-grounding decision
        collapse_status = self.collapse_detector.get_status()
        collapse_status['warning_count'] = warning_count

        viability_result = self.viability_monitor.check_viability()

        # Trigger auto-grounding manager
        domain = self.current_domain or "LOGOS"  # Fallback if not set
        intervention_result = self.auto_grounding.check_and_inject(
            step=step,
            domain=domain,
            viability_result=viability_result,
            collapse_status=collapse_status
        )

        if intervention_result:
            print(f"  -> Intervention type: {intervention_result['type']}")
            print(f"  -> Reason: {intervention_result['reason']}")

            # Store grounding for next sample
            if intervention_result['type'] in ['context', 'combined']:
                context = intervention_result.get('context')
                if context:
                    self.emergency_context = context
                    print(f"  -> Context injection queued")

            if intervention_result['type'] in ['advisor', 'combined']:
                advice = intervention_result.get('advice')
                if advice:
                    self.emergency_advice = advice
                    print(f"  -> Advisor injection queued")

        return intervention_result

    def check_pillar_collapse(self, pillar):
        """Check collapse status for a specific pillar."""
        if pillar not in self.pillar_collapse_detectors:
            return None
        return self.pillar_collapse_detectors[pillar].get_status()

    def get_collapse_status_all(self):
        """Get collapse status for all monitors (1 central + 7 pillars)."""
        central = self.collapse_detector.get_status()
        pillars = {p: d.get_status() for p, d in self.pillar_collapse_detectors.items()}

        # Count how many pillars are showing warnings
        pillars_warning = sum(1 for s in pillars.values() if s['warning_count'] > 0)

        return {
            'central': central,
            'pillars': pillars,
            'pillars_warning_count': pillars_warning,
            'training_paused': self.training_paused,
            'recommendation': self._get_collapse_recommendation(central, pillars)
        }

    def _get_collapse_recommendation(self, central, pillars):
        """Generate recommendation based on collapse status."""
        if self.training_paused:
            return "STOP: Training paused due to collapse detection"
        if central['warning_count'] >= 2:
            return "CRITICAL: Central monitor shows persistent warnings"

        warning_pillars = [p for p, s in pillars.items() if s['warning_count'] > 0]
        if len(warning_pillars) >= 4:
            return f"HIGH RISK: {len(warning_pillars)}/7 pillars showing collapse signature"
        elif len(warning_pillars) >= 2:
            return f"CAUTION: {len(warning_pillars)} pillars showing warnings: {warning_pillars}"
        elif len(warning_pillars) == 1:
            return f"WATCH: {warning_pillars[0]} showing early warning signs"
        else:
            return "OK: No collapse signatures detected"
            
    def _inject_modules(self, model, skip_nlm=False):
        """
        Refreshed injection logic.

        Args:
            model: The CTM model to inject modules into
            skip_nlm: v5.3 - Skip NLM-related injections (for RecursiveSpecialistNLM)
        """
        device = next(iter(model.parameters())).device
        d_model = model.d_model
        if not hasattr(model, 'embedding'):
            model.embedding = nn.Embedding(len(self.tokenizer), d_model).to(device)
        if not hasattr(model, 'lm_head'):
            model.lm_head = nn.Linear(d_model, len(self.tokenizer)).to(device)
            
    def _safe_load_state_dict(self, target_model, state_dict):
        """ Robust handling of key mismatches between compiled and uncompiled states """
        target_state = target_model.state_dict()
        
        # Determine mapping logic
        fixed_state = {}
        for k, v in state_dict.items():
            # Source -> Target mapping
            if k.startswith("_orig_mod."):
                stripped_k = k.replace("_orig_mod.", "")
                if stripped_k in target_state: fixed_state[stripped_k] = v
                elif k in target_state: fixed_state[k] = v
            else:
                prefixed_k = f"_orig_mod.{k}"
                if prefixed_k in target_state: fixed_state[prefixed_k] = v
                elif k in target_state: fixed_state[k] = v
        
        # Load with strict=False to allow missing/extra buffers
        try:
            missing, unexpected = target_model.load_state_dict(fixed_state, strict=False)
            if unexpected: print(f"  [LoadWarning] Unexpected keys (ignored): {len(unexpected)} keys")
            if missing: print(f"  [LoadWarning] Missing keys (reset): {len(missing)} keys")
        except Exception as e:
            print(f"  [CRITICAL] load_state_dict failed: {e}")
        return True

    def health_check(self):
        """ Phase 4.4: Staccato Marathon Health Check """
        print("\n--- [HealthCheck] Auditing Resource Efficiency ---")
        try:
            import psutil
            import torch
            
            # 1. Memory Usage
            mem = psutil.virtual_memory()
            print(f"  System RAM: {mem.percent}% used ({mem.used / 1e9:.1f}GB / {mem.total / 1e9:.1f}GB)")
            
            # 2. VRAM Usage
            if torch.cuda.is_available():
                vram_used = torch.cuda.memory_allocated() / 1e9
                vram_total = torch.cuda.get_device_properties(0).total_memory / 1e9
                print(f"  GPU VRAM:   {vram_used:.1f}GB / {vram_total:.1f}GB ({(vram_used/vram_total)*100:.1f}%)")
                
                if vram_used / vram_total > 0.95:
                    print("  [ALERT] Critical VRAM (>95%). Purging cache.")
                    torch.cuda.empty_cache()
            
            # 3. Storage
            usage = psutil.disk_usage(os.getcwd())
            print(f"  Storage:    {usage.free / 1e9:.1f}GB Free")
            
        except ImportError:
            print("  psutil potentially missing. Resource audit limited.")

    def get_flourishing_modifier(self, domain):
        """
        Phase 4.6: GFS-Aware Flourishing Modifier (φ).
        Integrates real user flourishing state with reward modulation.
        """
        # Get base modifier from GFS state (now real, not heuristic)
        phi = self.gfs.get_flourishing_modifier(domain)

        # Add emergency boost if dimension is critical
        emergency = self.gfs.get_emergency_boost(domain)
        phi = phi + emergency * 0.1

        # Also apply heuristic backup for smooth degradation
        domain_stress_proxy = self.throttles.get(domain, 1.0)
        if domain_stress_proxy < 0.7:
            phi -= 0.05 * (1.0 - domain_stress_proxy)  # Additional penalty if domain is throttled

        # Keep-3 Rotation: Boost restorative pillars under system-wide stress
        restorative_pillars = ["BIOS", "SOPHIA", "LOGOS"]
        avg_throttle = sum(self.throttles.values()) / max(len(self.throttles), 1)
        if avg_throttle < 0.6 and domain in restorative_pillars:
            phi += 0.05  # Smaller boost (GFS handles main logic)

        return phi

    def update_gfs_from_survey(self, survey_response: dict):
        """
        Update GFS (Gross Flourishing Score) from user survey response.

        Example survey_response:
        {
            "material_stability": 0.6,
            "physical_health": 0.7,
            "mental_health": 0.4,
            "social_relationships": 0.8,
            "meaning_purpose": 0.5,
            "character_virtue": 0.6,
        }

        Args:
            survey_response: Dict with GFS dimension names as keys, scores [0, 1] as values
        """
        if not hasattr(self, 'gfs'):
            print("[GFS] GFS not initialized, skipping survey update")
            return

        try:
            self.gfs.update_from_survey(survey_response)
            print(f"[GFS] Updated from survey: Overall flourishing = {self.gfs.gfs_state.get_overall_score():.2f}")
        except Exception as e:
            print(f"[GFS] Error updating from survey: {e}")

    def _init_specialist_branches(self):
        """ Initialize specialists for the 7 Pillars of Wisdom """
        print(f"Initializing {len(self.curriculum.domains)} Pillar Specialists...")
        for pillar in self.curriculum.domains.keys():
            self.spawn_specialist(pillar)

    def spawn_specialist(self, domain):
        """
        Mitosis: Create a new specialist by cloning the Central Foundation.

        v5.3: When recursive weights enabled, creates RecursiveSpecialistNLM
        that derives weights from central NLM, achieving ~91% parameter savings.
        """
        if domain in self.specialist_branches: return

        # Determine device
        device = next(iter(self.model.parameters())).device

        # v5.3: Use RecursiveSpecialistNLM when recursive weights are enabled
        if self.use_recursive_weights and self._recursive_weights_available:
            from recursive_weights import RecursiveSpecialistNLM

            # Create a wrapper CTM that uses RecursiveSpecialistNLM for its NLM
            specialist = ContinuousThoughtMachine(
                d_model=self.model.d_model,
                memory_length=self.model.memory_length,
                num_thoughts=self.model.num_thoughts,
                use_recursive_weights=False,  # We'll replace the NLM manually
            ).to(device)

            # Replace the standard NLM with RecursiveSpecialistNLM
            # This derives all weights from the central model's NLM
            specialist.nlm = RecursiveSpecialistNLM(
                central_nlm=self.model.nlm,
                domain=domain,
                operator_rank=self.recursive_operator_rank // 2,  # Smaller for specialists
            ).to(device)

            # Mark this specialist as recursive for tracking
            specialist._is_recursive_specialist = True
            specialist._recursive_domain = domain

            # Inject modules (excluding NLM which is already set)
            self._inject_modules(specialist, skip_nlm=True)

            # Copy non-NLM state from central
            central_state = self.model.state_dict()
            specialist_state = specialist.state_dict()
            for k, v in central_state.items():
                if 'nlm' not in k and k in specialist_state:
                    specialist_state[k] = v.clone()
            specialist.load_state_dict(specialist_state, strict=False)

            # Get parameter savings report
            param_report = specialist.nlm.parameter_report()
            print(f"  [v5.3] Recursive Specialist '{domain}' created: "
                  f"{param_report['specialist_params']:,} params "
                  f"({param_report['savings_percent']:.1f}% savings)")

        else:
            # Standard specialist creation (full weight copy)
            specialist = ContinuousThoughtMachine(
                d_model=self.model.d_model,
                memory_length=self.model.memory_length,
                num_thoughts=self.model.num_thoughts,
                use_recursive_weights=self.use_recursive_weights,
                recursive_operator=self.recursive_operator,
                recursive_operator_rank=self.recursive_operator_rank,
            ).to(device)

            # Inject modules
            self._inject_modules(specialist)

            # Load current Foundation weights
            self._safe_load_state_dict(specialist, self.model.state_dict())
            print(f"  [PillarSpawn] Specialist '{domain}' spawned from Foundation.")

        self.specialist_branches[domain] = specialist

    def _init_domain_prototypes(self):
        """ Initialize DDA Router prototypes using v4.8 DDARouter """
        print("Initializing DDA Router Prototypes (v4.8)...")
        self.dda_router.initialize_prototypes(
            embedding_fn=self.model.embedding,
            tokenizer=self.tokenizer,
            curriculum=self.curriculum
        )
        print(f"DDA Router prototypes initialized for {len(self.dda_router.prototypes)} domains.")

    def _populate_amer_rcl_problems(self):
        """
        Populate AMER-RCL curriculum with problems from the basic curriculum.
        Maps basic curriculum problems to AMER-RCL Problem objects with skills.
        """
        if not self.amer_rcl:
            return

        print("[AMER-RCL] Populating problem bank from curriculum...")

        # Skill mapping for different problem types
        skill_map = {
            # LOGOS skills
            "math_l1": ["basic_arithmetic"],
            "math_l2": ["algebra"],
            "math_l3": ["advanced_calculus", "proofs"],
            "cs_l1": ["formal_logic"],
            "cs_l2": ["algebra", "formal_logic"],
            # PHYSIS skills
            "physics_l1": ["kinematics"],
            "physics_l2": ["dynamics"],
            "physics_l3": ["quantum_mechanics"],
            # BIOS skills
            "biology_l1": ["cell_biology"],
            "health_l1": ["physiology"],
            # NOMOS skills
            "history_l1": ["legal_principles"],
            "history_l2": ["case_analysis"],
            "law_l1": ["legal_principles"],
            "law_l2": ["statutory_interpretation"],
            # PSYCHE skills
            "psychology_l1": ["cognitive_basics"],
            "psychology_l2": ["behavioral_analysis"],
            # SOPHIA skills
            "philosophy_l1": ["ethical_reasoning"],
            "philosophy_l2": ["metaphysics"],
            # OIKOS skills
            "economics_l1": ["microeconomics"],
            "economics_l2": ["macroeconomics"],
            "business_l1": ["microeconomics"],
        }

        # Generate sample problems for each pillar and add to AMER-RCL
        problem_count = 0
        for pillar in self.curriculum.domains.keys():
            # Generate problems at different levels
            for level in [1, 2, 3]:
                for sample_idx in range(5):  # 5 problems per level
                    try:
                        # Get problem from basic curriculum
                        question, answer = self.curriculum.get_problem(pillar)

                        if not question:
                            continue

                        # Determine problem type and skills
                        problem_type = self._infer_problem_type(pillar, level)
                        skills_required = skill_map.get(problem_type, [])

                        # Create AMER-RCL Problem object
                        problem = Problem(
                            problem_id=f"{pillar}_{level}_{sample_idx}",
                            pillar=pillar,
                            text=question,
                            solution=answer,
                            skills_required=skills_required,
                            base_difficulty=level / 3.0,  # Level 1 = 0.33, Level 2 = 0.67, Level 3 = 1.0
                            current_difficulty=level / 3.0,
                        )

                        self.amer_rcl.add_problem(problem)
                        problem_count += 1

                    except Exception as e:
                        # Skip problematic problems
                        continue

        print(f"[AMER-RCL] Added {problem_count} problems to curriculum bank")

    def _infer_problem_type(self, pillar: str, level: int) -> str:
        """Infer problem type from pillar and level for skill mapping"""
        type_map = {
            "LOGOS": f"math_l{level}",
            "PHYSIS": f"physics_l{level}",
            "BIOS": "biology_l1" if level == 1 else "health_l1",
            "NOMOS": f"law_l{min(level, 2)}",
            "PSYCHE": f"psychology_l{min(level, 2)}",
            "SOPHIA": f"philosophy_l{min(level, 2)}",
            "OIKOS": f"economics_l{min(level, 2)}",
        }
        return type_map.get(pillar, "math_l1")

    def get_contextual_attention(self, input_ids):
        """
        Calculate attention weights over domains using v4.8 DDA Router.
        Returns top-k selected domains and their attention weights.
        """
        with torch.no_grad():
            # Get input embedding centroid
            input_embed = self.model.embedding(input_ids).mean(dim=1).squeeze(0) # (128,)

            # Use DDA Router for hybrid routing
            selected_domains, attention_weights = self.dda_router.route(input_embed)

            # Store attention weights for entropy loss later
            self._last_attention_weights = attention_weights
            self._last_selected_domains = selected_domains

            return attention_weights

    def evaluate_central_performance(self, samples_per_domain=2):
        """ 
        Quickly evaluate the Central Foundation across all domains
        to detect if it is becoming a bottleneck.
        """
        print(f"--- Evaluating Central Foundation Stability ---")
        total_correct = 0
        total_tested = 0
        
        with torch.no_grad():
            for domain in self.curriculum.domains.keys():
                for _ in range(samples_per_domain):
                    q, gt = self.curriculum.get_problem(domain)
                    if not q: continue
                    
                    ids = self.tokenizer(q, return_tensors="pt").input_ids.to(self.device())
                    # Generate thought group
                    thoughts = self.model.generate_thought_group(self.model.embedding(ids), input_ids=ids)
                    final_thought = thoughts[:, -1, :]
                    logits = self.model.lm_head(final_thought)
                    
                    # Check first token (simplified validation)
                    pred = logits.argmax().item()
                    gt_ids = self.tokenizer(str(gt), add_special_tokens=False).input_ids
                    is_correct = pred == gt_ids[0] if gt_ids else False
                    
                    if is_correct: total_correct += 1
                    total_tested += 1
                    
        acc = total_correct / total_tested if total_tested > 0 else 0.5
        self.central_accuracy_history.append(acc)
        print(f"Central Performance: {acc:.2f} (n={total_tested})")
        return acc

    def get_coordination_metrics(self):
        """ 
        Monitor the 15-model collective health.
        - Calculates specialist average vs Foundation (Central).
        - Identifies runaway specialists (for throttling).
        """
        domain_accs = {}
        for d in self.specialist_branches.keys():
            history = self.curriculum.domains[d]["history"]
            acc = sum(history) / len(history) if history else 0.5
            domain_accs[d] = acc
        
        avg_spec_acc = sum(domain_accs.values()) / len(domain_accs)
        central_acc = sum(self.central_accuracy_history[-20:]) / len(self.central_accuracy_history[-20:]) if self.central_accuracy_history else 0.5
        
        print(f"\n[Coordination] Spec Avg: {avg_spec_acc:.2f} | Central: {central_acc:.2f}")
        
        # 1. Lagrangian Resource Flow: If Central lags by >10%, double the sync frequency
        if (avg_spec_acc - central_acc) > 0.10:
            self.dynamic_sync_every = max(2, self.dynamic_sync_every // 2)
            print(f"!!! FOUNDATION BOTTLENECK: Increasing Sync Frequency to {self.dynamic_sync_every} steps.")
        else:
            self.dynamic_sync_every = 10 # Reset to baseline
            
        # 2. Specialist Pacing: Identify specialists >20% ahead of group
        throttles = {}
        for d, acc in domain_accs.items():
            if acc > avg_spec_acc + 0.20:
                throttles[d] = 0.5 # 50% LR reduction
                print(f"--- Throttling {d}: Too far ahead of the collective. ---")
            else:
                throttles[d] = 1.0
                
        return throttles

    def sync_dynamic_context(self, attention_weights, alpha=0.1, consilience_weight=0.05):
        """ 
        Liquid Lattice Sync with Consilience Subspace Alignment.
        Pulls specialists towards a shared reasoning manifold for the active problem.
        """
        print(f"Executing Liquid Lattice Sync (Consilience Active)...")
        active_partners = {d: w for d, w in attention_weights.items() if w > 0.05}
        if not active_partners:
            return
        
        with torch.no_grad():
            snapshots = {d: {k: v.clone() for k, v in self.specialist_branches[d].state_dict().items()} for d in active_partners.keys()}
            
            # Calculate the Lattice Centroid for Consilience
            lattice_centroid = {}
            total_attn = sum(active_partners.values())
            
            for k in snapshots[list(active_partners.keys())[0]].keys():
                ref_tensor = snapshots[list(active_partners.keys())[0]][k]
                if not ref_tensor.is_floating_point():
                    lattice_centroid[k] = ref_tensor.clone()
                    continue
                centroid_v = torch.zeros_like(ref_tensor)
                for d, w in active_partners.items():
                    centroid_v += snapshots[d][k] * (w / total_attn)
                lattice_centroid[k] = centroid_v

            for target_domain in active_partners.keys():
                target_model = self.specialist_branches[target_domain]
                target_state = target_model.state_dict()
                
                for k in target_state.keys():
                    if not target_state[k].is_floating_point():
                        continue
                    # 1. Partner Update (Standard Liquid Lattice)
                    update_val = torch.zeros_like(target_state[k])
                    total_p_weight = 0
                    for p_domain, p_weight in active_partners.items():
                        if p_domain == target_domain: continue
                        update_val += snapshots[p_domain][k] * p_weight
                        total_p_weight += p_weight
                    
                    if total_p_weight > 0:
                        update_val /= total_p_weight
                        target_state[k] = (1 - alpha) * target_state[k] + alpha * update_val
                    
                    # 2. Consilience Subspace Alignment: Pull toward the active centroid
                    target_state[k] = (1 - consilience_weight) * target_state[k] + consilience_weight * lattice_centroid[k]
                
                target_model.load_state_dict(target_state)

    def sync_specialists_to_central(self, alpha=0.2):
        """ 
        Feed Out: Merge full specialist states into central model via reward-weighted EMA.
        α (alpha) controls the inertia of the Central Foundation.
        """
        print(f"\n--- Syncing Specialists to Central (EMA Hub Sync, alpha={alpha}) ---")
        central_state = self.model.state_dict()
        
        # 1. Calculate weighted average of specialist diffs
        weights = {}
        total_weight = 0
        for domain, specialist in self.specialist_branches.items():
            history = self.curriculum.domains[domain]["history"]
            acc = sum(history) / len(history) if history else 0.1
            weight = max(0.1, acc) 
            weights[domain] = weight
            total_weight += weight
            
        print(f"Sync Weights: { {k: f'{v/total_weight:.2f}' for k, v in weights.items()} }")
        
        # 2. Compute the aggregated specialist state
        avg_specialist_state = {k: torch.zeros_like(v, dtype=torch.float32) for k, v in central_state.items()}
        
        with torch.no_grad():
            for domain, specialist in self.specialist_branches.items():
                s_state = specialist.state_dict()
                w = weights[domain] / total_weight
                for k in avg_specialist_state.keys():
                    if k in s_state:
                         avg_specialist_state[k] += s_state[k].to(avg_specialist_state[k].device) * w
            
            # 3. Apply EMA Update selectively
            # Fed-HIRE Integration: Penalize high-drift specialists
            drift_scores = {}
            for d in self.specialist_branches:
                # Approximate drift by norm of weights vs central (skip non-float tensors)
                s_state = self.specialist_branches[d].state_dict()
                drift = sum(torch.norm(s_state[k] - central_state[k]).item() 
                           for k in central_state if k in s_state and central_state[k].is_floating_point())
                drift_scores[d] = drift
            
            avg_drift = sum(drift_scores.values()) / len(drift_scores) if drift_scores else 1.0
            
            # Reasoning layers (nlm, synapses) get the full EMA.
            # Fluency layers (embedding, lm_head) get a much lower alpha to prevent degradation.
            new_state = {}
            for k, v_central in central_state.items():
                v_avg = avg_specialist_state[k].to(v_central.device)
                
                # Fed-HIRE Selective Consensus: Weight alpha based on drift
                # If d_drift < avg: Specialist is stable -> Higher Alpha (more influence)
                # If d_drift > avg: Specialist is diverging -> Lower Alpha (less influence)
                
                # Logic/Reasoning Layers
                if any(x in k.lower() for x in ['nlm', 'synapse', 'mhc', 'engram']):
                    # EMA: theta = (1-alpha)*theta + alpha*avg_specialist
                    new_state[k] = (1 - alpha) * v_central + alpha * v_avg
                else:
                    # Sensitive Layers (Embeddings/LM Head) - 10x more inertia
                    alpha_fluency = alpha * 0.1
                    new_state[k] = (1 - alpha_fluency) * v_central + alpha_fluency * v_avg
            
            # Load back to central
            self._safe_load_state_dict(self.model, new_state)

            # --- v4.8: Sigma Watchdog Monitoring (Central Model) ---
            # Monitor central model for collapse after sync
            # Generate a test input to get central activations
            test_input = torch.randn(1, self.model.d_model, device=self.device())
            central_activations = self.model(test_input.unsqueeze(0), input_ids=None)
            if isinstance(central_activations, tuple):
                central_activations = central_activations[0]
            if central_activations.dim() == 3:
                central_activations = central_activations[0]  # (T, D)

            intervention, spectral_penalty = self.sigma_watchdog.check(
                domain="CENTRAL",
                activations=central_activations,
                step=self.global_train_step
            )

            if intervention != "ok":
                print(f"  [SigmaWatchdog] CENTRAL model {intervention.upper()} intervention detected.")

            if intervention == "hard" and self.sigma_watchdog.should_hard_reset("CENTRAL"):
                print(f"  [SigmaWatchdog] CRITICAL: Central model collapse detected! Rebroadcasting from best specialist.")
                # Find best performing specialist
                best_domain = max(weights.items(), key=lambda x: x[1])[0]
                print(f"  [SigmaWatchdog] Restoring Central from {best_domain} (highest performance).")
                self._safe_load_state_dict(self.model, self.specialist_branches[best_domain].state_dict())
                self.sigma_watchdog.reset_domain("CENTRAL")

        print("Central CTM Logic Foundation Updated (EMA Stability & Fed-HIRE Consensus Active).")

    def broadcast_central_to_specialists(self, domains=None):
        """ Feed In: Update specialist CTMs from the central model """
        domains = domains or self.specialist_branches.keys()
        central_state = self.model.state_dict()
        
        for domain in domains:
            self._safe_load_state_dict(self.specialist_branches[domain], central_state)
        print(f"Broadcasted Central CTM state to {len(domains)} specialists.")

    def evaluate_central_performance(self):
        """ Monitors 10-step reasoning drift (Lagrangian Mechanic) """
        print("\n--- Central Foundation Evaluate ---")
        prompt = "Synthesize the core logic of the 14 pillars."
        ids = self.tokenizer(prompt, return_tensors="pt").input_ids.to(self.device())
        x = self.model.embedding(ids)
        
        # Robust handling for generate_thought_group return type
        result = self.model.generate_thought_group(x, input_ids=ids)
        if isinstance(result, tuple):
             thoughts = result[0] # Unpack (thoughts, log_probs)
        else:
             thoughts = result
             
        # thoughts is (1, T, D)
        final_thought = thoughts[:, -1, :] 
        # Measure drift from origin (just a metric)
        drift = torch.norm(final_thought).item()
        print(f"  [Lagrangian] Foundation Drift vs Origin: {drift:.4f}")
        
        # Push to telemetry
        self.telemetry.push_metrics({
            "step": getattr(self, 'global_train_step', 0),
            "drift": drift,
            "pillar": "FOUNDATION"
        })
        return drift

    def get_coordination_metrics(self):
        """ Phase 3.4 Pacing: Resource Allocation based on curriculum state """
        throttles = {}
        for domain in self.curriculum.domains:
            history = self.curriculum.domains[domain]["history"]
            acc = sum(history) / len(history) if history else 0.5
            # Pacing: If mastery is high, reduce update magnitude (consolidate)
            # If struggling, maintain full plasticity
            if acc > 0.8:
                throttles[domain] = 0.5
            else:
                throttles[domain] = 1.0
        return throttles

    # --- Phase 4.3: Centralized Advisor Gateway ---
    def request_central_consultation(self, query, logic_gap, domain, adversarial_chance=0.3):
        """
        Specialist-to-Hub Gateway for external aid.
        Enforces global rate limits (via SearchInterface) and stochastic adversarial testing.
        """
        # Central Model evaluates if current step justifies external consultation
        is_adversarial = random.random() < adversarial_chance
        
        # SearchInterface respects the 60s cooldown internally
        advisor_input = self.search_interface.consult_advisor(query, logic_gap, adversarial=is_adversarial)

        # Phase 2: Record grounding event
        if advisor_input:
            self.viability_monitor.record_grounding_event('advisor', {'adversarial': is_adversarial})

        if advisor_input:
            tag = ' test="adversarial"' if is_adversarial else ""
            return f"<advisor_input{tag}>\n{advisor_input}\n</advisor_input>"
        return None

    def _get_ordered_domains(self):
        """ Defines the logical ordering for the Circular Topology (7 Sovereign Pillars) """
        return ["LOGOS", "PHYSIS", "BIOS", "NOMOS", "PSYCHE", "SOPHIA", "OIKOS"]

    def sync_neighbors(self, alpha=0.1):
        """ 
        Horizontal Flow: Each specialist pulls a fraction (alpha) of logic from its neighbors.
        Creates a 'diffusion' effect around the ring.
        """
        print(f"\n--- Ring Synchronization (Horizontal Flow, alpha={alpha}) ---")
        ordered = self._get_ordered_domains()
        n = len(ordered)
        
        # We need to snapshot all states first to avoid sequential bias within one step
        snapshots = {d: {k: v.clone() for k, v in self.specialist_branches[d].state_dict().items()} for d in ordered}
        
        with torch.no_grad():
            for i in range(n):
                curr = ordered[i]
                prev = ordered[(i - 1) % n]
                nxt = ordered[(i + 1) % n]
                
                curr_model = self.specialist_branches[curr]
                s_prev = snapshots[prev]
                s_nxt = snapshots[nxt]
                
                # New weights = (1 - 2*alpha) * self + alpha * prev + alpha * next
                state = curr_model.state_dict()
                for k in state.keys():
                    if k in s_prev and k in s_nxt:
                        state[k] = (1 - 2*alpha) * state[k] + alpha * s_prev[k] + alpha * s_nxt[k]
                
                curr_model.load_state_dict(state)
        
        print(f"Horizontal Knowledge Transfer complete across the 7-pillar sovereign arch.")

    def device(self):
        try:
            return next(self.model.parameters()).device
        except (StopIteration, AttributeError):
            return torch.device("cuda" if torch.cuda.is_available() else "cpu")

    def _safe_load_state_dict(self, model, state_dict):
        # Remove '_orig_mod.' prefix from compiled checkpoints 
        new_state = {}
        for k, v in state_dict.items():
            name = k[10:] if k.startswith("_orig_mod.") else k
            new_state[name] = v
        model.load_state_dict(new_state, strict=False)
        
    def load_grounding_data(self, path=None):
        path = path if path else self.grounding_path
        self.grounding_path = path # Update stored path
        
        if os.path.exists(path):
            try:
                mtime = os.path.getmtime(path)
                # Only load if modified
                if mtime > self.grounding_last_mtime:
                    with open(path, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                        if isinstance(data, dict) and "reports" in data:
                            self.grounding_data = data["reports"]
                        elif isinstance(data, list):
                            self.grounding_data = data
                    print(f"Loaded {len(self.grounding_data)} Lived Experience reports (Updated).")
                    self.grounding_last_mtime = mtime
            except Exception as e:
                print(f"Error loading grounding data: {e}")
        else:
             # Only warn once if missing
             if self.grounding_last_mtime == 0:
                 print(f"Warning: Grounding log not found at {path}")

    def load_corpus_data(self, batch_size=4, seq_len=128, phase=None):
        target_phase = phase or self.current_phase
        print(f"Loading Corpus for {target_phase.upper()}...")
        
        # Use corpus_config to get files for the current phase
        corpus_files = get_corpus_for_phase(target_phase)
        print(f"  [v5.1] Found {len(corpus_files)} files in {target_phase}")
        
        dataset = HFDatasetWrapper(self.tokenizer, self.dataset_path, seq_len, corpus_files=corpus_files)
        if len(dataset) > 0:
            self.corpus_loader = DataLoader(dataset, batch_size=batch_size, shuffle=True)
            self.corpus_iterator = iter(self.corpus_loader)
            print(f"Corpus Loader Initialized for {target_phase}.")
        else:
            print(f"Warning: No valid data found in corpus for {target_phase}.")

    def _check_phase_transition(self):
        """Logic to advance through progressive learning phases"""
        if self.current_phase == "phase4_specialized":
            return

        current_stats = self.phase_thresholds[self.current_phase]
        steps_req = current_stats["steps"]
        mastery_req = current_stats["mastery"]

        # Check conditions (Steps or overall mastery)
        # Using self.global_train_step as the clock
        overall_mastery = 0.0
        if self.amer_rcl:
            report = self.amer_rcl.skill_tree.get_mastery_report()
            if report:
                overall_mastery = sum(report.values()) / len(report)

        if self.global_train_step >= steps_req or overall_mastery >= mastery_req:
            # Advance phase
            phases = list(self.phase_thresholds.keys())
            current_idx = phases.index(self.current_phase)
            if current_idx < len(phases) - 1:
                self.current_phase = phases[current_idx + 1]
                print(f"\n[v5.1] PHASE TRANSITION: Advancing to {self.current_phase.upper()}")
                # Reload corpus for the new phase
                self.load_corpus_data(batch_size=getattr(self, 'current_batch_size', 4))
                
                # Push milestone to telemetry
                self.telemetry.push_metrics({
                    "step": self.global_train_step,
                    "milestone": f"TRANSITION_TO_{self.current_phase.upper()}",
                    "mastery": overall_mastery
                })

    def load_scotus_data(self, path=None, limit=100):
        # Use self.scotus_path if path is not provided
        load_path = path if path else self.scotus_path
        if not load_path or not os.path.exists(load_path):
            print(f"Warning: SCOTUS data path not found or not provided: {load_path}")
            return

        print(f"Loading Legal Data from {load_path} (Limit: {limit})...")
        try:
            with open(load_path, 'r', encoding='utf-8') as f:
                for i, line in enumerate(f):
                    if i >= limit:
                        break
                    try:
                        self.scotus_data.append(json.loads(line))
                    except json.JSONDecodeError:
                        continue
            print(f"Loaded {len(self.scotus_data)} legal cases.")
        except Exception as e:
            print(f"Error loading legal data: {e}")

    def load_ctkg_data(self):
        """
        Loads the Critical Thinking Knowledge Graph (Level 6)
        """
        path = "D:/articles/MIT Level 6 Fine-Grained, Full-Coverage, Lossless Critical Thinking Knowledge Graph/Six_Level_KG_2in1_English.jsonl"
        self.ctkg_data = []
        
        if os.path.exists(path):
            try:
                print(f"Loading CTKG from {path}...")
                with open(path, 'r', encoding='utf-8') as f:
                    for line in f:
                        self.ctkg_data.append(json.loads(line))
                print(f"Loaded {len(self.ctkg_data)} CTKG nodes.")
            except Exception as e:
                print(f"Error loading CTKG: {e}")
        else:
             print(f"Warning: CTKG path not found: {path}")

    def get_ctkg_sample(self):
        if not hasattr(self, 'ctkg_data') or not self.ctkg_data:
            self.load_ctkg_data()
            if not self.ctkg_data:
                return None, None
        
        # Select a random node (Constraint/Concept)
        node = random.choice(self.ctkg_data)
        
        # Structural Task: "Explain the divergence" or "Define the concept"
        # Since we want to detect "divergence", let's use the 'content' as Truth.
        # Task: "Analyze the following concept from the perspective of {node['level']}: {node['tags']}"
        # Simulating a divergence check: "What is the structural definition of {node['content'][:30]}...?"
        
        content = node.get('content', '')
        level = node.get('level', 'Unknown')
        tags = node.get('tags', [])
        
        input_text = f"Critical Thinking Level {level}: Analyze structure of: {str(tags)}"
        ground_truth = content
        
        return input_text, ground_truth

    def get_math_sample(self, domain="math"):
        # This function name is legacy, but it now routes to curriculum
        return self.curriculum.get_problem(domain)

    def get_grounding_sample(self):
        if not self.grounding_data:
            # Fallback if no file
            return "Reflect on AI progress.", "Progress is non-linear."
        
        report = random.choice(self.grounding_data)
        # Input: The context
        text = f"Reflect on this experience:\nSituation: {report.get('situation', '')}\nEvent: {report.get('what_happened', '')}\nWhat does this teach us?"
        # Target: The lesson
        gt = report.get('what_this_teaches', '')
        return text, gt

    def text_to_tensor(self, text):
        # Placeholder: Prototype uses random embeddings
        # Real CTM would use LFM Tokenizer -> Embedding
        # Placeholder: Prototype uses random embeddings
        # Real CTM would use LFM Tokenizer -> Embedding
        # Returning random tensor (1, D)
        
        # Simulate Input IDs from text length or hash
        # For prototype, just use simple bytes conversion to get something deterministic-ish or just random
        # (1, 10) length sequence
        
        input_ids = torch.tensor([list(text.encode('utf-8'))[:10]], dtype=torch.long, device=self.model.parameters().__next__().device)
        # Pad if short
        if input_ids.size(1) < 10:
             input_ids = F.pad(input_ids, (0, 10 - input_ids.size(1)))
        
        return torch.randn(1, 128, device=self.model.parameters().__next__().device), input_ids 

    def review_predict_verify_revisit(self, domain="math", prompt_suffix="", throttle_mult=1.0):
        """
        The Main Training Cycle: Review -> Predict -> Verify -> Revisit
        Includes "Reflective Retry" to reward learning/self-correction.
        """
        specialist = self.specialist_branches.get(domain)
        print(f"\n--- New Training Cycle ({domain}) ---")
        
        # AMER-RCL: Use adaptive curriculum if available
        problem_id = None
        if hasattr(self, 'amer_rcl') and self.amer_rcl and domain in self.curriculum.domains:
            # Get current mastery for adaptive sampling
            mastery = self.amer_rcl.skill_tree.get_mastery_report()
            problem = self.amer_rcl.sample_problem(domain, current_mastery=mastery)
            if problem:
                input_text = problem.text
                gt = problem.solution
                problem_id = problem.problem_id
                print(f"  [AMER-RCL] Sampled problem (difficulty={problem.current_difficulty:.2f})")
            else:
                # Fallback to basic curriculum
                input_text, gt = self.curriculum.get_problem(domain)
        else:
            # Use basic curriculum
            if domain == "grounding":
                input_text, gt = self.get_grounding_sample()
            elif domain in ["math", "physics", "cs"]:
                input_text, gt = self.get_math_sample(domain)
            elif domain == "critical_thinking":
                 input_text, gt = self.get_ctkg_sample()
            elif domain == "legal":
                 input_text, gt = self.get_legal_sample()
            else:
                 input_text, gt = self.curriculum.get_problem(domain)

        if not input_text: return

        # Phase 4.0: Contextual Grounding (Search-Augmented Specialists)
        context = ""
        if domain in self.research_domains:
            # Trigger Research Hook (use first 100 chars as query)
            query = input_text[:100]
            context = self.search_interface.search_web(query)
            if context:
                # Phase 2: Record grounding event
                self.viability_monitor.record_grounding_event('context', {'query': query[:50]})
                print(f"  [Grounding] Injected context for {domain} specialization.")
                input_text = f"<context>\n{context}\n</context>\n\n{input_text}"

        # === NEW: Emergency grounding injection (Auto-Grounding System) ===
        # Override with emergency context if auto-grounding triggered
        if self.emergency_context is not None:
            context = self.emergency_context
            print(f"[AUTO-GROUNDING] Injecting emergency context for {domain}")
            input_text = f"<context>\n{context}\n</context>\n\n{input_text}"
            self.emergency_context = None  # Clear after use

        input_text += prompt_suffix # Inject Aristotle prompt logic (after grounding)
        
        # Phase 4.1-4.3: Big Brother Consultation (Centralized Advisor Protocol)
        advisor_input_block = ""
        # Tailor logic gap based on pillar
        logic_gap_map = {
            "LOGOS": "syllogistic validity",
            "PHYSIS": "material causality",
            "BIOS": "organic homeostasis",
            "NOMOS": "jurisprudential intent",
            "PSYCHE": "affective heuristic bias",
            "SOPHIA": "metaphysical first principles",
            "OIKOS": "scarcity optimization"
        }
        logic_gap = logic_gap_map.get(domain, "structural inference complexity")
        
        # Trigger Advisor if the domain is research-heavy OR required by sovereign logic
        if domain in self.research_domains and len(input_text) > 30:
             # Route through Central Hub Gateway
             step = getattr(self, 'global_train_step', 0)
             advisor_start = time.time()
             advisor_input_block = self.search_interface.consult_advisor(input_text[:100], logic_gap, pillar=domain, step=step)
             advisor_time_ms = (time.time() - advisor_start) * 1000

             # Phase 4: Record ensemble health
             if hasattr(self, 'ensemble_monitor'):
                 # Record that advisor was consulted (primary model attempted)
                 # We don't have per-model breakdown, but record as successful if we got advice
                 self.ensemble_monitor.record_query(
                     model_id="ensemble-consensus",
                     provider="distributed",
                     query=input_text[:100],
                     pillar=domain,
                     success=bool(advisor_input_block),
                     response_time_ms=advisor_time_ms,
                 )

             if advisor_input_block:
                 print(f"  [Advisor] Centralized Gateway approved consultation for {domain}.")
                 input_text = f"<advisor_input>\n{advisor_input_block}\n</advisor_input>\n\n{input_text}"

        # === NEW: Emergency advisor injection (Auto-Grounding System) ===
        # Override with emergency advisor if auto-grounding triggered
        if self.emergency_advice is not None:
            advisor_input_block = self.emergency_advice
            print(f"[AUTO-GROUNDING] Injecting emergency advisor consultation for {domain}")
            input_text = f"<advisor_input>\n{advisor_input_block}\n</advisor_input>\n\n{input_text}"
            self.emergency_advice = None  # Clear after use

        # AMER-RCL: Retrieve Trajectory Seed if available
        # logic_gap_id = hash(input_text[:50]) % 1000
        # seed_z = self.amert_trajectory_cache.get(logic_gap_id)

        # === Track current domain for auto-grounding intervention ===
        self.current_domain = domain

        print(f"Reviewing ({domain}): {input_text[:100]}...")

        inputs = self.tokenizer(input_text, return_tensors="pt", padding=True, truncation=True).input_ids.to(self.device())
        
        # 1. Calculate Dynamic Attention for the question
        attn_weights = self.get_contextual_attention(inputs)
        top_domains = sorted(attn_weights.items(), key=lambda x: x[1], reverse=True)[:3]
        print(f"DDA Context: { {k: f'{v:.2f}' for k, v in top_domains} }")
        
        # 2. Liquid Lattice Sync: Prime the focal specialist with neighbor logic
        # Small alpha (0.05) to just 'nudge' the specialist towards relevant domains
        self.sync_dynamic_context(attn_weights, alpha=0.05)
        
        def verifier(thoughts, inputs=None):
            # thoughts: (Group, ThoughtSteps, Dim) or (Group, Dim) if flattened?
            # generate_thought_group returns (Group, NumThoughts, Dim)
            # We need to grab the FINAL thought for checking answer.
            
            rewards = []
            for i, thought_trace in enumerate(thoughts):
                # thought_trace: (NumThoughts, Dim)
                final_thought = thought_trace[-1] # Take the final thought vector
                
                # DECODE VECTOR -> TEXT
                # Project to Vocab
                logits = self.model.lm_head(final_thought) 
                # Greedy Decode (Token ID)
                token_id = logits.argmax().item()
                thought = self.tokenizer.decode([token_id], skip_special_tokens=True)
                
                score = 0.0
                is_correct = False
                
                if domain in (["grounding", "critical_thinking"] + list(self.research_domains)):
                    # Use bag-of-words/top-k hack for text-based domains
                    vals, idxs = logits.topk(10)
                    thought = self.tokenizer.decode(idxs, skip_special_tokens=True)
                    
                    # v4.9: Pass full input_text as context for grounding/advisor weighing
                    score = self.semantic_reward.compute(thought, gt, input_text)
                    is_correct = score > 0.2

                    # Phase 2: Viability tracking
                    self.viability_monitor.record_semantic_reward(self.semantic_reward.last_similarity)
                    self.viability_monitor.record_grounding_penalty(-1.0 if self.semantic_reward.last_hard_rule_violated else 0.0)
                    self.viability_monitor.record_hallucination(self.semantic_reward.last_hard_rule_violated)
                    
                elif domain in ["math", "physics", "cs"]:
                    try:
                        # Normalize
                        gt_clean = str(gt).strip().lower()
                        thought_clean = thought.strip().lower()
                        # Partial match or exact match
                        is_correct = gt_clean in thought_clean
                        score = 1.0 if is_correct else -1.0
                    except: score = -1.0
                    
                # --- LEARNING REWARD (Reflective Retry) ---
                if domain in self.curriculum.domains.keys(): # Match any domain in curriculum
                    self.curriculum.update(domain, 1.0 if is_correct else 0.0)
                    if is_correct:
                        # Exponential Reward for Success
                        level = self.curriculum.domains[domain]["level"]
                        score = score * (2 ** (level - 1))
                
                # --- FLOURISHING MODIFIER (Phase 4.6) ---
                phi = self.get_flourishing_modifier(domain)
                score = score * (1.0 + phi)
                        
                rewards.append(score)
            return torch.tensor(rewards, device=inputs.device)

        x_embed = self.model.embedding(inputs)

        # --- Phase 4.0: Budget Governor (Adaptive Thinking Depth) ---
        epsilon = self.budget_governor(domain)

        # Route to specialist CTM if available
        # Each specialist now has its own train_step_grpo method!
        if specialist:
            # Plan 3.4: Apply Throttling to the Specialist update
            base_lr = 0.01
            scaled_lr = base_lr * throttle_mult
            if throttle_mult < 1.0: print(f"  [Pacing] Throttling {domain} update (LR: {scaled_lr:.4f})")

            # Phase 4.0: Modulate thinking depth based on epsilon (exhaustion signal)
            # Higher epsilon -> more compute needed -> deeper thinking
            base_depth = specialist.num_thoughts
            adaptive_depth = max(3, int(base_depth * (1.0 + epsilon)))
            if adaptive_depth != base_depth:
                print(f"  [BudgetGovernor] Adjusting thinking depth: {base_depth} -> {adaptive_depth} (eps={epsilon:.2f})")
                specialist.num_thoughts = adaptive_depth

            # --- HYBRID LOSS: Domain-Specific Training ---
            # LOGOS/PHYSIS: Dual-tick for exact-answer tasks (70% supervised + 30% RL)
            # Other pillars: Pure GrPO for open-ended reasoning
            use_dual_tick = domain in ["LOGOS", "PHYSIS"] and domain in ["math", "physics", "cs"]

            if use_dual_tick:
                # Try to extract/create label for dual-tick training
                try:
                    # Tokenize ground truth answer as target label
                    gt_tokens = self.tokenizer(str(gt), return_tensors="pt", max_length=10, truncation=True).input_ids.to(self.device())
                    target_label = gt_tokens[0][0]  # First token as proxy label

                    # 70% Dual-Tick (supervised)
                    dual_tick_loss, _ = specialist.train_step_dual_tick(
                        x_embed, target_label, input_ids=inputs, lr=scaled_lr
                    )

                    # 30% GrPO (exploration)
                    grpo_loss, mean_reward = specialist.train_step_grpo(
                        x_embed, verifier, input_ids=inputs, group_size=8, lr=scaled_lr * 0.5
                    )

                    # Hybrid loss
                    loss = 0.7 * dual_tick_loss.item() + 0.3 * grpo_loss.item()
                    print(f"  [HybridLoss] {domain}: DualTick={dual_tick_loss.item():.4f}, GrPO={grpo_loss.item():.4f}")

                except Exception as e:
                    # Fallback to GrPO if dual-tick fails
                    print(f"  [HybridLoss] Dual-tick failed for {domain}, using GrPO: {e}")
                    loss, mean_reward = specialist.train_step_grpo(x_embed, verifier, input_ids=inputs, group_size=4, lr=scaled_lr)
            else:
                # Pure GrPO for open-ended domains (BIOS, NOMOS, PSYCHE, SOPHIA, OIKOS)
                loss, mean_reward = specialist.train_step_grpo(x_embed, verifier, input_ids=inputs, group_size=4, lr=scaled_lr)

            # Restore original depth
            specialist.num_thoughts = base_depth

            # --- v4.8: Sigma Watchdog Monitoring (Per-Specialist) ---
            # Collect activations from the specialist's last forward pass
            with torch.no_grad():
                specialist_activations = specialist(x_embed.mean(dim=1), input_ids=inputs)
                if isinstance(specialist_activations, tuple):
                    specialist_activations = specialist_activations[0]  # Extract thoughts if tuple
                # Take final thoughts: (B, T, D) -> (T, D) for first batch
                if specialist_activations.dim() == 3:
                    specialist_activations = specialist_activations[0]  # (T, D)

                # Monitor for collapse
                intervention, spectral_penalty = self.sigma_watchdog.check(
                    domain=domain,
                    activations=specialist_activations,
                    step=self.global_train_step
                )

                # Add spectral penalty to loss if needed
                if spectral_penalty is not None:
                    loss = loss + spectral_penalty.item()
                    print(f"  [SigmaWatchdog] {intervention.upper()} intervention for {domain}. Penalty: {spectral_penalty.item():.4f}")

                # Handle hard reset if specialist has collapsed
                if intervention == "hard" and self.sigma_watchdog.should_hard_reset(domain):
                    print(f"  [SigmaWatchdog] HARD RESET triggered for {domain}. Reinitializing from Central.")
                    self._safe_load_state_dict(specialist, self.model.state_dict())
                    self.sigma_watchdog.reset_domain(domain)

                # Record activation for DDA Router prototype updates
                self.dda_router.record_activation(domain, specialist_activations.mean(dim=0))
        else:
            # Central model training (no specialist)
            # Phase 4.0: Modulate thinking depth based on epsilon
            base_depth = self.model.num_thoughts
            adaptive_depth = max(3, int(base_depth * (1.0 + epsilon)))
            if adaptive_depth != base_depth:
                print(f"  [BudgetGovernor] Central depth adjustment: {base_depth} -> {adaptive_depth} (eps={epsilon:.2f})")
                self.model.num_thoughts = adaptive_depth

            # --- HYBRID LOSS: Domain-Specific Training (Central Model) ---
            use_dual_tick = domain in ["LOGOS", "PHYSIS"] and domain in ["math", "physics", "cs"]

            if use_dual_tick:
                try:
                    gt_tokens = self.tokenizer(str(gt), return_tensors="pt", max_length=10, truncation=True).input_ids.to(self.device())
                    target_label = gt_tokens[0][0]

                    dual_tick_loss, _ = self.model.train_step_dual_tick(x_embed, target_label, input_ids=inputs, lr=0.01)
                    grpo_loss, mean_reward = self.model.train_step_grpo(x_embed, verifier, input_ids=inputs, group_size=8, lr=0.005)

                    loss = 0.7 * dual_tick_loss.item() + 0.3 * grpo_loss.item()
                    print(f"  [HybridLoss] Central {domain}: DualTick={dual_tick_loss.item():.4f}, GrPO={grpo_loss.item():.4f}")

                except Exception:
                    loss, mean_reward = self.model.train_step_grpo(x_embed, verifier, input_ids=inputs, group_size=4, lr=0.01)
            else:
                loss, mean_reward = self.model.train_step_grpo(x_embed, verifier, input_ids=inputs, group_size=4, lr=0.01)

            # Restore original depth
            self.model.num_thoughts = base_depth

        # --- v4.8: Add DDA Entropy Loss (Prevent Pillar Collapse) ---
        if hasattr(self, '_last_attention_weights'):
            entropy_loss = self.dda_router.pillar_entropy_loss(self._last_attention_weights)
            loss = loss + entropy_loss.item()

        # Log Metrics (Phase 4.3 Enrichment)
        # epsilon already computed earlier for budget governor
        extra = {
            "epsilon": epsilon,
            "thinking_depth": specialist.num_thoughts if specialist else self.model.num_thoughts,
            "sigma_intervention": intervention if specialist else "ok",
            "dda_routing_step": self.dda_router.step
        }
        self.log_metrics(domain, mean_reward, loss, extra_metrics=extra)

        # AMER-RCL: Record attempt and trajectory
        if hasattr(self, 'amer_rcl') and self.amer_rcl and problem_id:
            # Determine success (reward > threshold)
            success = mean_reward > 0.5
            thinking_steps = specialist.num_thoughts if specialist else self.model.num_thoughts

            # Record attempt (updates problem difficulty and skill mastery)
            self.amer_rcl.record_attempt(
                problem_id=problem_id,
                success=success,
                reward=mean_reward,
                thinking_steps=thinking_steps,
                trajectory=None  # Full trajectory recording would require thought states
            )

            # Update curriculum based on performance
            self.curriculum.update(domain, success)

            # Periodically save AMER-RCL state
            if self.global_train_step % 500 == 0:
                self.amer_rcl.save_state()

        print(f"Cycle Complete ({domain}). Loss: {loss:.4f} | Mean Verification Score: {mean_reward:.4f} | Epsilon: {epsilon:.2f}")

    def log_metrics(self, domain, reward, loss, extra_metrics=None):
        """ Log training progress to a JSONL file for offline analysis """
        if extra_metrics is None: extra_metrics = {}
        
        # Phase 2: Include viability metrics
        viability_status = self.viability_monitor.get_status()

        # Phase 4 Enhancements Metrics
        phase4_metrics = {}
        if hasattr(self, 'search_interface') and hasattr(self.search_interface, 'search_stats'):
            phase4_metrics['search_queries'] = self.search_interface.search_stats.get('queries', 0)
            phase4_metrics['search_cache_hits'] = self.search_interface.search_stats.get('cache_hits', 0)
        if hasattr(self, 'gfs'):
            phase4_metrics['gfs_flourishing'] = self.gfs.gfs_state.get_overall_score()
        if hasattr(self, 'ensemble_monitor'):
            ensemble_stats = self.ensemble_monitor.get_stats()
            phase4_metrics['ensemble_reliability'] = ensemble_stats['ensemble_reliability']
            phase4_metrics['ensemble_available_models'] = ensemble_stats['available_models']

        # v5.0 Metrics
        v5_metrics = {}
        if self.cuda_tile_optimizer is not None:
            cuda_status = self.cuda_tile_optimizer.status()
            v5_metrics['cuda_tile_available'] = cuda_status.get('available', False)
            if cuda_status.get('compute_capability'):
                v5_metrics['cuda_compute_capability'] = cuda_status['compute_capability']
        if self.gym_manager is not None:
            v5_metrics['gym_interface_available'] = True
        if NEMO_GYM_AVAILABLE:
            v5_metrics['nemo_gym_available'] = True

        log_entry = {
            "timestamp": datetime.now().isoformat(),
            "domain": domain,
            "reward": float(reward),
            "loss": float(loss),
            "step": getattr(self, 'global_train_step', 0),
            "epsilon": float(extra_metrics.get('epsilon', 0.0)),
            "thinking_depth": int(extra_metrics.get('thinking_depth', 0)),
            "gpu_mem_gb": round(torch.cuda.memory_allocated() / 1e9, 2) if torch.cuda.is_available() else 0,
            "gpu_reserved_gb": round(torch.cuda.memory_reserved() / 1e9, 2) if torch.cuda.is_available() else 0,
            "viability": {
                "c_eff": viability_status['c_eff'],
                "e_total": viability_status['e_total'],
                "viable": viability_status['viable'],
                "margin": viability_status['c_eff'] - viability_status['e_total'],
                "weights": viability_status['weights']
            },
            "phase4": phase4_metrics,
            "v5": v5_metrics
        }
        # Include any extra key-values
        for k, v in extra_metrics.items():
            if k not in log_entry:
                log_entry[k] = v

        with open(self.log_file, "a") as f:
            f.write(json.dumps(log_entry) + "\n")

        # --- Phase 2.1: Record to Collapse Detectors (1+7 Architecture) ---
        step = log_entry["step"]

        # Record to central detector (aggregate signal)
        if hasattr(self, 'collapse_detector'):
            central_detection = self.collapse_detector.record(
                step=step,
                reward=float(reward),
                loss=float(loss) if loss is not None and not (isinstance(loss, float) and loss != loss) else None,
                domain=domain,
                metadata={'epsilon': log_entry.get('epsilon', 0)}
            )

            # Check if training should pause
            if hasattr(self, 'training_paused') and self.collapse_detector.is_paused:
                self.training_paused = True

        # Record to pillar-specific detector
        if hasattr(self, 'pillar_collapse_detectors') and domain in self.pillar_collapse_detectors:
            pillar_detection = self.pillar_collapse_detectors[domain].record(
                step=step,
                reward=float(reward),
                loss=float(loss) if loss is not None and not (isinstance(loss, float) and loss != loss) else None,
                domain=domain
            )

            # Update pillar warning count
            if pillar_detection and pillar_detection.get('signature_detected'):
                self.pillar_collapse_warnings[domain] = pillar_detection.get('consecutive_warnings', 0)

        # Add collapse status to log entry for monitoring dashboard
        if hasattr(self, 'collapse_detector'):
            collapse_status = self.collapse_detector.get_status()
            log_entry['collapse'] = {
                'central_warnings': collapse_status['warning_count'],
                'pillar_warnings': dict(self.pillar_collapse_warnings) if hasattr(self, 'pillar_collapse_warnings') else {},
                'paused': self.training_paused if hasattr(self, 'training_paused') else False
            }

        # Real-time Telemetry Push
        self.telemetry.push_metrics({
            "step": log_entry["step"],
            "reward": log_entry["reward"],
            "loss": log_entry["loss"],
            "pillar": domain,
            "epsilon": log_entry["epsilon"],
            "thinking_depth": log_entry["thinking_depth"],
            "extra": extra_metrics
        })

        # Auto-Push to Git (Every 10 Steps)
        if log_entry["step"] % 10 == 0:
            try:
                # Use current working directory or relative path
                cwd = os.path.dirname(os.path.abspath(__file__))
                subprocess.Popen(["python3", "scripts/push_metrics.py"], cwd=cwd)
            except Exception as e:
                print(f"[Warning] Failed to trigger git push: {e}")

    def budget_governor(self, domain):
        """
        Phase 4.0: Budget Governor
        Analyzes specialist thought deltas to compute an exhaustion signal (epsilon).
        """
        specialist = self.specialist_branches.get(domain, self.model)
        if hasattr(specialist, "thought_deltas") and specialist.thought_deltas:
            deltas = specialist.thought_deltas
            if len(deltas) < 2: return 0.0
            
            # Epsilon = Softmax-weighted change in deltas
            # If deltas are not decreasing, epsilon increases.
            last_delta = deltas[-1]
            avg_delta = sum(deltas[:-1]) / len(deltas[:-1])
            
            epsilon = (last_delta / (avg_delta + 1e-8)).item()
            return epsilon
        return 0.0

    def compute_exhaustion_signal(self, domain, threshold=2.0):
        """
        Checks if the reasoning loop should be governed/exited.
        """
        epsilon = self.budget_governor(domain)
        if epsilon > threshold:
            print(f"  [BudgetGovernor] High Exhaustion Detected ({epsilon:.2f} > {threshold}). Governing cycle.")
            return True
        return False

    def git_push_sync(self):
        """ Heartbeat: Commit and push metrics to Git to track progress remotely """
        print("\n--- Git Heartbeat: Pushing Metrics ---")
        try:
            import subprocess
            # 1. Add metrics and progress logs (skip binary checkpoints)
            subprocess.run(["git", "add", self.log_file, "training_log.txt"], check=False)

            # 2. Commit with step info
            step = getattr(self, 'global_train_step', 0)
            msg = f"CTM Heartbeat: Step {step} | Syncing Logic Foundation Metrics"
            subprocess.run(["git", "commit", "-m", msg], check=False)

            # 3. Push to current branch (private repo)
            subprocess.run(["git", "push"], check=False)

            # 4. Also push to public repo if 'public' remote exists (for live dashboard)
            result = subprocess.run(["git", "remote", "get-url", "public"], capture_output=True, text=True)
            if result.returncode == 0:
                print("Pushing to public repo for live dashboard...")
                subprocess.run(["git", "push", "public", "HEAD:live"], check=False)

            print("Git Push Complete.")
        except Exception as e:
            print(f"Warning: Git Sync failed ({e}). Continuing training.")

    def train_parallel(self, steps=100, sync_every=10, ring_alpha=0.05, time_limit_hours=None, git_sync=False, bootstrap_steps=0):
        """ 
        Orchestrate Parallel Training with Sequential Bootstrap and Staccato Pulses.
        """
        print(f"Starting Phased Marathon for {steps} steps (Pulse: 10, HealthCheck: 100)...")
        
        start_time = time.time()
        self.global_train_step = self.load_latest_checkpoint()
        
        for step in range(1, steps + 1):
            self.global_train_step += 1
            
            # Pulse Start Marker (Every 10 Steps)
            if step % 10 == 1:
                print(f"\n>>> [Pulse] Starting 10-step reasoning burst ({self.global_train_step} - {self.global_train_step+9})")

            # Check Time Limit
            if time_limit_hours:
                elapsed = (time.time() - start_time) / 3600
                if elapsed >= time_limit_hours:
                    print(f"\n[TIME LIMIT] {time_limit_hours} hours reached. Saving and exiting.")
                    self.save_checkpoint(self.global_train_step)
                    break

            # Phase 2.1: Check Collapse Detector (Haslam 2025 Temporal Signature)
            if hasattr(self, 'training_paused') and self.training_paused:
                print(f"\n{'='*60}")
                print("🚨 TRAINING PAUSED: Collapse Signature Detected 🚨")
                print(f"{'='*60}")
                collapse_status = self.get_collapse_status_all()
                print(f"Central warnings: {collapse_status['central']['warning_count']}")
                print(f"Pillars with warnings: {collapse_status['pillars_warning_count']}/7")
                print(f"Optimal step estimate: {collapse_status['central'].get('optimal_step_estimate', 'N/A')}")
                print(f"Recommendation: {collapse_status['recommendation']}")
                print(f"{'='*60}")
                print("\nTo resume training, call trainer.collapse_detector.resume()")
                print("To save and exit, the checkpoint has already been saved.\n")
                break

            # 1. Domain Selection & Reasoning Logic
            is_bootstrapping = step <= bootstrap_steps
            if self.mitosis and not self.specialist_branches:
                 self._init_specialist_branches()
                 self._init_domain_prototypes()

            if is_bootstrapping:
                active_domains = ["LOGOS"]
            else:
                if not self.specialist_branches:
                    active_domains = random.sample(list(self.curriculum.domains.keys()), k=2)
                else:
                    active_domains = random.sample(list(self.specialist_branches.keys()), k=min(4, len(self.specialist_branches)))
            
            for domain in active_domains:
                throttle_mult = self.throttles.get(domain, 1.0)
                self.review_predict_verify_revisit(domain=domain, throttle_mult=throttle_mult)

            # High Heaven Mode: Interleaved Corpus Training (Batch Training to saturate GPU)
            # 30% chance per step to run a heavy corpus batch (or always if high_heaven is aggressive)
            if hasattr(self, 'high_heaven') and self.high_heaven and self.corpus_loader and random.random() < 0.3:
                corpus_loss = self.train_step_corpus_self_test()
                # print(f"  [HighHeaven] Corpus Self-test: {corpus_loss:.4f} reward")

            # Phase 2: Viability check (every 10 steps)
            if step % 10 == 0:
                viability_result = self.viability_monitor.check_viability()
                if not viability_result['viable']:
                    print(f"  [Warning] [Viability] C_eff < E: margin = {viability_result['margin']:.4f}")

                    # === NEW: Proactive auto-grounding intervention on viability violation ===
                    # Even if no collapse warning yet, inject grounding if C_eff < E
                    if hasattr(self, 'auto_grounding'):
                        collapse_status = self.collapse_detector.get_status()
                        domain = self.current_domain or "LOGOS"
                        intervention = self.auto_grounding.check_and_inject(
                            step=step,
                            domain=domain,
                            viability_result=viability_result,
                            collapse_status=collapse_status
                        )

                        if intervention:
                            # Store grounding for next sample
                            if intervention['type'] in ['context', 'combined']:
                                context = intervention.get('context')
                                if context:
                                    self.emergency_context = context
                            if intervention['type'] in ['advisor', 'combined']:
                                advice = intervention.get('advice')
                                if advice:
                                    self.emergency_advice = advice

            self.viability_monitor.increment_step()

            # 2. Vertical Sync & Persistence
            if step % self.dynamic_sync_every == 0:
                print(f"  [Sync] Hub Synchronization (Step {self.global_train_step})")
                self.sync_specialists_to_central(alpha=0.2)
                self.broadcast_central_to_specialists()
                
                # Checkpoint persistence: reduce load to every 100 steps
                if self.global_train_step % 100 == 0:
                    self.save_checkpoint(self.global_train_step)
                    # Phase 4.4: Staccato Health Check
                    self.health_check()

                    # --- v4.8: Status Report ---
                    print("\n--- v4.8 Module Status ---")
                    dda_stats = self.dda_router.get_routing_stats()
                    print(f"DDA Router: Step {dda_stats['step']}, Next refresh in {dda_stats['next_refresh_in']} steps")

                    sigma_status = self.sigma_watchdog.get_status()
                    print("Sigma Watchdog Health:")
                    for domain, status in sigma_status.items():
                        print(f"  {domain}: {status['health']} (log_det: {status['recent_avg_log_det']}, interventions: {status['intervention_counts']})")

                    session_stats = self.session_memory.get_stats()
                    print(f"Session Memory: {session_stats['buffer_len']}/{session_stats['window_size']} states, "
                          f"{session_stats['buffer_size_mb']:.2f} MB")

                    # Phase 2: Viability Monitor Status
                    viability_status = self.viability_monitor.get_status()
                    viable_symbol = "[OK]" if viability_status['viable'] else "[FAIL]"
                    print(f"Viability: {viable_symbol} C_eff={viability_status['c_eff']:.3f}, "
                          f"E={viability_status['e_total']:.3f}, margin={viability_status['c_eff'] - viability_status['e_total']:.3f}")
                    if viability_status['violation_count'] > 0:
                        print(f"  WARNING: Violations: {viability_status['violation_count']} (C_eff < E)")

                    # Phase 2.1: Collapse Detector Status (1+7 Architecture)
                    if hasattr(self, 'collapse_detector'):
                        print("\n--- Collapse Detector Status (Haslam 2025) ---")
                        collapse_all = self.get_collapse_status_all()
                        central = collapse_all['central']

                        # Central monitor
                        central_symbol = "🚨" if central['warning_count'] > 0 else "✓"
                        reward_trend = central.get('current_reward_trend')
                        loss_trend = central.get('current_loss_trend')
                        print(f"Central: {central_symbol} warnings={central['warning_count']}")
                        if reward_trend is not None:
                            print(f"  Reward trend: {reward_trend:.4f} {'↓' if reward_trend < 0 else '↑'}")
                        if loss_trend is not None:
                            print(f"  Loss trend: {loss_trend:.4f} {'↓' if loss_trend < 0 else '→' if abs(loss_trend) < 0.02 else '↑'}")

                        # Per-pillar status
                        print("Pillars:")
                        for pillar, status in collapse_all['pillars'].items():
                            p_symbol = "⚠" if status['warning_count'] > 0 else "✓"
                            p_trend = status.get('current_reward_trend')
                            trend_str = f" (r:{p_trend:.3f})" if p_trend is not None else ""
                            print(f"  {pillar}: {p_symbol} w={status['warning_count']}{trend_str}")

                        print(f"Recommendation: {collapse_all['recommendation']}")
                        print("--- End Collapse Detector Status ---")

                    # Phase 4 Enhancements: GFS and Ensemble Health Status
                    print("\n--- Phase 4 Enhancements Status ---")

                    # GFS Flourishing Status
                    if hasattr(self, 'gfs'):
                        gfs_report = self.gfs.get_report()
                        print(f"GFS Overall Flourishing: {gfs_report['overall_flourishing']:.2f}")
                        if gfs_report['stressed_dimensions']:
                            print(f"  Stressed dimensions: {gfs_report['stressed_dimensions']}")
                        if gfs_report['intervention_priority']:
                            print(f"  Priority intervention: {gfs_report['intervention_priority']}")

                    # Ensemble Health Status
                    if hasattr(self, 'ensemble_monitor'):
                        ensemble_health = self.ensemble_monitor.check_ensemble_health()
                        print(f"Ensemble Health: {ensemble_health['ensemble_reliability']:.1%} reliable")
                        print(f"  Available models: {ensemble_health['available_models']}/{ensemble_health['total_models']}")
                        if self.ensemble_monitor.should_trigger_alert():
                            print(f"  [ALERT] {ensemble_health['recommendation']}")
                            self.ensemble_monitor.export_report()

                    # Persist GFS state every 1000 steps
                    if hasattr(self, 'gfs') and self.global_train_step % 1000 == 0:
                        self.gfs.save_state()
                        print("[GFS] State saved")

                    print("--- End Phase 4 Status ---\n")

                    # --- v5.0: Advanced Components Status ---
                    v5_status = self.get_v5_status()
                    print("--- v5.0 Advanced Components Status ---")
                    print(f"CUDA Tile: {('Available' if v5_status['cuda_tile']['available'] else 'Not available')}")
                    if v5_status['cuda_tile']['available']:
                        print(f"  Enabled: {v5_status['cuda_tile']['enabled']}")
                        if 'compute_capability' in v5_status['cuda_tile']:
                            print(f"  Compute: {v5_status['cuda_tile']['compute_capability']}")
                    print(f"Gym Interface: {('Available' if v5_status['gym_interface']['available'] else 'Not available')}")
                    if v5_status['gym_interface']['available']:
                        print(f"  Enabled: {v5_status['gym_interface']['enabled']}")
                    print(f"NeMo Gym: {('Available' if v5_status['nemo_gym']['available'] else 'Not available')}")
                    if v5_status['nemo_gym']['available']:
                        print(f"  Trainer initialized: {v5_status['nemo_gym']['trainer_initialized']}")
                    print("--- End v5.0 Status ---\n")

                    # --- AMER-RCL Curriculum Status ---
                    if hasattr(self, 'amer_rcl') and self.amer_rcl:
                        print("--- AMER-RCL Curriculum Status ---")
                        for pillar in self.curriculum.domains.keys():
                            state = self.amer_rcl.get_curriculum_state(pillar=pillar)
                            print(f"{pillar}:")
                            print(f"  Available skills: {len(state['available_skills'])}")
                            if 'trajectory_quality' in state:
                                quality = state['trajectory_quality']
                                print(f"  Efficiency: {quality['efficiency']:.3f}")
                                print(f"  Success rate: {quality['success_rate']:.1%}")
                                print(f"  Trend: {state['performance_trend']}")
                        print("--- End AMER-RCL Status ---\n")
                
                if git_sync:
                    self.git_push_sync()
                
            # v5.1: Adaptive Curriculum Phase Transitions
            self._check_phase_transition()
            
        print("\nPhased Training Session Complete.")

    def train_step_corpus_self_test(self):
        """
        New Corpus Training Mode: "Self-Testing"
        Instead of blind next-token prediction, we:
        1. Take a corpus sample.
        2. Mask a chunk of it.
        3. Ask model to "Restore the text".
        4. Reward based on Semantic Similarity to original.
        """
        if not self.corpus_loader: return 0.0

        try:
            inputs, labels = next(self.corpus_iterator)
        except:
            self.corpus_iterator = iter(self.corpus_loader)
            inputs, labels = next(self.corpus_iterator)
            
        device = self.device()
        inputs = inputs.to(device)
        
        # 1. Prepare "Test" - Masking
        # Simple Masking: Replaces last 40% of tokens with mask_token (or 0)
        # For prototype, we just truncated in dataloader, so inputs is (B, S).
        # Let's take the first 60% as prompt, and ask to generate the rest.
        
        seq_len = inputs.size(1)
        split_point = int(seq_len * 0.6)
        
        prompt_ids = inputs[:, :split_point]
        target_ids = inputs[:, split_point:]
        
        # We need to decode to text to let TTT work its magic with "Thought" generation
        prompt_text = self.tokenizer.decode(prompt_ids[0], skip_special_tokens=True)
        target_text = self.tokenizer.decode(target_ids[0], skip_special_tokens=True)
        
        # 2. Predict (Generate Thought -> Reconstruction)
        # We use a special instruction wrapper
        query = f"Complete the following text accurately:\n'{prompt_text}'"
        
        # 3. Verifier for GrPO
        def verifier(thoughts, inputs=None):
            rewards = []
            for thought_trace in thoughts:
                # Decode vector to text
                final_thought = thought_trace[-1]
                logits = self.model.lm_head(final_thought)
                
                # Bag of words for semantic match
                vals, idxs = logits.topk(10)
                thought_text = self.tokenizer.decode(idxs, skip_special_tokens=True)

                # v4.9: Use new RLVR-based compute method
                score = self.semantic_reward.compute(thought_text, target_text)
                rewards.append(score)
            return torch.tensor(rewards, device=device)

        # 4. Train Step (GrPO)
        # We treat the corpus completion as a reasoning task!
        # This aligns "Knowledge" with "Reasoning".
        
        # We need embeddings for the query
        q_inputs = self.tokenizer(query, return_tensors="pt", padding=True, truncation=True).input_ids.to(device)
        x_embed = self.model.embedding(q_inputs)
        
        loss, mean_reward = self.model.train_step_grpo(x_embed, verifier, input_ids=q_inputs, group_size=4, lr=0.01)
        
        return mean_reward

    def train_step_supervised(self):
        """
        Runs one step of supervised training on the corpus.
        """
        if not self.corpus_loader:
            return 0.0
            
        try:
            inputs, labels = next(self.corpus_iterator)
        except StopIteration:
            self.corpus_iterator = iter(self.corpus_loader)
            inputs, labels = next(self.corpus_iterator)
            
        device = self.model.parameters().__next__().device
        inputs, labels = inputs.to(device), labels.to(device)
        
        # Forward Pass
        # We need to manually handle the embedding -> CTM -> LM Head flow here 
        # because model.forward() inside CTM is different.
        
        x = self.model.embedding(inputs) # (B, S, D)
        # B, S, D = x.shape
        # x_flat = x.view(B * S, D)
        
        # CTM processes vectors. We treat each token embedding as a vector input.
        # CRITICAL: Pass input_ids_flat so Engram can retrieve memory (Scaling Mechanism)
        # input_ids_flat = inputs.view(-1)
        # thoughts_history = self.model(x_flat, input_ids=input_ids_flat) # (B*S, T, D)
        
        # ACTIVATE TTT (Engram through TTT)
        # We pass the full sequence (B, S, D) to forward_ttt.
        # It adapts the model on the context, then returns thought traces for the flattened sequence.
        thoughts_history = self.model.forward_ttt(x, input_ids=inputs, ttt_steps=1, ttt_lr=0.01)

        final_thought = thoughts_history[:, -1, :] # (B*S, D)
        
        logits = self.model.lm_head(final_thought) # (B*S, V)
        
        criterion = nn.CrossEntropyLoss()
        loss = criterion(logits, labels.view(-1))
        
        # Backward (We don't have a separate optimizer here in UnifiedTrainer yet?)
        # UnifiedTrainer doesn't seem to hold an optimizer self.optimizer?
        # ctm_prototype.py train_step_grpo creates a new AdamW every step?? 
        # Let's check ctm_prototype.py. Yes, it does: optimizer = optim.AdamW(...)
        # That's inefficient but fine for prototype.
        
        optimizer = optim.AdamW(list(self.model.parameters()) + list(self.model.lm_head.parameters()), lr=1e-4) # Lower LR for fine-tuning
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
        
        return loss.item()

    def save_checkpoint(self, step):
        path = os.path.join(self.checkpoint_dir, f"checkpoint_step_{step}.pt")
        print(f"Saving Unified Checkpoint to {path}...")

        full_state = {
            "central_model": self.model.state_dict(),
            "specialist_branches": {d: s.state_dict() for d, s in self.specialist_branches.items()},
            "curriculum": self.curriculum.domains,
            "step": step,
            # v4.8: Save DDA Router and Sigma Watchdog state
            "dda_router_prototypes": self.dda_router.prototypes,
            "dda_router_step": self.dda_router.step,
            "sigma_watchdog_history": self.sigma_watchdog.history,
            "sigma_watchdog_interventions": self.sigma_watchdog.intervention_counts
        }

        torch.save(full_state, path)
        print(f"Unified Checkpoint Saved (Central + {len(self.specialist_branches)} Specialists).")

        # --- v4.8: Persist Session Memory ---
        self.session_memory.save()
        print(f"Session Memory persisted (Buffer: {len(self.session_memory.buffer)} states).")

        # Auto-cleanup: Keep only the latest 2 checkpoints
        try:
            checkpoints = sorted(
                [f for f in os.listdir(self.checkpoint_dir) if f.startswith("checkpoint_step_") and f.endswith(".pt")],
                key=lambda x: int(x.split("_")[2].split(".")[0])
            )
            if len(checkpoints) > 2:
                for old_ckpt in checkpoints[:-2]:
                    old_path = os.path.join(self.checkpoint_dir, old_ckpt)
                    os.remove(old_path)
                    print(f"  [Cleanup] Removed old checkpoint: {old_ckpt}")
        except Exception as e:
            print(f"Warning: Checkpoint cleanup failed: {e}")

    def load_latest_checkpoint(self):
        if not os.path.exists(self.checkpoint_dir):
            os.makedirs(self.checkpoint_dir, exist_ok=True)
            return 0
            
        checkpoints = [f for f in os.listdir(self.checkpoint_dir) if f.startswith("checkpoint_step_") and f.endswith(".pt")]
        if not checkpoints:
            print("No checkpoints found. Starting from scratch.")
            return 0
        
        # Sort by step number
        checkpoints.sort(key=lambda x: int(x.split("_")[2].split(".")[0]))
        latest_ckpt = checkpoints[-1]
        
        load_path = os.path.join(self.checkpoint_dir, latest_ckpt)
        print(f"Resuming from unified checkpoint: {load_path}")
        
        checkpoint_data = torch.load(load_path, map_location=self.device())
        
        # Load central (Safely handle compiled state dicts)
        self._safe_load_state_dict(self.model, checkpoint_data["central_model"])
        
        # Load specialists
        if "specialist_branches" in checkpoint_data:
            for domain, state in checkpoint_data["specialist_branches"].items():
                if domain in self.specialist_branches:
                    self.specialist_branches[domain].load_state_dict(state)
            print(f"Resumed {len(checkpoint_data['specialist_branches'])} Specialist branches.")
            
        # Load curriculum (Phase 3 Migration Safety)
        if "curriculum" in checkpoint_data:
            stored_domains = checkpoint_data["curriculum"]
            # If the stored curriculum is legacy (14 domains), do NOT overwrite the new 7-pillar map
            if "LOGOS" not in stored_domains and "math" in stored_domains:
                print("--- LEGACY CURRICULUM DETECTED: Preserving 7-Pillar Sovereign Architecture ---")
            else:
                self.curriculum.domains = stored_domains

        # --- v4.8: Restore DDA Router and Sigma Watchdog state ---
        if "dda_router_prototypes" in checkpoint_data:
            self.dda_router.prototypes = checkpoint_data["dda_router_prototypes"]
            self.dda_router.step = checkpoint_data.get("dda_router_step", 0)
            print(f"Restored DDA Router state (step: {self.dda_router.step}).")

        if "sigma_watchdog_history" in checkpoint_data:
            self.sigma_watchdog.history = checkpoint_data["sigma_watchdog_history"]
            self.sigma_watchdog.intervention_counts = checkpoint_data.get("sigma_watchdog_interventions", {})
            print(f"Restored Sigma Watchdog state.")

        # Session Memory is auto-loaded via start_session() in __init__

        return checkpoint_data.get("step", 0)

    # --- v5.0: NeMo Gym Training with Advanced Components ---

    def get_v5_status(self) -> dict:
        """
        Get status of all v5.0 components.

        Returns:
            Dictionary with status of CUDA Tile, Gym Interface, and NeMo Gym
        """
        status = {
            "cuda_tile": {
                "available": CUDA_TILE_AVAILABLE,
                "enabled": self.cuda_tile_optimizer is not None,
            },
            "gym_interface": {
                "available": GYM_INTERFACE_AVAILABLE,
                "enabled": self.gym_manager is not None,
            },
            "nemo_gym": {
                "available": NEMO_GYM_AVAILABLE,
                "trainer_initialized": self.nemo_trainer is not None,
            }
        }

        # Add CUDA Tile details if available
        if self.cuda_tile_optimizer is not None:
            cuda_status = self.cuda_tile_optimizer.status()
            status["cuda_tile"].update(cuda_status)

        return status

    def train_with_nemo_gym(self, config_kwargs=None):
        """
        Train using full NeMo Gym orchestration with GRPO algorithm.

        This is the v5.0 training pipeline combining:
        - CUDA Tile optimization for Tensor Core acceleration
        - Custom GymEnv interface for all 7 pillars
        - Full NeMo Gym multi-agent training orchestration

        Args:
            config_kwargs (dict, optional): Configuration parameters for NeMoGymConfig
                - num_steps: Total training steps (default: 10000)
                - rollout_length: Rollout collection batch size (default: 50)
                - batch_size: GRPO batch size (default: 32)
                - learning_rate: Adam learning rate (default: 1e-5)
                - grpo_group_size: Group size for group-relative comparison (default: 4)

        Returns:
            Dictionary with training results including:
                - status: 'complete'
                - total_steps: Number of steps trained
                - total_episodes: Number of episodes completed
                - metrics: History of metrics over training
        """
        if not NEMO_GYM_AVAILABLE:
            print("[v5.0] ERROR: NeMo Gym not available. Install with: pip install nemo-pytorch")
            return {"status": "error", "message": "NeMo Gym not available"}

        if not GYM_INTERFACE_AVAILABLE:
            print("[v5.0] ERROR: Gym Interface not available.")
            return {"status": "error", "message": "Gym Interface not available"}

        print("[v5.0] Starting NeMo Gym training orchestration...")

        # Create config
        config_kwargs = config_kwargs or {}
        config = create_nemo_config(**config_kwargs)

        print(f"[v5.0] Training Configuration:")
        print(f"  Steps: {config.num_steps}")
        print(f"  Rollout Length: {config.rollout_length}")
        print(f"  Batch Size: {config.batch_size}")
        print(f"  Learning Rate: {config.learning_rate}")
        print(f"  GRPO Group Size: {config.grpo_group_size}")

        # Create trainer
        try:
            self.nemo_trainer = create_nemo_trainer(
                model=self.model,
                curriculum=self.curriculum,
                semantic_reward=self.semantic_reward,
                config=config
            )
            print("[v5.0] NeMo Gym trainer created successfully")
        except Exception as e:
            print(f"[v5.0] ERROR creating trainer: {e}")
            return {"status": "error", "message": str(e)}

        # Execute training
        try:
            result = self.nemo_trainer.train()
            print(f"[v5.0] Training complete!")
            print(f"  Total Steps: {result['total_steps']}")
            print(f"  Total Episodes: {result['total_episodes']}")
            return result
        except Exception as e:
            print(f"[v5.0] ERROR during training: {e}")
            import traceback
            traceback.print_exc()
            return {"status": "error", "message": str(e)}

    def optimize_with_cuda_tile(self):
        """
        Apply CUDA Tile optimization to NLM blocks and other Tensor Core operations.

        This replaces standard PyTorch operations with direct Tensor Core invocations
        for 90%+ cuBLAS performance.

        Returns:
            Dictionary with optimization results and performance metrics
        """
        if self.cuda_tile_optimizer is None:
            print("[v5.0] CUDA Tile not available. Optimization skipped.")
            return {"status": "skipped", "reason": "CUDA Tile not available"}

        print("[v5.0] Applying CUDA Tile optimization...")

        try:
            # Get optimization report
            report = self.cuda_tile_optimizer.optimize_model(self.model)

            print(f"[v5.0] Optimization complete:")
            print(f"  Optimized NLM Blocks: {report.get('nlm_blocks_optimized', 0)}")
            print(f"  Optimized GRU Cells: {report.get('gru_cells_optimized', 0)}")
            print(f"  Tensor Core Usage: {report.get('tensor_core_usage', 'N/A')}")
            print(f"  Expected Speedup: {report.get('expected_speedup', 'N/A')}")

            return report
        except Exception as e:
            print(f"[v5.0] ERROR during optimization: {e}")
            return {"status": "error", "message": str(e)}

    def get_gym_environment_info(self):
        """
        Get information about configured Gym environments for all pillars.

        Returns:
            Dictionary with environment specifications for each pillar
        """
        if self.gym_manager is None:
            print("[v5.0] Gym Environment Manager not available.")
            return {}

        try:
            info = {}
            for pillar in self.curriculum.domains:
                env_info = self.gym_manager.get_environment_info(pillar)
                info[pillar] = env_info

            return info
        except Exception as e:
            print(f"[v5.0] ERROR getting environment info: {e}")
            return {}


if __name__ == "__main__":
    import argparse
    import subprocess
    from datetime import datetime

    parser = argparse.ArgumentParser()
    parser.add_argument("--steps", type=int, default=100, help="Override number of training steps")
    parser.add_argument("--sync-every", type=int, default=10, help="Frequency of vertical sync and checkpointing")
    parser.add_argument("--time-limit", type=float, default=None, help="Stop after N hours and save final checkpoint")
    parser.add_argument("--git-push", action="store_true", help="Periodically push metrics to Git (Heartbeat)")
    parser.add_argument("--scotus-limit", type=int, default=100, help="Limit for SCOTUS data loading")
    parser.add_argument("--high-heaven", action="store_true", help="L4 Optimized: High Batch, Compilation")
    parser.add_argument("--bootstrap", type=int, default=0, help="Number of Math-first sequential bootstrap steps")
    parser.add_argument("--mitosis", action="store_true", help="Sequential Specialist Spawning strategy")
    parser.add_argument("--d-model", type=int, default=1024, help="Model dimensionality (1024 for LFM, 4096 for H1R)")
    parser.add_argument("--tokenizer", type=str, default="LiquidAI/LFM2.5-1.2B-Instruct", help="Tokenizer/Backbone ID")
    parser.add_argument("--checkpoint-dir", type=str, default="Examiner1/models/examiner_v2_1024", help="Checkpoint storage directory")
    parser.add_argument("--batch-size", type=int, default=None, help="Override training batch size")
    parser.add_argument("--distributed", action="store_true", help="Enable distributed grounding")
    parser.add_argument("--grounding-url", type=str, default="ws://localhost:8765", help="URL of the local grounding server")
    parser.add_argument("--spiking", action="store_true", help="Enable Low-Power Spiking Backend (0.3 spikes/neuron)")
    args = parser.parse_args()

    print("Initializing Unified Trainer...")
    
    # Config
    if args.batch_size:
        BATCH_SIZE = args.batch_size
    else:
        BATCH_SIZE = 128 if args.high_heaven else 4
    
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"Device: {device}")

    if args.high_heaven:
        print("🚀 MODE: HIGH HEAVEN")
        print(f"Batch Size: {BATCH_SIZE}")
        print("Torch Compile: ENABLED")
        print("Triton: ENABLED")
        torch.set_float32_matmul_precision('high')

    # CTM Architectural Scale: Dynamic Dimension
    model = ContinuousThoughtMachine(d_model=args.d_model, memory_length=15, num_thoughts=10)
    if args.spiking:
        print("  [Spiking] Low-Power Backend Enabled (Identity Mapping conversion).")
        model.spiking_mode = True
    model.to(device)
    
    if args.high_heaven:
        # Use torch.compile on 4096-dim model only if VRAM allows, otherwise skip to preserve space for weights
        if args.d_model <= 1024:
            model = torch.compile(model)
        else:
            print("  [Compiling] Skipping torch.compile for 4096-dim model to maximize weight-space VRAM.")
    
    # Path to SCOTUS data - this is now handled internally by trainer.load_scotus_data
    # scotus_path = "case_with_all_sources_with_companion_cases_tag.jsonl"
    # if not os.path.exists(scotus_path):
    #     # Fallback to absolute windows path for local dev
    #     scotus_path = r"D:\articles\Super-SCOTUS Data set\case_with_all_sources_with_companion_cases_tag.jsonl"

    trainer = UnifiedTrainer(
        model, 
        scotus_path=None, 
        high_heaven=args.high_heaven, 
        mitosis=args.mitosis,
        advisor_provider="lfm" if "falcon" in args.tokenizer.lower() else "qwen",
        distributed=args.distributed,
        grounding_url=args.grounding_url,
        tokenizer_name=args.tokenizer,
        checkpoint_dir=args.checkpoint_dir
    ) # Pass None, as path resolution is internal
    # Checkpoint Resume
    start_step = trainer.load_latest_checkpoint()
    
    # Reload with correct limit...
    trainer.scotus_data = [] # Clear default load
    trainer.load_scotus_data(path=None, limit=args.scotus_limit) # Call without path, let it resolve or use synthetic
    trainer.load_grounding_data(path="lived_experience_log.json")
    trainer.load_corpus_data(batch_size=BATCH_SIZE)
    
    # NOTE: Prototypes are initialized dynamically via mitosis logic during train_parallel
    
    
    print("Starting Parallel Training Loop...")
    # Default: 100 steps for parallel orchestration
    steps_to_run = args.steps if args.steps else 100
    
    trainer.train_parallel(
        steps=steps_to_run, 
        sync_every=args.sync_every, 
        time_limit_hours=args.time_limit,
        git_sync=args.git_push,
        bootstrap_steps=args.bootstrap
    )
    print("Training Complete.")
