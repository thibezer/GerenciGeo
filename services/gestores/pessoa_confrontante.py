"""Gravação segura de pessoas (titulares e coproprietários) de confrontantes.

Regras (documentadas porque pessoas são compartilhadas por CPF entre lotes, levantamentos e clientes):

1. A identidade da pessoa é o CPF/CNPJ normalizado (só dígitos). O mesmo CPF => a mesma pessoa, sempre reaproveitada.
2. Atualizar uma pessoa grava APENAS os campos informados. Em pessoa usada por outros registros um campo vazio
   NUNCA apaga o dado existente (equivale a COALESCE); em pessoa só deste registro um campo informado como vazio limpa.
3. Trocar o titular (CPF de outra pessoa, ou CPF vazio numa pessoa compartilhada que tinha CPF) nunca altera a pessoa
   antiga: cria/reaproveita a pessoa certa só para este registro.
4. Gênero ausente fica NULL (= não informado); não existe mais padrão 'M'/'F' no backend.
"""

from typing import Dict, Iterable, Optional

from services.gestores.confrontante_manager import contar_usos_pessoa, criar_pessoa_basica
from utils.validadores import normalizar_documento, normalizar_nome, sql_doc_normalizado

NACIONALIDADE_PADRAO = "brasileiro(a)"

CAMPOS_QUALIFICACAO = (
    "rg", "genero", "nacionalidade", "profissao", "estado_civil", "regime_bens", "endereco_completo",
    "nome_conjuge", "cpf_conjuge", "rg_conjuge", "genero_conjuge", "nacionalidade_conjuge", "profissao_conjuge",
)

_SQL_PESSOA_POR_DOC = f"SELECT id FROM pessoas WHERE {sql_doc_normalizado('cpf_cnpj')} = ? ORDER BY id LIMIT 1"


def limpar_texto(valor):
    """Texto aparado; vazio vira None."""
    if valor is None:
        return None
    texto = str(valor).strip()
    return texto or None


def pessoa_por_documento(cursor, documento) -> Optional[int]:
    digitos = normalizar_documento(documento)
    if not digitos:
        return None
    cursor.execute(_SQL_PESSOA_POR_DOC, (digitos,))
    row = cursor.fetchone()
    return row[0] if row else None


def cpf_da_pessoa(cursor, pessoa_id) -> str:
    if not pessoa_id:
        return ""
    cursor.execute("SELECT cpf_cnpj FROM pessoas WHERE id = ?", (pessoa_id,))
    row = cursor.fetchone()
    return normalizar_documento(row[0]) if row else ""


def inserir_pessoa(cursor, nome: str, cpf_cnpj, dados: Dict) -> int:
    """Nova pessoa. Nacionalidade assume 'brasileiro(a)' quando não informada; gênero fica NULL se não informado."""
    valores = {c: limpar_texto(dados.get(c)) for c in CAMPOS_QUALIFICACAO}
    if not valores["nacionalidade"]:
        valores["nacionalidade"] = NACIONALIDADE_PADRAO
    if not valores["nacionalidade_conjuge"] and valores["nome_conjuge"]:
        valores["nacionalidade_conjuge"] = NACIONALIDADE_PADRAO
    colunas = ["nome", "cpf_cnpj"] + list(CAMPOS_QUALIFICACAO)
    cursor.execute(
        f"INSERT INTO pessoas ({', '.join(colunas)}) VALUES ({', '.join('?' for _ in colunas)})",
        [nome, limpar_texto(cpf_cnpj)] + [valores[c] for c in CAMPOS_QUALIFICACAO],
    )
    return cursor.lastrowid


def _linha_pessoa(cursor, pessoa_id):
    cursor.execute("SELECT * FROM pessoas WHERE id = ?", (pessoa_id,))
    row = cursor.fetchone()
    return tuple(row) if row is not None else None


def atualizar_pessoa(cursor, pessoa_id: int, nome: Optional[str], dados: Dict, campos: Iterable[str],
                     conservador: bool, cpf_cnpj="__nao_informado__") -> bool:
    """Atualiza só `campos` (os enviados pelo cliente). `conservador` (pessoa de outros registros ou de outra origem):
    valor vazio não apaga o existente. Devolve True se a linha da pessoa mudou."""
    antes = _linha_pessoa(cursor, pessoa_id)
    sets, params = [], []
    nome = limpar_texto(nome)
    if nome:
        sets.append("nome = ?")
        params.append(nome)
    if cpf_cnpj != "__nao_informado__":
        cpf_limpo = limpar_texto(cpf_cnpj)
        if cpf_limpo or not conservador:
            sets.append("cpf_cnpj = ?")
            params.append(cpf_limpo)
    for campo in CAMPOS_QUALIFICACAO:
        if campo not in campos:
            continue
        valor = limpar_texto(dados.get(campo))
        if valor is None and conservador:
            continue
        sets.append(f"{campo} = ?")
        params.append(valor)
    if sets:
        params.append(pessoa_id)
        cursor.execute(f"UPDATE pessoas SET {', '.join(sets)} WHERE id = ?", params)
    return _linha_pessoa(cursor, pessoa_id) != antes


def pessoa_sem_cpf_do_levantamento(cursor, levantamento_id: int, nome: str, ignorar_confrontante_id: int = None) -> Optional[int]:
    """Pessoa SEM CPF já usada por outro confrontante do mesmo levantamento com o mesmo nome (comparação
    normalizada): reaproveitada em vez de duplicar a pessoa do vizinho."""
    chave = normalizar_nome(nome)
    if not chave:
        return None
    cursor.execute(
        """SELECT c.id, p.id, p.nome FROM confrontantes c JOIN pessoas p ON p.id = c.pessoa_id
           WHERE c.levantamento_id = ? AND COALESCE(TRIM(p.cpf_cnpj), '') = '' ORDER BY c.id""",
        (levantamento_id,),
    )
    for cid, pid, pnome in cursor.fetchall():
        if cid != ignorar_confrontante_id and normalizar_nome(pnome) == chave:
            return pid
    return None


def usos_externos(cursor, pessoa_id: int, confrontante_id: int = None) -> int:
    """Registros de OUTROS donos usando a pessoa (desconta o confrontante em edição e seus coproprietários)."""
    return contar_usos_pessoa(cursor, pessoa_id, ignorar_confrontante_id=confrontante_id)


def mensagem_aviso_pessoa_compartilhada(qtd: int) -> str:
    plural = "registro" if qtd == 1 else "registros"
    return (
        f"Esta pessoa também é usada em {qtd} {plural}; os dados pessoais (nome e qualificação) são os mesmos "
        f"para todos. Para trocar o titular só deste lote, altere o CPF."
    )
