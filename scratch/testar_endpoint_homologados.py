import requests

try:
    # Faz requisição para o novo endpoint de pontos homologados da matrícula
    # Usando levantamento ID 11 e matrícula ID 8 (que têm pontos homologados)
    # Vamos validar
    res = requests.get("http://127.0.0.1:8000/levantamentos/11/matriculas/8/pontos-homologados")
    if res.status_code == 200:
        pts = res.json()
        print(f"Sucesso! Retornou {len(pts)} pontos homologados.")
        if len(pts) > 0:
            print("Primeiros 3 pontos na ordem de caminhamento:")
            for p in pts[:3]:
                print(f"  Ordem: {p.get('ordem_caminhamento')} | Código: {p.get('codigo_completo')} | Tipo: {p.get('tipo_ponto')}")
            
            # Validar se estão ordenados por ordem_caminhamento ASC
            ordens = [p.get('ordem_caminhamento') for p in pts]
            is_sorted = ordens == sorted(ordens)
            print(f"Ordenação por ordem_caminhamento está correta? {is_sorted} (Ordens: {ordens})")
        else:
            print("Aviso: Nenhum ponto encontrado.")
    else:
        print(f"Erro {res.status_code}: {res.text}")
except Exception as e:
    print("Erro na validação:", e)
