import sqlite3
import sys
import os

# Adiciona o diretório do projeto ao path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.gestores.confrontante_manager import resolver_confrontantes_planilha, vincular_confrontantes_pontos

def inicializar_banco_teste():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # Criar tabelas
    cursor.execute("""
        CREATE TABLE confrontantes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            levantamento_id INTEGER NOT NULL,
            nome TEXT NOT NULL,
            matricula_imovel TEXT,
            cns_confrontante TEXT
        )
    """)
    
    cursor.execute("""
        CREATE TABLE pontos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            levantamento_id INTEGER NOT NULL,
            matricula_id INTEGER,
            nome_vertice TEXT NOT NULL,
            tipo_ponto TEXT NOT NULL,
            lat REAL,
            lon REAL,
            alt REAL,
            ordem_caminhamento INTEGER,
            sigma_lat REAL
        )
    """)
    
    cursor.execute("""
        CREATE TABLE segmentos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            levantamento_id INTEGER NOT NULL,
            matricula_id INTEGER NOT NULL,
            ponto_inicio_id INTEGER NOT NULL,
            ponto_fim_id INTEGER NOT NULL,
            confrontante_id INTEGER,
            tipo_limite_sigef TEXT,
            metodo_posicionamento_sigef TEXT
        )
    """)
    
    return conn, cursor

def test_resolver_confrontantes():
    print("Executando test_resolver_confrontantes...")
    conn, cursor = inicializar_banco_teste()
    lev_id = 1
    
    # Simular pontos de uma importação (Matrícula A lindeira a Vitor Koyama, Matrícula 6622)
    pontos_lote_a = [
        {
            "codigo_completo": "TST-M-0001",
            "matricula_confrontante": "6622",
            "cns_confrontante": "123",
            "confrontante_descritivo": "Vitor Shin Itiro Koyama"
        }
    ]
    
    # Executar a primeira resolução
    mapa_a = resolver_confrontantes_planilha(lev_id, pontos_lote_a, cursor)
    assert "TST-M-0001" in mapa_a
    conf_id_1 = mapa_a["TST-M-0001"]
    
    # Verificar inserção no banco
    cursor.execute("SELECT * FROM confrontantes WHERE id = ?", (conf_id_1,))
    row = cursor.fetchone()
    assert row is not None
    assert row["nome"] == "Vitor Shin Itiro Koyama"
    assert row["matricula_imovel"] == "6622"
    assert row["cns_confrontante"] == "123"
    
    # Simular pontos de outra importação (Matrícula B lindeira a Vitor Koyama, Matrícula 5893 - Diferente!)
    pontos_lote_b = [
        {
            "codigo_completo": "TST-M-0002",
            "matricula_confrontante": "5893",
            "cns_confrontante": "123",
            "confrontante_descritivo": "Vitor Shin Itiro Koyama"
        }
    ]
    
    # Executar a segunda resolução
    mapa_b = resolver_confrontantes_planilha(lev_id, pontos_lote_b, cursor)
    assert "TST-M-0002" in mapa_b
    conf_id_2 = mapa_b["TST-M-0002"]
    
    # Os confrontantes devem ser DIFERENTES porque têm matrículas confrontantes diferentes
    assert conf_id_1 != conf_id_2
    
    cursor.execute("SELECT * FROM confrontantes WHERE id = ?", (conf_id_2,))
    row2 = cursor.fetchone()
    assert row2 is not None
    assert row2["nome"] == "Vitor Shin Itiro Koyama"
    assert row2["matricula_imovel"] == "5893"
    
    # Simular ponto sem matrícula, mas com o mesmo nome
    pontos_lote_c = [
        {
            "codigo_completo": "TST-M-0003",
            "matricula_confrontante": "",
            "cns_confrontante": "",
            "confrontante_descritivo": "VITOR SHIN ITIRO KOYAMA"
        }
    ]
    
    # Deve resolver para um dos existentes (como não tem matrícula especificada)
    mapa_c = resolver_confrontantes_planilha(lev_id, pontos_lote_c, cursor)
    conf_id_3 = mapa_c["TST-M-0003"]
    assert conf_id_3 in (conf_id_1, conf_id_2)
    
    # Simular confrontante genérico (ex: Estrada) sem matrícula
    pontos_estrada_1 = [
        {
            "codigo_completo": "TST-M-0004",
            "matricula_confrontante": "",
            "cns_confrontante": "",
            "confrontante_descritivo": "ESTRADA MUNICIPAL YARA"
        }
    ]
    mapa_e1 = resolver_confrontantes_planilha(lev_id, pontos_estrada_1, cursor)
    est_id_1 = mapa_e1["TST-M-0004"]
    
    # Outro ponto na Estrada Municipal Yara sem matrícula
    pontos_estrada_2 = [
        {
            "codigo_completo": "TST-M-0005",
            "matricula_confrontante": "",
            "cns_confrontante": "",
            "confrontante_descritivo": "ESTRADA MUNICIPAL YARA"
        }
    ]
    mapa_e2 = resolver_confrontantes_planilha(lev_id, pontos_estrada_2, cursor)
    est_id_2 = mapa_e2["TST-M-0005"]
    
    # Devem ser o mesmo ID (desduplicação por nome sem matrícula)
    assert est_id_1 == est_id_2
    
    print("test_resolver_confrontantes concluído com sucesso!")
    conn.close()

def test_vincular_confrontantes_pontos():
    print("Executando test_vincular_confrontantes_pontos...")
    conn, cursor = inicializar_banco_teste()
    lev_id = 1
    
    # Inserir confrontantes existentes
    cursor.execute("INSERT INTO confrontantes (levantamento_id, nome, matricula_imovel) VALUES (?, ?, ?)", (lev_id, "Vitor Koyama", "6622"))
    conf_id_1 = cursor.lastrowid
    cursor.execute("INSERT INTO confrontantes (levantamento_id, nome, matricula_imovel) VALUES (?, ?, ?)", (lev_id, "Vitor Koyama", "5893"))
    conf_id_2 = cursor.lastrowid
    
    pontos_inseridos = [
        {
            "codigo_completo": "TST-M-0001",
            "matricula_confrontante": "6622",
            "confrontante_descritivo": "Vitor Koyama"
        },
        {
            "codigo_completo": "TST-M-0002",
            "matricula_confrontante": "5893",
            "confrontante_descritivo": "Vitor Koyama"
        },
        {
            "codigo_completo": "TST-M-0003",
            "matricula_confrontante": "",
            "confrontante_descritivo": "Vitor Koyama"
        }
    ]
    
    mapa = vincular_confrontantes_pontos(lev_id, pontos_inseridos, cursor)
    assert mapa["TST-M-0001"] == conf_id_1
    assert mapa["TST-M-0002"] == conf_id_2
    assert mapa["TST-M-0003"] in (conf_id_1, conf_id_2)
    
    print("test_vincular_confrontantes_pontos concluído com sucesso!")
    conn.close()

def test_normalizacao_matricula():
    print("Executando test_normalizacao_matricula...")
    from services.gestores.confrontante_manager import normalizar_matricula
    
    # Casos de igualdade esperada
    assert normalizar_matricula("6.000") == "6000"
    assert normalizar_matricula("6000") == "6000"
    assert normalizar_matricula("06.000") == "6000"
    assert normalizar_matricula("0006000") == "6000"
    assert normalizar_matricula("6.000-A") == "6000A"
    assert normalizar_matricula("6.000/A") == "6000A"
    assert normalizar_matricula("Mat. 6.000/A") == "6000A"
    assert normalizar_matricula("Matrícula 06000") == "6000"
    assert normalizar_matricula("M-6000") == "6000"
    assert normalizar_matricula("M-006.000-B") == "6000B"
    assert normalizar_matricula("Nº 8.540") == "8540"
    assert normalizar_matricula("0") == "0"
    assert normalizar_matricula("") == ""
    assert normalizar_matricula(None) == ""
    
    # Testar fluxo do resolver_confrontantes com grafias diferentes
    conn, cursor = inicializar_banco_teste()
    lev_id = 1
    
    # 1. Inserir um confrontante existente com matrícula formatada "6.000"
    cursor.execute(
        "INSERT INTO confrontantes (levantamento_id, nome, matricula_imovel) VALUES (?, ?, ?)",
        (lev_id, "Carlos Santos", "6.000")
    )
    conf_id_existente = cursor.lastrowid
    
    # 2. Resolver ponto cuja matrícula na planilha vem como "6000" (sem ponto)
    pontos_lote = [
        {
            "codigo_completo": "TST-M-0010",
            "matricula_confrontante": "6000",
            "cns_confrontante": "456",
            "confrontante_descritivo": "Carlos Santos"
        }
    ]
    mapa = resolver_confrontantes_planilha(lev_id, pontos_lote, cursor)
    assert mapa["TST-M-0010"] == conf_id_existente
    
    # 3. Resolver ponto com matrícula "06.000" (com zero à esquerda e ponto)
    pontos_lote_2 = [
        {
            "codigo_completo": "TST-M-0011",
            "matricula_confrontante": "06.000",
            "cns_confrontante": "456",
            "confrontante_descritivo": "Carlos Santos"
        }
    ]
    mapa_2 = resolver_confrontantes_planilha(lev_id, pontos_lote_2, cursor)
    assert mapa_2["TST-M-0011"] == conf_id_existente
    
    # 4. Verificar se não foi gerado nenhum outro confrontante duplicado no banco
    cursor.execute("SELECT COUNT(*) as qtd FROM confrontantes WHERE levantamento_id = ?", (lev_id,))
    assert cursor.fetchone()["qtd"] == 1
    
    print("test_normalizacao_matricula concluído com sucesso!")
    conn.close()

if __name__ == "__main__":
    test_resolver_confrontantes()
    test_vincular_confrontantes_pontos()
    test_normalizacao_matricula()
    print("Todos os testes passaram!")
