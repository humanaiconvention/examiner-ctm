#!/usr/bin/env python3
import sys
import os
import subprocess
from pathlib import Path

# Configuration - Loaded from examiner-ctm/.env.local if available
GCP_PROJECT = "gen-lang-client-0481286758"
GCP_LOCATION = "global"
MODEL_ID = "claude-opus-4-5@20251101"

def load_env():
    env_path = Path(__file__).parent / "examiner-ctm" / ".env.local"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                os.environ[k.strip()] = v.strip()

def get_gcp_token():
    """Fetch access token from gcloud CLI."""
    try:
        result = subprocess.run("gcloud auth print-access-token", shell=True, capture_output=True, text=True, check=True)
        return result.stdout.strip()
    except Exception:
        return None

def query_opus(prompt: str):
    try:
        from anthropic import AnthropicVertex
        
        project = os.getenv("GCP_PROJECT", GCP_PROJECT)
        location = os.getenv("GCP_LOCATION", GCP_LOCATION)
        token = get_gcp_token()
        
        if not token:
            print("ERROR: Authentication failed. Please run 'gcloud auth application-default login'.")
            return

        client = AnthropicVertex(region=location, project_id=project, access_token=token)
        
        print(f"--- Consulting Claude 4.5 Opus ({MODEL_ID}) ---")
        message = client.messages.create(
            max_tokens=4096,
            messages=[{"role": "user", "content": prompt}],
            model=MODEL_ID,
            temperature=0.3
        )
        
        return message.content[0].text
    except ImportError:
        print("ERROR: 'anthropic' library not installed. Run 'pip install anthropic[vertex]'.")
    except Exception as e:
        print(f"ERROR: {str(e)}")

if __name__ == "__main__":
    load_env()
    if len(sys.argv) < 2:
        print("Usage: python deep_code.py 'Your coding question or prompt'")
        sys.exit(1)
        
    user_prompt = " ".join(sys.argv[1:])
    
    # Check if user is piping a file or passing paths
    # (Future expansion: add --file support)
    
    response = query_opus(user_prompt)
    if response:
        print("\n" + response)
