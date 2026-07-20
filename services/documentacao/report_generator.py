import os
import shutil
import logging
import re
import zipfile
import shapefile
from pathlib import Path
from pyproj import Geod, Transformer
from docx import Document
from database.connection import execute_query
from config import EXPORT_BASE_FOLDER

logger = logging.getLogger(__name__)

# Diretório base original dos templates definidos no Google Drive do usuário
ORIGINAL_TEMPLATES_DIR = Path(
    r"G:\.shortcut-targets-by-id\12gyUSmCZB9ndFe3-BOib0TWAYaaMTxaF\TRANSITO\Área de Fronteira\Modelos área de Fronteira"
)

# Coordenada fixada da Fronteira Internacional Brasil-Paraguai estabelecida constitucionalmente
BORDER_LAT = -24.0671222
BORDER_LON = -54.2868778

def formatar_cpf(valor) -> str:
    """Aplica a máscara ###.###.###-## em números puros de CPF"""
    if not valor:
        return ""
    nums = "".join(filter(str.isdigit, str(valor)))
    if len(nums) == 11:
        return f"{nums[:3]}.{nums[3:6]}.{nums[6:9]}-{nums[9:]}"
    elif len(nums) == 14: # Caso seja CNPJ
        return f"{nums[:2]}.{nums[2:5]}.{nums[5:8]}/{nums[8:12]}-{nums[12:]}"
    return str(valor)

def formatar_rg(valor) -> str:
    """Formata e limpa o campo de RG/Inscrição Estadual"""
    if not valor:
        return ""
    return str(valor).strip()

def calcular_menor_distancia_fronteira(propriedade_id: int, matricula_id: int = None) -> tuple[float, float, float]:
    """
    Retorna (distancia_km, lat_ponto, lon_ponto) representando o ponto do imóvel mais próximo da fronteira.
    
    1. Procura na pasta física de Shapefile da propriedade (específica da matrícula ou geral).
       Se encontrar um .zip, descompacta.
       Lê os arquivos .shp usando pyshp.
       Detecta se as coordenadas estão em UTM e converte se necessário para SIRGAS 2000 (EPSG:4674).
    2. Se não houver Shapefile, busca base geodésica M no banco associada a levantamentos da propriedade.
    3. Se não houver nada, levanta ValueError.
    """
    folder_shp = None
    if matricula_id:
        folder_mat = Path(EXPORT_BASE_FOLDER) / "Propriedades" / f"Prop_{propriedade_id}" / "Shapefile_Fronteira" / f"Matricula_{matricula_id}"
        if folder_mat.exists() and (list(folder_mat.glob("*.zip")) or list(folder_mat.glob("*.shp"))):
            folder_shp = folder_mat

    if not folder_shp:
        folder_shp = Path(EXPORT_BASE_FOLDER) / "Propriedades" / f"Prop_{propriedade_id}" / "Shapefile_Fronteira"
    
    # Se a pasta existe, processa arquivos contidos nela
    if folder_shp.exists():
        # Se houver zip e nenhum shp, extrai primeiro
        zips = list(folder_shp.glob("*.zip"))
        shps = list(folder_shp.glob("*.shp"))
        
        if zips and not shps:
            for z in zips:
                try:
                    with zipfile.ZipFile(z, 'r') as zip_ref:
                        zip_ref.extractall(folder_shp)
                    logger.info(f"[FRONTEIRA] Shapefile zip {z.name} extraído com sucesso na pasta.")
                except Exception as ze:
                    logger.error(f"[FRONTEIRA] Erro ao extrair zip {z.name}: {ze}")
            shps = list(folder_shp.glob("*.shp"))
            
        if shps:
            # Lê o primeiro arquivo .shp encontrado
            shp_path = shps[0]
            logger.info(f"[FRONTEIRA] Lendo Shapefile: {shp_path}")
            try:
                with shapefile.Reader(str(shp_path)) as sf:
                    menor_dist = float('inf')
                    ponto_mais_proximo = (0.0, 0.0)
                    
                    # Instancia transformador UTM Zone 22S (EPSG:31982) -> SIRGAS 2000 (EPSG:4674)
                    transformer = Transformer.from_crs("epsg:31982", "epsg:4674", always_xy=True)
                    geod = Geod(ellps="GRS80")
                    pontos_lidos = 0
                    
                    for shape in sf.shapes():
                        for pt in shape.points:
                            x, y = pt[0], pt[1]
                            # Eliminação de qualquer aproximação plana euclidiana (forçando elipsóide GRS80)
                            if abs(x) > 180 or abs(y) > 90:
                                lon, lat = transformer.transform(x, y)
                            else:
                                lon, lat = x, y
                                
                            # Calcula distância rigorosa
                            _, _, dist_m = geod.inv(lon, lat, BORDER_LON, BORDER_LAT)
                            dist_k = dist_m / 1000.0
                            pontos_lidos += 1
                            
                            if dist_k < menor_dist:
                                menor_dist = dist_k
                                ponto_mais_proximo = (lat, lon)
                                
                    if pontos_lidos > 0:
                        logger.info(f"[FRONTEIRA] Calculada menor distância a partir do Shapefile ({pontos_lidos} pontos): {menor_dist:.3f} km")
                        return menor_dist, ponto_mais_proximo[0], ponto_mais_proximo[1]
            except Exception as se:
                logger.error(f"[FRONTEIRA] Erro ao processar Shapefile {shp_path.name}: {se}")
                
    # Caso não tenha Shapefile ou tenha ocorrido erro, busca pontos geodésicos no banco.
    # REGRA 8 gemini.md: A distância deve ser calculada a partir da base do levantamento
    # (ponto tipo 'M' ativo, prioritariamente CORRIGIDO) usando pyproj.Geod(ellps="GRS80").
    params_m = [propriedade_id]
    query_base_m = """
        SELECT p.lat, p.lon, p.lat_corrigido, p.lon_corrigido, p.nome_vertice, p.tipo_ponto, p.matricula_id, l.status
        FROM pontos p
        JOIN levantamentos l ON p.levantamento_id = l.id
        WHERE l.propriedade_id = ? AND p.tipo_ponto = 'M'
          AND p.lat IS NOT NULL AND p.lon IS NOT NULL
          AND p.lat != 0.0 AND p.lon != 0.0
    """
    if matricula_id:
        query_base_m += " ORDER BY (p.matricula_id = ?) DESC, l.status = 'EM_ANDAMENTO' DESC, (p.status_ponto = 'CORRIGIDO') DESC, p.id ASC"
        params_m.append(matricula_id)
    else:
        query_base_m += " ORDER BY l.status = 'EM_ANDAMENTO' DESC, (p.status_ponto = 'CORRIGIDO') DESC, p.id ASC"

    rows = execute_query(query_base_m, params=tuple(params_m), fetch_all=True)

    # Se não houver pontos tipo 'M', fallback para qualquer ponto do levantamento com coordenadas válidas
    if not rows:
        logger.warning("[FRONTEIRA] Nenhum ponto tipo 'M' (base) encontrado. Usando fallback com todos os pontos válidos.")
        params_fb = [propriedade_id]
        query_fallback = """
            SELECT p.lat, p.lon, p.lat_corrigido, p.lon_corrigido, p.nome_vertice, p.tipo_ponto, p.matricula_id, l.status
            FROM pontos p
            JOIN levantamentos l ON p.levantamento_id = l.id
            WHERE l.propriedade_id = ?
              AND p.lat IS NOT NULL AND p.lon IS NOT NULL
              AND p.lat != 0.0 AND p.lon != 0.0
        """
        if matricula_id:
            query_fallback += " ORDER BY (p.matricula_id = ?) DESC, l.status = 'EM_ANDAMENTO' DESC, (p.status_ponto = 'CORRIGIDO') DESC, p.id ASC"
            params_fb.append(matricula_id)
        else:
            query_fallback += " ORDER BY l.status = 'EM_ANDAMENTO' DESC, (p.status_ponto = 'CORRIGIDO') DESC, p.id ASC"
        rows = execute_query(query_fallback, params=tuple(params_fb), fetch_all=True)

    if rows:
        geod = Geod(ellps="GRS80")
        menor_dist = float('inf')
        coord_referencia = (0.0, 0.0)

        for row in rows:
            base = dict(row)
            lat = base["lat_corrigido"] if base["lat_corrigido"] is not None else base["lat"]
            lon = base["lon_corrigido"] if base["lon_corrigido"] is not None else base["lon"]
            if lat and lon:
                try:
                    _, _, dist_m = geod.inv(float(lon), float(lat), BORDER_LON, BORDER_LAT)
                    dist_k = dist_m / 1000.0
                    if dist_k < menor_dist:
                        menor_dist = dist_k
                        coord_referencia = (lat, lon)
                except Exception as e_geod:
                    logger.warning(f"[FRONTEIRA] Erro ao calcular distância geodésica para ponto '{base.get('nome_vertice')}': {e_geod}")
                    continue

        if menor_dist != float('inf'):
            logger.info(f"[FRONTEIRA] Calculada menor distância a partir de ponto tipo 'M' do Banco: {menor_dist:.3f} km")
            return menor_dist, coord_referencia[0], coord_referencia[1]

    raise ValueError(
        "A propriedade selecionada não possui arquivos Shapefile enviados nem bases geodésicas (pontos tipo 'M') "
        "no banco de dados. Por favor, envie o Shapefile da área ou cadastre a base PPP para calcular a distância."
    )

def carregar_template(nome_arquivo: str) -> str:
    path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "templates", nome_arquivo)
    with open(path, "r", encoding="utf-8") as f:
        return f.read()

class BorderAreaReportGenerator:
    @staticmethod
    def gerar_laudo_fronteira_html(lev_id: int, matricula_id: int, numero_trt: str, data_trt: str) -> str:
        """Gera a string HTML correspondente ao Laudo Técnico de Faixa de Fronteira com as tags injetadas"""
        # 1. Recupera metadados do levantamento e profissional
        query_lev = """
            SELECT l.propriedade_id, l.profissional_id, p.nome as nome_profissional, p.registro as registro_profissional, 
                   p.endereco as address_profissional, p.codigo_credenciado, p.formacao as formacao_profissional, p.conselho as conselho_profissional,
                   p.nacionalidade as nacionalidade_profissional, p.cpf as cpf_profissional, p.rg as rg_profissional, p.endereco_residencial as endereco_residencial_profissional,
                   p.endereco as endereco_profissional
            FROM levantamentos l
            JOIN profissionais p ON l.profissional_id = p.id
            WHERE l.id = ?
        """
        row_lev = execute_query(query_lev, params=(lev_id,), fetch_one=True)
        if not row_lev:
            raise ValueError(f"Levantamento ID {lev_id} não encontrado.")
        lev_data = dict(row_lev)
        propriedade_id = lev_data["propriedade_id"]

        # 2. Recupera metadados da Propriedade
        query_prop = "SELECT id, nome_propriedade, municipio, uf, codigo_car, codigo_ccir FROM propriedades WHERE id = ?"
        row_prop = execute_query(query_prop, params=(propriedade_id,), fetch_one=True)
        if not row_prop:
            raise ValueError(f"Propriedade com ID {propriedade_id} não encontrada.")
        prop_data = dict(row_prop)

        # 3. Recupera metadados da Matrícula específica (incluindo novos campos de valor_itr, denominacao, georreferenciamento)
        query_mat = """
            SELECT m.id, m.numero_matricula, pr.codigo_ccir as ccir, m.itr, m.area_ha, m.cri_comarca, m.cri_circunscricao, m.livro_registro, m.folha_registro,
                   m.valor_itr, m.denominacao, m.georreferenciamento
            FROM matriculas m
            JOIN propriedades pr ON m.propriedade_id = pr.id
            WHERE m.id = ? AND m.propriedade_id = ?
        """
        row_mat = execute_query(query_mat, params=(matricula_id, propriedade_id), fetch_one=True)
        if not row_mat:
            raise ValueError(f"Matrícula com ID {matricula_id} não encontrada para a propriedade correspondente.")
        mat_data = dict(row_mat)

        # 4. Busca o proprietário principal vinculado à propriedade (incluindo sexo)
        query_proprietario = """
            SELECT p.nome as nome_completo, p.cpf_cnpj, p.rg as rg_ie, p.estado_civil, p.regime_bens, 
                   p.nome_conjuge, p.cpf_conjuge, p.rg_conjuge, p.profissao, p.nacionalidade, p.endereco_completo, c.cidade, c.estado,
                   c.sexo, pc.percentual_participacao
            FROM propriedade_clientes pc
            JOIN clientes c ON pc.cliente_id = c.id
            JOIN pessoas p ON c.pessoa_id = p.id
            WHERE pc.propriedade_id = ?
            ORDER BY pc.percentual_participacao DESC, c.id ASC
            LIMIT 1
        """
        row_owner = execute_query(query_proprietario, params=(propriedade_id,), fetch_one=True)
        if not row_owner:
            raise ValueError("Não há proprietários vinculados a esta propriedade. Cadastre o proprietário primeiro.")
        owner_data = dict(row_owner)

        # 5. Cálculo Elipsoidal Determinístico da Distância
        dist_km, _, _ = calcular_menor_distancia_fronteira(propriedade_id, matricula_id)

        # Formata CPF e RG do proprietário
        cpf_owner = formatar_cpf(owner_data["cpf_cnpj"])
        rg_owner = formatar_rg(owner_data["rg_ie"])

        # Variáveis profissionais formatadas para a assinatura e o texto
        nome_prof = lev_data["nome_profissional"]
        nac_prof = lev_data.get("nacionalidade_profissional") or "brasileiro(a)"
        formacao_prof = lev_data.get("formacao_profissional") or "Responsável Técnico"
        cpf_prof = formatar_cpf(lev_data.get("cpf_profissional")) or "Não Informado"
        rg_prof = formatar_rg(lev_data.get("rg_profissional")) or "Não Informado"
        conselho_prof = lev_data.get("conselho_profissional")
        registro_prof = lev_data.get("registro_profissional") or ""
        
        if conselho_prof:
            if conselho_prof.lower() in registro_prof.lower():
                conselho_exibicao = registro_prof
            else:
                conselho_exibicao = f"{conselho_prof} {registro_prof}"
        else:
            conselho_exibicao = registro_prof
            
        end_residencial_prof = lev_data.get("endereco_residencial_profissional") or "Não Informado"
        end_comercial_prof = lev_data.get("endereco_profissional") or "Não Informado"
        municipio_cartorio = mat_data.get('cri_comarca') or prop_data['municipio']

        # Variáveis do proprietário para a Seção 2 com pronomes inteligentes baseados em gênero
        nome_owner = owner_data["nome_completo"]
        nac_owner = owner_data.get("nacionalidade") or "brasileiro(a)"
        prof_owner = owner_data.get("profissao") or "produtor(a) rural"
        domicilio_owner = owner_data.get("endereco_completo") or "Não Informado"
        if owner_data.get("cidade") and owner_data.get("estado"):
            domicilio_owner += f", {owner_data['cidade']}-{owner_data['estado']}"
            
        percentual_posse = owner_data.get("percentual_participacao") or 100.0
        percentual_posse_str = f"{percentual_posse:.2f}%" if percentual_posse % 1 != 0 else f"{int(percentual_posse)}%"

        # Pronomes baseados em gênero
        sexo_owner = str(owner_data.get("sexo") or "M").strip().upper()
        if sexo_owner in ("F", "FEMININO"):
            pron_portador = "portadora"
            pron_inscrito = "inscrita"
        else:
            pron_portador = "portador"
            pron_inscrito = "inscrito"

        # Regime e cônjuge para a Seção 2
        est_civil = str(owner_data.get("estado_civil", "")).strip().lower()
        if "casad" in est_civil or "estável" in est_civil or "estavel" in est_civil:
            regime = owner_data.get("regime_bens") or "Não Informado"
            conj_nome = owner_data.get("nome_conjuge") or "Não Informado"
            conj_nac = "brasileiro(a)"
            conj_prof = "do lar"
            
            # Pronomes do cônjuge baseados no sexo do proprietário principal (heurística inteligente)
            if sexo_owner in ("F", "FEMININO"):
                conj_portador = "portador"
                conj_inscrito = "inscrito"
            elif sexo_owner in ("M", "MASCULINO"):
                conj_portador = "portadora"
                conj_inscrito = "inscrita"
            else:
                conj_portador = "portador(a)"
                conj_inscrito = "inscrito(a)"
                
            conj_rg = formatar_rg(owner_data.get("rg_conjuge")) or "Não Informado"
            conj_cpf = formatar_cpf(owner_data.get("cpf_conjuge")) or "Não Informado"
            
            casado_info = f", casado sob o regime de casamento de {regime}, com {conj_nome}, {conj_nac}, {conj_prof}, {conj_portador} do RG nº {conj_rg} e {conj_inscrito} no CPF sob o nº {conj_cpf}"
        else:
            est_civil_exibicao = owner_data.get("estado_civil") or "solteiro"
            if sexo_owner in ("F", "FEMININO") and est_civil_exibicao.lower() == "solteiro":
                est_civil_exibicao = "solteira"
            elif sexo_owner in ("M", "MASCULINO") and est_civil_exibicao.lower() == "solteira":
                est_civil_exibicao = "solteiro"
            casado_info = f", {est_civil_exibicao.lower()}"

        texto_secao2 = f'<strong class="text-slate-900">{nome_owner}</strong>, {pron_inscrito} no CPF nº <strong class="text-slate-900">{cpf_owner}</strong> e {pron_portador} do RG nº <strong class="text-slate-900">{rg_owner}</strong>, {nac_owner}, {prof_owner}{casado_info}, domiciliado em {domicilio_owner}, este detentor de <strong class="text-slate-900">{percentual_posse_str}</strong> da propriedade:'

        # Texto para a Seção 3 - denominação específica da matrícula
        nome_lote = mat_data.get("denominacao") or prop_data['nome_propriedade']
        texto_secao3 = f"imóvel rural denominado <strong class=\"text-slate-900\">{nome_lote}</strong>, matrícula nº <strong class=\"text-slate-900\">{mat_data['numero_matricula']}</strong>, localizado no município de <strong class=\"text-slate-900\">{prop_data['municipio']}/{prop_data['uf']}</strong>, Comarca de <strong class=\"text-slate-900\">{mat_data['cri_comarca'] or prop_data['municipio']}</strong>, com área de <strong class=\"text-slate-900\">{mat_data['area_ha']:.4f} hectares</strong>."

        # Formata data da TRT
        data_trt_formatada = ""
        if data_trt:
            try:
                from datetime import datetime
                dt = datetime.strptime(data_trt, "%Y-%m-%d")
                data_trt_formatada = dt.strftime("%d/%m/%Y")
            except Exception:
                data_trt_formatada = data_trt

        # Gera data de hoje por extenso de forma independente de locale (como fallback)
        meses = {
            1: "janeiro", 2: "fevereiro", 3: "março", 4: "abril",
            5: "maio", 6: "junho", 7: "julho", 8: "agosto",
            9: "setembro", 10: "outubro", 11: "novembro", 12: "dezembro"
        }
        from datetime import datetime
        agora = datetime.now()
        data_hoje_extenso = f"{agora.day} de {meses[agora.month]} de {agora.year}"

        # Carrega o template HTML
        template = carregar_template("laudo_fronteira.html")
        replacements = {
            "{nome_lote}": nome_lote,
            "{nome_prof}": nome_prof or "_____",
            "{nac_prof}": nac_prof,
            "{formacao_prof}": formacao_prof,
            "{cpf_prof}": cpf_prof,
            "{rg_prof}": rg_prof,
            "{conselho_exibicao}": conselho_exibicao,
            "{end_residencial_prof}": end_residencial_prof,
            "{end_comercial_prof}": end_comercial_prof,
            "{texto_secao2}": texto_secao2,
            "{texto_secao3}": texto_secao3,
            "{dist_km}": f"{dist_km:.3f}",
            "{numero_trt}": numero_trt or "_____",
            "{data_trt_formatada}": data_trt_formatada or "Não Informado",
            "{municipio_cartorio}": municipio_cartorio,
            "{municipio}": prop_data["municipio"] or "_____",
            "{uf}": prop_data["uf"] or "PR",
            "{data_hoje_extenso}": data_hoje_extenso
        }
        html_content = template
        for placeholder, value in replacements.items():
            html_content = html_content.replace(placeholder, str(value))
        return html_content

    @staticmethod
    def gerar_requerimento_ratificacao_html(lev_id: int, matricula_id: int) -> str:
        """Gera a string HTML correspondente ao Requerimento de Ratificação de Fronteira com as tags injetadas"""
        # 1. Recupera metadados do levantamento
        query_lev = """
            SELECT l.propriedade_id, l.profissional_id, p.nome as nome_profissional, p.registro as registro_profissional, p.codigo_credenciado
            FROM levantamentos l
            JOIN profissionais p ON l.profissional_id = p.id
            WHERE l.id = ?
        """
        row_lev = execute_query(query_lev, params=(lev_id,), fetch_one=True)
        if not row_lev:
            raise ValueError(f"Levantamento ID {lev_id} não encontrado.")
        lev_data = dict(row_lev)
        propriedade_id = lev_data["propriedade_id"]

        # 2. Recupera metadados da Propriedade
        query_prop = "SELECT id, nome_propriedade, municipio, uf, codigo_car, codigo_ccir FROM propriedades WHERE id = ?"
        row_prop = execute_query(query_prop, params=(propriedade_id,), fetch_one=True)
        if not row_prop:
            raise ValueError(f"Propriedade com ID {propriedade_id} não encontrada.")
        prop_data = dict(row_prop)

        # 3. Recupera metadados da Matrícula específica (incluindo valor_itr, denominacao, georreferenciamento)
        query_mat = """
            SELECT m.id, m.numero_matricula, pr.codigo_ccir as ccir, m.itr, m.area_ha, m.cri_comarca, m.cri_circunscricao, m.livro_registro, m.folha_registro,
                   m.valor_itr, m.denominacao, m.georreferenciamento
            FROM matriculas m
            JOIN propriedades pr ON m.propriedade_id = pr.id
            WHERE m.id = ? AND m.propriedade_id = ?
        """
        row_mat = execute_query(query_mat, params=(matricula_id, propriedade_id), fetch_one=True)
        if not row_mat:
            raise ValueError(f"Matrícula com ID {matricula_id} não encontrada para a propriedade correspondente.")
        mat_data = dict(row_mat)

        # 4. Busca todos os proprietários vinculados à propriedade com dados completos (incluindo sexo)
        query_proprietarios = """
            SELECT p.nome as nome_completo, p.cpf_cnpj, p.rg as rg_ie, p.estado_civil, p.regime_bens, 
                   p.nome_conjuge, p.cpf_conjuge, p.rg_conjuge, p.profissao, p.nacionalidade, p.endereco_completo, c.cidade, c.estado,
                   c.sexo, pc.percentual_participacao
            FROM propriedade_clientes pc
            JOIN clientes c ON pc.cliente_id = c.id
            JOIN pessoas p ON c.pessoa_id = p.id
            WHERE pc.propriedade_id = ?
            ORDER BY pc.percentual_participacao DESC, c.id ASC
        """
        rows_owners = execute_query(query_proprietarios, params=(propriedade_id,), fetch_all=True)
        if not rows_owners:
            raise ValueError("Não há proprietários vinculados a esta propriedade.")

        # Montagem dinâmica das qualificações de proprietários com pronomes inteligentes baseados em sexo
        qualificacoes = []
        total_owners = len(rows_owners)
        
        for owner in rows_owners:
            owner_data = dict(owner)
            
            c_nome = owner_data["nome_completo"]
            c_cpf = formatar_cpf(owner_data["cpf_cnpj"])
            c_rg = formatar_rg(owner_data["rg_ie"]) or "Não Informado"
            c_nac = owner_data.get("nacionalidade") or "brasileiro(a)"
            c_prof = owner_data.get("profissao") or "produtor(a) rural"
            c_est_civil = owner_data.get("estado_civil") or "Não Informado"
            c_domicilio = owner_data.get("endereco_completo") or "Não Informado"
            if owner_data.get("cidade") and owner_data.get("estado"):
                c_domicilio += f", {owner_data['cidade']}-{owner_data['estado']}"
                
            c_sexo = str(owner_data.get("sexo") or "M").strip().upper()
            if c_sexo in ("F", "FEMININO"):
                pron_c_portador = "portadora"
                pron_c_inscrito = "inscrita"
            else:
                pron_c_portador = "portador"
                pron_c_inscrito = "inscrito"
                
            # Regime e cônjuge para a qualificação
            e_civil = str(c_est_civil).strip().lower()
            is_casado = "casad" in e_civil or "estável" in e_civil or "estavel" in e_civil
            
            if is_casado:
                reg = owner_data.get("regime_bens") or "Não Informado"
                conj_n = owner_data.get("nome_conjuge") or "Não Informado"
                conj_na = "brasileiro(a)"
                conj_pr = "do lar"
                conj_rg = formatar_rg(owner_data.get("rg_conjuge")) or "Não Informado"
                conj_cpf = formatar_cpf(owner_data.get("cpf_conjuge")) or "Não Informado"
                
                # Heurística de pronomes para o cônjuge do requerente
                if c_sexo in ("F", "FEMININO"):
                    conj_portador = "portador"
                    conj_inscrito = "inscrito"
                elif c_sexo in ("M", "MASCULINO"):
                    conj_portador = "portadora"
                    conj_inscrito = "inscrita"
                else:
                    conj_portador = "portador(a)"
                    conj_inscrito = "inscrito(a)"
                
                qualif = f'<strong class="text-slate-900">{c_nome}</strong>, {c_nac}, {c_prof}, {c_est_civil}, casado sob o regime de {reg} com {conj_n}, {conj_na}, {conj_pr}, {pron_c_portador} do RG nº {c_rg} e {pron_c_inscrito} no CPF sob o nº {c_cpf}, e cônjuge {conj_portador} do RG nº {conj_rg} e CPF sob o nº {conj_cpf}, ambos residentes e domiciliados em {c_domicilio}'
            else:
                est_civil_final = c_est_civil if (c_est_civil and c_est_civil.strip()) else ("solteira" if c_sexo in ("F", "FEMININO") else "solteiro")
                qualif = f'<strong class="text-slate-900">{c_nome}</strong>, {c_nac}, {c_prof}, {est_civil_final.lower()}, {pron_c_portador} do RG nº {c_rg} e {pron_c_inscrito} no CPF sob o nº {c_cpf}, residente e domiciliado em {c_domicilio}'
                
            qualificacoes.append(qualif)

        # Checa se algum dos proprietários é casado
        any_casado = any("casad" in str(dict(o).get("estado_civil", "")).strip().lower() or "estável" in str(dict(o).get("estado_civil", "")).strip().lower() or "estavel" in str(dict(o).get("estado_civil", "")).strip().lower() for o in rows_owners)

        comarca_exibicao = str(mat_data.get('cri_comarca') or prop_data.get('municipio', '')).upper()
        ccir_exibicao = mat_data.get('ccir') or prop_data.get('codigo_ccir') or 'Não Informado'
        nome_lote = mat_data.get("denominacao") or prop_data['nome_propriedade']

        if total_owners == 1 and not any_casado:
            o1_sexo = str(dict(rows_owners[0]).get("sexo") or "M").strip().upper()
            pron_prop_final = "legítima proprietária" if o1_sexo in ("F", "FEMININO") else "legítimo proprietário"
            
            qualificacao_completa = qualificacoes[0]
            texto_requerimento = f"{qualificacao_completa}, na qualidade de {pron_prop_final}, vem requerer e autorizar, nos termos da Lei nº 13.178/2015, bem como nos arts. 656-BU e seguintes do Código de Normas da Corregedoria-Geral da Justiça do Estado do Paraná, a ratificação do imóvel situado em faixa de fronteira, denominado <strong class=\"text-slate-900\">{nome_lote}</strong>, com área de <strong class=\"text-slate-900\">{mat_data['area_ha']:.4f} ha</strong>, localizado no município de {prop_data['municipio']}/PR, objeto da matrícula nº <strong class=\"text-slate-900\">{mat_data['numero_matricula']}</strong> do Registro de Imóveis da Comarca de {comarca_exibicao}, inscrito no CCIR/INCRA sob o nº <strong class=\"text-slate-900\">{ccir_exibicao}</strong>."
        else:
            if total_owners == 1:
                qualificacao_completa = qualificacoes[0]
            else:
                primeiros = ";<br>".join(qualificacoes[:-1])
                ultimo = qualificacoes[-1]
                qualificacao_completa = f"{primeiros};<br>e {ultimo}"
            
            texto_requerimento = f"{qualificacao_completa}, na qualidade de legítimos proprietários, vêm requerer e autorizar, nos termos da Lei nº 13.178/2015, bem como nos arts. 656-BU e seguintes do Código de Normas da Corregedoria-Geral da Justiça do Estado do Paraná, a ratificação do imóvel situado em faixa de fronteira, denominado <strong class=\"text-slate-900\">{nome_lote}</strong>, com área de <strong class=\"text-slate-900\">{mat_data['area_ha']:.4f} ha</strong>, localizado no município de {prop_data['municipio']}/PR, objeto da matrícula nº <strong class=\"text-slate-900\">{mat_data['numero_matricula']}</strong> do Registro de Imóveis da Comarca de {comarca_exibicao}, inscrito no CCIR/INCRA sob o nº <strong class=\"text-slate-900\">{ccir_exibicao}</strong>."

        # Geração dinâmica das assinaturas no rodapé
        bloco_assinaturas_html = '<div class="mt-6 pt-2 flex flex-row flex-wrap justify-around gap-x-8 gap-y-8 w-full">'
        for owner in rows_owners:
            owner_data = dict(owner)
            o_nome = owner_data["nome_completo"]
            
            # Adiciona o Proprietário
            bloco_assinaturas_html += f"""
            <div class="flex flex-col items-center min-w-[240px] flex-1 max-w-[280px]">
                <div class="w-full border-t border-slate-400 mt-8 mb-2"></div>
                <div class="text-xs font-bold text-slate-900 text-center uppercase tracking-wide">{o_nome}</div>
                <div class="text-[10px] text-slate-500 text-center font-medium mt-0.5">Requerente Proprietário</div>
            </div>
            """
            
            # Adiciona o Cônjuge se for casado
            e_civil = str(owner_data.get("estado_civil", "")).strip().lower()
            if "casad" in e_civil or "estável" in e_civil or "estavel" in e_civil:
                conj_n = owner_data.get("nome_conjuge") or "Cônjuge do Proprietário"
                bloco_assinaturas_html += f"""
                <div class="flex flex-col items-center min-w-[240px] flex-1 max-w-[280px]">
                    <div class="w-full border-t border-slate-400 mt-8 mb-2"></div>
                    <div class="text-xs font-bold text-slate-900 text-center uppercase tracking-wide">{conj_n}</div>
                    <div class="text-[10px] text-slate-500 text-center font-medium mt-0.5">Requerente Cônjuge</div>
                </div>
                """
        bloco_assinaturas_html += "</div>"

        # Variáveis profissionais e financeiras do ITR
        valor_venal_itr = mat_data.get("valor_itr")
        if valor_venal_itr is not None:
            try:
                valor_venal_itr_str = f"{valor_venal_itr:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
            except Exception:
                valor_venal_itr_str = str(valor_venal_itr)
        else:
            valor_venal_itr_str = mat_data.get("itr") or "____________________"

        # Injeção condicional do item X (SIGEF/INCRA) baseado em limite de 200 hectares
        codigo_sigef_exibicao = mat_data.get("georreferenciamento") or "____________________"
        exibir_sigef = mat_data.get("area_ha", 0.0) >= 200.0
        bloco_sigef_html = ""
        if exibir_sigef:
            bloco_sigef_html = f"""
                    <div class="flex items-start gap-2">
                        <span class="font-bold text-slate-800 leading-none">X -</span>
                        <span>Certificação obtida junto ao SIGEF/INCRA código nº <strong class="text-slate-800 font-mono">{codigo_sigef_exibicao}</strong>.</span>
                    </div>
            """

        # Gera data de hoje por extenso
        meses = {
            1: "janeiro", 2: "fevereiro", 3: "março", 4: "abril",
            5: "maio", 6: "junho", 7: "julho", 8: "agosto",
            9: "setembro", 10: "outubro", 11: "novembro", 12: "dezembro"
        }
        from datetime import datetime
        agora = datetime.now()
        data_hoje_extenso = f"{agora.day} de {meses[agora.month]} de {agora.year}"

        # Carrega o template HTML
        template = carregar_template("requerimento_ratificacao.html")
        replacements = {
            "{nome_lote}": nome_lote,
            "{comarca_exibicao}": comarca_exibicao,
            "{texto_requerimento}": texto_requerimento,
            "{valor_venal_itr_str}": valor_venal_itr_str,
            "{municipio}": prop_data["municipio"] or "_____",
            "{uf}": prop_data["uf"] or "PR",
            "{bloco_sigef_html}": bloco_sigef_html,
            "{bloco_assinaturas_html}": bloco_assinaturas_html,
            "{data_hoje_extenso}": data_hoje_extenso
        }
        html_content = template
        for placeholder, value in replacements.items():
            html_content = html_content.replace(placeholder, str(value))
        return html_content
