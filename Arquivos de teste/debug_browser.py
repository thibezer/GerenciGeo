import subprocess
import time
import urllib.request
import json
import websocket

edge_path = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
p = subprocess.Popen([
    edge_path,
    '--headless',
    '--disable-gpu',
    '--remote-allow-origins=*',
    '--remote-debugging-port=9333'
])

time.sleep(2)

try:
    with urllib.request.urlopen('http://127.0.0.1:9333/json') as r:
        pages = json.loads(r.read())
        target = [pg for pg in pages if pg.get('type') == 'page'][0]
        ws_url = target['webSocketDebuggerUrl']
        print('Target WS:', ws_url)

    ws = websocket.create_connection(ws_url)
    
    # Enable domains
    ws.send(json.dumps({'id': 1, 'method': 'Runtime.enable'}))
    ws.send(json.dumps({'id': 2, 'method': 'Log.enable'}))
    ws.send(json.dumps({'id': 3, 'method': 'Page.enable'}))
    
    # Navigate
    ws.send(json.dumps({
        'id': 4,
        'method': 'Page.navigate',
        'params': {'url': 'https://darkgray-duck-674813.hostingersite.com/principal.html#dashboard'}
    }))

    # Read events for 6 seconds
    start = time.time()
    events = []
    while time.time() - start < 6:
        ws.settimeout(1.0)
        try:
            msg = ws.recv()
            evt = json.loads(msg)
            method = evt.get('method', '')
            if 'exception' in method.lower() or 'log' in method.lower() or 'console' in method.lower() or 'Runtime.exceptionThrown' in str(evt):
                print('[CDP EVENT]', json.dumps(evt, indent=2))
            events.append(evt)
        except Exception:
            pass

    # Check DOM of #view-container
    ws.send(json.dumps({
        'id': 100,
        'method': 'Runtime.evaluate',
        'params': {
            'expression': 'document.getElementById("view-container") ? document.getElementById("view-container").innerHTML : "NO CONTAINER"'
        }
    }))
    res = json.loads(ws.recv())
    print('VIEW CONTAINER INNERHTML:', json.dumps(res, indent=2)[:500])

    ws.close()

finally:
    p.kill()
