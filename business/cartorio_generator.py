import os
import logging
import math
from datetime import datetime
from pyproj import Transformer, Geod
from database.connection import execute_query
from config import EXPORT_BASE_FOLDER
from business.geoprocessamento import calcular_zona_utm_segura

logger = logging.getLogger(__name__)

def formatar_cpf(valor) -> str:
    if not valor:
        return ""
    nums = "".join(filter(str.isdigit, str(valor)))
    if len(nums) == 11:
        return f"{nums[:3]}.{nums[3:6]}.{nums[6:9]}-{nums[9:]}"
    elif len(nums) == 14:
        return f"{nums[:2]}.{nums[2:5]}.{nums[5:8]}/{nums[8:12]}-{nums[12:]}"
    return str(valor)

def formatar_rg(valor) -> str:
    if not valor:
        return ""
    return str(valor).strip()

def obter_dados_comuns(lev_id: int, matricula_id: int) -> dict:
    """Carrega profissional, propriedade, matricula e proprietário principal com dados qualificados"""
    # 1. Levantamento e Profissional (Inclusão de suporte a TRT persistente no banco)
    query_lev = """
        SELECT l.propriedade_id, l.profissional_id, l.numero_trt as lev_numero_trt, l.data_trt as lev_data_trt,
               p.nome as nome_profissional, p.registro as registro_profissional, 
               p.endereco as endereco_profissional, p.codigo_credenciado, p.formacao as formacao_profissional, p.conselho as conselho_profissional,
               p.nacionalidade as nacionalidade_profissional, p.cpf as cpf_profissional, p.rg as rg_profissional, p.endereco_residencial as endereco_residencial_profissional
        FROM levantamentos l
        JOIN profissionais p ON l.profissional_id = p.id
        WHERE l.id = ?
    """
    row_lev = execute_query(query_lev, params=(lev_id,), fetch_one=True)
    if not row_lev:
        raise ValueError(f"Levantamento ID {lev_id} não encontrado.")
    lev_data = dict(row_lev)
    prop_id = lev_data["propriedade_id"]

    # 2. Propriedade
    row_prop = execute_query(
        "SELECT id, nome_propriedade, municipio, uf, codigo_car, codigo_ccir FROM propriedades WHERE id = ?",
        params=(prop_id,),
        fetch_one=True
    )
    if not row_prop:
        raise ValueError(f"Propriedade com ID {prop_id} não encontrada.")
    prop_data = dict(row_prop)

    # 3. Matrícula
    row_mat = execute_query(
        """
        SELECT id, numero_matricula, ccir, itr, area_ha, cri_comarca, cri_circunscricao, livro_registro, folha_registro,
               valor_itr, denominacao, georreferenciamento
        FROM matriculas
        WHERE id = ? AND propriedade_id = ?
        """,
        params=(matricula_id, prop_id),
        fetch_one=True
    )
    if not row_mat:
        raise ValueError(f"Matrícula ID {matricula_id} não encontrada para esta propriedade.")
    mat_data = dict(row_mat)

    # 4. Proprietários
    rows_owners = execute_query(
        """
        SELECT c.nome_completo, c.cpf_cnpj, c.rg_ie, c.estado_civil, c.regime_bens, 
               c.nome_conjuge, c.cpf_conjuge, c.rg_conjuge, c.profissao, c.nacionalidade, c.endereco_completo, c.cidade, c.estado, c.sexo
        FROM propriedade_clientes pc
        JOIN clientes c ON pc.cliente_id = c.id
        WHERE pc.propriedade_id = ?
        ORDER BY pc.percentual_participacao DESC, c.id ASC
        """,
        params=(prop_id,),
        fetch_all=True
    )
    owners = [dict(o) for o in rows_owners]

    return {
        "lev": lev_data,
        "prop": prop_data,
        "mat": mat_data,
        "owners": owners
    }

def obter_segmentos_detalhados_confrontante(matricula_id: int, confrontante_id: int) -> list[dict]:
    """Busca e retorna os segmentos de confrontação ordenados com dados topográficos e geométricos completos"""
    query = """
        SELECT s.tipo_limite_sigef, s.metodo_posicionamento_sigef,
               pi.nome_vertice as ini_nome, pi.lat as ini_lat, pi.lon as ini_lon, pi.ordem_caminhamento as ini_ordem,
               pf.nome_vertice as fim_nome, pf.lat as fim_lat, pf.lon as fim_lon
        FROM segmentos s
        JOIN pontos pi ON s.ponto_inicio_id = pi.id
        JOIN pontos pf ON s.ponto_fim_id = pf.id
        WHERE s.matricula_id = ? AND s.confrontante_id = ?
    """
    rows = execute_query(query, params=(matricula_id, confrontante_id), fetch_all=True)
    segs = [dict(r) for r in rows]
    segs.sort(key=lambda x: x["ini_ordem"] if x["ini_ordem"] is not None else 0)
    return segs

def calcular_azimute_e_distancia(ini_lat, ini_lon, fim_lat, fim_lon) -> tuple[str, str]:
    if any(coord is None for coord in [ini_lat, ini_lon, fim_lat, fim_lon]):
        return "-", "-"
    
    try:
        # Usar pyproj.Geod com elipsoide GRS80 (SIRGAS 2000) para cálculo geodésico rigoroso 2D (elipsoidal)
        # Isso remove as distorções do fator de escala UTM (k) e bate perfeitamente com os cálculos do SIGEF.
        geod = Geod(ellps="GRS80")
        az_ida, az_volta, distancia = geod.inv(ini_lon, ini_lat, fim_lon, fim_lat)
        
        distancia_str = f"{distancia:.2f} m"
        
        # Ajusta azimute para a faixa 0-360
        az_deg = az_ida % 360.0
        
        # Formatar azimute no padrão GMS (Graus, Minutos e Segundos)
        graus = int(az_deg)
        minutos_dec = (az_deg - graus) * 60.0
        minutos = int(minutos_dec)
        segundos = (minutos_dec - minutos) * 60.0
        
        # Proteção clássica para arredondamento de segundos
        if segundos >= 59.5:
            segundos = 0.0
            minutos += 1
            if minutos >= 60:
                minutos = 0
                graus = (graus + 1) % 360
                
        azimute_str = f"{graus}°{minutos:02d}'{segundos:02.0f}\""
        
        return azimute_str, distancia_str
    except Exception as e:
        logger.warning(f"Erro ao calcular azimute/distância geodésica do segmento: {e}")
        return "-", "-"

def gerar_tabela_divisas_html(matricula_id: int, confrontante_id: int) -> str:
    """Gera uma tabela HTML estruturada com os dados de caminhamento técnico da divisa lindeira"""
    segmentos = obter_segmentos_detalhados_confrontante(matricula_id, confrontante_id)
    if not segmentos:
        return '<p class="text-xs text-red-500 italic">Nenhum segmento de divisa mapeado para este confrontante.</p>'

    linhas_html = ""
    for s in segmentos:
        lat_f = f"{s['ini_lat']:.7f}°" if s['ini_lat'] else "-"
        lon_f = f"{s['ini_lon']:.7f}°" if s['ini_lon'] else "-"
        
        # Calcular Azimute e Distância
        azimute_f, dist_f = calcular_azimute_e_distancia(s["ini_lat"], s["ini_lon"], s["fim_lat"], s["fim_lon"])
        
        linhas_html += f"""
        <tr class="border-b border-slate-200 text-[11px] text-slate-700 font-mono">
            <td class="px-3 py-1 font-bold text-slate-900">{s['ini_nome']}</td>
            <td class="px-3 py-1 font-bold text-slate-900">{s['fim_nome']}</td>
            <td class="px-3 py-1 text-right font-bold text-slate-900">{azimute_f}</td>
            <td class="px-3 py-1 text-right font-bold text-slate-900">{dist_f}</td>
            <td class="px-3 py-1 text-right">{lat_f}</td>
            <td class="px-3 py-1 text-right">{lon_f}</td>
        </tr>
        """

    table_html = f"""
    <div class="my-2 border border-slate-300 rounded-lg overflow-hidden break-inside-avoid">
        <table class="w-full text-left border-collapse bg-slate-50/50">
            <thead>
                <tr class="bg-slate-100 text-[10px] font-bold text-slate-600 uppercase border-b border-slate-300 tracking-wider">
                    <th class="px-3 py-1">De</th>
                    <th class="px-3 py-1">Para</th>
                    <th class="px-3 py-1 text-right">Azimute</th>
                    <th class="px-3 py-1 text-right">Distância</th>
                    <th class="px-3 py-1 text-right">Lat. Inicial</th>
                    <th class="px-3 py-1 text-right">Lon. Inicial</th>
                </tr>
            </thead>
            <tbody>
                {linhas_html}
            </tbody>
        </table>
    </div>
    """
    return table_html

def obter_data_extenso() -> str:
    meses = {
        1: "janeiro", 2: "fevereiro", 3: "março", 4: "abril",
        5: "maio", 6: "junho", 7: "julho", 8: "agosto",
        9: "setembro", 10: "outubro", 11: "novembro", 12: "dezembro"
    }
    agora = datetime.now()
    return f"{agora.day} de {meses[agora.month]} de {agora.year}"

def carregar_template(nome_arquivo: str) -> str:
    path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "templates", nome_arquivo)
    with open(path, "r", encoding="utf-8") as f:
        return f.read()

class CartorioReportGenerator:
    
    @staticmethod
    def gerar_requerimento_cartorio_html(lev_id: int, matricula_id: int, numero_trt: str = None, data_trt: str = "") -> str:
        dados = obter_dados_comuns(lev_id, matricula_id)
        
        # Fallback inteligente para dados persistidos no banco
        final_trt = numero_trt if numero_trt else (dados["lev"].get("lev_numero_trt") or "____________________")
        raw_data_trt = data_trt if data_trt else (dados["lev"].get("lev_data_trt") or "")
        
        qualificacoes = []
        for owner in dados["owners"]:
            sexo = str(owner.get("sexo") or "M").strip().upper()
            pron_inscrito = "inscrita" if sexo in ("F", "FEMININO") else "inscrito"
            pron_portador = "portadora" if sexo in ("F", "FEMININO") else "portador"
            
            cpf = formatar_cpf(owner["cpf_cnpj"])
            rg = formatar_rg(owner["rg_ie"])
            nac = owner.get("nacionalidade") or "brasileiro(a)"
            prof = owner.get("profissao") or "produtor(a) rural"
            est_civil = owner.get("estado_civil") or "solteiro"
            domicilio = owner.get("endereco_completo") or "Não Informado"
            if owner.get("cidade") and owner.get("estado"):
                domicilio += f", {owner['cidade']}-{owner['estado']}"
                
            e_civil_lower = est_civil.lower()
            regime = owner.get("regime_bens") or "Não Informado"
            
            if "casad" in e_civil_lower or "estável" in e_civil_lower or "estavel" in e_civil_lower:
                conj_nome = owner.get("nome_conjuge") or "Não Informado"
                if "parcial" in regime.lower():
                    casado_info = f", casado(a) sob o regime de {regime} com {conj_nome}"
                else:
                    conj_rg = formatar_rg(owner.get("rg_conjuge")) or "Não Informado"
                    conj_cpf = formatar_cpf(owner.get("cpf_conjuge")) or "Não Informado"
                    casado_info = f", casado(a) sob o regime de {regime} com {conj_nome}, portador(a) do RG nº {conj_rg} e inscrito(a) no CPF nº {conj_cpf}"
            else:
                casado_info = f", {est_civil.lower()}"
                
            qualif = f'<strong class="text-slate-900">{owner["nome_completo"]}</strong>, {nac}, {prof}{casado_info}, residente e domiciliado em {domicilio}, {pron_inscrito} no CPF nº {cpf} e {pron_portador} do RG nº {rg}'
            qualificacoes.append(qualif)
            
        qualificacao_completa = ";<br>".join(qualificacoes)
        
        # 1. Recuperar todas as matrículas cadastradas para a propriedade
        prop_id = dados["prop"]["id"]
        query_mats = """
            SELECT id, numero_matricula, ccir, itr, area_ha, cri_comarca, cri_circunscricao, livro_registro, folha_registro,
                   valor_itr, denominacao, georreferenciamento
            FROM matriculas
            WHERE propriedade_id = ?
            ORDER BY numero_matricula
        """
        rows_mats = execute_query(query_mats, params=(prop_id,), fetch_all=True)
        mats = [dict(m) for m in rows_mats]
        
        comarca = str(dados["mat"].get("cri_comarca") or dados["prop"]["municipio"]).upper()
        data_extenso = obter_data_extenso()
        
        # Se houver múltiplas matrículas, consolidamos os dados em uma tabela
        if len(mats) > 1:
            linhas_tabela = ""
            area_total_acumulada = 0.0
            lista_mats = []
            
            for m in mats:
                area_m = m["area_ha"] or 0.0
                area_total_acumulada += area_m
                area_m_str = f"{area_m:,.4f}".replace(",", "X").replace(".", ",").replace("X", ".")
                num_mat = m["numero_matricula"] or "_____"
                lista_mats.append(num_mat)
                sigef_m = m["georreferenciamento"] or "Não Certificado"
                denominacao_m = m["denominacao"] or dados["prop"]["nome_propriedade"]
                
                linhas_tabela += f"""
                <tr class="border-b border-slate-100 font-mono text-[10px] text-slate-700 hover:bg-slate-50/50 transition-colors">
                    <td class="px-3 py-2 font-bold text-slate-900">{denominacao_m}</td>
                    <td class="px-3 py-2 text-center font-semibold">{num_mat}</td>
                    <td class="px-3 py-2 text-right">{area_m_str} ha</td>
                    <td class="px-3 py-2 text-center text-[9px]">{sigef_m}</td>
                </tr>
                """
            
            area_total_str = f"{area_total_acumulada:,.4f}".replace(",", "X").replace(".", ",").replace("X", ".")
            
            if len(lista_mats) == 2:
                lista_mats_str = f"{lista_mats[0]} e {lista_mats[1]}"
            else:
                lista_mats_str = ", ".join(lista_mats[:-1]) + f" e {lista_mats[-1]}"
                
            nome_lote = f"{dados['prop']['nome_propriedade']} (Glebas: {', '.join(lista_mats)})"
            
            itens_iniciais_requerimento_html = f"""
                <li class="flex items-start gap-2">
                    <span class="font-bold text-slate-900">1.</span>
                    <span class="w-full">Os requerentes são os legítimos proprietários e possuidores dos imóveis rurais situados no município de <strong class="text-slate-900">{dados["prop"]["municipio"]}/{dados["prop"]["uf"]}</strong>, denominados e caracterizados conforme a tabela de glebas abaixo descrita:
                        
                        <div class="overflow-x-auto mt-3 border border-slate-200 rounded-lg shadow-sm w-full break-inside-avoid">
                            <table class="w-full text-left border-collapse">
                                <thead>
                                    <tr class="bg-slate-50 border-b border-slate-200 text-slate-700 text-[10px] font-bold uppercase tracking-wider">
                                        <th class="px-3 py-2">Denominação (Gleba)</th>
                                        <th class="px-3 py-2 text-center">Matrícula Originária</th>
                                        <th class="px-3 py-2 text-right">Área Registrada</th>
                                        <th class="px-3 py-2 text-center">Certificação SIGEF (Código)</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-100">
                                    {linhas_tabela}
                                </tbody>
                            </table>
                        </div>
                    </span>
                </li>

                <li class="flex items-start gap-2 mt-4">
                    <span class="font-bold text-slate-900">2.</span>
                    <span>As referidas áreas, somadas, perfazem uma extensão territorial total de <strong>{area_total_str} ha</strong> de direito, registradas conforme as antigas descrições precárias de limites nos assentos imobiliários originários descritos.</span>
                </li>

                <li class="flex items-start gap-2">
                    <span class="font-bold text-slate-900">3.</span>
                    <span>Ocorre que, realizando-se o levantamento topográfico georreferenciado e de alta precisão dos imóveis para fins de obtenção da certificação técnica junto ao INCRA, constatou-se formalmente que os dados descritivos e as áreas históricas contidos nas matrículas descritas não correspondem à exata, fidedigna e atual realidade de fato existente e consolidada em campo.</span>
                </li>

                <li class="flex items-start gap-2">
                    <span class="font-bold text-slate-900">4.</span>
                    <span>Em cumprimento às normas vigentes, o <strong>INCRA aprovou os projetos de georreferenciamento</strong> das glebas, emitindo as respectivas Certificações SIGEF com os protocolos técnicos e códigos identificadores individuais constantes na tabela descrita no Item 1.</span>
                </li>
            """
            texto_encerramento_html = f"<strong>ENCERRAMENTO DAS MATRÍCULAS ORIGINÁRIAS DE NÚMEROS {lista_mats_str.upper()}</strong> e as subsequentes <strong>ABERTURAS DE NOVAS MATRÍCULAS GEORREFERENCIADAS</strong>"
        
        else:
            # Caso de matrícula única (preserva comportamento original de forma isolada)
            nome_lote = dados["mat"].get("denominacao") or dados["prop"]["nome_propriedade"]
            area_m = dados["mat"]["area_ha"] or 0.0
            area_m_str = f"{area_m:,.4f}".replace(",", "X").replace(".", ",").replace("X", ".")
            georref_sigef = dados["mat"].get("georreferenciamento") or "____________________"
            num_mat = dados["mat"]["numero_matricula"] or "_____"
            
            itens_iniciais_requerimento_html = f"""
                <li class="flex items-start gap-2">
                    <span class="font-bold text-slate-900">1.</span>
                    <span>Os requerentes são os legítimos proprietários e possuidores do imóvel rural denominado <strong
                            class="text-slate-900">{nome_lote}</strong>, situado no município de {dados["prop"]["municipio"]}/{dados["prop"]["uf"]},
                        objeto da <strong>Matrícula nº {num_mat}</strong> deste prestigiado Ofício de Registro
                        Imobiliário.</span>
                </li>

                <li class="flex items-start gap-2">
                    <span class="font-bold text-slate-900">2.</span>
                    <span>O referido imóvel rural perfaz originalmente uma área total descrita de <strong>{area_m_str}
                            ha</strong>, registrada conforme as antigas descrições precárias de divisas constantes no
                        assento imobiliário original.</span>
                </li>

                <li class="flex items-start gap-2">
                    <span class="font-bold text-slate-900">3.</span>
                    <span>Ocorre que, realizando-se o levantamento topográfico georreferenciado e de alta precisão do
                        imóvel para fins de obtenção da certificação técnica junto ao INCRA, constatou-se formalmente
                        que os dados descritivos e a área histórica contidos na matrícula descrita não correspondem à
                        exata, fidedigna e atual realidade de fato existente e consolidada em campo.</span>
                </li>

                <li class="flex items-start gap-2">
                    <span class="font-bold text-slate-900">4.</span>
                    <span>Em cumprimento às normas vigentes, o <strong>INCRA aprovou o projeto de
                            georreferenciamento</strong> do referido imóvel, emitindo a Certificação SIGEF sob o número
                        de protocolo técnico <strong
                            class="font-mono text-slate-900 font-bold">{georref_sigef}</strong>, apurando e certificando
                        a poligonal perimetral exata da propriedade.</span>
                </li>
            """
            texto_encerramento_html = f"<strong>ENCERRAMENTO DA MATRÍCULA Nº {num_mat}</strong> e a subsequente <strong>ABERTURA DE NOVA MATRÍCULA GEORREFERENCIADA</strong>"

        data_trt_f = "____________________"
        if raw_data_trt:
            try:
                dt = datetime.strptime(raw_data_trt, "%Y-%m-%d") if "-" in raw_data_trt else datetime.strptime(raw_data_trt, "%d/%m/%Y")
                data_trt_f = dt.strftime("%d/%m/%Y")
            except:
                data_trt_f = raw_data_trt
                
        bloco_assinaturas = '<div class="mt-6 flex flex-row flex-wrap justify-around gap-x-8 gap-y-12 w-full">'
        for owner in dados["owners"]:
            bloco_assinaturas += f"""
            <div class="flex flex-col items-center min-w-[250px] flex-1 max-w-[300px]">
                <div class="w-full border-t border-slate-400 mt-6 mb-2"></div>
                <div class="text-xs font-bold text-slate-900 text-center uppercase tracking-wide">{owner["nome_completo"]}</div>
                <div class="text-[10px] text-slate-500 text-center font-medium mt-0.5">Proprietário Requerente</div>
            </div>
            """
            e_civil = str(owner.get("estado_civil", "")).strip().lower()
            if "casad" in e_civil or "estável" in e_civil or "estavel" in e_civil:
                conj_nome = owner.get("nome_conjuge") or "Cônjuge"
                bloco_assinaturas += f"""
                <div class="flex flex-col items-center min-w-[250px] flex-1 max-w-[300px]">
                    <div class="w-full border-t border-slate-400 mt-6 mb-2"></div>
                    <div class="text-xs font-bold text-slate-900 text-center uppercase tracking-wide">{conj_nome}</div>
                    <div class="text-[10px] text-slate-500 text-center font-medium mt-0.5">Cônjuge Requerente</div>
                </div>
                """
        bloco_assinaturas += "</div>"

        template = carregar_template("requerimento_cartorio.html")
        replacements = {
            "{nome_lote}": nome_lote,
            "{comarca}": comarca,
            "{qualificacao_completa}": qualificacao_completa,
            "{itens_iniciais_requerimento_html}": itens_iniciais_requerimento_html,
            "{texto_encerramento_html}": texto_encerramento_html,
            "{nome_profissional}": dados["lev"]["nome_profissional"] or "_____",
            "{conselho_profissional}": dados["lev"]["conselho_profissional"] or "conselho profissional",
            "{registro_profissional}": dados["lev"]["registro_profissional"] or "_____",
            "{final_trt}": final_trt,
            "{data_trt_f}": data_trt_f,
            "{municipio}": dados["prop"]["municipio"] or "_____",
            "{uf}": dados["prop"]["uf"] or "PR",
            "{data_extenso}": data_extenso,
            "{bloco_assinaturas}": bloco_assinaturas
        }
        html_content = template
        for placeholder, value in replacements.items():
            html_content = html_content.replace(placeholder, str(value))
        return html_content

    @staticmethod
    def gerar_declaracao_responsabilidade_html(lev_id: int, matricula_id: int) -> str:
        dados = obter_dados_comuns(lev_id, matricula_id)
        comarca = str(dados["mat"].get("cri_comarca") or dados["prop"]["municipio"]).upper()
        
        qualificacoes = []
        for owner in dados["owners"]:
            sexo = str(owner.get("sexo") or "M").strip().upper()
            pron_inscrito = "inscrita" if sexo in ("F", "FEMININO") else "inscrito"
            pron_portador = "portadora" if sexo in ("F", "FEMININO") else "portador"
            qualif = f'<strong class="text-slate-900">{owner["nome_completo"]}</strong>, {pron_inscrito} no CPF nº {formatar_cpf(owner["cpf_cnpj"])} e {pron_portador} do RG nº {formatar_rg(owner["rg_ie"])}'
            qualificacoes.append(qualif)
            
        qualificacao_completa = " e ".join(qualificacoes)
        data_extenso = obter_data_extenso()
        
        # 1. Recuperar todas as matrículas cadastradas para a propriedade
        prop_id = dados["prop"]["id"]
        query_mats = """
            SELECT id, numero_matricula, ccir, itr, area_ha, cri_comarca, cri_circunscricao, livro_registro, folha_registro,
                   valor_itr, denominacao, georreferenciamento
            FROM matriculas
            WHERE propriedade_id = ?
            ORDER BY numero_matricula
        """
        rows_mats = execute_query(query_mats, params=(prop_id,), fetch_all=True)
        mats = [dict(m) for m in rows_mats]
        
        # Se houver múltiplas matrículas, consolidamos os dados em uma tabela
        if len(mats) > 1:
            linhas_tabela = ""
            lista_mats = []
            
            for m in mats:
                area_m = m["area_ha"] or 0.0
                area_m_str = f"{area_m:,.4f}".replace(",", "X").replace(".", ",").replace("X", ".")
                num_mat = m["numero_matricula"] or "_____"
                lista_mats.append(num_mat)
                denominacao_m = m["denominacao"] or dados["prop"]["nome_propriedade"]
                cri_comarca_m = m["cri_comarca"] or dados["prop"]["municipio"]
                
                linhas_tabela += f"""
                <tr class="border-b border-slate-100 font-mono text-[10px] text-slate-700 hover:bg-slate-50/50 transition-colors">
                    <td class="px-3 py-2 font-bold text-slate-900">{denominacao_m}</td>
                    <td class="px-3 py-2 text-center font-semibold">{num_mat}</td>
                    <td class="px-3 py-2 text-right">{area_m_str} ha</td>
                    <td class="px-3 py-2">{cri_comarca_m}</td>
                </tr>
                """
            
            nome_lote = f"{dados['prop']['nome_propriedade']} (Glebas: {', '.join(lista_mats)})"
            
            texto_inicial_declaracao_html = f"""
                <p>Os abaixo assinados, {qualificacao_completa}, na qualidade de legítimos proprietários dos imóveis rurais situados no município de <strong class="text-slate-900">{dados["prop"]["municipio"]}/{dados["prop"]["uf"]}</strong>, declaram sob as penas da lei, em especial as sanções previstas no art. 299 do Código Penal Brasileiro, ser de sua inteira responsabilidade as divisas físicas e a posse pacífica das seguintes glebas/matrículas descritas abaixo:
                    
                    <div class="overflow-x-auto mt-3 border border-slate-200 rounded-lg shadow-sm w-full break-inside-avoid">
                        <table class="w-full text-left border-collapse">
                            <thead>
                                <tr class="bg-slate-50 border-b border-slate-200 text-slate-700 text-[10px] font-bold uppercase tracking-wider">
                                    <th class="px-3 py-2">Denominação (Gleba)</th>
                                    <th class="px-3 py-2 text-center">Matrícula</th>
                                    <th class="px-3 py-2 text-right">Área</th>
                                    <th class="px-3 py-2">Comarca / CRI</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100">
                                {linhas_tabela}
                            </tbody>
                        </table>
                    </div>
                </p>
                <p class="mt-4">Declaramos, para todos os fins de direito e sob as penas da lei, que:</p>
            """
        
        else:
            # Caso de matrícula única (preserva comportamento original de forma isolada)
            nome_lote = dados["mat"].get("denominacao") or dados["prop"]["nome_propriedade"]
            area_m = dados["mat"]["area_ha"] or 0.0
            area_m_str = f"{area_m:,.4f}".replace(",", "X").replace(".", ",").replace("X", ".")
            num_mat = dados["mat"]["numero_matricula"] or "_____"
            
            texto_inicial_declaracao_html = f"""
                <p>Os abaixo assinados, {qualificacao_completa}, na qualidade de legítimos proprietários do imóvel rural
                    denominado <strong>{nome_lote}</strong>, com área de <strong>{area_m_str} ha</strong>, localizado no
                    município de {dados["prop"]["municipio"]}/{dados["prop"]["uf"]}, objeto da Matrícula nº <strong>{num_mat}</strong> do
                    Registro de Imóveis da Comarca de {comarca}, declaram sob as penas da lei, em especial as sanções
                    previstas no art. 299 do Código Penal Brasileiro, que:</p>
            """

        bloco_assinaturas = '<div class="mt-6 flex flex-row flex-wrap justify-around gap-x-8 gap-y-12 w-full">'
        for owner in dados["owners"]:
            bloco_assinaturas += f"""
            <div class="flex flex-col items-center min-w-[250px] flex-1 max-w-[300px]">
                <div class="w-full border-t border-slate-400 mt-6 mb-2"></div>
                <div class="text-xs font-bold text-slate-900 text-center uppercase tracking-wide">{owner["nome_completo"]}</div>
                <div class="text-[10px] text-slate-500 text-center font-medium mt-0.5">Declarante Proprietário</div>
            </div>
            """
        bloco_assinaturas += "</div>"

        template = carregar_template("declaracao_responsabilidade.html")
        replacements = {
            "{nome_lote}": nome_lote,
            "{comarca}": comarca,
            "{qualificacao_completa}": qualificacao_completa,
            "{texto_inicial_declaracao_html}": texto_inicial_declaracao_html,
            "{municipio}": dados["prop"]["municipio"] or "_____",
            "{uf}": dados["prop"]["uf"] or "PR",
            "{data_extenso}": data_extenso,
            "{bloco_assinaturas}": bloco_assinaturas
        }
        html_content = template
        for placeholder, value in replacements.items():
            html_content = html_content.replace(placeholder, str(value))
        return html_content

    @staticmethod
    def gerar_laudo_tecnico_html(lev_id: int, matricula_id: int, numero_trt: str = None, data_trt: str = "", equipamento: str = "") -> str:
        dados = obter_dados_comuns(lev_id, matricula_id)
        
        final_trt = numero_trt if numero_trt else (dados["lev"].get("lev_numero_trt") or "____________________")
        raw_data_trt = data_trt if data_trt else (dados["lev"].get("lev_data_trt") or "")

        proprietarios_list = [o["nome_completo"] for o in dados["owners"]]
        proprietarios_str = " e ".join(proprietarios_list)
        
        nome_prof = dados["lev"]["nome_profissional"]
        registro_prof = dados["lev"]["registro_profissional"]
        conselho_prof = dados["lev"]["conselho_profissional"] or "CFTA"
        conselho_exibicao = f"{conselho_prof} nº {registro_prof}"
        endereco_prof = dados["lev"]["endereco_profissional"] or "Não Informado"
        credencial_incra = dados["lev"]["codigo_credenciado"] or "Não Informado"
        
        data_trt_f = "____________________"
        if raw_data_trt:
            try:
                dt = datetime.strptime(raw_data_trt, "%Y-%m-%d") if "-" in raw_data_trt else datetime.strptime(raw_data_trt, "%d/%m/%Y")
                data_trt_f = dt.strftime("%d/%m/%Y")
            except:
                data_trt_f = raw_data_trt

        equipamento_f = equipamento if (equipamento and equipamento.strip()) else "Receptor GNSS Hi-Target V30 / RTK de Dupla Frequência (L1/L2)"

        # 1. Recuperar todas as matrículas cadastradas para a propriedade
        prop_id = dados["prop"]["id"]
        query_mats = """
            SELECT id, numero_matricula, ccir, itr, area_ha, cri_comarca, cri_circunscricao, livro_registro, folha_registro,
                   valor_itr, denominacao, georreferenciamento
            FROM matriculas
            WHERE propriedade_id = ?
            ORDER BY numero_matricula
        """
        rows_mats = execute_query(query_mats, params=(prop_id,), fetch_all=True)
        mats = [dict(m) for m in rows_mats]
        
        # Se houver múltiplas matrículas, consolidamos os dados em formato de tabela
        if len(mats) > 1:
            linhas_resumo = ""
            lista_mats = []
            mats_ids = []
            for m in mats:
                mats_ids.append(m["id"])
                area_m = m["area_ha"] or 0.0
                area_m_str = f"{area_m:,.4f}".replace(",", "X").replace(".", ",").replace("X", ".")
                num_mat = m["numero_matricula"] or "_____"
                lista_mats.append(num_mat)
                denominacao_m = m["denominacao"] or dados["prop"]["nome_propriedade"]
                cri_comarca_m = m["cri_comarca"] or dados["prop"]["municipio"]
                
                linhas_resumo += f"""
                <tr class="border-b border-slate-100 font-mono text-[10px] text-slate-700 hover:bg-slate-50/50 transition-colors">
                    <td class="px-3 py-2 font-bold text-slate-900">{denominacao_m}</td>
                    <td class="px-3 py-2 text-center font-semibold">{num_mat}</td>
                    <td class="px-3 py-2 text-right">{area_m_str} ha</td>
                    <td class="px-3 py-2">{cri_comarca_m}</td>
                </tr>
                """
                
            nome_lote = f"{dados['prop']['nome_propriedade']} (Glebas: {', '.join(lista_mats)})"
            
            texto_inicial_laudo_html = f"""
                <p>O presente Laudo Técnico tem por objetivo descrever e justificar as operações de campo e escritório
                    realizadas para o Georreferenciamento e Retificação Territorial dos imóveis rurais pertencentes a
                    <strong>{proprietarios_str}</strong>, localizados no município de {dados["prop"]["municipio"] or "_____"}/{dados["prop"]["uf"] or "PR"}, caracterizados e denominados conforme detalhado a seguir:
                    
                    <div class="overflow-x-auto mt-3 border border-slate-200 rounded-lg shadow-sm w-full break-inside-avoid">
                        <table class="w-full text-left border-collapse">
                            <thead>
                                <tr class="bg-slate-50 border-b border-slate-200 text-slate-700 text-[10px] font-bold uppercase tracking-wider">
                                    <th class="px-3 py-2">Denominação (Gleba)</th>
                                    <th class="px-3 py-2 text-center">Matrícula</th>
                                    <th class="px-3 py-2 text-right">Área</th>
                                    <th class="px-3 py-2">Comarca / CRI</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100">
                                {linhas_resumo}
                            </tbody>
                        </table>
                    </div>
                </p>
            """
            
            cabecalho_tabela_html = """
                <tr class="bg-slate-50 text-[9px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                    <th class="px-2 py-1.5">Vértice</th>
                    <th class="px-2 py-1.5 text-center">Tipo</th>
                    <th class="px-2 py-1.5 text-right">Este (X)</th>
                    <th class="px-2 py-1.5 text-right">Norte (Y)</th>
                    <th class="px-2 py-1.5 text-right">Altitude (Z)</th>
                    <th class="px-2 py-1.5">Lote / Matrícula</th>
                </tr>
            """
            
            # Consultar pontos de todas as matrículas
            placeholders = ",".join(["?"] * len(mats_ids))
            query_pontos = f"""
                SELECT bp.codigo_completo, bp.norte, bp.este, bp.altitude, bp.tipo_ponto, bp.numero, bp.matricula_id,
                       m.numero_matricula, m.denominacao
                FROM banco_pontos bp
                LEFT JOIN matriculas m ON bp.matricula_id = m.id
                WHERE bp.levantamento_id = ? AND bp.matricula_id IN ({placeholders})
                ORDER BY bp.matricula_id, bp.tipo_ponto, bp.numero
            """
            params_pontos = [lev_id] + mats_ids
            rows_pontos = execute_query(query_pontos, params=params_pontos, fetch_all=True)
            pontos_list = [dict(p) for p in rows_pontos]
            total_pontos = len(pontos_list)
            
            tabela_pontos_html = ""
            if pontos_list:
                for p in pontos_list:
                    este_f = f"{p['este']:,.2f}" if p["este"] is not None else "-"
                    norte_f = f"{p['norte']:,.2f}" if p["norte"] is not None else "-"
                    altitude_f = f"{p['altitude']:,.2f}" if p["altitude"] is not None else "-"
                    denominacao_m = p["denominacao"] or dados["prop"]["nome_propriedade"]
                    num_mat = p["numero_matricula"] or "_____"
                    
                    tabela_pontos_html += f"""
                    <tr class="border-b border-slate-100 font-mono text-[10px] text-slate-700 hover:bg-slate-50/50 transition-colors">
                        <td class="px-2 py-1.5 font-bold text-slate-900">{p["codigo_completo"]}</td>
                        <td class="px-2 py-1.5 text-center">{p["tipo_ponto"]}</td>
                        <td class="px-2 py-1.5 text-right">{este_f}</td>
                        <td class="px-2 py-1.5 text-right">{norte_f}</td>
                        <td class="px-2 py-1.5 text-right">{altitude_f}</td>
                        <td class="px-2 py-1.5 font-sans font-medium text-slate-600 text-[9px]">{denominacao_m} ({num_mat})</td>
                    </tr>
                    """
            else:
                tabela_pontos_html = """
                <tr>
                    <td colspan="6" class="px-4 py-8 text-center text-slate-400 italic text-xs">Nenhum ponto homologado registrado no banco deste levantamento.</td>
                </tr>
                """
        
        else:
            # Caso de matrícula única (preserva comportamento original de forma isolada)
            nome_lote = dados["mat"].get("denominacao") or dados["prop"]["nome_propriedade"]
            area_m = dados["mat"]["area_ha"] or 0.0
            area_m_str = f"{area_m:,.4f}".replace(",", "X").replace(".", ",").replace("X", ".")
            num_mat = dados["mat"]["numero_matricula"] or "_____"
            
            texto_inicial_laudo_html = f"""
                <p>O presente Laudo Técnico tem por objetivo descrever e justificar as operações de campo e escritório
                    realizadas para o Georreferenciamento e Retificação Territorial do imóvel rural
                    <strong>{nome_lote}</strong>, com área total medida de <strong>{area_m_str} ha</strong>, pertencente a
                    <strong>{proprietarios_str}</strong>, localizado no município de {dados["prop"]["municipio"] or "_____"}/{dados["prop"]["uf"] or "PR"}, sob a Matrícula nº
                    <strong>{num_mat}</strong>.
                </p>
            """
            
            cabecalho_tabela_html = """
                <tr class="bg-slate-50 text-[9px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                    <th class="px-2 py-1.5">Vértice</th>
                    <th class="px-2 py-1.5 text-center">Tipo</th>
                    <th class="px-2 py-1.5 text-right">Este (X)</th>
                    <th class="px-2 py-1.5 text-right">Norte (Y)</th>
                    <th class="px-2 py-1.5 text-right">Altitude (Z)</th>
                </tr>
            """
            
            rows_pontos = execute_query(
                "SELECT codigo_completo, norte, este, altitude, tipo_ponto, numero FROM banco_pontos WHERE levantamento_id = ? AND matricula_id = ? ORDER BY tipo_ponto, numero",
                params=(lev_id, matricula_id),
                fetch_all=True
            )
            pontos_list = [dict(p) for p in rows_pontos]
            total_pontos = len(pontos_list)
            
            tabela_pontos_html = ""
            if pontos_list:
                for p in pontos_list:
                    este_f = f"{p['este']:,.2f}" if p["este"] is not None else "-"
                    norte_f = f"{p['norte']:,.2f}" if p["norte"] is not None else "-"
                    altitude_f = f"{p['altitude']:,.2f}" if p["altitude"] is not None else "-"
                    tabela_pontos_html += f"""
                    <tr class="border-b border-slate-100 font-mono text-[10px] text-slate-700">
                        <td class="px-2 py-1.5 font-bold text-slate-900">{p["codigo_completo"]}</td>
                        <td class="px-2 py-1.5 text-center">{p["tipo_ponto"]}</td>
                        <td class="px-2 py-1.5 text-right">{este_f}</td>
                        <td class="px-2 py-1.5 text-right">{norte_f}</td>
                        <td class="px-2 py-1.5 text-right">{altitude_f}</td>
                    </tr>
                    """
            else:
                tabela_pontos_html = """
                <tr>
                    <td colspan="5" class="px-4 py-8 text-center text-slate-400 italic text-xs">Nenhum ponto homologado registrado no banco deste levantamento.</td>
                </tr>
                """

        data_extenso = obter_data_extenso()

        template = carregar_template("laudo_tecnico.html")
        replacements = {
            "{nome_lote}": nome_lote,
            "{texto_inicial_laudo_html}": texto_inicial_laudo_html,
            "{cabecalho_tabela_html}": cabecalho_tabela_html,
            "{proprietarios_str}": proprietarios_str,
            "{municipio}": dados["prop"]["municipio"] or "_____",
            "{uf}": dados["prop"]["uf"] or "PR",
            "{equipamento_f}": equipamento_f,
            "{total_pontos}": total_pontos,
            "{tabela_pontos_html}": tabela_pontos_html,
            "{credencial_incra}": credencial_incra,
            "{final_trt}": final_trt,
            "{data_trt_f}": data_trt_f,
            "{data_extenso}": data_extenso,
            "{nome_prof}": nome_prof or "_____",
            "{conselho_exibicao}": conselho_exibicao,
            "{endereco_prof}": endereco_prof
        }
        html_content = template
        for placeholder, value in replacements.items():
            html_content = html_content.replace(placeholder, str(value))
        return html_content

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
                ORDER BY ordem_caminhamento ASC
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
    def gerar_js_inicializacao_mapas(lista_mapas_data: list[dict]) -> str:
        """Gera la tag <script> para carregar o Leaflet com imagens de satélite do Google em segundo plano"""
        import json
        mapas_json = json.dumps(lista_mapas_data)
        
        js_code = f"""
    <script>
        document.addEventListener("DOMContentLoaded", function() {{
            const mapasData = {mapas_json};
            
            mapasData.forEach(function(m) {{
                try {{
                    const map = L.map(m.id, {{
                        zoomControl: false,
                        attributionControl: false,
                        fadeAnimation: false,
                        zoomAnimation: false
                    }});
                    
                    const googleSat = L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={{x}}&y={{y}}&z={{z}}', {{
                        maxZoom: 20,
                        crossOrigin: true
                    }});
                    
                    googleSat.addTo(map);
                    
                    if (m.poligono && m.poligono.length > 0) {{
                        L.polygon(m.poligono, {{
                            color: '#94a3b8',
                            fill: false,
                            weight: 1.5,
                            dashArray: '4, 4'
                        }}).addTo(map);
                    }}
                    
                    const bounds = L.latLngBounds();
                    if (m.lindeira && m.lindeira.length > 0) {{
                        m.lindeira.forEach(function(seg) {{
                            L.polyline(seg, {{
                                color: '#0284c7',
                                weight: 4.5,
                                lineCap: 'round',
                                lineJoin: 'round'
                            }}).addTo(map);
                            bounds.extend(seg[0]);
                            bounds.extend(seg[1]);
                        }});
                    }}
                    
                    if (m.lindeira_pontos && m.lindeira_pontos.length > 0) {{
                        m.lindeira_pontos.forEach(function(pt) {{
                            const marker = L.circleMarker(pt.coords, {{
                                radius: 2.0,
                                color: '#0284c7',
                                fillColor: '#ffffff',
                                fillOpacity: 1.0,
                                weight: 1.5
                            }}).addTo(map);
                            
                            if (pt.exibir_nome) {{
                                marker.bindTooltip(pt.nome, {{
                                    permanent: true,
                                    direction: 'top',
                                    className: 'custom-tooltip',
                                    offset: [0, -5]
                                }});
                            }}
                        }});
                    }}
                    
                    if (bounds.isValid()) {{
                        map.fitBounds(bounds, {{
                            padding: [40, 40],
                            maxZoom: 18
                        }});
                    }} else if (m.poligono && m.poligono.length > 0) {{
                        map.fitBounds(m.poligono, {{
                            padding: [20, 20]
                        }});
                    }}
                    
                    let tilesLoaded = 0;
                    map.on('tileload', function() {{
                        tilesLoaded++;
                        if (tilesLoaded >= 3) {{
                            const loader = document.getElementById("loader_" + m.id);
                            if (loader) loader.style.display = "none";
                        }}
                    }});
                    
                    setTimeout(function() {{
                        const loader = document.getElementById("loader_" + m.id);
                        if (loader) loader.style.display = "none";
                    }}, 1500);
                    
                }} catch (e) {{
                    console.error("Erro ao inicializar mapa " + m.id + ": ", e);
                    const loader = document.getElementById("loader_" + m.id);
                    if (loader) {{
                        loader.innerHTML = '<span class="text-xs text-red-500 font-bold">Falha ao carregar imagens do mapa.</span>';
                    }}
                }}
            }});
        }});
    </script>
        """
        return js_code

    @staticmethod
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
            SELECT id, nome, cpf_cnpj, rg, nacionalidade, profissao, estado_civil, regime_bens, 
                   endereco_completo, nome_conjuge, cpf_conjuge, rg_conjuge, matricula_imovel
            FROM confrontantes
            WHERE id = ? AND levantamento_id = ?
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
                row_conf = execute_query("SELECT nome, matricula_imovel FROM confrontantes WHERE id = ?", params=(c_id,), fetch_one=True)
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
    def gerar_termo_responsabilidade_sigef_html(lev_id: int, matricula_id: int, numero_trt: str = None, data_trt: str = "") -> str:
        """Gera o HTML correspondente ao Termo de Responsabilidade Técnica SIGEF com as tags injetadas"""
        dados = obter_dados_comuns(lev_id, matricula_id)
        
        final_trt = numero_trt if numero_trt else (dados["lev"].get("lev_numero_trt") or "____________________")
        raw_data_trt = data_trt if data_trt else (dados["lev"].get("lev_data_trt") or "")

        nome_prof = dados["lev"]["nome_profissional"]
        registro_prof = dados["lev"]["registro_profissional"]
        conselho_prof = dados["lev"]["conselho_profissional"] or "CFTA"
        conselho_exibicao = f"{conselho_prof} nº {registro_prof}"
        formacao_prof = dados["lev"]["formacao_profissional"] or "Responsável Técnico"
        rg_prof = dados["lev"]["rg_profissional"] or "Não Informado"
        cpf_prof = formatar_cpf(dados["lev"]["cpf_profissional"]) or "Não Informado"
        end_residencial_prof = dados["lev"]["endereco_residencial_profissional"] or "Não Informado"
        end_comercial_prof = dados["lev"]["endereco_profissional"] or "Não Informado"
        credencial_incra = dados["lev"]["codigo_credenciado"] or "Não Informado"

        municipio_cartorio = dados["mat"].get("cri_comarca") or dados["prop"]["municipio"] or "_____"

        # 1. Recuperar todas as matrículas cadastradas para a propriedade do levantamento
        prop_id = dados["prop"]["id"]
        query_mats = """
            SELECT id, numero_matricula, ccir, itr, area_ha, cri_comarca, cri_circunscricao, livro_registro, folha_registro,
                   valor_itr, denominacao, georreferenciamento
            FROM matriculas
            WHERE propriedade_id = ?
            ORDER BY numero_matricula
        """
        rows_mats = execute_query(query_mats, params=(prop_id,), fetch_all=True)
        mats = [dict(m) for m in rows_mats]

        # Se houver múltiplas matrículas, consolidamos os dados em formato de tabela
        if len(mats) > 1:
            linhas_tabela = ""
            area_total_acumulada = 0.0
            lista_mats = []
            
            for m in mats:
                area_m = m["area_ha"] or 0.0
                area_total_acumulada += area_m
                area_m_str = f"{area_m:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
                num_mat = m["numero_matricula"] or "_____"
                lista_mats.append(num_mat)
                sigef_m = m["georreferenciamento"] or "Não Certificado"
                denominacao_m = m["denominacao"] or dados["prop"]["nome_propriedade"]
                
                linhas_tabela += f"""
                <tr class="border-b border-slate-100 font-mono text-[10px] text-slate-700 hover:bg-slate-50/50 transition-colors">
                    <td class="px-3 py-2 font-bold text-slate-900">{denominacao_m}</td>
                    <td class="px-3 py-2 text-center font-semibold">{num_mat}</td>
                    <td class="px-3 py-2 text-right">{area_m_str} ha</td>
                    <td class="px-3 py-2 text-center text-[9px]">{sigef_m}</td>
                </tr>
                """
            
            area_total_str = f"{area_total_acumulada:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
            nome_lote = f"{dados['prop']['nome_propriedade']} (Glebas: {', '.join(lista_mats)})"
            
            texto_declaracao_imoveis_html = f"""
                <p>
                    <strong>DECLARA</strong> que é responsável técnico pelo Levantamento Geodésico executado 
                    com fulcro no § 5º do art. 176 da Lei 6015/73 e Lei 10.267/01, Decreto 4.449/02 e 
                    5.570/05, dos imóveis rurais localizados no município e comarca de 
                    <strong class="text-slate-900">{municipio_cartorio}</strong>, através da emissão da Anotação de Responsabilidade Técnica – ART/TRT nº 
                    <strong class="text-slate-900">{final_trt}</strong>, caracterizados e certificados individualmente conforme detalhado a seguir:
                </p>
                
                <div class="overflow-x-auto mt-3 border border-slate-200 rounded-lg shadow-sm w-full break-inside-avoid">
                    <table class="w-full text-left border-collapse">
                        <thead>
                            <tr class="bg-slate-50 border-b border-slate-200 text-slate-700 text-[10px] font-bold uppercase tracking-wider">
                                <th class="px-3 py-2">Denominação (Gleba)</th>
                                <th class="px-3 py-2 text-center">Matrícula Originária</th>
                                <th class="px-3 py-2 text-right">Área Certificada</th>
                                <th class="px-3 py-2 text-center">Certificação SIGEF (Código)</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100">
                            {linhas_tabela}
                        </tbody>
                    </table>
                </div>
                
                <p class="mt-4">
                    A área total consolidada sob responsabilidade técnica deste levantamento georreferenciado perfaz a extensão total de <strong class="text-slate-900">{area_total_str} ha</strong>.
                </p>
            """
        else:
            # Caso de matrícula única (preserva comportamento original de forma isolada)
            nome_lote = dados["mat"].get("denominacao") or dados["prop"]["nome_propriedade"]
            num_mat = dados["mat"]["numero_matricula"]
            georreferenciamento = dados["mat"].get("georreferenciamento") or "____________________"
            area_ha = dados["mat"]["area_ha"] or 0.0
            area_ha_str = f"{area_ha:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
            
            texto_declaracao_imoveis_html = f"""
                <p>
                    <strong>DECLARA</strong> que é responsável técnico pelo Levantamento Geodésico executado 
                    com fulcro no § 5º do art. 176 da Lei 6015/73 e Lei 10.267/01, Decreto 4.449/02 e 
                    5.570/05, do imóvel rural: <strong class="text-slate-900">{nome_lote}</strong>, 
                    com matrícula nº <strong class="text-slate-900">{num_mat}</strong>, localizado no município e comarca de 
                    <strong class="text-slate-900">{municipio_cartorio}</strong>, através da emissão da Anotação de Responsabilidade Técnica – ART/TRT nº 
                    <strong class="text-slate-900">{final_trt}</strong>, certificação da parcela nº 
                    <strong class="text-slate-900 font-mono">{georreferenciamento}</strong> e área certificada em <strong class="text-slate-900">{area_ha_str} ha</strong>.
                </p>
            """

        # Data por extenso
        meses = {
            1: "janeiro", 2: "fevereiro", 3: "março", 4: "abril",
            5: "maio", 6: "junho", 7: "julho", 8: "agosto",
            9: "setembro", 10: "outubro", 11: "novembro", 12: "dezembro"
        }
        agora = datetime.now()
        data_hoje_extenso = f"{agora.day} de {meses[agora.month]} de {agora.year}"

        template = carregar_template("termo_responsabilidade_sigef.html")
        
        replacements = {
            "{nome_lote}": nome_lote,
            "{nome_prof}": nome_prof or "_____",
            "{formacao_prof}": formacao_prof,
            "{conselho_exibicao}": conselho_exibicao,
            "{rg_prof}": rg_prof,
            "{cpf_prof}": cpf_prof,
            "{end_residencial_prof}": end_residencial_prof,
            "{end_comercial_prof}": end_comercial_prof,
            "{credencial_incra}": credencial_incra,
            "{texto_declaracao_imoveis_html}": texto_declaracao_imoveis_html,
            "{municipio}": dados["prop"]["municipio"] or "_____",
            "{uf}": dados["prop"]["uf"] or "PR",
            "{data_hoje_extenso}": data_hoje_extenso
        }
        
        html_content = template
        for placeholder, value in replacements.items():
            html_content = html_content.replace(placeholder, str(value))
        return html_content
        
    @staticmethod
    def gerar_manual_proprietario_html(lev_id: int, matricula_id: int) -> str:
        """Gera o HTML correspondente ao Manual do Proprietário Pós-Georreferenciamento"""
        dados = obter_dados_comuns(lev_id, matricula_id)
        
        nome_prof = dados["lev"]["nome_profissional"]
        registro_prof = dados["lev"]["registro_profissional"]
        conselho_prof = dados["lev"]["conselho_profissional"] or "CFTA"
        conselho_exibicao = f"{conselho_prof} nº {registro_prof}"
        formacao_prof = dados["lev"]["formacao_profissional"] or "Responsável Técnico"

        # Tenta buscar comarca ou município da matrícula/propriedade
        municipio_cartorio = dados["mat"].get("cri_comarca") or dados["prop"]["municipio"] or "_____"
        
        # Múltiplas glebas / matrícula única
        prop_id = dados["prop"]["id"]
        query_mats = "SELECT id, numero_matricula, denominacao FROM matriculas WHERE propriedade_id = ? ORDER BY numero_matricula"
        rows_mats = execute_query(query_mats, params=(prop_id,), fetch_all=True)
        mats = [dict(m) for m in rows_mats]
        
        if len(mats) > 1:
            lista_mats = [m["numero_matricula"] or "_____" for m in mats]
            nome_lote = f"{dados['prop']['nome_propriedade']} (Glebas: {', '.join(lista_mats)})"
        else:
            nome_lote = dados["mat"].get("denominacao") or dados["prop"]["nome_propriedade"]

        template = carregar_template("manual_proprietario.html")
        
        replacements = {
            "{nome_lote}": nome_lote,
            "{nome_prof}": nome_prof or "_____",
            "{formacao_prof}": formacao_prof,
            "{conselho_exibicao}": conselho_exibicao,
            "{municipio_cartorio}": municipio_cartorio,
            "{municipio}": dados["prop"]["municipio"] or "_____",
            "{uf}": dados["prop"]["uf"] or "PR"
        }
        
        html_content = template
        for placeholder, value in replacements.items():
            html_content = html_content.replace(placeholder, str(value))
        return html_content