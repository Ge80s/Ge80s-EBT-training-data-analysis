import requests
import json

url = 'http://127.0.0.1:8000/api/ai/analyze'
payload = {"prompt": "请给出基于当前样本数据的简短训练建议。", "filters": {}}

print(f"Posting to {url}...")
with requests.post(url, json=payload, stream=True, timeout=120) as resp:
    print(f"HTTP {resp.status_code}")
    resp.raise_for_status()
    for line in resp.iter_lines(decode_unicode=True):
        if not line:
            continue
        if line.startswith('data: '):
            data = line[6:]
            try:
                parsed = json.loads(data)
                print('EVENT:', parsed)
                if parsed.get('token'):
                    print(parsed['token'], end='', flush=True)
                if parsed.get('error'):
                    print('\nERROR:', parsed['error'])
                if parsed.get('done'):
                    print('\nDONE')
                    break
            except Exception as e:
                print('Malformed data:', data)
print('Stream finished')
