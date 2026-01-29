"""
Multi-Advisor Ensemble
Queries 3 open models via OpenRouter, aggregates for bias reduction.
Uses local .env.local for API keys (gitignored).
"""
import os
import json
import requests
from pathlib import Path

# Load local config
def load_env():
    env_path = Path(__file__).parent / ".env.local"
    config = {}
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                config[k.strip()] = v.strip()
    return config

CONFIG = load_env()
OPENROUTER_API_KEY = CONFIG.get("OPENROUTER_API_KEY", "")
OPENROUTER_BASE = "https://openrouter.ai/api/v1/chat/completions"

# GCP Vertex AI config
GCP_PROJECT = CONFIG.get("GCP_PROJECT", "")
GCP_LOCATION = CONFIG.get("GCP_LOCATION", "us-central1")
GCP_QWEN_MODEL = CONFIG.get("GCP_QWEN_MODEL", "")
GCP_LLAMA_ENDPOINT = CONFIG.get("GCP_LLAMA_ENDPOINT", "") # e.g. us-central1-aiplatform.googleapis.com

# Default ensemble: Latest SOTA models from OpenRouter + GCP Vertex
ENSEMBLE_MODELS = [
    ("openrouter", "qwen/qwen3-235b-a22b-2507"), # Qwen 3 (Latest)
    ("openrouter", "google/gemma-3-27b-it"),     # Gemma 3 (Latest)
    ("openrouter", "anthropic/claude-sonnet-4.5"), # Anthropic Latest
    ("gcp_qwen", "qwen3-next-80b"),
    ("gcp_llama", "meta/llama-4-maverick-17b-128e-instruct-maas"),
]

def query_openrouter(model: str, prompt: str) -> dict:
    """Query via OpenRouter."""
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/humanaiconvention/examiner",
        "X-Title": "Examiner-CTM"
    }
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 200,
        "temperature": 0.3
    }
    try:
        resp = requests.post(OPENROUTER_BASE, headers=headers, json=payload, timeout=30)
        resp.raise_for_status()
        return {"model": model, "trace": resp.json()["choices"][0]["message"]["content"], "success": True}
    except Exception as e:
        return {"model": model, "trace": None, "success": False, "error": str(e)}

def _get_gcp_auth():
    import google.auth
    from google.auth.transport.requests import Request
    creds, _ = google.auth.default()
    creds.refresh(Request())
    return creds.token

def query_gcp_qwen(prompt: str) -> dict:
    """Query Qwen3-next-80B via GCP Vertex AI MaaS (Predict API)."""
    if not GCP_PROJECT or not GCP_QWEN_MODEL:
        return {"model": "gcp-qwen3-80b", "trace": None, "success": False, "error": "GCP Qwen not configured"}
    
    try:
        token = _get_gcp_auth()
        endpoint = f"https://{GCP_LOCATION}-aiplatform.googleapis.com/v1/projects/{GCP_PROJECT}/{GCP_QWEN_MODEL}:predict"
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        payload = {"instances": [{"prompt": prompt}], "parameters": {"maxOutputTokens": 200, "temperature": 0.3}}
        
        resp = requests.post(endpoint, headers=headers, json=payload, timeout=60)
        resp.raise_for_status()
        trace = resp.json()["predictions"][0]
        return {"model": "gcp-qwen3-80b", "trace": trace, "success": True}
    except Exception as e:
        return {"model": "gcp-qwen3-80b", "trace": None, "success": False, "error": str(e)}

def query_gcp_llama4(model: str, prompt: str) -> dict:
    """Query Llama 4 via GCP Vertex AI MaaS (OpenAPI Gateway)."""
    if not GCP_PROJECT or not GCP_LLAMA_ENDPOINT:
        return {"model": model, "trace": None, "success": False, "error": "GCP Llama4 not configured"}
        
    try:
        token = _get_gcp_auth()
        # Endpoint format Provided by USER
        url = f"https://{GCP_LLAMA_ENDPOINT}/v1/projects/{GCP_PROJECT}/locations/{GCP_LOCATION}/endpoints/openapi/chat/completions"
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        payload = {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": 200,
            "temperature": 0.3,
            "stream": False # Set to false for ensemble aggregation
        }
        
        resp = requests.post(url, headers=headers, json=payload, timeout=60)
        resp.raise_for_status()
        trace = resp.json()["choices"][0]["message"]["content"]
        return {"model": model, "trace": trace, "success": True}
    except Exception as e:
        return {"model": model, "trace": None, "success": False, "error": str(e)}

def query_single_advisor(provider: str, model: str, prompt: str) -> dict:
    """Route to correct provider."""
    if provider == "gcp_qwen":
        return query_gcp_qwen(prompt)
    if provider == "gcp_llama":
        return query_gcp_llama4(model, prompt)
    return query_openrouter(model, prompt)


def query_ensemble(query: str, logic_gap: str, pillar: str) -> dict:
    """Query SOTA models, aggregate into A/B Consilience Trace."""
    
    prompt = f"""You are a Causal Logic Transducer specialized in {pillar} grounding. 
Provide a 100-word Reasoning Trace for:

PILLAR: {pillar} (Aristotelian Focus)
QUERY: {query}
LOGIC GAP: {logic_gap}

TASK:
1. AXIOMS: State 2-3 fundamental constraints for {pillar}.
2. CAUSAL CHAIN: Deterministic If-Then-Because flow.
3. SENSITIVE VARIABLES: Critical bifurcation points.

OUTPUT: Pure causal reasoning. No conversational filler."""

    from concurrent.futures import ThreadPoolExecutor
    
    results_list = []
    def run_query(m_info):
        provider, model = m_info
        result = query_single_advisor(provider, model, prompt)
        model_name = model.split('/')[-1] if '/' in model else model
        result["label"] = f"{provider.upper()}:{model_name}"
        return result

    with ThreadPoolExecutor(max_workers=len(ENSEMBLE_MODELS)) as executor:
        results_list = list(executor.map(run_query, ENSEMBLE_MODELS))
    
    for r in results_list:
        print(f"  [{r['label']}] {'PASS' if r['success'] else 'FAIL'}")
    
    # Construct Consilience Trace (A/B/C/D/E)
    traces = []
    for r in results_list:
        if r["success"] and r["trace"]:
            traces.append(f"### [ADVISOR: {r['label']}]\n{r['trace']}")
    
    if not traces:
        return {"consensus": None, "counter_weights": [], "confidence": 0.0}
    
    consensus = "\n\n".join(traces)
    success_count = sum(1 for r in results_list if r["success"])
    
    return {
        "consensus": consensus,
        "counter_weights": [], # Embedded in consensus
        "confidence": success_count / len(ENSEMBLE_MODELS),
        "raw_results": results_list
    }


if __name__ == "__main__":
    print("Testing Multi-Advisor Ensemble...")
    result = query_ensemble(
        query="Prove transitivity of implication",
        logic_gap="Missing modus ponens axiom",
        pillar="LOGOS"
    )
    print(f"\nConsensus: {result['consensus'][:200] if result['consensus'] else 'None'}...")
    print(f"Confidence: {result['confidence']:.0%}")
    print(f"Counter-weights: {len(result['counter_weights'])}")
