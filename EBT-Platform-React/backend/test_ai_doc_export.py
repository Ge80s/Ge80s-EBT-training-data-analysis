import requests
url = 'http://127.0.0.1:8000/api/export/ai-analysis-doc'
print('Posting to', url)
resp = requests.post(url, timeout=60)
print('Status:', resp.status_code)
print('Content-Type:', resp.headers.get('Content-Type'))
if resp.ok:
    with open('ai_analysis_export.docx', 'wb') as f:
        f.write(resp.content)
    print('Saved ai_analysis_export.docx')
else:
    print(resp.text)
