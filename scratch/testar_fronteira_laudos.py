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
        INSERT INTO pessoas (
            nome, cpf_cnpj, rg, estado_civil, nacionalidade, 
            profissao, endereco_completo,
            nome_conjuge, cpf_conjuge, rg_conjuge, regime_bens
        ) VALUES (
            'Maria Oliveira Teste', '37299462001', '7654321-PR', 'Casada', 'brasileira',
            'produtora rural', 'Linha Central, Km 10',
            'Thiago Silva Teste', '42857708300', '1234567-PR', 'Comunhão Parcial de Bens'
        )
    """, commit=True)
    pessoa_id = execute_query("SELECT id FROM pessoas LIMIT 1", fetch_one=True)['id']

    execute_query("""
        INSERT INTO clientes (
            pessoa_id, profissional_id, email, telefone, cidade, estado, cep, sexo
        ) VALUES (?, ?, 'maria@teste.com', '4599999999', 'Cascavel', 'PR', '85800-000', 'F')
    """, params=(pessoa_id, prof_id), commit=True)
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

    # Matrícula A (Matricula_A_101)
    execute_query("""
        INSERT INTO matriculas (
            propriedade_id, numero_matricula, area_ha, cri_comarca, 
            cri_circunscricao, livro_registro, folha_registro, itr, denominacao
        ) VALUES (?, 'Matricula_A_101', 120.5, 'Cascavel', '1° CRI', 'Livro 2-RG', 'Folha 50', 'ITR-789', 'Fazenda Primavera - Gleba A')
    """, params=(prop_id,), commit=True)
    mat_id = execute_query("SELECT id FROM matriculas WHERE numero_matricula = 'Matricula_A_101' LIMIT 1", fetch_one=True)['id']

    # Matrícula B (Matricula_B_102)
    execute_query("""
        INSERT INTO matriculas (
            propriedade_id, numero_matricula, area_ha, cri_comarca, 
            cri_circunscricao, livro_registro, folha_registro, itr, denominacao, georreferenciamento
        ) VALUES (?, 'Matricula_B_102', 85.23, 'Cascavel', '1° CRI', 'Livro 2-RG', 'Folha 51', 'ITR-789', 'Fazenda Primavera - Gleba B', 'ffffffff-gggg-hhhh-iiii-jjjjjjjjjjjj')
    """, params=(prop_id,), commit=True)
    mat_b_id = execute_query("SELECT id FROM matriculas WHERE numero_matricula = 'Matricula_B_102' LIMIT 1", fetch_one=True)['id']

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

    # Inserção de pontos homologados na tabela banco_pontos
    # Ponto 1 (Gleba A)
    execute_query("""
        INSERT INTO banco_pontos (
            profissional_id, levantamento_id, matricula_id, tipo_ponto, numero, codigo_completo, norte, este, altitude, planilha_origem
        ) VALUES (?, ?, ?, 'M', 1, 'M-01', 7350000.0, 500000.0, 700.0, 'Gleba_A_Planilha.ods')
    """, params=(prof_id, lev_id, mat_id), commit=True)

    # Ponto 2 (Gleba B)
    execute_query("""
        INSERT INTO banco_pontos (
            profissional_id, levantamento_id, matricula_id, tipo_ponto, numero, codigo_completo, norte, este, altitude, planilha_origem
        ) VALUES (?, ?, ?, 'P', 2, 'P-02', 7351000.0, 501000.0, 705.0, 'Gleba_B_Planilha.ods')
    """, params=(prof_id, lev_id, mat_b_id), commit=True)

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

    # 2.3 Requisita Laudo Técnico do Cartório via API e valida remoção de assinatura
    url_laudo_tec = f"/levantamentos/{lev_id}/matriculas/{mat_id}/laudo-tecnico-html?numero_trt=TRT-PR-999&data_trt=2026-06-12"
    res_laudo_tec = client.get(url_laudo_tec)
    
    print(f"\nLaudo Técnico HTML Status: {res_laudo_tec.status_code} (Esperado: 200)")
    if res_laudo_tec.status_code != 200:
        t2_ok = False
    else:
        html_tec_text = res_laudo_tec.text
        
        # Deve ter o nome do lote e proprietários
        has_lote = "Fazenda Primavera" in html_tec_text
        has_prop = "Maria Oliveira Teste" in html_tec_text
        
        # NÃO deve conter o bloco de assinatura do profissional (que continha o endereço dele)
        has_end_prof_footer = "Avenida Brasil, 1000, Foz do Iguaçu-PR" in html_tec_text
        # NÃO deve conter a div interna com a linha de assinatura
        has_signature_box = "mt-16 flex flex-col items-center" in html_tec_text
        
        # Deve ter o resumo das glebas A e B
        has_gleba_a = "Fazenda Primavera - Gleba A" in html_tec_text
        has_gleba_b = "Fazenda Primavera - Gleba B" in html_tec_text
        # Cabeçalho da tabela de pontos deve conter a coluna de Gleba
        has_col_gleba = "Gleba / Matrícula" in html_tec_text
        # Deve listar os pontos de teste de cada gleba no tbody
        has_ponto_1 = "M-01" in html_tec_text
        has_ponto_2 = "P-02" in html_tec_text
        has_ref_gleba_a = "Fazenda Primavera - Gleba A (Matricula_A_101)" in html_tec_text
        has_ref_gleba_b = "Fazenda Primavera - Gleba B (Matricula_B_102)" in html_tec_text
        
        print("[Validando Laudo Técnico e Consolidação de Múltiplas Matrículas]:")
        print(f" - Contém nome do lote: {has_lote}")
        print(f" - Contém proprietários: {has_prop}")
        print(f" - Contém endereço do prof (deve ser False): {has_end_prof_footer}")
        print(f" - Contém div de assinatura (deve ser False): {has_signature_box}")
        print(f" - Contém Gleba A: {has_gleba_a}")
        print(f" - Contém Gleba B: {has_gleba_b}")
        print(f" - Contém coluna 'Gleba / Matrícula' no cabeçalho: {has_col_gleba}")
        print(f" - Contém ponto M-01: {has_ponto_1}")
        print(f" - Contém ponto P-02: {has_ponto_2}")
        print(f" - Contém referência ao lote A na tabela: {has_ref_gleba_a}")
        print(f" - Contém referência ao lote B na tabela: {has_ref_gleba_b}")
        
        if (not has_lote or not has_prop or has_end_prof_footer or has_signature_box or 
            not has_gleba_a or not has_gleba_b or not has_col_gleba or 
            not has_ponto_1 or not has_ponto_2 or not has_ref_gleba_a or not has_ref_gleba_b):
            t2_ok = False

    # 2.4 Requisita Requerimento de Cartório via API (Multi-matrícula) e valida consolidação
    url_req_cartorio = f"/levantamentos/{lev_id}/matriculas/{mat_id}/requerimento-cartorio-html?numero_trt=TRT-PR-999&data_trt=2026-06-12"
    res_req_cartorio = client.get(url_req_cartorio)
    
    print(f"\nRequerimento de Cartório HTML Status: {res_req_cartorio.status_code} (Esperado: 200)")
    if res_req_cartorio.status_code != 200:
        t2_ok = False
    else:
        html_req_cartorio = res_req_cartorio.text
        
        # Deve ter a tabela com as duas glebas
        has_gleba_a = "Fazenda Primavera - Gleba A" in html_req_cartorio
        has_gleba_b = "Fazenda Primavera - Gleba B" in html_req_cartorio
        has_mat_a = "Matricula_A_101" in html_req_cartorio
        has_mat_b = "Matricula_B_102" in html_req_cartorio
        has_area_total = "205,7300 ha" in html_req_cartorio
        has_encerramento_plural = "ENCERRAMENTO DAS MATRÍCULAS ORIGINÁRIAS DE NÚMEROS MATRICULA_A_101 E MATRICULA_B_102" in html_req_cartorio
        
        print("[Validando Requerimento de Cartório Consolidação Multi-matrícula]:")
        print(f" - Contém Gleba A: {has_gleba_a}")
        print(f" - Contém Gleba B: {has_gleba_b}")
        print(f" - Contém Matrícula A: {has_mat_a}")
        print(f" - Contém Matrícula B: {has_mat_b}")
        print(f" - Contém Área Total Acumulada (205.73 ha): {has_area_total}")
        print(f" - Contém Encerramento Pluralizado: {has_encerramento_plural}")
        
        if not has_gleba_a or not has_gleba_b or not has_mat_a or not has_mat_b or not has_area_total or not has_encerramento_plural:
            t2_ok = False

    # 2.5 Requisita Declaração de Responsabilidade via API (Multi-matrícula) e valida consolidação
    url_decl_resp = f"/levantamentos/{lev_id}/matriculas/{mat_id}/declaracao-responsabilidade-html"
    res_decl_resp = client.get(url_decl_resp)
    
    print(f"\nDeclaração de Responsabilidade HTML Status: {res_decl_resp.status_code} (Esperado: 200)")
    if res_decl_resp.status_code != 200:
        t2_ok = False
    else:
        html_decl_resp = res_decl_resp.text
        
        # Deve ter a tabela com as duas glebas
        has_gleba_a_dec = "Fazenda Primavera - Gleba A" in html_decl_resp
        has_gleba_b_dec = "Fazenda Primavera - Gleba B" in html_decl_resp
        has_mat_a_dec = "Matricula_A_101" in html_decl_resp
        has_mat_b_dec = "Matricula_B_102" in html_decl_resp
        has_area_a_dec = "120,5000 ha" in html_decl_resp
        has_area_b_dec = "85,2300 ha" in html_decl_resp
        
        print("[Validando Declaração de Responsabilidade Consolidação Multi-matrícula]:")
        print(f" - Contém Gleba A: {has_gleba_a_dec}")
        print(f" - Contém Gleba B: {has_gleba_b_dec}")
        print(f" - Contém Matrícula A: {has_mat_a_dec}")
        print(f" - Contém Matrícula B: {has_mat_b_dec}")
        print(f" - Contém Área A (120.5 ha): {has_area_a_dec}")
        print(f" - Contém Área B (85.23 ha): {has_area_b_dec}")
        
        if not has_gleba_a_dec or not has_gleba_b_dec or not has_mat_a_dec or not has_mat_b_dec or not has_area_a_dec or not has_area_b_dec:
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
