"""
Grounding Client (Node 1) - L4 Instance
Sends grounding requests to Local server, receives traces.
"""
import asyncio
import json
import websockets

class GroundingClient:
    def __init__(self, server_url="ws://127.0.0.1:8765"):
        self.server_url = server_url
        self.connected = False
        self.ws = None
    
    async def connect(self):
        try:
            # Add ping_interval to keep the tunnel alive
            self.ws = await websockets.connect(
                self.server_url, 
                ping_interval=20, 
                ping_timeout=20,
                close_timeout=10
            )
            self.connected = True
            print(f"[GroundingClient] Connected to {self.server_url} (Keep-alive active)")
        except Exception as e:
            print(f"[GroundingClient] Connection failed: {e}")
            self.connected = False
    
    async def request_grounding(self, pillar, query, logic_gap, step, request_id=None):
        """Send grounding request, await response with retry logic."""
        import uuid
        request_id = request_id or str(uuid.uuid4())
        
        req = {
            "request_id": request_id, "pillar": pillar,
            "query": query, "logic_gap": logic_gap, "step": step
        }
        
        for attempt in range(3):
            is_closed = True
            if self.ws:
                try:
                    is_closed = not self.ws.open
                except AttributeError:
                    # Fallback for different versions
                    is_closed = getattr(self.ws, 'closed', True)
            
            if not self.connected or is_closed:
                await self.connect()
            
            if not self.connected:
                print(f"  [GroundingClient] Retry {attempt+1}/3: Server unreachable.")
                await asyncio.sleep(2)
                continue
                
            try:
                await self.ws.send(json.dumps(req))
                response = await asyncio.wait_for(self.ws.recv(), timeout=65)
                return json.loads(response)
            except Exception as e:
                print(f"  [GroundingClient] Send/Recv error: {e}. Reconnecting...")
                self.connected = False
                await asyncio.sleep(1)
        
        return None
    
    def request_grounding_sync(self, pillar, query, logic_gap, step):
        """Synchronous wrapper for training loop."""
        try:
            return asyncio.get_event_loop().run_until_complete(
                self.request_grounding(pillar, query, logic_gap, step)
            )
        except RuntimeError:
            # No event loop running
            loop = asyncio.new_event_loop()
            result = loop.run_until_complete(
                self.request_grounding(pillar, query, logic_gap, step)
            )
            loop.close()
            return result


# Singleton for trainer integration
_client = None

def get_grounding_client(server_url="ws://localhost:8765"):
    global _client
    if _client is None:
        _client = GroundingClient(server_url)
    return _client
