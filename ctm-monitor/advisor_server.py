from http.server import HTTPServer, BaseHTTPRequestHandler
import json
from advisor_ensemble import query_ensemble

HOST = "0.0.0.0"
PORT = 8080

class AdvisorHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path == "/query":
            content_length = int(self.headers["Content-Length"])
            post_data = self.rfile.read(content_length)
            request = json.loads(post_data.decode("utf-8"))
            
            query = request.get("query", "")
            logic_gap = request.get("logic_gap", "")
            pillar = request.get("pillar", "LOGOS")
            
            print(f"[AdvisorServer] Reqeust: {query[:50]}... ({pillar})")
            
            result = query_ensemble(query, logic_gap, pillar)
            
            self.send_response(200)
            self.send_header("Content-type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(result).encode("utf-8"))
        else:
            self.send_response(404)
            self.end_headers()

if __name__ == "__main__":
    print(f"Starting Local Advisor Server on {HOST}:{PORT}")
    server = HTTPServer((HOST, PORT), AdvisorHandler)
    server.serve_forever()
