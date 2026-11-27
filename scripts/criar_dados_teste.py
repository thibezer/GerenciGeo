"""Cria (ou reaproveita) o CENÁRIO DE TESTE fixo do GerenciGeo, pela API do app em execução.

Cenário (tudo fictício, identificado por "TESTE" no nome):
  - Cliente PF casado:  CLIENTE TESTE GERENCIGEO (+ cônjuge)
  - Propriedade:        PROPRIEDADE TESTE GERENCIGEO (Umuarama/PR), matrícula 99999
  - Levantamento:       4 vértices (TST-P-0001..0004) e 4 divisas
  - Confrontante PJ:    EMPRESA CONFRONTANTE TESTE LTDA com 3 representantes legais
  - Confrontante PF:    CONFRONTANTE PF TESTE (casado) + 1 coproprietário

Idempotente: rodar de novo não duplica (procura pelo nome). Mostra os IDs no final.
Uso: python scripts/criar_dados_teste.py [--url http://127.0.0.1:8000]
Docs para agentes: ver .agents/AGENTS.md ("Cenário de teste fixo").
"""
import argparse
import json
import os
import sys
from datetime import date

import requests

NOME_CLIENTE = "CLIENTE TESTE GERENCIGEO"
NOME_PROP = "PROPRIEDADE TESTE GERENCIGEO"
NOME_PJ = "EMPRESA CONFRONTANTE TESTE LTDA"
NOME_PF = "CONFRONTANTE PF TESTE"
MATRICULA = "99999"
# CPFs/CNPJ com dígitos verificadores válidos, mas de ninguém (gerados para teste).
CPF_CLIENTE, CPF_CONJUGE = "529.982.247-25", "111.444.777-35"
CNPJ_PJ = "11.222.333/0001-81"
CPF_PF, CPF_PF_CONJ, CPF_COPROP = "390.533.447-05", "168.995.350-09", "453.178.287-91"

REPRESENTANTES = [
    {"cpf_cnpj": "529.982.247-25", "nome": "REPRESENTANTE UM TESTE", "rg": "1.111.111-1 SSP/PR", "genero": "M",
     "nacionalidade": "brasileiro(a)", "profissao": "administrador", "estado_civil": "casado", "endereco_completo": ""},
    {"cpf_cnpj": "111.444.777-35", "nome": "REPRESENTANTE DOIS TESTE", "rg": "2.222.222-2 SSP/PR", "genero": "F",
     "nacionalidade": "brasileira", "profissao": "contadora", "estado_civil": "solteiro",
     "endereco_completo": "Rua das Flores, 100, Centro, Umuarama/PR"},
    {"cpf_cnpj": "390.533.447-05", "nome": "REPRESENTANTE TRES TESTE", "rg": "3.333.333-3 SSP/PR", "genero": "M",
     "nacionalidade": "brasileiro(a)", "profissao": "engenheiro", "estado_civil": "divorciado", "endereco_completo": ""},
]
# Quadrado ~100 m em Umuarama/PR (lat, lon, alt)
VERTICES = [(-23.7500, -53.3100, 400.0), (-23.7500, -53.3090, 401.0),
            (-23.7509, -53.3090, 402.0), (-23.7509, -53.3100, 401.0)]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://127.0.0.1:8000")
    base = ap.parse_args().url.rstrip("/")
    s = requests.Session()

    def req(metodo, caminho, **kw):
        r = s.request(metodo, base + caminho, timeout=60, **kw)
        if r.status_code >= 400:
            raise SystemExit(f"{metodo} {caminho} -> {r.status_code}: {r.text[:300]}")
        return r.json() if r.content else {}

    def lista(dado, chave):
        return dado if isinstance(dado, list) else dado.get(chave, [])

    # 1. Cliente
    cli = next((c for c in lista(req("GET", "/clientes"), "clientes") if (c.get("nome") or c.get("nome_completo")) == NOME_CLIENTE), None)
    if cli:
        cliente_id = cli["id"]
    else:
        res = req("POST", "/clientes", json={
            "nome_completo": NOME_CLIENTE, "cpf_cnpj": CPF_CLIENTE, "rg_ie": "9.999.999-9", "rg_orgao": "SSP", "rg_uf": "PR",
            "sexo": "M", "estado_civil": "casado", "regime_bens": "comunhao_parcial", "profissao": "agricultor",
            "nacionalidade": "brasileiro(a)", "nome_conjuge": "CÔNJUGE TESTE GERENCIGEO", "cpf_conjuge": CPF_CONJUGE,
            "genero_conjuge": "F", "nacionalidade_conjuge": "brasileira", "profissao_conjuge": "professora",
            "endereco_completo": "Rua Teste, 123, Centro, Umuarama/PR", "cidade": "Umuarama", "estado": "PR",
            "email": "teste@exemplo.invalid", "telefone": "(44) 90000-0000"})
        cliente_id = res.get("id") or res.get("cliente_id")

    # 2. Propriedade + vínculo + matrícula
    prop = next((p for p in lista(req("GET", "/propriedades"), "propriedades") if p.get("nome_propriedade") == NOME_PROP), None)
    if prop:
        prop_id = prop["id"]
    else:
        prop_id = req("POST", "/propriedades", json={"nome_propriedade": NOME_PROP, "municipio": "Umuarama", "uf": "PR"})["id"]
        req("POST", f"/propriedades/{prop_id}/clientes", json={"cliente_id": cliente_id, "percentual_participacao": 100})
    if not any(m["numero_matricula"] == MATRICULA for m in req("GET", f"/propriedades/{prop_id}/matriculas")):
        req("POST", f"/propriedades/{prop_id}/matriculas", json={
            "numero_matricula": MATRICULA, "area_ha": 0.9, "area_registrada_ha": 0.9, "denominacao": "Lote Teste"})
    mat_prop = next(m for m in req("GET", f"/propriedades/{prop_id}/matriculas") if m["numero_matricula"] == MATRICULA)

    # 3. Levantamento (reaproveita o existente da propriedade)
    levs = [l for l in lista(req("GET", "/levantamentos"), "levantamentos") if l.get("propriedade_id") == prop_id]
    if levs:
        lev_id = levs[0]["id"]
    else:
        prof_id = req("GET", "/profissionais")[0]["id"]
        lev_id = req("POST", "/levantamentos", json={
            "propriedade_id": prop_id, "profissional_id": prof_id, "data_inicio": date.today().isoformat(),
            "numero_trt": "TESTE-000"})["id"]
    mat_id = next(m["id"] for m in req("GET", f"/levantamentos/{lev_id}/matriculas") if m["numero_matricula"] == MATRICULA)

    # 4. Pontos e confrontantes
    pontos = req("GET", f"/levantamentos/{lev_id}/pontos")
    if not any(str(p.get("nome_vertice", "")).startswith("TST-P-") for p in pontos):
        for i, (lat, lon, alt) in enumerate(VERTICES, 1):
            req("POST", f"/levantamentos/{lev_id}/pontos", json={
                "matricula_id": mat_id, "nome_vertice": f"TST-P-{i:04d}", "tipo_ponto": "P",
                "lat": lat, "lon": lon, "alt": alt, "ordem_caminhamento": i})
    pts = sorted([p for p in req("GET", f"/levantamentos/{lev_id}/pontos") if str(p.get("nome_vertice", "")).startswith("TST-P-")],
                 key=lambda p: p["nome_vertice"])

    def garantir_confrontante(nome, payload):
        achado = next((c for c in req("GET", f"/levantamentos/{lev_id}/confrontantes") if c.get("nome") == nome), None)
        if achado:
            return achado["id"]
        req("POST", f"/levantamentos/{lev_id}/confrontantes", json=payload)
        return next(c["id"] for c in req("GET", f"/levantamentos/{lev_id}/confrontantes") if c.get("nome") == nome)

    pj_id = garantir_confrontante(NOME_PJ, {
        "nome": NOME_PJ, "cpf_cnpj": CNPJ_PJ, "rg": "123456789", "endereco_completo": "Av. Empresarial, 500, Umuarama/PR",
        "matricula_imovel": "88881", "lote": "Lote 1", "titular_assina": True, "representantes": REPRESENTANTES})
    pf_id = garantir_confrontante(NOME_PF, {
        "nome": NOME_PF, "cpf_cnpj": CPF_PF, "rg": "4.444.444-4", "genero": "M", "estado_civil": "casado",
        "regime_bens": "comunhao_parcial", "profissao": "pecuarista", "nacionalidade": "brasileiro(a)",
        "nome_conjuge": "CÔNJUGE PF TESTE", "cpf_conjuge": CPF_PF_CONJ, "genero_conjuge": "F",
        "endereco_completo": "Sítio Teste, Zona Rural, Umuarama/PR", "matricula_imovel": "88882", "lote": "Lote 2",
        "coproprietarios": [{"nome": "COPROPRIETÁRIO TESTE", "cpf_cnpj": CPF_COPROP, "genero": "M", "estado_civil": "solteiro",
                             "profissao": "agricultor", "nacionalidade": "brasileiro(a)"}]})

    # 5. Divisas: 0->1 PJ, 1->2 PF, 2->3 PJ, 3->0 PF
    if len(pts) >= 4 and not req("GET", f"/levantamentos/{lev_id}/segmentos"):
        for i, conf in enumerate([pj_id, pf_id, pj_id, pf_id]):
            req("POST", f"/levantamentos/{lev_id}/segmentos", json={
                "matricula_id": mat_id, "ponto_inicio_id": pts[i]["id"], "ponto_fim_id": pts[(i + 1) % 4]["id"],
                "confrontante_id": conf, "tipo_limite_sigef": "LA1", "metodo_posicionamento_sigef": "PG1"})

    # 6. Marca como HOMOLOGADO (a tela de confrontantes e o cartório só enxergam o que veio do arquivo homologado).
    # A API não expõe isso sem importar uma planilha; atualiza direto, restrito a este levantamento.
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from database.connection import execute_query
    execute_query("UPDATE pontos SET origem_homologada = 1, arquivo_origem = COALESCE(arquivo_origem, 'TESTE_HOMOLOGADO') "
                  "WHERE levantamento_id = ? AND nome_vertice LIKE 'TST-P-%'", params=(lev_id,), commit=True)
    execute_query("UPDATE segmentos SET origem_homologada = 1 WHERE levantamento_id = ?", params=(lev_id,), commit=True)

    resumo = {"cliente_id": cliente_id, "propriedade_id": prop_id, "levantamento_id": lev_id,
              "matricula_levantamento_id": mat_id, "confrontante_pj_id": pj_id, "confrontante_pf_id": pf_id}
    print(json.dumps(resumo, indent=2, ensure_ascii=False))
    print(f"Anuência PJ: GET {base}/levantamentos/{lev_id}/matriculas/{mat_id}/confrontantes/{pj_id}/anuencia-html")
    return 0


if __name__ == "__main__":
    sys.exit(main())
