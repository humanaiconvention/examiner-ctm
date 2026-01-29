import os
import json
import time
import subprocess
import asyncio
import threading
try:
    import websockets
    HAS_WEBSOCKETS = True
except ImportError:
    HAS_WEBSOCKETS = False
from datetime import datetime

class CTMTelemetry:
    def __init__(self, log_file="parallel_training_metrics.jsonl", port=8080):
        self.log_file = log_file
        self.port = port
        self.queue = asyncio.Queue()
        self.loop = None
        self._start_sidecar()

    def _start_sidecar(self):
        """Start the WebSocket sidecar in a background thread"""
        def run_server():
            self.loop = asyncio.new_event_loop()
            asyncio.set_event_loop(self.loop)
            self.loop.run_until_complete(self.telemetry_sidecar())

        thread = threading.Thread(target=run_server, daemon=True)
        thread.start()

    async def telemetry_sidecar(self):
        """Serve metrics via WebSocket for AI Studio alignment"""
        if not HAS_WEBSOCKETS:
            print("  [Telemetry] Sidecar disabled (websockets not found).")
            return
        print(f"  [Telemetry] Sidecar starting on ws://0.0.0.0:{self.port}...")
        async with websockets.serve(self.handle_client, "0.0.0.0", self.port):
            await asyncio.Future()  # run forever

    async def handle_client(self, websocket):
        """Send live metrics to connected AI Studio dashboard"""
        print(f"  [Telemetry] AI Studio Monitor Connected.")
        try:
            while True:
                # Wait for new metrics data
                payload = await self.queue.get()
                await websocket.send(json.dumps(payload))
        except Exception as e:
            if HAS_WEBSOCKETS and isinstance(e, websockets.exceptions.ConnectionClosed):
                print(f"  [Telemetry] AI Studio Monitor Disconnected.")
            else:
                print(f"  [Telemetry] Client error: {e}")

    def push_metrics(self, metrics):
        """Push metrics from the synchronous training loop into the async sidecar"""
        if self.loop is None:
            return

        # Prepare payload matching AI Studio TelemetryData interface
        gpu = self.get_gpu_stats()
        payload = {
            "type": "metrics",
            "iteration": metrics.get('step', 0),
            "cycle": metrics.get('thinking_depth', 0), 
            "loss": float(metrics.get('loss', 0.0)),
            "vram": gpu['memory_used_mb'] if gpu else 0,
            "thought_delta": float(metrics.get('reward', 0.0)),
            "pillar": metrics.get('pillar', 'LOGOS'),
            "drift": float(metrics.get('drift', 0.0)),
            "epsilon": float(metrics.get('epsilon', 0.0)),
            "sync_sample": metrics.get('sync_sample', []), 
            "extra": metrics.get('extra', {}),
            "timestamp": time.time() * 1000
        }
        
        self.loop.call_soon_threadsafe(self.queue.put_nowait, payload)

    def push_readme(self, readme_content):
        """Push README content to AI Studio for display"""
        if self.loop is None:
            return
            
        payload = {
            "type": "readme_update",
            "content": readme_content,
            "git_branch": "parallel-ctm-marathon",
            "timestamp": time.time() * 1000
        }
        self.loop.call_soon_threadsafe(self.queue.put_nowait, payload)

    def get_gpu_stats(self):
        """Get GPU utilization via nvidia-smi"""
        try:
            cmd = "nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw --format=csv,noheader,nounits"
            output = subprocess.check_output(cmd.split()).decode("utf-8").strip()
            gpu_util, mem_used, mem_total, temp, power = output.split(", ")
            return {
                "utilization": float(gpu_util),
                "memory_used_mb": int(mem_used),
                "memory_total_mb": int(mem_total),
                "temperature_c": int(temp),
                "power_draw_w": float(power)
            }
        except Exception:
            return None

    def save_snapshot(self, step_info):
        """Maintain the existing file-based snapshot for backward compatibility"""
        gpu = self.get_gpu_stats()
        payload = {
            "version": "1.0",
            "timestamp": datetime.now().isoformat(),
            "status": "active",
            "telemetry": {
                "gpu": gpu,
                "training_step": step_info
            }
        }
        with open("ctm_telemetry_snapshot.json", "w") as f:
            json.dump(payload, f, indent=2)
        return payload
