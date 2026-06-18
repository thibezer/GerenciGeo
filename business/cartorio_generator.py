import os
import logging
from datetime import datetime
from database.connection import execute_query
from config import EXPORT_BASE_FOLDER

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
    # 1. Levantamento e Profissional
    query_lev = """
        SELECT l.propriedade_id, l.profissional_id, p.nome as nome_profissional, p.registro as registro_profissional, 
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

def obter_trechos_confrontacao(matricula_id: int, confrontante_id: int) -> list[list[dict]]:
    """Busca os segmentos da divisa do confrontante (unificando pelo nome) e agrupa em cadeias consecutivas/contíguas"""
    # 1. Busca o nome do confrontante com base no ID fornecido
    row_nome = execute_query(
        "SELECT nome FROM confrontantes WHERE id = ?",
        params=(confrontante_id,),
        fetch_one=True
    )
    if not row_nome:
        return []
    nome_alvo = row_nome["nome"]

    # 2. Busca todos os segmentos da matrícula cuja confrontação tenha o mesmo nome (unificado)
    query = """
        SELECT s.ponto_inicio_id, s.ponto_fim_id,
               pi.nome_vertice as ini_nome, pi.ordem_caminhamento as ini_ordem, pi.lat as ini_lat, pi.lon as ini_lon,
               pf.nome_vertice as fim_nome, pf.ordem_caminhamento as fim_ordem, pf.lat as fim_lat, pf.lon as fim_lon
        FROM segmentos s
        JOIN pontos pi ON s.ponto_inicio_id = pi.id
        JOIN pontos pf ON s.ponto_fim_id = pf.id
        JOIN confrontantes c ON s.confrontante_id = c.id
        WHERE s.matricula_id = ? AND UPPER(TRIM(c.nome)) = UPPER(TRIM(?))
    """
    rows = execute_query(query, params=(matricula_id, nome_alvo), fetch_all=True)
    if not rows:
        return []
    
    segs = [dict(r) for r in rows]
    # Ordena pelo ini_ordem. Se nulo, assume 0
    segs.sort(key=lambda s: s["ini_ordem"] if s["ini_ordem"] is not None else 0)
    
    # Encadeamento de cadeias lineares
    cadeias = []
    for s in segs:
        pt_ini = {"nome": s["ini_nome"], "ordem": s["ini_ordem"], "lat": s["ini_lat"], "lon": s["ini_lon"]}
        pt_fim = {"nome": s["fim_nome"], "ordem": s["fim_ordem"], "lat": s["fim_lat"], "lon": s["fim_lon"]}
        
        # Tenta encaixar no final de alguma cadeia existente
        encaixou = False
        for c in cadeias:
            if c[-1]["nome"] == pt_ini["nome"]:
                c.append(pt_fim)
                encaixou = True
                break
        
        if not encaixou:
            cadeias.append([pt_ini, pt_fim])
            
    # Tenta mesclar cadeias soltas que são consecutivas (ex: se a ordenação inicial não foi perfeita)
    mesclou = True
    while mesclou:
        mesclou = False
        for i in range(len(cadeias)):
            for j in range(len(cadeias)):
                if i != j:
                    if cadeias[i][-1]["nome"] == cadeias[j][0]["nome"]:
                        cadeias[i].extend(cadeias[j][1:])
                        cadeias.pop(j)
                        mesclou = True
                        break
            if mesclou:
                break
                
    return cadeias

def descrever_trechos_texto(cadeias: list[list[dict]]) -> str:
    if not cadeias:
        return "nenhum trecho de divisa confrontante identificado"
    
    trechos_desc = []
    for c in cadeias:
        p_first = c[0]["nome"]
        p_last = c[-1]["nome"]
        
        # Formata sequência dos vértices
        vertices_seq = [pt["nome"] for pt in c]
        vertices_seq_str = " ➔ ".join(vertices_seq)
        
        # Pega coordenadas do primeiro e último do trecho
        lat_first = f"{c[0]['lat']:.7f}°" if c[0]['lat'] else "Não Informada"
        lon_first = f"{c[0]['lon']:.7f}°" if c[0]['lon'] else "Não Informada"
        lat_last = f"{c[-1]['lat']:.7f}°" if c[-1]['lat'] else "Não Informada"
        lon_last = f"{c[-1]['lon']:.7f}°" if c[-1]['lon'] else "Não Informada"
        
        trechos_desc.append(
            f"limite delimitado pela sequência de vértices <strong>{vertices_seq_str}</strong>, "
            f"iniciando no vértice <strong>{p_first}</strong> (Lat: {lat_first}, Lon: {lon_first}) "
            f"e finalizando no vértice <strong>{p_last}</strong> (Lat: {lat_last}, Lon: {lon_last})"
        )
        
    if len(trechos_desc) == 1:
        return trechos_desc[0]
    else:
        desc_final = "; ".join(trechos_desc[:-1])
        desc_final += f" e {trechos_desc[-1]}"
        return desc_final

def obter_data_extenso() -> str:
    meses = {
        1: "janeiro", 2: "fevereiro", 3: "março", 4: "abril",
        5: "maio", 6: "junho", 7: "julho", 8: "agosto",
        9: "setembro", 10: "outubro", 11: "novembro", 12: "dezembro"
    }
    agora = datetime.now()
    return f"{agora.day} de {meses[agora.month]} de {agora.year}"

class CartorioReportGenerator:
    
    @staticmethod
    def gerar_requerimento_cartorio_html(lev_id: int, matricula_id: int, numero_trt: str, data_trt: str) -> str:
        dados = obter_dados_comuns(lev_id, matricula_id)
        
        # Qualificação dos proprietários
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
            if "casad" in e_civil_lower or "estável" in e_civil_lower or "estavel" in e_civil_lower:
                regime = owner.get("regime_bens") or "Não Informado"
                conj_nome = owner.get("nome_conjuge") or "Não Informado"
                conj_rg = formatar_rg(owner.get("rg_conjuge")) or "Não Informado"
                conj_cpf = formatar_cpf(owner.get("cpf_conjuge")) or "Não Informado"
                
                conj_pron_portador = "portador" if sexo in ("F", "FEMININO") else "portadora"
                conj_pron_inscrito = "inscrito" if sexo in ("F", "FEMININO") else "inscrita"
                
                casado_info = f", casado sob o regime de {regime} com {conj_nome}, {conj_pron_portador} do RG nº {conj_rg} e {conj_pron_inscrito} no CPF nº {conj_cpf}"
            else:
                casado_info = f", {est_civil.lower()}"
                
            qualif = f'<strong class="text-slate-900">{owner["nome_completo"]}</strong>, {nac}, {prof}{casado_info}, residente e domiciliado em {domicilio}, {pron_inscrito} no CPF nº {cpf} e {pron_portador} do RG nº {rg}'
            qualificacoes.append(qualif)
            
        qualificacao_completa = ";<br>".join(qualificacoes)
        
        comarca = str(dados["mat"].get("cri_comarca") or dados["prop"]["municipio"]).upper()
        nome_lote = dados["mat"].get("denominacao") or dados["prop"]["nome_propriedade"]
        ccir = dados["mat"].get("ccir") or dados["prop"]["codigo_ccir"] or "Não Informado"
        itr = dados["mat"].get("itr") or "Não Informado"
        
        valor_venal = dados["mat"].get("valor_itr")
        if valor_venal:
            valor_venal_str = f"R$ {valor_venal:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
        else:
            valor_venal_str = "R$ ____________________"
            
        georref_sigef = dados["mat"].get("georreferenciamento") or "____________________"
        
        data_trt_f = ""
        if data_trt:
            try:
                dt = datetime.strptime(data_trt, "%Y-%m-%d")
                data_trt_f = dt.strftime("%d/%m/%Y")
            except:
                data_trt_f = data_trt
                
        # Assinaturas
        bloco_assinaturas = '<div class="mt-16 flex flex-row flex-wrap justify-around gap-x-8 gap-y-12 w-full break-inside-avoid">'
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

        data_extenso = obter_data_extenso()

        html_content = f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Requerimento ao Registro de Imóveis - {nome_lote}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        body {{ font-family: 'Inter', sans-serif; }}
        @media print {{
            @page {{ size: A4; margin: 2cm 2cm; }}
            .no-print {{ display: none !important; }}
            body {{ background-color: white !important; padding: 0 !important; }}
            .page {{ box-shadow: none !important; border: none !important; margin: 0 !important; padding: 0 !important; max-width: 100% !important; }}
        }}
    </style>
</head>
<body class="bg-slate-100 text-slate-800 min-h-screen p-4 md:p-8 flex flex-col items-center select-text">
    <!-- Controle Superior -->
    <div class="no-print w-full max-w-[21cm] bg-[#0c1510] text-white py-4 px-6 mb-6 flex justify-between items-center rounded-xl border border-white/10 shadow-lg">
        <div class="flex items-center gap-3">
            <div class="w-8 h-8 bg-[#00f5a0]/10 border border-[#00f5a0]/30 rounded-lg flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" class="text-[#00f5a0] w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            </div>
            <div>
                <h4 class="text-sm font-bold text-white uppercase tracking-wider">Requerimento de Averbação / Retificação</h4>
                <p class="text-[10px] text-white/40 mt-0.5">Destinado ao Cartório de Registro de Imóveis (CRI)</p>
            </div>
        </div>
        <button onclick="window.print()" class="px-5 py-2 bg-[#00f5a0] hover:bg-[#00d48a] text-[#0c1510] font-bold rounded-lg shadow-md transition-all text-xs uppercase tracking-wider cursor-pointer">
            Imprimir Documento
        </button>
    </div>

    <!-- Página A4 -->
    <div class="page bg-white text-slate-800 p-16 max-w-[21cm] min-h-[29.7cm] w-full shadow-2xl border border-slate-200 rounded-xl flex flex-col justify-between print:rounded-none print:border-none print:shadow-none">
        <div>
            <!-- Cabeçalho Completa -->
            <div class="flex flex-col items-center pb-2 mb-8 text-center border-b border-slate-100">
                <div class="text-2xl font-extrabold text-[#0c1510] tracking-wider uppercase mb-0.5">COMPLETA</div>
                <div class="text-[9px] font-semibold text-slate-500 uppercase tracking-widest">Agrimensura e Projetos Agropecuários</div>
            </div>

            <!-- Endereçamento -->
            <p class="text-xs font-bold uppercase text-slate-900 mb-8 tracking-wide">
                ILUSTRÍSSIMO SENHOR OFICIAL DO SERVIÇO DE REGISTRO DE IMÓVEIS DA COMARCA DE {comarca} - ESTADO DO PARANÁ.
            </p>

            <!-- Corpo -->
            <div class="space-y-4 text-xs text-justify leading-relaxed text-slate-700">
                <p>{qualificacao_completa}, na qualidade de legítimos proprietários, vêm respeitosamente requerer a Vossa Senhoria, com fulcro no art. 213, inciso II da Lei nº 6.015/1973 e na Lei nº 10.267/2001, a <strong>AVERBAÇÃO DO GEORREFERENCIAMENTO E RETIFICAÇÃO CONSENSUAL DE ÁREA</strong> do imóvel rural de sua propriedade denominado <strong>{nome_lote}</strong>, com área de <strong>{dados["mat"]["area_ha"]:.4f} ha</strong>, objeto da Matrícula nº <strong>{dados["mat"]["numero_matricula"]}</strong> deste Registro de Imóveis, inscrito no CCIR/INCRA sob o nº <strong>{ccir}</strong> e cadastrado no ITR/Receita Federal sob o nº <strong>{itr}</strong>.</p>
                
                <p>O presente requerimento fundamenta-se nos trabalhos técnicos de georreferenciamento devidamente homologados pelo INCRA, sob o código de certificação SIGEF nº <strong class="font-mono text-slate-900">{georref_sigef}</strong>, cujo memorial descritivo, planta e anuências seguem anexados, atestando a exatidão das divisas, sem qualquer sobreposição a terras públicas ou privadas.</p>
                
                <p>Os serviços de agrimensura foram executados pelo Responsável Técnico <strong>{dados["lev"]["nome_profissional"]}</strong>, inscrito no {dados["lev"]["conselho_profissional"] or "conselho profissional"} sob o registro nº <strong>{dados["lev"]["registro_profissional"]}</strong>, sob TRT/ART nº <strong>{numero_trt}</strong>, recolhida/quitada na data de <strong>{data_trt_f}</strong>.</p>
                
                <p>Atribui-se a esta retificação, para efeitos fiscais e emolumentares, o valor venal de <strong>{valor_venal_str}</strong> com base na declaração de ITR.</p>
                
                <p>Nesses termos, pede e espera deferimento.</p>
                
                <p class="text-left pt-6 font-medium">{dados["prop"]["municipio"]}-{dados["prop"]["uf"]}, {data_extenso}.</p>
            </div>
        </div>

        <!-- Assinaturas -->
        {bloco_assinaturas}
    </div>
</body>
</html>
"""
        return html_content

    @staticmethod
    def gerar_declaracao_responsabilidade_html(lev_id: int, matricula_id: int) -> str:
        dados = obter_dados_comuns(lev_id, matricula_id)
        nome_lote = dados["mat"].get("denominacao") or dados["prop"]["nome_propriedade"]
        comarca = str(dados["mat"].get("cri_comarca") or dados["prop"]["municipio"]).upper()
        
        # Qualificação dos proprietários
        qualificacoes = []
        for owner in dados["owners"]:
            sexo = str(owner.get("sexo") or "M").strip().upper()
            pron_inscrito = "inscrita" if sexo in ("F", "FEMININO") else "inscrito"
            pron_portador = "portadora" if sexo in ("F", "FEMININO") else "portador"
            qualif = f'<strong class="text-slate-900">{owner["nome_completo"]}</strong>, {pron_inscrito} no CPF nº {formatar_cpf(owner["cpf_cnpj"])} e {pron_portador} do RG nº {formatar_rg(owner["rg_ie"])}'
            qualificacoes.append(qualif)
            
        qualificacao_completa = " e ".join(qualificacoes)
        data_extenso = obter_data_extenso()

        # Assinaturas
        bloco_assinaturas = '<div class="mt-20 flex flex-row flex-wrap justify-around gap-x-8 gap-y-12 w-full break-inside-avoid">'
        for owner in dados["owners"]:
            bloco_assinaturas += f"""
            <div class="flex flex-col items-center min-w-[250px] flex-1 max-w-[300px]">
                <div class="w-full border-t border-slate-400 mt-6 mb-2"></div>
                <div class="text-xs font-bold text-slate-900 text-center uppercase tracking-wide">{owner["nome_completo"]}</div>
                <div class="text-[10px] text-slate-500 text-center font-medium mt-0.5">Declarante Proprietário</div>
            </div>
            """
        bloco_assinaturas += "</div>"

        html_content = f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Declaração de Responsabilidade de Limites - {nome_lote}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        body {{ font-family: 'Inter', sans-serif; }}
        @media print {{
            @page {{ size: A4; margin: 2cm 2cm; }}
            .no-print {{ display: none !important; }}
            body {{ background-color: white !important; padding: 0 !important; }}
            .page {{ box-shadow: none !important; border: none !important; margin: 0 !important; padding: 0 !important; max-width: 100% !important; }}
        }}
    </style>
</head>
<body class="bg-slate-100 text-slate-800 min-h-screen p-4 md:p-8 flex flex-col items-center select-text">
    <!-- Controle Superior -->
    <div class="no-print w-full max-w-[21cm] bg-[#0c1510] text-white py-4 px-6 mb-6 flex justify-between items-center rounded-xl border border-white/10 shadow-lg">
        <div class="flex items-center gap-3">
            <div class="w-8 h-8 bg-[#00f5a0]/10 border border-[#00f5a0]/30 rounded-lg flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" class="text-[#00f5a0] w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            </div>
            <div>
                <h4 class="text-sm font-bold text-white uppercase tracking-wider">Declaração de Responsabilidade</h4>
                <p class="text-[10px] text-white/40 mt-0.5">Atestado de limites e respeito às posses vizinhas</p>
            </div>
        </div>
        <button onclick="window.print()" class="px-5 py-2 bg-[#00f5a0] hover:bg-[#00d48a] text-[#0c1510] font-bold rounded-lg shadow-md transition-all text-xs uppercase tracking-wider cursor-pointer">
            Imprimir Documento
        </button>
    </div>

    <!-- Página A4 -->
    <div class="page bg-white text-slate-800 p-16 max-w-[21cm] min-h-[29.7cm] w-full shadow-2xl border border-slate-200 rounded-xl flex flex-col justify-between print:rounded-none print:border-none print:shadow-none">
        <div>
            <!-- Cabeçalho Completa -->
            <div class="flex flex-col items-center pb-2 mb-12 text-center border-b border-slate-100">
                <div class="text-2xl font-extrabold text-[#0c1510] tracking-wider uppercase mb-0.5">COMPLETA</div>
                <div class="text-[9px] font-semibold text-slate-500 uppercase tracking-widest">Agrimensura e Projetos Agropecuários</div>
            </div>

            <!-- Título do Documento -->
            <div class="text-center mb-8">
                <h2 class="text-sm font-bold text-[#0c1510] tracking-wide uppercase">DECLARAÇÃO DE RESPONSABILIDADE DE LIMITES E POSSE</h2>
            </div>

            <!-- Corpo -->
            <div class="space-y-6 text-xs text-justify leading-relaxed text-slate-700">
                <p>Os abaixo assinados, {qualificacao_completa}, na qualidade de legítimos proprietários do imóvel rural denominado <strong>{nome_lote}</strong>, com área de <strong>{dados["mat"]["area_ha"]:.4f} ha</strong>, localizado no município de {dados["prop"]["municipio"]}/PR, objeto da Matrícula nº <strong>{dados["mat"]["numero_matricula"]}</strong> do Registro de Imóveis da Comarca de {comarca}, declaram sob as penas da lei, em especial as sanções previstas no art. 299 do Código Penal Brasileiro, que:</p>
                
                <div class="pl-4 space-y-3 font-medium text-slate-600">
                    <div class="flex items-start gap-2">
                        <span class="font-bold text-slate-800 leading-none">I -</span>
                        <span>As divisas do imóvel rural descritas no levantamento topográfico e memorial técnico foram rigorosamente respeitadas e demarcadas em campo de acordo com os marcos históricos de posse mansa e pacífica;</span>
                    </div>
                    <div class="flex items-start gap-2">
                        <span class="font-bold text-slate-800 leading-none">II -</span>
                        <span>Não há litígios, disputas judiciais ou extrajudiciais pendentes com nenhum dos vizinhos confrontantes a respeito das linhas divisórias demarcadas;</span>
                    </div>
                    <div class="flex items-start gap-2">
                        <span class="font-bold text-slate-800 leading-none">III -</span>
                        <span>O levantamento técnico não avança sobre áreas de domínio público (estradas federais, estaduais ou municipais) ou faixas de servidão de utilidade pública;</span>
                    </div>
                    <div class="flex items-start gap-2">
                        <span class="font-bold text-slate-800 leading-none">IV -</span>
                        <span>Isentam o profissional credenciado executor dos trabalhos técnicos de qualquer responsabilidade civil ou criminal decorrente de futuras contestações sobre a titularidade ou localização física das divisas históricas acordadas.</span>
                    </div>
                </div>

                <p>Por ser a expressão pura da verdade, firmam a presente em duas vias de igual teor.</p>
                
                <p class="text-left pt-8 font-medium">{dados["prop"]["municipio"]}-{dados["prop"]["uf"]}, {data_extenso}.</p>
            </div>
        </div>

        <!-- Assinaturas -->
        {bloco_assinaturas}
    </div>
</body>
</html>
"""
        return html_content

    @staticmethod
    def gerar_laudo_tecnico_html(lev_id: int, matricula_id: int, numero_trt: str, data_trt: str, equipamento: str) -> str:
        dados = obter_dados_comuns(lev_id, matricula_id)
        nome_lote = dados["mat"].get("denominacao") or dados["prop"]["nome_propriedade"]
        comarca = str(dados["mat"].get("cri_comarca") or dados["prop"]["municipio"]).upper()
        
        # Proprietários
        proprietarios_list = [o["nome_completo"] for o in dados["owners"]]
        proprietarios_str = " e ".join(proprietarios_list)
        
        # Metadados do Profissional
        prof = dados["lev"]
        nome_prof = prof["nome_profissional"]
        registro_prof = prof["registro_profissional"]
        conselho_prof = prof["conselho_profissional"] or "CFTA"
        conselho_exibicao = f"{conselho_prof} nº {registro_prof}"
        endereco_prof = prof["endereco_profissional"] or "Não Informado"
        credencial_incra = prof["codigo_credenciado"] or "Não Informado"
        
        # TRT data
        data_trt_f = ""
        if data_trt:
            try:
                dt = datetime.strptime(data_trt, "%Y-%m-%d")
                data_trt_f = dt.strftime("%d/%m/%Y")
            except:
                data_trt_f = data_trt

        # Equipamento padrão se não informado
        equipamento_f = equipamento if (equipamento and equipamento.strip()) else "Receptor GNSS Hi-Target V30 / RTK de Dupla Frequência (L1/L2)"

        # Coletar pontos homologados associados ao levantamento e matrícula específica
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

        html_content = f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Laudo Técnico e Memorial Justificativo - {nome_lote}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        body {{ font-family: 'Inter', sans-serif; }}
        @media print {{
            @page {{ size: A4; margin: 2cm 2cm; }}
            .no-print {{ display: none !important; }}
            body {{ background-color: white !important; padding: 0 !important; }}
            .page {{ box-shadow: none !important; border: none !important; margin: 0 !important; padding: 0 !important; max-width: 100% !important; }}
        }}
    </style>
</head>
<body class="bg-slate-100 text-slate-800 min-h-screen p-4 md:p-8 flex flex-col items-center select-text">
    <!-- Controle Superior -->
    <div class="no-print w-full max-w-[21cm] bg-[#0c1510] text-white py-4 px-6 mb-6 flex justify-between items-center rounded-xl border border-white/10 shadow-lg">
        <div class="flex items-center gap-3">
            <div class="w-8 h-8 bg-[#00f5a0]/10 border border-[#00f5a0]/30 rounded-lg flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" class="text-[#00f5a0] w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            </div>
            <div>
                <h4 class="text-sm font-bold text-white uppercase tracking-wider">Laudo Técnico de Agrimensura</h4>
                <p class="text-[10px] text-white/40 mt-0.5">Memorial Técnico e Metodologia de Campo</p>
            </div>
        </div>
        <button onclick="window.print()" class="px-5 py-2 bg-[#00f5a0] hover:bg-[#00d48a] text-[#0c1510] font-bold rounded-lg shadow-md transition-all text-xs uppercase tracking-wider cursor-pointer">
            Imprimir Documento
        </button>
    </div>

    <!-- Página A4 -->
    <div class="page bg-white text-slate-800 p-16 max-w-[21cm] min-h-[29.7cm] w-full shadow-2xl border border-slate-200 rounded-xl flex flex-col justify-between print:rounded-none print:border-none print:shadow-none">
        <div>
            <!-- Cabeçalho Completa -->
            <div class="flex flex-col items-center pb-2 mb-8 text-center border-b border-slate-100">
                <div class="text-2xl font-extrabold text-[#0c1510] tracking-wider uppercase mb-0.5">COMPLETA</div>
                <div class="text-[9px] font-semibold text-slate-500 uppercase tracking-widest">Agrimensura e Projetos Agropecuários</div>
            </div>

            <!-- Título -->
            <div class="text-center mb-6">
                <h2 class="text-sm font-bold text-slate-900 uppercase tracking-wide">LAUDO TÉCNICO E MEMORIAL JUSTIFICATIVO</h2>
            </div>

            <!-- Corpo -->
            <div class="space-y-4 text-xs text-justify leading-relaxed text-slate-700">
                <p>O presente Laudo Técnico tem por objetivo descrever e justificar as operações de campo e escritório realizadas para o Georreferenciamento e Retificação Territorial do imóvel rural <strong>{nome_lote}</strong>, com área total medida de <strong>{dados["mat"]["area_ha"]:.4f} ha</strong>, pertencente a <strong>{proprietarios_str}</strong>, localizado no município de {dados["prop"]["municipio"]}/PR, sob a Matrícula nº <strong>{dados["mat"]["numero_matricula"]}</strong>.</p>
                
                <div>
                    <h3 class="font-bold text-slate-900 mb-1">1. Metodologia de Posicionamento e Coleta de Dados</h3>
                    <p>Para a coleta de coordenadas dos vértices limites do perímetro do imóvel, utilizou-se o método de posicionamento por satélite GNSS com o equipamento <strong>{equipamento_f}</strong>. O posicionamento baseou-se em marcos homologados e triangulados, com posterior processamento científico através da submissão à API de pós-processamento geodésico do IBGE (IBGE-PPP). Os vértices do tipo Rover foram determinados de forma estática e RTK, respeitando a precisão centimétrica metrológica M-Sigma em todas as leituras de sigmas horizontais e verticais.</p>
                </div>
                
                <div>
                    <h3 class="font-bold text-slate-900 mb-1">2. Padrões Cartográficos e Datum de Referência</h3>
                    <p>O processamento topográfico final e a planta do imóvel rural foram gerados de forma rigorosa no Sistema Geodésico de Referência <strong>SIRGAS 2000</strong>, projetado em coordenadas planas **UTM Zona 22S (EPSG:31982)** com Meridiano Central 51° W e Elipsoide de Referência GRS80.</p>
                </div>

                <div>
                    <h3 class="font-bold text-slate-900 mb-1">3. Vértices Homologados Cadastrados ({total_pontos} pontos)</h3>
                    <div class="max-h-[300px] overflow-y-auto border border-slate-200 rounded-lg my-2 scrollbar-thin">
                        <table class="w-full text-left border-collapse">
                            <thead>
                                <tr class="bg-slate-50 text-[9px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                                    <th class="px-2 py-1.5">Vértice</th>
                                    <th class="px-2 py-1.5 text-center">Tipo</th>
                                    <th class="px-2 py-1.5 text-right">Este (X)</th>
                                    <th class="px-2 py-1.5 text-right">Norte (Y)</th>
                                    <th class="px-2 py-1.5 text-right">Altitude (Z)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {tabela_pontos_html}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div>
                    <h3 class="font-bold text-slate-900 mb-1">4. Parecer e Conclusão Técnico-Legal</h3>
                    <p>ATESTO, na qualidade de responsável técnico credenciado no INCRA sob o código <strong>{credencial_incra}</strong>, sob o amparo da TRT/ART nº <strong>{numero_trt}</strong> quitada em <strong>{data_trt_f}</strong>, que os limites descritos representam com exatidão física a realidade de posse de fato consolidada em campo. Não há indícios ou detecção de sobreposição de coordenadas com áreas vizinhas certificadas no SIGEF.</p>
                </div>

                <p class="text-left pt-6 font-medium">{dados["prop"]["municipio"]}-{dados["prop"]["uf"]}, {data_extenso}.</p>
            </div>
        </div>

        <!-- Assinatura Técnico -->
        <div class="mt-12 flex flex-col items-center self-center break-inside-avoid">
            <div class="w-[280px] border-t border-slate-400 mt-6 mb-2"></div>
            <div class="text-xs font-bold text-slate-900 text-center uppercase tracking-wide">{nome_prof}</div>
            <div class="text-[10px] text-slate-500 text-center font-medium mt-0.5">{conselho_exibicao}</div>
            <div class="text-[9px] text-slate-400 text-center font-mono mt-0.5">Credencial INCRA: {credencial_incra}</div>
            <div class="text-[9px] text-slate-400 text-center italic mt-0.5">{endereco_prof}</div>
        </div>
    </div>
</body>
</html>
"""
        return html_content

    @staticmethod
    def gerar_declaracao_anuencia_html(lev_id: int, matricula_id: int, confrontante_id: int) -> str:
        dados = obter_dados_comuns(lev_id, matricula_id)
        nome_lote = dados["mat"].get("denominacao") or dados["prop"]["nome_propriedade"]
        comarca = str(dados["mat"].get("cri_comarca") or dados["prop"]["municipio"]).upper()
        
        # Proprietários do imóvel requerente
        proprietarios_list = [o["nome_completo"] for o in dados["owners"]]
        proprietarios_str = " e ".join(proprietarios_list)
        
        # Metadados do Confrontante
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
            
        # Qualificação do Confrontante
        c_nome = obter_valor_ou_linha(conf["nome"], 35)
        c_cpf = obter_valor_ou_linha(formatar_cpf(conf["cpf_cnpj"]), 18)
        c_rg = obter_valor_ou_linha(formatar_rg(conf["rg"]), 15)
        c_nac = obter_valor_ou_linha(conf.get("nacionalidade"), 18)
        c_prof = obter_valor_ou_linha(conf.get("profissao"), 20)
        c_est_civil = obter_valor_ou_linha(conf.get("estado_civil"), 15)
        c_domicilio = obter_valor_ou_linha(conf.get("endereco_completo"), 50)
        c_matricula = obter_valor_ou_linha(conf.get("matricula_imovel"), 24)
        
        e_civil = str(conf.get("estado_civil") or "").strip().lower()
        is_casado = "casad" in e_civil or "estável" in e_civil or "estavel" in e_civil
        
        if is_casado:
            reg = obter_valor_ou_linha(conf.get("regime_bens"), 20)
            conj_n = obter_valor_ou_linha(conf.get("nome_conjuge"), 35)
            conj_rg = obter_valor_ou_linha(formatar_rg(conf.get("rg_conjuge")), 15)
            conj_cpf = obter_valor_ou_linha(formatar_cpf(conf.get("cpf_conjuge")), 18)
            
            casado_info = f", casado sob o regime de {reg} com {conj_n}, portador do RG nº {conj_rg} e CPF nº {conj_cpf}"
        else:
            casado_info = f", {c_est_civil.lower() if '_' not in c_est_civil else c_est_civil}"
            
        qualificacao_confrontante = f'<strong class="text-slate-900">{c_nome}</strong>, {c_nac}, {c_prof}{casado_info}, residente e domiciliado em {c_domicilio}, inscrito no CPF nº {c_cpf} e portador do RG nº {c_rg}'

        # Obter os trechos de confrontação unificados
        cadeias = obter_trechos_confrontacao(matricula_id, confrontante_id)
        divisa_descricao_texto = descrever_trechos_texto(cadeias)

        # Assinaturas do Confrontante e Cônjuge (se casado)
        bloco_assinaturas = '<div class="mt-20 flex flex-row flex-wrap justify-around gap-x-8 gap-y-12 w-full break-inside-avoid">'
        bloco_assinaturas += f"""
        <div class="flex flex-col items-center min-w-[250px] flex-1 max-w-[300px]">
            <div class="w-full border-t border-slate-400 mt-6 mb-2"></div>
            <div class="text-xs font-bold text-slate-900 text-center uppercase tracking-wide">{c_nome}</div>
            <div class="text-[10px] text-slate-500 text-center font-medium mt-0.5">Confrontante Anuente</div>
            <div class="text-[9px] text-slate-400 text-center italic mt-1">(Reconhecer firma)</div>
        </div>
        """
        if is_casado:
            conj_n = conf.get("nome_conjuge") or "Cônjuge do Confrontante"
            bloco_assinaturas += f"""
            <div class="flex flex-col items-center min-w-[250px] flex-1 max-w-[300px]">
                <div class="w-full border-t border-slate-400 mt-6 mb-2"></div>
                <div class="text-xs font-bold text-slate-900 text-center uppercase tracking-wide">{conj_n}</div>
                <div class="text-[10px] text-slate-500 text-center font-medium mt-0.5">Cônjuge do Confrontante Anuente</div>
                <div class="text-[9px] text-slate-400 text-center italic mt-1">(Reconhecer firma)</div>
            </div>
            """
        bloco_assinaturas += "</div>"

        data_extenso = obter_data_extenso()

        html_content = f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Declaração de Anuência do Confrontante - {c_nome}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        body {{ font-family: 'Inter', sans-serif; }}
        @media print {{
            @page {{ size: A4; margin: 2cm 2cm; }}
            .no-print {{ display: none !important; }}
            body {{ background-color: white !important; padding: 0 !important; }}
            .page {{ box-shadow: none !important; border: none !important; margin: 0 !important; padding: 0 !important; max-width: 100% !important; }}
        }}
    </style>
</head>
<body class="bg-slate-100 text-slate-800 min-h-screen p-4 md:p-8 flex flex-col items-center select-text">
    <!-- Controle Superior -->
    <div class="no-print w-full max-w-[21cm] bg-[#0c1510] text-white py-4 px-6 mb-6 flex justify-between items-center rounded-xl border border-white/10 shadow-lg">
        <div class="flex items-center gap-3">
            <div class="w-8 h-8 bg-[#00f5a0]/10 border border-[#00f5a0]/30 rounded-lg flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" class="text-[#00f5a0] w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            </div>
            <div>
                <h4 class="text-sm font-bold text-white uppercase tracking-wider">Declaração de Anuência do Confrontante</h4>
                <p class="text-[10px] text-white/40 mt-0.5">Termo Consolidado de Respeito de Divisas</p>
            </div>
        </div>
        <button onclick="window.print()" class="px-5 py-2 bg-[#00f5a0] hover:bg-[#00d48a] text-[#0c1510] font-bold rounded-lg shadow-md transition-all text-xs uppercase tracking-wider cursor-pointer">
            Imprimir Documento
        </button>
    </div>

    <!-- Página A4 -->
    <div class="page bg-white text-slate-800 p-16 max-w-[21cm] min-h-[29.7cm] w-full shadow-2xl border border-slate-200 rounded-xl flex flex-col justify-between print:rounded-none print:border-none print:shadow-none">
        <div>
            <!-- Cabeçalho Completa -->
            <div class="flex flex-col items-center pb-2 mb-12 text-center border-b border-slate-100">
                <div class="text-2xl font-extrabold text-[#0c1510] tracking-wider uppercase mb-0.5">COMPLETA</div>
                <div class="text-[9px] font-semibold text-slate-500 uppercase tracking-widest">Agrimensura e Projetos Agropecuários</div>
            </div>

            <!-- Título do Documento -->
            <div class="text-center mb-8">
                <h2 class="text-sm font-bold text-slate-900 uppercase tracking-wide">DECLARAÇÃO DE ANUÊNCIA E RESPEITO DE LIMITES</h2>
            </div>

            <!-- Corpo -->
            <div class="space-y-6 text-xs text-justify leading-relaxed text-slate-700">
                <p>{qualificacao_confrontante}, na qualidade de proprietário e/ou possuidor legítimo da área confrontante registrada sob a Matrícula nº <strong>{c_matricula}</strong>, declara expressamente a quem possa interessar, sob as penas da lei, que concorda integralmente com as linhas de limites e demarcações territoriais executadas para o Georreferenciamento do imóvel rural vizinho denominado <strong>{nome_lote}</strong>, de propriedade de <strong>{proprietarios_str}</strong>, sob a Matrícula nº <strong>{dados["mat"]["numero_matricula"]}</strong> deste Registro de Imóveis da Comarca de {comarca}.</p>
                
                <p>O declarante atesta que a linha de divisa comum entre as propriedades corresponde rigorosamente ao <strong>{divisa_descricao_texto}</strong>.</p>
                
                <p>Declara, outrossim, que a referida linha divisória respeita os limites históricos consolidados de posse e que não houve nenhuma invasão, turbação ou alteração física de marcos e cercas comuns durante a execução técnica dos trabalhos geodésicos em campo.</p>
                
                <p>Por ser verdade, firma a presente declaração para que produza seus devidos efeitos legais junto ao Oficial do Registro de Imóveis competente.</p>
                
                <p class="text-left pt-6 font-medium">{dados["prop"]["municipio"]}-{dados["prop"]["uf"]}, {data_extenso}.</p>
            </div>
        </div>

        <!-- Assinaturas -->
        {bloco_assinaturas}
    </div>
</body>
</html>
"""
        return html_content
