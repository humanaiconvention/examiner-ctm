
import asyncio
import os
import subprocess
from pathlib import Path
from mcp.server.fastmcp import FastMCP

# Initialize FastMCP server
mcp = FastMCP("VertexOpus")

# Configuration (mirrors deep_code.py)
GCP_PROJECT = "gen-lang-client-0481286758"
GCP_LOCATION = "global"
MODEL_ID = "claude-opus-4-5@20251101"

def get_gcp_token():
    """Fetch access token from gcloud CLI."""
    try:
        # Check if we are in an environment where gcloud is on PATH
        # We might need shell=True on Windows to find the command if it's not in explicit path
        result = subprocess.run("gcloud auth print-access-token", shell=True, capture_output=True, text=True, check=True)
        return result.stdout.strip()
    except Exception as e:
        print(f"Error getting token: {e}")
        return None

@mcp.tool()
async def consult_vertex_opus(prompt: str) -> str:
    """
    Consults the Claude 4.5 Opus model via Vertex AI for deep coding analysis, architecture questions, or complex reasoning.
    Use this tool when you need elite-level reasoning or a second opinion on code structure.
    """
    try:
        from anthropic import AnthropicVertex
        
        # Load environment variables if needed, though we default to constants
        project = os.getenv("GCP_PROJECT", GCP_PROJECT)
        location = os.getenv("GCP_LOCATION", GCP_LOCATION)
        
        token = get_gcp_token()
        if not token:
            return "ERROR: Could not Authenticate. Please ensure 'gcloud auth application-default login' has been run or gcloud is in the PATH."

        client = AnthropicVertex(region=location, project_id=project, access_token=token)
        
        message = client.messages.create(
            max_tokens=4096,
            messages=[{"role": "user", "content": prompt}],
            model=MODEL_ID,
            temperature=0.3
        )
        
        return message.content[0].text
    except ImportError:
        return "ERROR: 'anthropic' library not installed. Please run 'pip install anthropic[vertex]'."
    except Exception as e:
        return f"ERROR invoking Vertex AI: {str(e)}"

if __name__ == "__main__":
    mcp.run()
