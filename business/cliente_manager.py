import os
import json
import re
from datetime import datetime
from database.connection import execute_query
from business.workspace_manager import WorkspaceManager
from database.repository import PendenciaRepo

def validar_cpf_cnpj(documento: str) -> bool:
    doc = re.sub(r'\D', '', documento)
    if len(doc) == 11:
        # Validação CPF
        if doc == doc[0] * 11: return False
        for i in range(9, 11):
            val = sum((int(doc[num]) * ((i + 1) - num) for num in range(0, i)))
            dig = ((val * 10) % 11) % 10
            if dig != int(doc[i]): return False
        return True
    elif len(doc) == 14:
        # Validação CNPJ
        if doc == doc[0] * 14: return False
        tamanho = len(doc) - 2
        numeros = doc[:tamanho]
        digitos = doc[tamanho:]
        def calc(num, tam):
            soma = 0
            pos = tam - 7
            for i in range(tam, 0, -1):
                soma += int(num[tam - i]) * pos
                pos -= 1
                if pos < 2: pos = 9
            return 0 if soma % 11 < 2 else 11 - (soma % 11)
        if calc(numeros, tamanho) != int(digitos[0]): return False
        if calc(numeros + doc[tamanho], tamanho + 1) != int(digitos[1]): return False
        return True
    return False

class ClienteManager:
    def verificar_dados_conjuge(self, cliente_id: int):
        """Verifica se cliente casado possui dados do cônjuge, se não, cria pendência se não houver uma ativa."""
        query = "SELECT nome_completo, estado_civil, nome_conjuge, cpf_conjuge FROM clientes WHERE id = ?"
        cliente = execute_query(query, params=(cliente_id,), fetch_one=True)
        if not cliente:
            return
            
        cliente = dict(cliente)
        estado_civil = str(cliente.get('estado_civil', '')).lower()
        if any(x in estado_civil for x in ['casado', 'uniao estavel', 'união estável']):
            if not cliente.get('nome_conjuge') or not cliente.get('cpf_conjuge'):
                titulo = f"Dados Faltantes - Cônjuge: {cliente.get('nome_completo')}"
                # Verifica se já existe pendência aberta com esse título
                check_query = "SELECT id FROM pendencias WHERE titulo = ? AND status != 'CONCLUIDO'"
                if not execute_query(check_query, params=(titulo,), fetch_one=True):
                    repo = PendenciaRepo()
                    repo.insert(
                        titulo=titulo,
                        descricao=f"O cliente {cliente.get('nome_completo')} está marcado como casado, mas faltam dados do cônjuge para georreferenciamento.",
                        prioridade="ALTA"
                    )

    def gerar_documento_cliente_workspace(self, cliente_id: int, levantamento_id: int):
        """Redireciona para o WorkspaceManager que gera o DADOS_GERAIS.json unificado"""
        try:
            wm = WorkspaceManager()
            wm.gerar_documento_cliente_workspace(levantamento_id)
        except Exception as e:
            print(f"Erro ao delegar geração de dados gerais no workspace: {e}")

    def registrar_historico(self, cliente_id: int, campo: str, valor_antigo: str, valor_novo: str):
        query = "INSERT INTO cliente_historico_logs (id_cliente, campo_alterado, valor_antigo, valor_novo) VALUES (?, ?, ?, ?)"
        execute_query(query, params=(cliente_id, campo, str(valor_antigo), str(valor_novo)), commit=True)
