#!/usr/bin/env python3

import os
import json
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import threading
import time

class HarmonizeServer(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed_path = urlparse(self.path)
        
        if parsed_path.path == '/health':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            response = {'status': 'healthy', 'timestamp': int(time.time())}
            self.wfile.write(json.dumps(response).encode())
        
        elif parsed_path.path == '/status':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            response = {
                'server': 'harmonize-py',
                'version': '1.0.0',
                'uptime': int(time.time() - server_start_time)
            }
            self.wfile.write(json.dumps(response).encode())
        
        else:
            self.send_response(404)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            error = {'error': 'Not found', 'path': parsed_path.path}
            self.wfile.write(json.dumps(error).encode())

    def do_POST(self):
        if self.path == '/webhook':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            
            try:
                webhook_data = json.loads(post_data.decode())
                print(f"Received webhook: {webhook_data}")
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                response = {'received': True, 'timestamp': int(time.time())}
                self.wfile.write(json.dumps(response).encode())
                
            except json.JSONDecodeError:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                error = {'error': 'Invalid JSON'}
                self.wfile.write(json.dumps(error).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {format % args}")

def run_server(port=8080):
    global server_start_time
    server_start_time = time.time()
    
    server = HTTPServer(('0.0.0.0', port), HarmonizeServer)
    print(f"Harmonize Python server starting on port {port}")
    print(f"Health check: http://localhost:{port}/health")
    print(f"Status: http://localhost:{port}/status") 
    print(f"Webhook endpoint: http://localhost:{port}/webhook")
    
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server...")
        server.shutdown()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    run_server(port)