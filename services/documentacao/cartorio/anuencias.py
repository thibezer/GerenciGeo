import os
import logging
from config import EXPORT_BASE_FOLDER
from services.documentacao.cartorio.utils import carregar_template, obter_data_extenso, formatar_cpf, formatar_rg
from services.documentacao.cartorio.data_fetcher import obter_dados_comuns, gerar_tabela_divisas_html
from database.connection import execute_query
from services.processamento.geoprocessamento import calcular_zona_utm_segura

logger = logging.getLogger(__name__)

def gerar_declaracao_anuencia_html(lev_id: int, matricula_id: int, confrontante_id: int, apenas_corpo: bool = False) -> str:
    dados = obter_dados_comuns(lev_id, matricula_id)
    nome_lote = dados["mat"].get("denominacao") or dados["prop"]["nome_propriedade"]
    comarca = str(dados["mat"].get("cri_comarca") or dados["prop"]["municipio"]).upper()
    proprietarios_list = [o["nome_completo"] for o in dados["owners"]]
    proprietarios_str = " e ".join(proprietarios_list)
    
    # Dados do Profissional para a Cláusula de Homologação
    nome_prof = dados["lev"]["nome_profissional"]
    registro_prof = dados["lev"]["registro_profissional"]
    conselho_prof = dados["lev"]["conselho_profissional"] or "CFTA"
    credencial_incra = dados["lev"]["codigo_credenciado"] or "Não Informado"
    final_trt = dados["lev"].get("lev_numero_trt") or "____________________"

    row_conf = execute_query(
        """
        SELECT c.id, p.nome, p.cpf_cnpj, p.rg, p.nacionalidade, p.profissao, p.estado_civil, p.regime_bens, 
               p.endereco_completo, p.nome_conjuge, p.cpf_conjuge, p.rg_conjuge, c.matricula_imovel
        FROM confrontantes c
        JOIN pessoas p ON c.pessoa_id = p.id
        WHERE c.id = ? AND c.levantamento_id = ?
        """,
        params=(confrontante_id, lev_id),
        fetch_one=True
    )
    if not row_conf:
        raise ValueError(f"Confrontante ID {confrontante_id} não encontrado para este levantamento.")
    conf = dict(row_conf)
    
    def obter_valor_ou_linha(valor, tamanho_linha=24) -> str:
        if not valor or str(valor).strip().upper() in ["", "NÃO INFORMADO", "NAO INFORMADO", "NONE", "NULL"]:
            return "_" * tamanho_linha
        return str(valor).strip()
        
    c_nome = obter_valor_ou_linha(conf["nome"], 35)
    c_cpf = obter_valor_ou_linha(formatar_cpf(conf["cpf_cnpj"]), 18)
    c_rg = obter_valor_ou_linha(formatar_rg(conf["rg"]), 15)
    c_nac = obter_valor_ou_linha(conf.get("nacionalidade"), 18)
    c_prof = obter_valor_ou_linha(conf.get("profissao"), 20)
    c_est_civil = obter_valor_ou_linha(conf.get("estado_civil"), 15)
    c_domicilio = obter_valor_ou_linha(conf.get("endereco_completo"), 50)
    c_matricula = obter_valor_ou_linha(conf.get("matricula_imovel"), 24)
    
    e_civil = str(conf.get("estado_civil") or "").strip().lower()
    regime = conf.get("regime_bens") or "Não Informado"
    is_casado = "casad" in e_civil or "estável" in e_civil or "estavel" in e_civil
    
    if is_casado:
        conj_n = obter_valor_ou_linha(conf.get("nome_conjuge"), 35)
        # Se for regime de separação de bens, o cônjuge é apenas citado sem qualificação completa.
        if "separacao" in regime.lower() or "separação" in regime.lower():
            casado_info = f", casado(a) sob o regime de {regime} com {conj_n}"
        else:
            # Nos outros regimes (como parcial ou universal), qualifica completamente.
            conj_rg = obter_valor_ou_linha(formatar_rg(conf.get("rg_conjuge")), 15)
            conj_cpf = obter_valor_ou_linha(formatar_cpf(conf.get("cpf_conjuge")), 18)
            casado_info = f", casado(a) sob o regime de {regime} com {conj_n}, portador(a) do RG nº {conj_rg} e inscrito(a) no CPF nº {conj_cpf}"
    else:
        casado_info = f", {c_est_civil.lower() if '_' not in c_est_civil else c_est_civil}"
        
    qualificacao_confrontante = f'<strong class="text-slate-900">{c_nome}</strong>, {c_nac}, {c_prof}{casado_info}, residente e domiciliado em {c_domicilio}, inscrito no CPF nº {c_cpf} e portador do RG nº {c_rg}'

    tabela_divisas_html = gerar_tabela_divisas_html(matricula_id, confrontante_id)

    bloco_assinaturas = '<div class="mt-6 flex flex-row flex-wrap justify-around gap-x-8 gap-y-12 w-full">'
    
    # 1. Assinatura dos Proprietários Requerentes (Imóvel que está sendo georreferenciado)
    for owner in dados["owners"]:
        bloco_assinaturas += f"""
        <div class="flex flex-col items-center min-w-[250px] flex-1 max-w-[300px]">
            <div class="w-full border-t border-slate-400 mt-6 mb-2"></div>
            <div class="text-xs font-bold text-slate-900 text-center uppercase tracking-wide">{owner["nome_completo"]}</div>
            <div class="text-[10px] text-slate-500 text-center font-medium mt-0.5">Proprietário Requerente</div>
        </div>
        """

    # 2. Assinatura do Confrontante Anuente
    bloco_assinaturas += f"""
    <div class="flex flex-col items-center min-w-[250px] flex-1 max-w-[300px]">
        <div class="w-full border-t border-slate-400 mt-6 mb-2"></div>
        <div class="text-xs font-bold text-slate-900 text-center uppercase tracking-wide">{c_nome}</div>
        <div class="text-[10px] text-slate-500 text-center font-medium mt-0.5">Confrontante Anuente</div>
    </div>
    """
    # Só assina se for casado e NÃO for sob o regime de separação de bens.
    if is_casado and not ("separacao" in regime.lower() or "separação" in regime.lower()):
        conj_n = conf.get("nome_conjuge") or "Cônjuge do Confrontante"
        bloco_assinaturas += f"""
        <div class="flex flex-col items-center min-w-[250px] flex-1 max-w-[300px]">
            <div class="w-full border-t border-slate-400 mt-6 mb-2"></div>
            <div class="text-xs font-bold text-slate-900 text-center uppercase tracking-wide">{conj_n}</div>
            <div class="text-[10px] text-slate-500 text-center font-medium mt-0.5">Cônjuge do Confrontante Anuente</div>
        </div>
        """
    bloco_assinaturas += "</div>"
    data_extenso = obter_data_extenso()

    # Gerar o anexo gráfico (Página 2) e mapa Leaflet
    mapa_divisa_leaflet, map_data = CartorioReportGenerator.gerar_anexo_grafico_html(
        lev_id, matricula_id, confrontante_id, c_nome, c_matricula
    )
    
    script_inicializacao_mapas = ""
    if map_data:
        script_inicializacao_mapas = CartorioReportGenerator.gerar_js_inicializacao_mapas([map_data])

    html_content = carregar_template("declaracao_anuencia.html")

    # Substituições lineares por .replace() para proteger as chaves do Tailwind CSS
    html_content = html_content.replace("{c_nome}", c_nome)
    html_content = html_content.replace("{municipio}", dados["prop"]["municipio"])
    html_content = html_content.replace("{data_extenso}", data_extenso)
    html_content = html_content.replace("{qualificacao_confrontante}", qualificacao_confrontante)
    html_content = html_content.replace("{c_matricula}", c_matricula)
    html_content = html_content.replace("{nome_lote}", nome_lote)
    html_content = html_content.replace("{proprietarios_str}", proprietarios_str)
    html_content = html_content.replace("{numero_matricula}", dados["mat"]["numero_matricula"])
    html_content = html_content.replace("{comarca}", comarca)
    html_content = html_content.replace("{tabela_divisas_html}", tabela_divisas_html)
    html_content = html_content.replace("{mapa_divisa_leaflet}", mapa_divisa_leaflet)
    html_content = html_content.replace("{script_inicializacao_mapas}", script_inicializacao_mapas)
    html_content = html_content.replace("{bloco_assinaturas}", bloco_assinaturas)
    
    # Injeção das chaves do Responsável Técnico
    html_content = html_content.replace("{nome_profissional}", nome_prof)
    html_content = html_content.replace("{conselho_profissional}", conselho_prof)
    html_content = html_content.replace("{registro_profissional}", registro_prof)
    html_content = html_content.replace("{credencial_incra}", credencial_incra)
    html_content = html_content.replace("{final_trt}", final_trt)

    if apenas_corpo:
        import re
        match = re.search(r'(<!-- FOLHA A4.*?<!-- FIM DE FOLHAS CONSOLIDADAS -->)', html_content, re.DOTALL)
        if match:
            return match.group(1)
        return html_content

    return html_content

@staticmethod

def gerar_declaracao_anuencia_lote_html(lev_id: int, matricula_id: int, confrontantes_ids: str = None) -> str:
    if confrontantes_ids:
        try:
            ids = [int(x.strip()) for x in confrontantes_ids.split(",") if x.strip().isdigit()]
        except Exception:
            raise ValueError("Lista de confrontantes_ids em formato inválido.")
    else:
        rows = execute_query(
            "SELECT DISTINCT confrontante_id FROM segmentos WHERE matricula_id = ? AND confrontante_id IS NOT NULL",
            params=(matricula_id,),
            fetch_all=True
        )
        ids = [r["confrontante_id"] for r in rows]
        
    if not ids:
        raise ValueError("Nenhum confrontante com limites definidos encontrado para esta matrícula.")
        
    dados = obter_dados_comuns(lev_id, matricula_id)
    num_mat = dados["mat"]["numero_matricula"] or "SEM_MATRICULA"
    
    template_base = carregar_template("declaracao_anuencia.html")
    
    corpos_paginas = []
    lista_mapas_data = []
    for c_id in ids:
        try:
            corpo = CartorioReportGenerator.gerar_declaracao_anuencia_html(lev_id, matricula_id, c_id, apenas_corpo=True)
            corpos_paginas.append(corpo)
            
            # Resgata metadados para construir mapa Leaflet correspondente
            query_c = """
                SELECT p.nome, c.matricula_imovel 
                FROM confrontantes c
                JOIN pessoas p ON c.pessoa_id = p.id
                WHERE c.id = ?
            """
            row_conf = execute_query(query_c, params=(c_id,), fetch_one=True)
            if row_conf:
                c_nome = row_conf["nome"] or ""
                c_mat = row_conf["matricula_imovel"] or ""
                _, map_data = CartorioReportGenerator.gerar_anexo_grafico_html(lev_id, matricula_id, c_id, c_nome, c_mat)
                if map_data:
                    lista_mapas_data.append(map_data)
        except Exception as e:
            logger.warning(f"Ignorado confrontante {c_id} no lote de anuências devido a erro: {e}")
            
    if not corpos_paginas:
        raise ValueError("Não foi possível gerar nenhuma anuência para as confrontações indicadas.")
        
    # Ajusta título e barra de ações
    template_base = template_base.replace(
        "<title>Declaração de Anuência do Confrontante - {c_nome}</title>",
        f"<title>Lote de Anuências - Matrícula {num_mat}</title>"
    )
    
    barra_lote_html = """<!-- BARRA_ACOES_INICIO -->
<div
    class="no-print print:hidden w-full max-w-[21cm] bg-[#0c1510] text-white py-4 px-6 mb-6 flex justify-between items-center rounded-xl border border-white/10 shadow-lg">
    <div class="flex items-center gap-3">
        <div class="w-8 h-8 bg-[#00f5a0]/10 border border-[#00f5a0]/30 rounded-lg flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" class="text-[#00f5a0] w-5 h-5" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
            </svg>
        </div>
        <div>
            <h4 class="text-sm font-bold text-white uppercase tracking-wider">Lote de Anuências do Confrontante</h4>
            <p class="text-[10px] text-white/40 mt-0.5">Múltiplos Termos de Respeito de Divisas (Matrícula {numero_matricula})</p>
        </div>
    </div>
    <button onclick="window.print()"
        class="no-print print:hidden px-5 py-2 bg-[#00f5a0] hover:bg-[#00d48a] text-[#0c1510] font-bold rounded-lg shadow-md transition-all text-xs uppercase tracking-wider cursor-pointer">
        Imprimir Todos em Lote
    </button>
</div>
<!-- BARRA_ACOES_FIM -->"""
    
    import re
    template_base = re.sub(r'<!-- BARRA_ACOES_INICIO -->.*?<!-- BARRA_ACOES_FIM -->', barra_lote_html, template_base, flags=re.DOTALL)
    template_base = template_base.replace("{numero_matricula}", num_mat)
    
    idx_corpo_ini = template_base.find("<!-- FOLHA A4 ESCRITÓRIO/CARTÓRIO -->")
    if idx_corpo_ini == -1:
        idx_corpo_ini = template_base.find("<div\n        class=\"page")
        
    header_html = template_base[:idx_corpo_ini]
    lote_corpos = "\n    <!-- FIM DE FOLHA / QUEBRA DE PÁGINA -->\n".join(corpos_paginas)
    
    # Gerar o JS de inicialização de todos os mapas consolidado
    script_inicializacao_mapas = ""
    if lista_mapas_data:
        script_inicializacao_mapas = CartorioReportGenerator.gerar_js_inicializacao_mapas(lista_mapas_data)
        
    footer_html = f"\n{script_inicializacao_mapas}\n</body>\n</html>"
    
    return header_html + lote_corpos + footer_html
    
@staticmethod

def gerar_anexo_grafico_html(lev_id: int, matricula_id: int, confrontante_id: int, c_nome: str, c_matricula: str) -> tuple[str, dict]:
    """Gera o HTML da Página 2 (Anexo Gráfico) e os dados de coordenadas do Leaflet"""
    try:
        # 1. Carregar todos os pontos da matrícula
        todos_pontos = execute_query(
            """
            SELECT id, nome_vertice, lat, lon, lat_corrigido, lon_corrigido, tipo_ponto, ordem_caminhamento, ignorar_poligono
            FROM pontos
            WHERE levantamento_id = ? AND matricula_id = ?
            ORDER BY CASE WHEN ordem_caminhamento IS NULL OR ordem_caminhamento = 0 THEN 999999 ELSE ordem_caminhamento END ASC, id ASC
            """,
            params=(lev_id, matricula_id),
            fetch_all=True
        )
        if not todos_pontos:
            return "", {}
            
        # 2. Filtrar pontos com coordenadas válidas e mapear em dicionário
        pts_validos = []
        lons = []
        for row in todos_pontos:
            pt = dict(row)
            lat = pt["lat_corrigido"] if pt["lat_corrigido"] is not None else pt["lat"]
            lon = pt["lon_corrigido"] if pt["lon_corrigido"] is not None else pt["lon"]
            if lat is not None and lon is not None:
                pt["_lat"] = lat
                pt["_lon"] = lon
                pts_validos.append(pt)
                lons.append(lon)
                
        if len(pts_validos) < 3:
            return "", {}
            
        lon_medio = sum(lons) / len(lons)
        zona_utm = int((lon_medio + 180) / 6) + 1
        
        pts_coords = {pt["id"]: (pt["_lat"], pt["_lon"], pt["nome_vertice"]) for pt in pts_validos}
        
        # 3. Montar poligonal principal ordenada (exclui ignorar_poligono = 1)
        poligono_coords = []
        for pt in pts_validos:
            if (pt["ignorar_poligono"] or 0) == 0:
                poligono_coords.append([pt["_lat"], pt["_lon"]])
                
        if len(poligono_coords) < 2:
            return "", {}
            
        # 4. Buscar segmentos do confrontante ordenados por ordem de caminhamento do ponto inicial
        rows_segs = execute_query(
            """
            SELECT s.ponto_inicio_id, s.ponto_fim_id, pi.ordem_caminhamento as ini_ordem
            FROM segmentos s
            JOIN pontos pi ON s.ponto_inicio_id = pi.id
            WHERE s.levantamento_id = ? AND s.matricula_id = ? AND s.confrontante_id = ?
            """,
            params=(lev_id, matricula_id, confrontante_id),
            fetch_all=True
        )
        
        segs = [dict(r) for r in rows_segs]
        if segs:
            segs.sort(key=lambda x: x["ini_ordem"] if x["ini_ordem"] is not None else 0)
            extremidade_inicial_id = segs[0]["ponto_inicio_id"]
            extremidade_final_id = segs[-1]["ponto_fim_id"]
        else:
            extremidade_inicial_id = None
            extremidade_final_id = None
        
        lindeira_coords = []
        lindeira_pontos = []
        pts_vistos = set()
        
        for s in segs:
            p_ini_id = s["ponto_inicio_id"]
            p_fim_id = s["ponto_fim_id"]
            
            if p_ini_id in pts_coords and p_fim_id in pts_coords:
                lat1, lon1, nome1 = pts_coords[p_ini_id]
                lat2, lon2, nome2 = pts_coords[p_fim_id]
                
                # Segmento linear entre início e fim
                lindeira_coords.append([[lat1, lon1], [lat2, lon2]])
                
                if p_ini_id not in pts_vistos:
                    exibir = (p_ini_id == extremidade_inicial_id or p_ini_id == extremidade_final_id)
                    lindeira_pontos.append({"coords": [lat1, lon1], "nome": nome1, "exibir_nome": exibir})
                    pts_vistos.add(p_ini_id)
                if p_fim_id not in pts_vistos:
                    exibir = (p_fim_id == extremidade_inicial_id or p_fim_id == extremidade_final_id)
                    lindeira_pontos.append({"coords": [lat2, lon2], "nome": nome2, "exibir_nome": exibir})
                    pts_vistos.add(p_fim_id)
                    
        if not lindeira_coords:
            return "", {}
            
        map_id = f"map_confrontante_{confrontante_id}"
        
        html = f"""
<!-- ANEXO GRÁFICO - CROQUI DE LIMITES DE CONFRONTAÇÃO (PÁGINA 2) -->
<div class="page bg-white text-slate-800 pt-8 pb-16 px-16 max-w-[21cm] min-h-[29.7cm] w-full shadow-2xl border border-slate-200 rounded-xl print:rounded-none print:border-none print:shadow-none break-before-page print:break-before-page">
    <!-- CABEÇALHO DA EMPRESA -->
    <div class="flex flex-col items-center pb-1 mb-1.5 text-center border-b border-slate-100">
        <div class="text-2xl font-extrabold text-[#0c1510] tracking-wider uppercase mb-0.5">COMPLETA</div>
        <div class="text-[9px] font-semibold text-slate-500 uppercase tracking-widest">Agrimensura e Projetos Agropecuários LTDA</div>
    </div>
    
    <div class="text-center mb-4">
        <h2 class="text-sm font-bold text-slate-900 uppercase tracking-wide">ANEXO GRÁFICO - CROQUI DE LIMITES</h2>
        <p class="text-[10px] text-slate-500 uppercase tracking-wider mt-1">Confrontante: <strong class="text-slate-900">{c_nome}</strong> | Matrícula: <strong class="text-slate-900">{c_matricula}</strong></p>
    </div>

    <!-- Container do Mapa Leaflet -->
    <div id="{map_id}" class="w-full h-[580px] border border-slate-300 rounded-xl shadow-sm bg-slate-100 overflow-hidden relative break-inside-avoid">
        <!-- Indicador de Carregamento -->
        <div id="loader_{map_id}" class="absolute inset-0 flex items-center justify-center bg-white/70 z-[1000]">
            <div class="flex flex-col items-center gap-2">
                <svg class="animate-spin h-8 w-8 text-[#0284c7]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span class="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Carregando Imagens de Satélite...</span>
            </div>
        </div>
    </div>

    <!-- Legenda do Mapa -->
    <div class="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-lg flex justify-around text-[10px] text-slate-600 font-bold uppercase tracking-wider break-inside-avoid">
        <div class="flex items-center gap-2">
            <div class="w-6 h-0.5 border-t-2 border-dashed border-[#94a3b8]"></div>
            <span>Limite Geral do Imóvel</span>
        </div>
        <div class="flex items-center gap-2">
            <div class="w-6 h-1 bg-[#0284c7] rounded"></div>
            <span class="text-[#0284c7]">Divisa Lindeira</span>
        </div>
        <div class="flex items-center gap-2">
            <div class="w-2 h-2 rounded-full border-[1.5px] border-[#0284c7] bg-white"></div>
            <span>Vértice de Divisa</span>
        </div>
    </div>

    <div class="mt-6 text-[8px] text-slate-400 text-justify leading-relaxed break-inside-avoid">
        * Este croqui possui caráter puramente ilustrativo para fins de anuência de divisa lindeira, não substituindo o memorial descritivo oficial de georreferenciamento nem as plantas técnicas aprovadas pelo INCRA/SIGEF. As coordenadas apresentadas baseiam-se na projeção UTM Zone {zona_utm}S sob o datum de referência SIRGAS 2000.
     </div>
</div>
<!-- FIM DE FOLHAS CONSOLIDADAS -->
        """
        
        map_data = {
            "id": map_id,
            "poligono": poligono_coords,
            "lindeira": lindeira_coords,
            "lindeira_pontos": lindeira_pontos
        }
        
        return html, map_data
    except Exception as e:
        logger.error(f"Erro ao gerar anexo gráfico da confrontação: {e}", exc_info=True)
        return "", {}

@staticmethod

