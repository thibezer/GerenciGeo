import os
import logging
from datetime import datetime
from pyproj import Transformer
from config import EXPORT_BASE_FOLDER
from services.documentacao.cartorio.utils import carregar_template, obter_data_extenso, formatar_cpf, formatar_rg
from services.documentacao.cartorio.data_fetcher import obter_dados_comuns
from database.connection import execute_query

logger = logging.getLogger(__name__)

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
        SELECT m.id, m.numero_matricula, pr.codigo_ccir as ccir, m.itr, m.area_ha, m.cri_comarca, m.cri_circunscricao, m.livro_registro, m.folha_registro,
               m.valor_itr, m.denominacao, m.georreferenciamento
        FROM matriculas m
        JOIN propriedades pr ON m.propriedade_id = pr.id
        WHERE m.propriedade_id = ?
        ORDER BY m.numero_matricula
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
        SELECT m.id, m.numero_matricula, pr.codigo_ccir as ccir, m.itr, m.area_ha, m.cri_comarca, m.cri_circunscricao, m.livro_registro, m.folha_registro,
               m.valor_itr, m.denominacao, m.georreferenciamento
        FROM matriculas m
        JOIN propriedades pr ON m.propriedade_id = pr.id
        WHERE m.propriedade_id = ?
        ORDER BY m.numero_matricula
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
        SELECT m.id, m.numero_matricula, pr.codigo_ccir as ccir, m.itr, m.area_ha, m.cri_comarca, m.cri_circunscricao, m.livro_registro, m.folha_registro,
               m.valor_itr, m.denominacao, m.georreferenciamento
        FROM matriculas m
        JOIN propriedades pr ON m.propriedade_id = pr.id
        WHERE m.propriedade_id = ?
        ORDER BY m.numero_matricula
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
        SELECT m.id, m.numero_matricula, pr.codigo_ccir as ccir, m.itr, m.area_ha, m.cri_comarca, m.cri_circunscricao, m.livro_registro, m.folha_registro,
               m.valor_itr, m.denominacao, m.georreferenciamento
        FROM matriculas m
        JOIN propriedades pr ON m.propriedade_id = pr.id
        WHERE m.propriedade_id = ?
        ORDER BY m.numero_matricula
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

