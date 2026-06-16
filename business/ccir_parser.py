import csv
import io
import os

def parse_ccir_csv(filepath):
    """
    Lê um arquivo CSV de CCIR, detecta o delimitador e encoding apropriados,
    e retorna uma lista de tuplas correspondentes às colunas da tabela ccir_cadastros.
    """
    if not os.path.exists(filepath):
        raise FileNotFoundError(f"Arquivo não encontrado: {filepath}")

    # Lista de encodings para tentar ler o arquivo
    encodings = ['utf-8-sig', 'latin-1', 'cp1252', 'utf-8']
    content = None
    
    for enc in encodings:
        try:
            with open(filepath, mode='r', encoding=enc) as f:
                content = f.read()
            break
        except (UnicodeDecodeError, LookupError):
            continue

    if content is None:
        raise ValueError("Não foi possível decodificar o arquivo com as codificações padrão (UTF-8, Latin-1, CP1252).")

    # Divide em linhas e remove vazias
    lines = [line.strip() for line in content.split('\n') if line.strip()]
    if not lines:
        return []

    # Detecta o delimitador baseado no cabeçalho
    first_line = lines[0]
    delimiter = ';' if ';' in first_line else ','

    # Utiliza o leitor de CSV nativo
    reader = csv.reader(io.StringIO(content), delimiter=delimiter)
    try:
        header = next(reader)
    except StopIteration:
        return []

    # Limpa cabeçalhos (remove aspas, espaços e coloca em caixa alta)
    header = [h.replace('"', '').strip().upper() for h in header]

    # Mapeamento flexível de cabeçalhos
    col_mapping = {
        "CÓDIGO DO IMOVEL": "codigo_imovel",
        "CODIGO DO IMOVEL": "codigo_imovel",
        "CÓDIGO DO IMÓVEL": "codigo_imovel",
        "CODIGO DO IMÓVEL": "codigo_imovel",
        "DENOMIÇÃO DO IMÓVEL": "denominacao",
        "DENOMINAÇÃO DO IMÓVEL": "denominacao",
        "DENOMIÇÃO DO IMOVEL": "denominacao",
        "DENOMINAÇÃO DO IMOVEL": "denominacao",
        "DENOMINACAO": "denominacao",
        "DENOMINAÇÃO": "denominacao",
        "CÓDIGO DO MUNICÍPIO (IBGE)": "codigo_municipio",
        "CODIGO DO MUNICIPIO (IBGE)": "codigo_municipio",
        "CODIGO DO MUNICIPIO": "codigo_municipio",
        "CÓDIGO DO MUNICÍPIO": "codigo_municipio",
        "MUNICÍPIO": "municipio",
        "MUNICIPIO": "municipio",
        "UF": "uf",
        "ÁREA TOTAL": "area_total",
        "AREA TOTAL": "area_total",
        "TITULAR": "titular",
        "NATUREZA JURÍDICA": "natureza_juridica",
        "NATUREZA JURIDICA": "natureza_juridica",
        "CONDIÇÃO DA PESSOA": "condicao_pessoa",
        "CONDICAO DA PESSOA": "condicao_pessoa",
        "PERCENTUAL DE DETENÇÃO": "percentual_detencao",
        "PERCENTUAL DE DETENCAO": "percentual_detencao",
        "PAÍS": "pais",
        "PAIS": "pais"
    }

    indices = {}
    for i, col in enumerate(header):
        mapped = col_mapping.get(col)
        if mapped:
            indices[mapped] = i

    # Valida colunas mínimas obrigatórias para termos consistência
    required = ["codigo_imovel", "titular"]
    for req in required:
        if req not in indices:
            raise ValueError(f"Coluna obrigatória não encontrada no cabeçalho do CSV: {req.upper().replace('_', ' ')}")

    rows_to_insert = []
    filename = os.path.basename(filepath)

    for row in reader:
        if not row:
            continue
            
        def get_field(name):
            if name in indices and indices[name] < len(row):
                return row[indices[name]].replace('"', '').strip()
            return ""

        codigo_imovel = get_field("codigo_imovel")
        if not codigo_imovel:
            continue  # Pula registros sem código

        denominacao = get_field("denominacao")
        codigo_municipio = get_field("codigo_municipio")
        municipio = get_field("municipio")
        uf = get_field("uf")

        # Conversão numérica segura de área (ex: "73,1847" ou "1.166,1000")
        area_raw = get_field("area_total")
        try:
            area_total = float(area_raw.replace('.', '').replace(',', '.')) if area_raw else None
        except ValueError:
            area_total = None

        titular = get_field("titular")
        natureza_juridica = get_field("natureza_juridica")
        condicao_pessoa = get_field("condicao_pessoa")

        # Conversão numérica de percentual de detenção
        pct_raw = get_field("percentual_detencao")
        try:
            percentual_detencao = float(pct_raw.replace('.', '').replace(',', '.')) if pct_raw else None
        except ValueError:
            percentual_detencao = None

        pais = get_field("pais")

        rows_to_insert.append((
            codigo_imovel, denominacao, codigo_municipio, municipio, uf,
            area_total, titular, natureza_juridica, condicao_pessoa,
            percentual_detencao, pais, filename
        ))

    return rows_to_insert
