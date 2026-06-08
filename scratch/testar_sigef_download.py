import requests

codigo_parcela = "c0a6f72f-ae52-45a1-bb08-862a85401588"
url = f"https://sigef.incra.gov.br/geo/exportar/vertice/csv/{codigo_parcela}"

output = []

# 1. Sem User-Agent customizado
try:
    r = requests.get(url, timeout=10)
    output.append("Sem User-Agent:")
    output.append(f"Status: {r.status_code}")
    output.append(f"Content-Type: {r.headers.get('Content-Type')}")
    output.append(f"Preview: {r.text[:200]}")
except Exception as e:
    output.append(f"Erro sem User-Agent: {e}")

output.append("-" * 50)

# 2. Com User-Agent simulando Chrome
headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
}

try:
    r = requests.get(url, headers=headers, timeout=10)
    output.append("Com User-Agent Chrome:")
    output.append(f"Status: {r.status_code}")
    output.append(f"Content-Type: {r.headers.get('Content-Type')}")
    output.append(f"Preview: {r.text[:200]}")
except Exception as e:
    output.append(f"Erro com User-Agent: {e}")

# Salva em arquivo
with open("scratch/resultado_sigef.txt", "w", encoding="utf-8") as f:
    f.write("\n".join(output))
