import urllib.request
import ssl
import json

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

urls = [
    'https://darkgray-duck-674813.hostingersite.com/',
    'https://darkgray-duck-674813.hostingersite.com/principal.html',
    'https://darkgray-duck-674813.hostingersite.com/index.html',
    'https://darkgray-duck-674813.hostingersite.com/api.php',
    'https://darkgray-duck-674813.hostingersite.com/api.php?action=list',
    'https://darkgray-duck-674813.hostingersite.com/api.php?action=get_lev&id=1',
    'https://darkgray-duck-674813.hostingersite.com/api/status',
    'https://darkgray-duck-674813.hostingersite.com/api/clientes',
    'https://darkgray-duck-674813.hostingersite.com/dados.json',
    'https://darkgray-duck-674813.hostingersite.com/uploads/',
    'https://darkgray-duck-674813.hostingersite.com/levantamentos/',
    'https://darkgray-duck-674813.hostingersite.com/version.json',
    'https://darkgray-duck-674813.hostingersite.com/assets/'
]

for u in urls:
    try:
        req = urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, context=ctx, timeout=10) as resp:
            content = resp.read(500)
            print(f"[{resp.status}] {u} | Content-Type: {resp.headers.get('Content-Type')} | Snippet: {content[:100]}")
    except urllib.error.HTTPError as e:
        print(f"[{e.code}] {u} | HTTPError: {e.reason}")
    except Exception as e:
        print(f"[ERR] {u} | {e}")
