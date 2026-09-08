import subprocess
import time
import urllib.request
import json
import websocket # if installed, or we can check

edge_path = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
p = subprocess.Popen([
    edge_path,
    '--headless',
    '--disable-gpu',
    '--remote-debugging-port=9222',
    'https://darkgray-duck-674813.hostingersite.com/principal.html#dashboard'
])

time.sleep(3)
try:
    with urllib.request.urlopen('http://127.0.0.1:9222/json') as r:
        pages = json.loads(r.read())
        print('Pages:', pages)
finally:
    p.kill()
