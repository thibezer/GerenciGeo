import os
import sys
import shutil
import math
from pathlib import Path
from pyproj import Transformer

# Ativa o modo de teste para usar o banco de dados temporário gerencigeo_test.db
os.environ["GERENCIGEO_TEST"] = "1"

# Ajusta path para importar módulos do projeto
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database.connection import DatabaseManager, execute_query
from database.models import create_tables
from business.geoprocessamento import corrigir_rovers_em_bloco

def format_status(success: bool) -> str:
    return "✅ [SUCESSO]" if success else "❌ [FALHA]"

def run_tests():
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except AttributeError:
        pass

    print("=" * 60)
    print("[*] INICIANDO TESTES DO MOTOR DE TRANSLAÇÃO GEODÉSICA")
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

    # Carga de dados inicial
    execute_query("""
        INSERT INTO profissionais (nome, registro, codigo_credenciado) 
        VALUES ('Eng. Thiago Silva', 'CREA-PR 12345', 'TSB')
    """, commit=True)
    prof_id = execute_query("SELECT id FROM profissionais LIMIT 1", fetch_one=True)['id']

    execute_query("""
        INSERT INTO propriedades (nome_propriedade, municipio, uf) 
        VALUES ('Fazenda Primavera', 'Guarapuava', 'PR')
    """, commit=True)
    prop_id = execute_query("SELECT id FROM propriedades LIMIT 1", fetch_one=True)['id']

    execute_query("""
        INSERT INTO levantamentos (propriedade_id, profissional_id, data_inicio, status) 
        VALUES (?, ?, '2026-06-12', 'EM_ANDAMENTO')
    """, params=(prop_id, prof_id), commit=True)
    lev_id = execute_query("SELECT id FROM levantamentos LIMIT 1", fetch_one=True)['id']

    print("\n--- TESTE 1: Translação de Rovers em Bloco (Vetor Delta) ---")
    t1_ok = True

    # 1. Inserir a Base já Corrigida
    # Coordenadas geodésicas corrigidas (PPP): Lat -24.0, Lon -51.0 (Meridiano Central Fuso 22S)
    # Altitude corrigida: 105.000m
    # Sigmas da base corrigida: lat=0.005, lon=0.005, alt=0.010
    # Coordenadas brutas de campo da base: UTM E=500000.0, N=10000000.0, h=100.0
    execute_query("""
        INSERT INTO pontos (
            levantamento_id, nome_vertice, tipo_ponto, lat, lon, alt, 
            e_original, n_original, alt_original, 
            sigma_lat, sigma_lon, sigma_alt, status_ponto
        ) VALUES (?, 'BASE-01', 'M', -24.0, -51.0, 105.0, 500000.0, 10000000.0, 100.0, 0.005, 0.005, 0.010, 'CORRIGIDO')
    """, params=(lev_id,), commit=True)
    base_id = execute_query("SELECT id FROM pontos WHERE nome_vertice = 'BASE-01'", fetch_one=True)['id']

    # Converte lat=-24.0, lon=-51.0 para UTM Zone 22S para calcularmos os deltas esperados analiticamente
    transformer_to_utm = Transformer.from_crs("epsg:4674", "epsg:31982", always_xy=True)
    e_base_corr, n_base_corr = transformer_to_utm.transform(-51.0, -24.0)
    
    delta_e_esp = e_base_corr - 500000.0
    delta_n_esp = n_base_corr - 10000000.0
    delta_h_esp = 105.0 - 100.0
    
    print(f"Base Corrigida Calculada UTM: E={e_base_corr:.4f}, N={n_base_corr:.4f}")
    print(f"Vetor Delta Esperado: dE={delta_e_esp:.4f}, dN={delta_n_esp:.4f}, dH={delta_h_esp:.4f}")

    # 2. Inserir Rovers amarrados à Base-01 (status_ponto = 'BRUTO')
    # Rover 1: brutas UTM E=500100.0, N=10000100.0, h=100.0 | Sigmas originais de campo: E=0.02, N=0.02, h=0.04
    execute_query("""
        INSERT INTO pontos (
            levantamento_id, nome_vertice, tipo_ponto, ponto_base_id,
            e_original, n_original, alt_original,
            sigma_e, sigma_n, sigma_z, status_ponto
        ) VALUES (?, 'ROV-01', 'P', ?, 500100.0, 10000100.0, 100.0, 0.02, 0.02, 0.04, 'BRUTO')
    """, params=(lev_id, base_id), commit=True)

    # Rover 2: brutas UTM E=499900.0, N=9999900.0, h=100.0 | Sigmas originais: E=0.03, N=0.03, h=0.06
    execute_query("""
        INSERT INTO pontos (
            levantamento_id, nome_vertice, tipo_ponto, ponto_base_id,
            e_original, n_original, alt_original,
            sigma_e, sigma_n, sigma_z, status_ponto
        ) VALUES (?, 'ROV-02', 'P', ?, 499900.0, 9999900.0, 100.0, 0.03, 0.03, 0.06, 'BRUTO')
    """, params=(lev_id, base_id), commit=True)

    # 3. Disparar a translação geodésica em bloco
    print("[*] Chamando corrigir_rovers_em_bloco...")
    qtd_corrigidos = corrigir_rovers_em_bloco(lev_id, base_id)
    print(f"Quantidade de rovers corrigidos: {qtd_corrigidos} (Esperado: 2)")
    if qtd_corrigidos != 2:
        t1_ok = False

    # 4. Validar as coordenadas e sigmas propagados dos rovers corrigidos no banco
    rows_corrigidas = execute_query("SELECT * FROM pontos WHERE ponto_base_id = ?", params=(base_id,), fetch_all=True)
    
    transformer_to_latlon = Transformer.from_crs("epsg:31982", "epsg:4674", always_xy=True)
    
    for row in rows_corrigidas:
        pt = dict(row)
        print(f"\n[Rover {pt['nome_vertice']}]:")
        print(f" - Status: {pt['status_ponto']} (Esperado: CORRIGIDO)")
        print(f" - Status Correção: {pt['status_correcao']} (Esperado: CORRIGIDO)")
        
        # Coordenadas UTM corrigidas esperadas
        e_corr_esp = pt["e_original"] + delta_e_esp
        n_corr_esp = pt["n_original"] + delta_n_esp
        alt_corr_esp = pt["alt_original"] + delta_h_esp
        
        # Converte para geodésica esperada
        lon_esp, lat_esp = transformer_to_latlon.transform(e_corr_esp, n_corr_esp)
        
        # Sigmas esperados
        sig_lat_esp = math.sqrt(pt["sigma_n"]**2 + 0.005**2)
        sig_lon_esp = math.sqrt(pt["sigma_e"]**2 + 0.005**2)
        sig_alt_esp = math.sqrt(pt["sigma_z"]**2 + 0.010**2)
        
        print(f" - Lat gravada: {pt['lat_corrigido']:.8f} | Esperada: {lat_esp:.8f}")
        print(f" - Lon gravada: {pt['lon_corrigido']:.8f} | Esperada: {lon_esp:.8f}")
        print(f" - Alt gravada: {pt['alt_corrigido']:.3f} | Esperada: {alt_corr_esp:.3f}")
        print(f" - Sigma Lat: {pt['sigma_lat']:.4f} | Esperado: {sig_lat_esp:.4f}")
        print(f" - Sigma Lon: {pt['sigma_lon']:.4f} | Esperado: {sig_lon_esp:.4f}")
        print(f" - Sigma Alt: {pt['sigma_alt']:.4f} | Esperado: {sig_alt_esp:.4f}")
        
        # Validações com tolerância numérica de precisão de ponto flutuante
        if pt["status_ponto"] != "CORRIGIDO" or pt["status_correcao"] != "CORRIGIDO":
            t1_ok = False
            print("❌ Falha no status!")
            
        if abs(pt["lat_corrigido"] - lat_esp) > 1e-9 or abs(pt["lon_corrigido"] - lon_esp) > 1e-9:
            t1_ok = False
            print("❌ Falha de exatidão de coordenadas geodésicas!")
            
        if abs(pt["alt_corrigido"] - alt_corr_esp) > 1e-3:
            t1_ok = False
            print("❌ Falha de exatidão de altitude!")
            
        if abs(pt["sigma_lat"] - sig_lat_esp) > 1e-4 or abs(pt["sigma_lon"] - sig_lon_esp) > 1e-4 or abs(pt["sigma_alt"] - sig_alt_esp) > 1e-4:
            t1_ok = False
            print("❌ Falha na propagação de incertezas (Sigmas)!")

    # 5. Verificar se um log de auditoria do geoprocessamento foi gravado no histórico de campo
    logs_trans = execute_query("SELECT * FROM historico_alteracoes_campo WHERE tipo_evento = 'CORRECAO_TRANSLACAO'", fetch_all=True)
    print(f"\nLogs de translação no histórico de campo: {len(logs_trans)} (Esperado: 1)")
    if len(logs_trans) != 1:
        t1_ok = False
    else:
        print(f" - Evento: {logs_trans[0]['tipo_evento']} | Descrição: {logs_trans[0]['descricao']}")

    print(f"\nResultado Teste 1: {format_status(t1_ok)}")

    print("\n" + "=" * 60)
    print(f"STATUS FINAL DOS TESTES: {format_status(t1_ok)}")
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
