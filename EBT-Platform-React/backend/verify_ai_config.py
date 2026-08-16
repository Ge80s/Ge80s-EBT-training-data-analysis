import json
import urllib.request

payload = {
    'provider': 'gemini',
    'api_key': 'demo-key',
    'model': 'gemini-2.5-flash',
    'base_url': ''
}

req = urllib.request.Request(
    'http://127.0.0.1:8000/api/ai/config',
    data=json.dumps(payload).encode('utf-8'),
    headers={'Content-Type': 'application/json'},
    method='POST'
)

with urllib.request.urlopen(req, timeout=20) as r:
    print(r.read().decode('utf-8'))
