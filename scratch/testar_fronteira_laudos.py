import os
import sys
import shutil
from pathlib import Path

# Ativa o modo de teste para usar o banco de dados temporário gerencigeo_test.db
os.environ["GERENCIGEO_TEST"] = "1"

# Ajusta path para importar módulos do projeto
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database.connection import DatabaseManager, execute_query
from database.models import create_tables
from business.report_generator import calcular_menor_distancia_fronteira
from api import app
from fastapi.testclient import TestClient

def format_status(success: bool) -> str:
    return "✅ [SUCESSO]" if success else "❌ [FALHA]"

def run_tests():
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except AttributeError:
        pass

    print("=" * 60)
    print("[*] INICIANDO TESTES DE RELATÓRIOS E FAIXA DE FRONTEIRA")
    print("=" * 60)

    # Inicialização do banco de testes isolado
    from config import DB_PATH
    db_test_path = Path(DB_PATH)
    
    if db_test_path.exists():
        try:
            os.remove(db_test_path)
        except Exception as e:
            print(f"[!] Erro ao remover banco de testes antigo: {e}")

    print("[*] Criando banco de testes e DDL...")
    with DatabaseManager() as conn:
        create_tables(conn)

    client = TestClient(app)

    # 1. Carga de dados (Profissional, Cliente Feminino Casado, Propriedade, Matrícula)
    # Profissional
    execute_query("""
        INSERT INTO profissionais (nome, registro, codigo_credenciado, endereco) 
        VALUES ('Eng. Thiago Silva', 'CREA-PR 12345', 'TSB', 'Avenida Brasil, 1000, Foz do Iguaçu-PR')
    """, commit=True)
    prof_id = execute_query("SELECT id FROM profissionais LIMIT 1", fetch_one=True)['id']

    # Cliente: Maria Oliveira Teste (Feminino, Casada)
    execute_query("""
        INSERT INTO clientes (
            nome_completo, cpf_cnpj, rg_ie, estado_civil, sexo, nacionalidade, 
            profissao, endereco_completo, cidade, estado,
            nome_conjuge, cpf_conjuge, rg_conjuge, regime_bens
        ) VALUES (
            'Maria Oliveira Teste', '37299462001', '7654321-PR', 'Casada', 'F', 'brasileira',
            'produtora rural', 'Linha Central, Km 10', 'Cascavel', 'PR',
            'Thiago Silva Teste', '42857708300', '1234567-PR', 'Comunhão Parcial de Bens'
        )
    """, commit=True)
    cli_id = execute_query("SELECT id FROM clientes LIMIT 1", fetch_one=True)['id']

    # Propriedade
    execute_query("""
        INSERT INTO propriedades (nome_propriedade, municipio, uf, codigo_car, codigo_ccir) 
        VALUES ('Fazenda Primavera', 'Guarapuava', 'PR', 'CAR-123', 'CCIR-456')
    """, commit=True)
    prop_id = execute_query("SELECT id FROM propriedades LIMIT 1", fetch_one=True)['id']

    # Vinculo Propriedade-Cliente (Maria)
    execute_query("""
        INSERT INTO propriedade_clientes (propriedade_id, cliente_id, percentual_participacao)
        VALUES (?, ?, 100.0)
    """, params=(prop_id, cli_id), commit=True)

    # Matrícula
    execute_query("""
        INSERT INTO matriculas (
            propriedade_id, numero_matricula, area_ha, cri_comarca, 
            cri_circunscricao, livro_registro, folha_registro, ccir, itr
        ) VALUES (?, 'Matricula_A_101', 120.5, 'Cascavel', '1° CRI', 'Livro 2-RG', 'Folha 50', 'CCIR-456', 'ITR-789')
    """, params=(prop_id,), commit=True)
    mat_id = execute_query("SELECT id FROM matriculas LIMIT 1", fetch_one=True)['id']

    # Levantamento
    execute_query("""
        INSERT INTO levantamentos (propriedade_id, profissional_id, data_inicio, status) 
        VALUES (?, ?, '2026-06-12', 'EM_ANDAMENTO')
    """, params=(prop_id, prof_id), commit=True)
    lev_id = execute_query("SELECT id FROM levantamentos LIMIT 1", fetch_one=True)['id']

    # Ponto Geodésico da Matrícula (que servirá de base do levantamento para o cálculo de fronteira)
    # Latitude e longitude próximas ao Paraguai: Lat -24.500000, Lon -54.000000
    # Marcado como tipo 'M' e status_ponto = 'CORRIGIDO' (prioritário no fallback)
    execute_query("""
        INSERT INTO pontos (
            levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, alt, status_ponto
        ) VALUES (?, ?, 'M-01', 'M', -24.5, -54.0, 700.0, 'CORRIGIDO')
    """, params=(lev_id, mat_id), commit=True)

    print("\n--- TESTE 1: Cálculo Geodésico Determinístico de Fronteira ---")
    t1_ok = True
    
    # Executa o cálculo determinístico elipsoidal
    dist_km, lat_p, lon_p = calcular_menor_distancia_fronteira(prop_id, mat_id)
    
    # O limite internacional fica em Lat -24.0671222, Lon -54.2868778.
    # Vamos calcular a distância elipsoidal esperada manualmente usando pyproj no teste para validar:
    from pyproj import Geod
    geod = Geod(ellps="GRS80")
    _, _, dist_esperada_m = geod.inv(-54.0, -24.5, -54.2868778, -24.0671222)
    dist_esperada_km = dist_esperada_m / 1000.0
    
    print(f"Distância Calculada: {dist_km:.3f} km | Esperada: {dist_esperada_km:.3f} km")
    if abs(dist_km - dist_esperada_km) > 1e-6:
        t1_ok = False
        print("❌ Falha de exatidão no cálculo elipsoidal de fronteira!")
    else:
        print(" - Cálculo de distância elipsoidal validado com sucesso!")

    print(f"Resultado Teste 1: {format_status(t1_ok)}")

    print("\n--- TESTE 2: Geração de Relatórios e Heurística de Gênero/Cônjuge (HTML) ---")
    t2_ok = True

    # 2.1 Requisita Laudo de Faixa de Fronteira via API
    url_laudo = f"/levantamentos/{lev_id}/matriculas/{mat_id}/laudo-fronteira-html?numero_trt=TRT-PR-999&data_trt=2026-06-12"
    res_laudo = client.get(url_laudo)
    
    print(f"Laudo HTML Status: {res_laudo.status_code} (Esperado: 200)")
    if res_laudo.status_code != 200:
        t2_ok = False
    else:
        html_text = res_laudo.text
        
        # Valida qualificações e tags injetadas no laudo
        tags_validas = [
            "Maria Oliveira Teste",
            "brasileira",
            "produtora rural",
            "portadora do RG n",
            "inscrita no CPF",
            "Comunhão Parcial de Bens",
            "Thiago Silva Teste",
            "Fazenda Primavera",
            "TRT-PR-999",
            f"{dist_km:.3f}"
        ]
        
        print("[Validando Tags no Laudo HTML]:")
        for tag in tags_validas:
            presente = tag in html_text
            print(f" - Tag '{tag}': {'PRESENTE' if presente else 'AUSENTE'}")
            if not presente:
                t2_ok = False

    # 2.2 Requisita Requerimento de Ratificação via API
    url_req = f"/levantamentos/{lev_id}/matriculas/{mat_id}/requerimento-ratificacao-html"
    res_req = client.get(url_req)
    
    print(f"\nRequerimento HTML Status: {res_req.status_code} (Esperado: 200)")
    if res_req.status_code != 200:
        t2_ok = False
    else:
        html_req_text = res_req.text
        
        # Valida classes de impressão e elementos no requerimento
        print("[Validando Classes de Impressão e Elementos no Requerimento]:")
        # Deve ter o botão com a classe no-print
        has_no_print = "no-print" in html_req_text
        # Deve ter window.print() para disparar impressão nativa no navegador
        has_window_print = "window.print()" in html_req_text
        # Deve ter o pronome de gênero "legítimos proprietários" no texto (já que é casada e qualifica o cônjuge)
        has_pronoun = "legítimos proprietários" in html_req_text
        
        print(f" - Contém classe 'no-print': {has_no_print}")
        print(f" - Contém script 'window.print()': {has_window_print}")
        print(f" - Contém pronome plural 'legítimos proprietários': {has_pronoun}")
        
        if not has_no_print or not has_window_print or not has_pronoun:
            t2_ok = False

    print(f"Resultado Teste 2: {format_status(t2_ok)}")

    print("\n" + "=" * 60)
    t_global = t1_ok and t2_ok
    print(f"STATUS FINAL DOS TESTES: {format_status(t_global)}")
    print("=" * 60)

    # Remove o banco de testes temporário no final
    if db_test_path.exists():
        print(f"\n[*] Removendo banco de testes temporário ({db_test_path.name})...")
        try:
            os.remove(db_test_path)
            print("[*] Banco de testes removido.")
        except Exception as e:
            print(f"[!] Não foi possível remover o banco de testes temporário: {e}")

if __name__ == "__main__":
    run_tests()
