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
from business.geoprocessamento import reordenar_perimetro_matricula

def format_status(success: bool) -> str:
    return "✅ [SUCESSO]" if success else "❌ [FALHA]"

def run_tests():
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except AttributeError:
        pass

    print("=" * 60)
    print("[*] INICIANDO TESTES DO ALGORITMO DE REORDENAÇÃO PERIMETRAL")
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

    # Carga de dados inicial (Profissional, Cliente, Propriedade, Matricula, Levantamento)
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
        INSERT INTO matriculas (propriedade_id, numero_matricula, area_ha) 
        VALUES (?, 'Matricula_Teste_Reorder', 100.0)
    """, params=(prop_id,), commit=True)
    mat_id = execute_query("SELECT id FROM matriculas LIMIT 1", fetch_one=True)['id']

    execute_query("""
        INSERT INTO levantamentos (propriedade_id, profissional_id, data_inicio, status) 
        VALUES (?, ?, '2026-06-12', 'EM_ANDAMENTO')
    """, params=(prop_id, prof_id), commit=True)
    lev_id = execute_query("SELECT id FROM levantamentos LIMIT 1", fetch_one=True)['id']

    # Inserção de confrontante para teste de preservação
    execute_query("""
        INSERT INTO confrontantes (levantamento_id, nome)
        VALUES (?, 'Vizinho Confrontante Historico')
    """, params=(lev_id,), commit=True)
    conf_id = execute_query("SELECT id FROM confrontantes LIMIT 1", fetch_one=True)['id']

    print("\n--- TESTE 1: Ingestão de Polígono Simples Desordenado (Sentido Anti-Horário) ---")
    
    # Inserção dos 4 vértices de um quadrado de 1 grau (~111km de lado) no sentido anti-horário e desordenados:
    # A (Norte/Oeste): lat -24.0, lon -47.0
    # B (Norte/Leste): lat -24.0, lon -46.0  <- Extremo Norte / Mais a Leste
    # C (Sul/Leste): lat -25.0, lon -46.0
    # D (Sul/Oeste): lat -25.0, lon -47.0
    
    # Ordem de Inserção Bruta (C -> B -> A -> D)
    pts_bruto = [
        {"nome": "V-03_C", "lat": -25.0, "lon": -46.0, "ordem": 1},
        {"nome": "V-02_B", "lat": -24.0, "lon": -46.0, "ordem": 2},
        {"nome": "V-01_A", "lat": -24.0, "lon": -47.0, "ordem": 3},
        {"nome": "V-04_D", "lat": -25.0, "lon": -47.0, "ordem": 4}
    ]

    for pt in pts_bruto:
        execute_query("""
            INSERT INTO pontos (levantamento_id, matricula_id, nome_vertice, tipo_ponto, lat, lon, alt, ordem_caminhamento)
            VALUES (?, ?, ?, 'V', ?, ?, 800.0, ?)
        """, params=(lev_id, mat_id, pt["nome"], pt["lat"], pt["lon"], pt["ordem"]), commit=True)

    # Pegamos os IDs dos pontos para o log
    pt_ids = {}
    for row in execute_query("SELECT id, nome_vertice FROM pontos", fetch_all=True):
        pt_ids[row["nome_vertice"]] = row["id"]

    # Cria um segmento inicial fictício ligando V-02_B a V-03_C e associa ao confrontante histórico
    # Queremos testar se a informação do confrontante é mantida após a reordenação!
    execute_query("""
        INSERT INTO segmentos (levantamento_id, matricula_id, ponto_inicio_id, ponto_fim_id, confrontante_id, tipo_limite_sigef, metodo_posicionamento_sigef)
        VALUES (?, ?, ?, ?, ?, 'LA2', 'MC1')
    """, params=(lev_id, mat_id, pt_ids["V-02_B"], pt_ids["V-03_C"], conf_id), commit=True)

    print("[*] Disparando reordenar_perimetro_matricula...")
    res = reordenar_perimetro_matricula(lev_id, mat_id)
    print("Resultado da Função:", res)

    t1_ok = True
    if not res.get("sucesso"):
        t1_ok = False
        print("❌ Falha: A função retornou erro:", res.get("erro"))
    else:
        # 1. Validar se o Ponto Inicial é V-02_B (Mais ao norte, desempate Leste)
        if res.get("ponto_inicial") != "V-02_B":
            t1_ok = False
            print("❌ Falha: Ponto inicial esperado: V-02_B, recebido:", res.get("ponto_inicial"))
        else:
            print("- Ponto inicial Extremo Norte validado (V-02_B)!")

        # 2. Validar se a Orientação Original foi identificada como ANTI-HORÁRIO
        if res.get("orientacao_original") != "ANTI-HORÁRIO":
            t1_ok = False
            print("❌ Falha: Orientação original esperada: ANTI-HORÁRIO, recebida:", res.get("orientacao_original"))
        else:
            print("- Orientação original anti-horária detectada e invertida!")

    # 3. Validar se os pontos receberam ordem de caminhamento corretas em sentido horário
    # Esperado:
    # 1. V-02_B
    # 2. V-03_C
    # 3. V-04_D
    # 4. V-01_A
    pontos_ordenados = execute_query("SELECT nome_vertice, ordem_caminhamento FROM pontos ORDER BY ordem_caminhamento ASC", fetch_all=True)
    ordem_esperada = ["V-02_B", "V-03_C", "V-04_D", "V-01_A"]
    print("\n[Ordem de Caminhamento Gravada no Banco]:")
    for i, pt in enumerate(pontos_ordenados):
        print(f" - Ordem {pt['ordem_caminhamento']}: {pt['nome_vertice']}")
        if pt['nome_vertice'] != ordem_esperada[i] or pt['ordem_caminhamento'] != (i + 1):
            t1_ok = False
            print(f"❌ Desvio na ordem. Esperado: {ordem_esperada[i]} na posição {i+1}")

    # 4. Validar os segmentos gerados e a preservação de confrontante histórico
    # Os segmentos devem ser:
    # Seg 1: V-02_B -> V-03_C
    # Seg 2: V-03_C -> V-04_D
    # Seg 3: V-04_D -> V-01_A
    # Seg 4: V-01_A -> V-02_B (Fechamento)
    segmentos = execute_query("""
        SELECT s.id, p_ini.nome_vertice as p_ini, p_fim.nome_vertice as p_fim, s.confrontante_id, c.nome as conf_nome
        FROM segmentos s
        JOIN pontos p_ini ON s.ponto_inicio_id = p_ini.id
        JOIN pontos p_fim ON s.ponto_fim_id = p_fim.id
        LEFT JOIN confrontantes c ON s.confrontante_id = c.id
        ORDER BY s.id ASC
    """, fetch_all=True)

    print(f"\n[Segmentos gerados]: {len(segmentos)}")
    if len(segmentos) != 4:
        t1_ok = False
        print("❌ Falha: Número de segmentos gerados inválido!")
    else:
        conexoes_esperadas = [
            ("V-02_B", "V-03_C"),
            ("V-03_C", "V-04_D"),
            ("V-04_D", "V-01_A"),
            ("V-01_A", "V-02_B")
        ]
        for idx, seg in enumerate(segmentos):
            ini, fim = conexoes_esperadas[idx]
            print(f" - Segmento {idx+1}: {seg['p_ini']} -> {seg['p_fim']} | Confrontante: {seg['conf_nome']}")
            if seg['p_ini'] != ini or seg['p_fim'] != fim:
                t1_ok = False
                print(f"❌ Segmento incorreto! Esperado: {ini} -> {fim}")
            
            # Valida se a associação do confrontante 'Vizinho Confrontante Historico' foi preservada
            if seg['p_ini'] == "V-02_B" and seg['p_fim'] == "V-03_C":
                if seg['confrontante_id'] != conf_id:
                    t1_ok = False
                    print("❌ Falha: O confrontante histórico do segmento V-02_B -> V-03_C não foi preservado!")
                else:
                    print(" - Confrontante histórico preservado com sucesso no segmento V-02_B -> V-03_C!")

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
