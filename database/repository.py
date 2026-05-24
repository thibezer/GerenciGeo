import logging
from database.connection import execute_query

logger = logging.getLogger(__name__)

class GenericRepo:
    def __init__(self, table):
        self.table = table

    def get_all(self):
        query = f"SELECT * FROM {self.table}"
        return [dict(r) for r in execute_query(query, fetch_all=True)]

    def get_by_id(self, item_id):
        query = f"SELECT * FROM {self.table} WHERE id = ?"
        row = execute_query(query, params=(item_id,), fetch_all=False, fetch_one=True)
        return dict(row) if row else None

    def delete(self, item_id):
        query = f"DELETE FROM {self.table} WHERE id = ?"
        execute_query(query, params=(item_id,), fetch_all=False, commit=True)
        return True

class ProfissionalRepo(GenericRepo):
    def __init__(self):
        super().__init__("profissionais")

    def insert(self, nome, registro, codigo_credenciado):
        query = """INSERT INTO profissionais (nome, registro, codigo_credenciado) 
                   VALUES (?, ?, ?)"""
        return execute_query(query, params=(nome, registro, codigo_credenciado), fetch_all=False, commit=True)
        
    def get_and_increment_counter(self, prof_id, tipo_vertice):
        """Busca o número do contador atual para M, P ou V e o incrementa em transação SQLite simulada"""
        coluna = f"contador_{tipo_vertice.lower()}"
        if tipo_vertice.upper() not in ['M', 'P', 'V']:
            raise ValueError("Tipo de vértice inválido")
            
        select_query = f"SELECT {coluna} FROM profissionais WHERE id = ?"
        row = execute_query(select_query, params=(prof_id,), fetch_all=False, fetch_one=True)
        
        if not row:
            return None
            
        valor_atual = row[coluna]
        proximo_valor = valor_atual + 1
        
        update_query = f"UPDATE profissionais SET {coluna} = ? WHERE id = ?"
        execute_query(update_query, params=(proximo_valor, prof_id), fetch_all=False, commit=True)
        
        return proximo_valor

class ClienteRepo(GenericRepo):
    def __init__(self):
        super().__init__("clientes")

    def insert(self, data_dict):
        cols = ", ".join(data_dict.keys())
        placeholders = ", ".join(["?"] * len(data_dict))
        query = f"INSERT INTO clientes ({cols}) VALUES ({placeholders})"
        return execute_query(query, params=tuple(data_dict.values()), fetch_all=False, commit=True)
        
    def update(self, item_id, data_dict):
        set_clause = ", ".join([f"{k} = ?" for k in data_dict.keys()])
        query = f"UPDATE clientes SET {set_clause} WHERE id = ?"
        params = list(data_dict.values())
        params.append(item_id)
        return execute_query(query, params=tuple(params), fetch_all=False, commit=True)

class PropriedadeRepo(GenericRepo):
    def __init__(self):
        super().__init__("propriedades")
        
    def insert(self, nome, codigo_sncr, municipio, uf):
        query = "INSERT INTO propriedades (nome, codigo_sncr, municipio, uf) VALUES (?, ?, ?, ?)"
        return execute_query(query, params=(nome, codigo_sncr, municipio, uf), fetch_all=False, commit=True)

    def update(self, prop_id, nome, codigo_sncr, municipio, uf):
        query = "UPDATE propriedades SET nome = ?, codigo_sncr = ?, municipio = ?, uf = ? WHERE id = ?"
        return execute_query(query, params=(nome, codigo_sncr, municipio, uf, prop_id), fetch_all=False, commit=True)

class PropriedadeClienteRepo(GenericRepo):
    def __init__(self):
        super().__init__("propriedade_clientes")
        
    def associar_socios(self, propriedade_id, cliente_list):
        for cli in cliente_list:
            query = "INSERT INTO propriedade_clientes (propriedade_id, cliente_id, percentual_participacao) VALUES (?,?,?)"
            execute_query(query, params=(propriedade_id, cli['id'], cli['percentual']), fetch_all=False, commit=True)

    def get_by_propriedade(self, propriedade_id):
        query = """
            SELECT pc.*, c.nome, c.id as cliente_id 
            FROM propriedade_clientes pc 
            JOIN clientes c ON pc.cliente_id = c.id 
            WHERE pc.propriedade_id = ?
        """
        return [dict(r) for r in execute_query(query, params=(propriedade_id,), fetch_all=True)]

    def limpar_socios(self, propriedade_id):
        query = "DELETE FROM propriedade_clientes WHERE propriedade_id = ?"
        return execute_query(query, params=(propriedade_id,), fetch_all=False, commit=True)

class MunicipioRepo(GenericRepo):
    def __init__(self):
        super().__init__("municipios")

    def search(self, termo, uf=None):
        if not termo: return []
        if uf:
            query = "SELECT nome FROM municipios WHERE nome LIKE ? AND uf = ? ORDER BY nome LIMIT 15"
            params = (f"{termo}%", uf)
        else:
            query = "SELECT nome FROM municipios WHERE nome LIKE ? ORDER BY nome LIMIT 15"
            params = (f"{termo}%",)
        
        results = execute_query(query, params=params, fetch_all=True)
        return [r['nome'] for r in results] if results else []

    def insert_if_not_exists(self, nome, uf):
        query = "INSERT OR IGNORE INTO municipios (nome, uf) VALUES (?, ?)"
        return execute_query(query, params=(nome, uf), fetch_all=False, commit=True)

class HistoricoRinexRepo(GenericRepo):
    def __init__(self):
        super().__init__("historico_rinex")
        
    def find_duplicate(self, nome, tamanho):
        """Verifica se existe um arquivo com mesmo nome e tamanho convertido com sucesso"""
        query = "SELECT * FROM historico_rinex WHERE arquivo_nome = ? AND arquivo_tamanho = ? AND sucesso = 1"
        return [dict(r) for r in execute_query(query, params=(nome, tamanho), fetch_all=True)]

    def get_by_filename_and_size(self, nome, tamanho):
        query = "SELECT * FROM historico_rinex WHERE arquivo_nome = ? AND arquivo_tamanho = ?"
        row = execute_query(query, params=(nome, tamanho), fetch_all=False, fetch_one=True)
        return dict(row) if row else None

    def insert(self, arquivo_nome, arquivo_tamanho, arquivo_path, ponto_nome=None, data_inicio=None, data_fim=None, latitude=None, longitude=None, sucesso=True):
        query = """INSERT INTO historico_rinex 
                   (arquivo_nome, arquivo_tamanho, arquivo_path, ponto_nome, data_inicio, data_fim, latitude, longitude, sucesso) 
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"""
        return execute_query(query, params=(
            arquivo_nome, arquivo_tamanho, arquivo_path, ponto_nome, 
            data_inicio, data_fim, latitude, longitude, sucesso
        ), fetch_all=False, commit=True)

    def update(self, item_id, data_dict):
        set_clause = ", ".join([f"{k} = ?" for k in data_dict.keys()])
        query = f"UPDATE historico_rinex SET {set_clause} WHERE id = ?"
        params = list(data_dict.values())
        params.append(item_id)
        return execute_query(query, params=tuple(params), fetch_all=False, commit=True)

    def get_all_ordered(self):
        query = "SELECT * FROM historico_rinex ORDER BY created_at DESC"
        return [dict(r) for r in execute_query(query, fetch_all=True)]

# Levantar, as classes para MatriculaRepo, LevantamentoRepo e PontoRepo seguem lógica análoga e bulk insert via loop ou execute_many

class PendenciaRepo(GenericRepo):
    def __init__(self):
        super().__init__("pendencias")

    def insert(self, titulo, descricao, status="PENDENTE", prioridade="MEDIA"):
        query = """INSERT INTO pendencias (titulo, descricao, status, prioridade) 
                   VALUES (?, ?, ?, ?)"""
        return execute_query(query, params=(titulo, descricao, status, prioridade), fetch_all=False, commit=True)

    def update_status(self, item_id, status):
        query = "UPDATE pendencias SET status = ? WHERE id = ?"
        return execute_query(query, params=(status, item_id), fetch_all=False, commit=True)
        
    def get_pendentes_alta(self, limit=3):
        query = "SELECT * FROM pendencias WHERE status = 'PENDENTE' AND prioridade = 'ALTA' ORDER BY data_criacao DESC LIMIT ?"
        return [dict(r) for r in execute_query(query, params=(limit,), fetch_all=True)]
