"""
Grounding Server (Node 2) - Local Machine
Uses Multi-Advisor Ensemble for bias-reduced reasoning traces.
"""
import asyncio
import json
import websockets
from datetime import datetime
from advisor_ensemble import query_ensemble
import sys
import io

# Force UTF-8 for all stdout/stderr to prevent Windows charmap errors
if sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

HOST = "127.0.0.1"
PORT = 8765

def log_request(connection, request):
    # In websockets 15+, request is a Request object
    print(f"[{datetime.now().isoformat()}] Received Request: {request.path} from {request.headers.get('Host', 'Unknown')}", flush=True)
    return None # Continue with WS handshake

async def handle_request(websocket):
    """Handle incoming grounding requests from L4."""
    print(f"[{datetime.now().isoformat()}] New connection from {websocket.remote_address}", flush=True)
    async for message in websocket:
        try:
            req = json.loads(message)
            pillar = req.get("pillar", "LOGOS")
            query = req.get("query", "")
            logic_gap = req.get("logic_gap", "")
            
            print(f"[{datetime.now().isoformat()}] {pillar}: {query[:50]}...", flush=True)
            
            # Multi-advisor ensemble (3 models)
            result = query_ensemble(query, logic_gap, pillar)
            
            response = {
                "request_id": req.get("request_id"),
                "trace": result["consensus"],
                "counter_weights": result["counter_weights"],
                "confidence": result["confidence"],
                "drift_score": 0.35 if result["consensus"] else None,
                "sovereign_override": result["confidence"] < 0.5,
                "timestamp": datetime.now().isoformat()
            }
            
            await websocket.send(json.dumps(response))
            print(f"  -> Confidence: {result['confidence']:.0%}, Counter-weights: {len(result['counter_weights'])}", flush=True)
            
        except Exception as e:
            msg = str(e).encode('ascii', 'ignore').decode('ascii')
            print(f"  Error: {msg}", flush=True)
            await websocket.send(json.dumps({"error": msg}))

async def main():
    print(f"Grounding Server (Ensemble Mode) on ws://{HOST}:{PORT}", flush=True)
    print(f"Models: Qwen 72B, Gemma 27B, Qwen 3 (Latest), Gemma 3 (Latest), Claude 4.5", flush=True)
    async with websockets.serve(handle_request, HOST, PORT, process_request=log_request, ping_interval=20, ping_timeout=20):
        await asyncio.Future()

if __name__ == "__main__":
    asyncio.run(main())
