import requests
url='http://127.0.0.1:8000/api/export/report'
payload={'threshold':3,'batch':None,'aircraft_type':None,'rank':None}
print('Posting...')
r=requests.post(url,json=payload,timeout=60)
print('Status',r.status_code)
print('Headers',r.headers.get('content-type'))
if r.status_code==200:
    open('test_report.xlsx','wb').write(r.content)
    print('Saved test_report.xlsx')
else:
    print('Body',r.text)
