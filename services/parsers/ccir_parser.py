import csv
import io
import os

def safe_float(val_str):
    if not val_str:
        return None
    val_str = val_str.strip()
    if ',' in val_str:
        # Formato BR: ponto como milhar (opcional) e vírgula como decimal
        val_str = val_str.replace('.', '').replace(',', '.')
    try:
        return float(val_str)
    except ValueError:
        return None

def corrigir_mojibake(texto):
    if not texto:
        return texto
    try:
        # Mojibake comum de UTF-8 decodificado incorretamente como CP1252/Latin-1
        for enc_from in ['cp1252', 'latin-1']:
            try:
                b = texto.encode(enc_from)
                decoded = b.decode('utf-8')
                if decoded != texto:
                    texto = decoded
                    break
            except Exception:
                continue
    except Exception:
        pass
        
    # Contingência manual para Mojibakes persistentes do Excel/INCRA
    substituicoes = {
        'ÃƒO': 'ÃO',
        'Ãƒo': 'ão',
        'Ãƒâ€': 'Ã',
        'Ãƒ': 'Ã',
        'Ã©': 'é',
        'Ã¡': 'á',
        'Ã³': 'ó',
        'Ãº': 'ú',
        'Ã­': 'í',
        'Ã§': 'ç',
        'Ã¢': 'â',
        'Ãª': 'ê',
        'Ã´': 'ô',
        'ÃƒÂ©': 'é',
        'ÃƒÂ¡': 'á',
        'ÃƒÂ³': 'ó',
        'ÃƒÂº': 'ú',
        'ÃƒÂ­': 'í',
        'ÃƒÂ§': 'ç',
        'ÃƒÂ¢': 'â',
        'ÃƒÂª': 'ê',
        'ÃƒÂ´': 'ô',
        'Ã‘': 'Ñ',
        'Ã±': 'ñ',
        'Ãš': 'Ú',
        'Ã': 'Á',
        'Ã“': 'Ó',
        'Ã': 'Í',
        'Ã‚': 'Â',
        'ÃŠ': 'Ê',
        'Ã”': 'Ô',
    }
    for errado, correto in substituicoes.items():
        if errado in texto:
            texto = texto.replace(errado, correto)
            
    return texto

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

        denominacao = corrigir_mojibake(get_field("denominacao"))
        codigo_municipio = get_field("codigo_municipio")
        municipio = corrigir_mojibake(get_field("municipio"))
        uf = get_field("uf")

        # Conversão numérica segura de área
        area_total = safe_float(get_field("area_total"))

        titular = corrigir_mojibake(get_field("titular"))
        natureza_juridica = corrigir_mojibake(get_field("natureza_juridica"))
        condicao_pessoa = corrigir_mojibake(get_field("condicao_pessoa"))

        # Conversão numérica de percentual de detenção
        percentual_detencao = safe_float(get_field("percentual_detencao"))

        pais = corrigir_mojibake(get_field("pais"))

        rows_to_insert.append((
            codigo_imovel, denominacao, codigo_municipio, municipio, uf,
            area_total, titular, natureza_juridica, condicao_pessoa,
            percentual_detencao, pais, filename
        ))

    return rows_to_insert


def sincronizar_pasta_ccir():
    """
    Sincroniza os arquivos .csv da pasta Banco_CCIR com a tabela do banco de dados SQLite.
    Insere novos arquivos, atualiza arquivos modificados e remove do banco registros de arquivos excluídos da pasta.
    """
    import glob
    from database.repository import CcirCadastroRepo
    from config import EXPORT_BASE_FOLDER
    from datetime import datetime
    import time
    
    ccir_dir = os.path.join(EXPORT_BASE_FOLDER, "Banco_CCIR")
    os.makedirs(ccir_dir, exist_ok=True)
    
    repo = CcirCadastroRepo()
    
    # 1. Encontra todos os arquivos .csv na pasta Banco_CCIR
    csv_pattern = os.path.join(ccir_dir, "*.csv")
    csv_files = glob.glob(csv_pattern)
    
    # Dicionário mapeando nome do arquivo para seu caminho e tempo de modificação
    arquivos_locais = {}
    for filepath in csv_files:
        filename = os.path.basename(filepath)
        mtime = os.path.getmtime(filepath)
        size = os.path.getsize(filepath)
        arquivos_locais[filename] = {
            "path": filepath,
            "mtime": mtime,
            "size": size
        }
        
    # 2. Busca arquivos já importados do banco
    arquivos_db = repo.get_imported_files()
    arquivos_db_dict = {a['arquivo_origem']: a for a in arquivos_db}
    
    logs_sync = []
    
    # 3. Remover registros de arquivos locais que foram deletados da pasta
    for db_filename in list(arquivos_db_dict.keys()):
        if db_filename not in arquivos_locais:
            repo.delete_by_arquivo(db_filename)
            logs_sync.append(f"Planilha '{db_filename}' removida do banco de dados (não encontrada na pasta).")
            
    # 4. Inserir ou atualizar registros de arquivos locais
    for filename, local_info in arquivos_locais.items():
        importar = False
        reason = ""
        if filename not in arquivos_db_dict:
            importar = True
            reason = "nova planilha detectada"
        else:
            # Compara tempos de modificação
            db_date_str = arquivos_db_dict[filename]['data_importacao']
            try:
                db_dt = datetime.strptime(db_date_str[:19], "%Y-%m-%d %H:%M:%S")
                db_ts = time.mktime(db_dt.timetuple())
                # Se o arquivo local tiver data de modificação superior à data da última importação no banco (com 2s de tolerância)
                if local_info['mtime'] > db_ts + 2:
                    importar = True
                    reason = "planilha atualizada no disco"
            except Exception:
                pass
                
        if importar:
            if filename in arquivos_db_dict:
                repo.delete_by_arquivo(filename)
                
            try:
                registros = parse_ccir_csv(local_info['path'])
                if registros:
                    repo.insert_bulk(registros)
                    logs_sync.append(f"Planilha '{filename}' ({len(registros)} registros) importada com sucesso ({reason}).")
                else:
                    logs_sync.append(f"Planilha '{filename}' ignorada (sem registros válidos).")
            except Exception as e:
                logs_sync.append(f"Erro ao processar planilha '{filename}': {str(e)}")
                
    if not logs_sync:
        logs_sync.append("Nenhuma alteração detectada. Banco de dados já sincronizado com a pasta.")
        
    return logs_sync

