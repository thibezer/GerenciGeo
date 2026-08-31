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

def extenso_parcelas(n: int) -> str:
    extensos = {
        2: "2 (duas)",
        3: "3 (três)",
        4: "4 (quatro)",
        5: "5 (cinco)",
        6: "6 (seis)",
        7: "7 (sete)",
        8: "8 (oito)",
        9: "9 (nove)",
        10: "10 (dez)"
    }
    try:
        val = int(n)
        return extensos.get(val, f"{val} ({val})")
    except Exception:
        return "3 (três)"

def gerar_declaracao_anuencia_desmembramento_html(lev_id: int, matricula_id: int, codigo_cns: str = None, qtd_parcelas: int = 3) -> str:
    dados = obter_dados_comuns(lev_id, matricula_id)
    
    qualificacoes = []
    for owner in dados["owners"]:
        sexo = str(owner.get("sexo") or "M").strip().upper()
        pron_inscrito = "inscrita" if sexo in ("F", "FEMININO") else "inscrito"
        pron_portador = "portadora" if sexo in ("F", "FEMININO") else "portador"
        pron_residente = "residente e domiciliada" if sexo in ("F", "FEMININO") else "residente e domiciliado"
        pron_detentor = "detentora" if sexo in ("F", "FEMININO") else "detentor"
        
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
            
        qualif = f'<strong class="text-slate-900">{owner["nome_completo"]}</strong>, {nac}, {prof}{casado_info}, {pron_portador} do RG nº <strong class="text-slate-900">{rg}</strong> e {pron_inscrito} no CPF sob o nº <strong class="text-slate-900">{cpf}</strong>, {pron_residente} na <strong class="text-slate-900">{domicilio}</strong>'
        qualificacoes.append(qualif)

    if len(qualificacoes) > 1:
        pronome_inicial = "Nós"
        qualificacao_completa = "; e<br>".join(qualificacoes)
        pronome_detentor = "detentores"
    else:
        pronome_inicial = "Eu"
        qualificacao_completa = qualificacoes[0] if qualificacoes else "Não Informado"
        sexo_owner = str(dados["owners"][0].get("sexo") or "M").strip().upper() if dados["owners"] else "M"
        pronome_detentor = "detentora" if sexo_owner in ("F", "FEMININO") else "detentor"

    nome_area = dados["mat"].get("denominacao") or dados["prop"]["nome_propriedade"]
    codigo_incra = dados["prop"].get("codigo_ccir") or dados["mat"].get("ccir") or "____________________"
    num_mat = dados["mat"]["numero_matricula"] or "_____"
    municipio_cartorio = str(dados["mat"].get("cri_comarca") or dados["prop"]["municipio"]).upper()
    uf_cartorio = str(dados["prop"]["uf"]).upper()
    cns_str = f" (CNS: {codigo_cns.strip()})" if (codigo_cns and str(codigo_cns).strip()) else ""

    texto_qualificacao_html = f'{pronome_inicial}, {qualificacao_completa}, {pronome_detentor}(a) do imóvel rural denominado <strong class="text-slate-900">{nome_area}</strong>, Código SNCR/INCRA nº <strong class="text-slate-900">{codigo_incra}</strong>, registrado sob a Matrícula nº <strong class="text-slate-900">{num_mat}</strong> no Cartório de Registro de Imóveis de <strong class="text-slate-900">{municipio_cartorio}/{uf_cartorio}</strong>{cns_str},'

    registro_prof = dados["lev"]["registro_profissional"] or "_____"
    conselho_prof = dados["lev"]["conselho_profissional"] or "CREA/CFTA"
    conselho_exibicao = f"{conselho_prof} sob o nº {registro_prof}"
    codigo_credenciado = dados["lev"]["codigo_credenciado"] or "_____"
    codigo_sigef_original = dados["mat"].get("georreferenciamento") or "____________________________________"

    qtd_parcelas_extenso = extenso_parcelas(qtd_parcelas)

    data_extenso = obter_data_extenso()

    bloco_assinaturas = '<div class="mt-6 flex flex-row flex-wrap justify-around gap-x-8 gap-y-12 w-full">'
    for owner in dados["owners"]:
        cpf_f = formatar_cpf(owner["cpf_cnpj"])
        bloco_assinaturas += f"""
        <div class="flex flex-col items-center min-w-[250px] flex-1 max-w-[300px]">
            <div class="w-full border-t border-slate-400 mt-6 mb-2"></div>
            <div class="text-xs font-bold text-slate-900 text-center uppercase tracking-wide">{owner["nome_completo"]}</div>
            <div class="text-[10px] text-slate-600 text-center font-medium mt-0.5 font-mono">CPF: {cpf_f}</div>
        </div>
        """
        e_civil = str(owner.get("estado_civil", "")).strip().lower()
        if "casad" in e_civil or "estável" in e_civil or "estavel" in e_civil:
            conj_nome = owner.get("nome_conjuge") or "Cônjuge"
            conj_cpf_f = formatar_cpf(owner.get("cpf_conjuge")) or "_____"
            bloco_assinaturas += f"""
            <div class="flex flex-col items-center min-w-[250px] flex-1 max-w-[300px]">
                <div class="w-full border-t border-slate-400 mt-6 mb-2"></div>
                <div class="text-xs font-bold text-slate-900 text-center uppercase tracking-wide">{conj_nome}</div>
                <div class="text-[10px] text-slate-600 text-center font-medium mt-0.5 font-mono">CPF: {conj_cpf_f}</div>
            </div>
            """
    bloco_assinaturas += "</div>"

    template = carregar_template("declaracao_anuencia_desmembramento.html")
    replacements = {
        "{nome_lote}": nome_area,
        "{texto_qualificacao_html}": texto_qualificacao_html,
        "{nome_profissional}": dados["lev"]["nome_profissional"] or "_____",
        "{codigo_credenciado}": codigo_credenciado,
        "{conselho_exibicao}": conselho_exibicao,
        "{codigo_sigef_original}": codigo_sigef_original,
        "{qtd_parcelas_extenso}": qtd_parcelas_extenso,
        "{municipio}": dados["prop"]["municipio"] or "_____",
        "{uf}": dados["prop"]["uf"] or "PR",
        "{data_extenso}": data_extenso,
        "{bloco_assinaturas}": bloco_assinaturas
    }

    for key, val in replacements.items():
        template = template.replace(key, str(val))

    return template


def formatar_regime_bens_extenso(regime: str) -> str:
    if not regime:
        return "Comunhão Parcial de Bens"
    r = regime.lower().strip()
    if "universal" in r:
        return "Comunhão Universal de Bens"
    if "parcial" in r:
        return "Comunhão Parcial de Bens"
    if "separac" in r or "separaç" in r:
        return "Separação Total de Bens"
    if "aquestos" in r or "participac" in r or "participaç" in r:
        return "Participação Final nos Aquestos"
    return regime


def gerar_requerimento_averbacao_casamento_html(
    lev_id: int = None,
    matricula_id: int = None,
    cliente_id: int = None,
    params: dict = None
) -> str:
    """Gera a peça jurídica do Requerimento de Averbação de Casamento perante o Cartório de Registro de Imóveis.
    Pode ser gerado com um levantamento ativo ou diretamente a partir de uma matrícula/propriedade cadastrada.
    """
    if not matricula_id:
        raise ValueError("O ID da matrícula é obrigatório para gerar o Requerimento de Averbação de Casamento.")

    params = params or {}
    
    if lev_id:
        dados = obter_dados_comuns(lev_id, matricula_id)
    else:
        # Busca direta por matrícula/propriedade sem exigir levantamento técnico
        row_mat = execute_query(
            "SELECT * FROM matriculas WHERE id = ?",
            params=(matricula_id,),
            fetch_one=True
        )
        if not row_mat:
            raise ValueError(f"Matrícula ID {matricula_id} não encontrada.")
        mat_data = dict(row_mat)
        prop_id = mat_data["propriedade_id"]

        row_prop = execute_query(
            "SELECT id, nome_propriedade, municipio, uf, codigo_car, codigo_ccir FROM propriedades WHERE id = ?",
            params=(prop_id,),
            fetch_one=True
        )
        if not row_prop:
            raise ValueError(f"Propriedade ID {prop_id} não encontrada.")
        prop_data = dict(row_prop)

        rows_owners = execute_query(
            """
            SELECT c.id as cliente_id, p.id as pessoa_id, p.nome as nome_completo, p.cpf_cnpj, p.rg as rg_ie, p.estado_civil, p.regime_bens, 
                   p.nome_conjuge, p.cpf_conjuge, p.rg_conjuge, p.genero_conjuge, p.nacionalidade_conjuge, p.profissao_conjuge,
                   p.profissao, p.nacionalidade, p.endereco_completo, c.cidade, c.estado, c.cep, c.sexo, c.email, c.telefone
            FROM propriedade_clientes pc
            JOIN clientes c ON pc.cliente_id = c.id
            JOIN pessoas p ON c.pessoa_id = p.id
            WHERE pc.propriedade_id = ?
            ORDER BY pc.percentual_participacao DESC, c.id ASC
            """,
            params=(prop_id,),
            fetch_all=True
        )
        owners = [dict(o) for o in rows_owners]
        dados = {
            "prop": prop_data,
            "mat": mat_data,
            "owners": owners
        }

    # 1. Selecionar o proprietário / requerente alvo
    target_owner = None
    if cliente_id:
        for o in dados["owners"]:
            if o.get("cliente_id") == cliente_id:
                target_owner = o
                break

    if not target_owner:
        # Preferir requerente casado ou que tenha cônjuge cadastrado
        for o in dados["owners"]:
            e_civ = str(o.get("estado_civil", "")).lower()
            if o.get("nome_conjuge") or "casad" in e_civ or "estav" in e_civ:
                target_owner = o
                break

    if not target_owner and dados["owners"]:
        target_owner = dados["owners"][0]

    if not target_owner:
        raise ValueError("Nenhum proprietário/cliente encontrado para o imóvel.")

    # 2. Consultar documentos adicionais / metadados do cliente e pessoa
    pessoa_id = target_owner.get("pessoa_id")
    cli_id = target_owner.get("cliente_id")

    orgao_rg_requerente = params.get("orgao_rg_requerente")
    orgao_rg_conjuge = params.get("orgao_rg_conjuge")
    certidao_matricula_db = None

    if pessoa_id:
        doc_rows = execute_query(
            "SELECT tipo_documento, numero, orgao_emissor, uf_emissor FROM cliente_documentos WHERE pessoa_id = ?",
            params=(pessoa_id,),
            fetch_all=True
        )
        for d in doc_rows:
            d_dict = dict(d)
            if d_dict.get("tipo_documento") == "RG" and not orgao_rg_requerente:
                oe = d_dict.get("orgao_emissor") or "SSP"
                uf = d_dict.get("uf_emissor") or (dados["prop"]["uf"] or "PR")
                orgao_rg_requerente = f"{oe}/{uf}"
            elif "CASAMENTO" in str(d_dict.get("tipo_documento", "")).upper():
                certidao_matricula_db = d_dict.get("numero")

    if cli_id and not certidao_matricula_db:
        meta_rows = execute_query(
            "SELECT chave, valor FROM cliente_metadados WHERE id_cliente = ?",
            params=(cli_id,),
            fetch_all=True
        )
        for m in meta_rows:
            m_dict = dict(m)
            if "casamento" in str(m_dict.get("chave", "")).lower():
                certidao_matricula_db = m_dict.get("valor")

    uf_padrao = dados["prop"]["uf"] or "PR"
    if not orgao_rg_requerente:
        orgao_rg_requerente = f"SSP/{uf_padrao}"
    if not orgao_rg_conjuge:
        orgao_rg_conjuge = f"SSP/{uf_padrao}"

    # 3. Cabeçalho / Ofício do Cartório de Registro de Imóveis
    comarca_cri = str(dados["mat"].get("cri_comarca") or dados["prop"]["municipio"]).upper()
    circunscricao_cri = str(dados["mat"].get("cri_circunscricao") or "").strip()
    numero_oficio = params.get("numero_oficio") or ""
    
    if not numero_oficio and circunscricao_cri:
        import re
        nums = re.findall(r'\d+', circunscricao_cri)
        if nums:
            numero_oficio = nums[0]

    if numero_oficio:
        cabecalho_oficial_cartorio = f"ILMO. SR. OFICIAL DO {numero_oficio}º OFICIAL DE REGISTRO DE IMÓVEIS DA COMARCA DE {comarca_cri}/{uf_padrao}"
    else:
        cabecalho_oficial_cartorio = f"ILMO. SR. OFICIAL DO REGISTRO DE IMÓVEIS DA COMARCA DE {comarca_cri}/{uf_padrao}"

    # 4. Dados do Requerente
    nome_requerente = target_owner.get("nome_completo") or "Nome do Requerente"
    nacionalidade_requerente = target_owner.get("nacionalidade") or "brasileiro(a)"
    profissao_requerente = target_owner.get("profissao") or "produtor(a) rural"
    rg_requerente = formatar_rg(target_owner.get("rg_ie")) or "Não Informado"
    cpf_requerente = formatar_cpf(target_owner.get("cpf_cnpj")) or "Não Informado"
    
    end_parts = []
    if target_owner.get("endereco_completo"):
        end_parts.append(str(target_owner["endereco_completo"]).strip())
    if target_owner.get("cep"):
        end_parts.append(f"CEP {target_owner['cep']}")
    if target_owner.get("cidade") and target_owner.get("estado"):
        end_parts.append(f"{target_owner['cidade']}/{target_owner['estado']}")
    elif dados["prop"].get("municipio") and dados["prop"].get("uf"):
        end_parts.append(f"{dados['prop']['municipio']}/{dados['prop']['uf']}")
        
    endereco_completo_requerente = ", ".join(end_parts) if end_parts else f"{dados['prop']['municipio']}/{dados['prop']['uf']}"
    telefone_requerente = target_owner.get("telefone") or "(não informado)"
    email_requerente = target_owner.get("email") or "(não informado)"

    # 5. Dados do Cônjuge
    nome_conjuge = params.get("nome_conjuge") or target_owner.get("nome_conjuge") or "Nome do Cônjuge"
    nacionalidade_conjuge = params.get("nacionalidade_conjuge") or target_owner.get("nacionalidade_conjuge") or "brasileiro(a)"
    profissao_conjuge = params.get("profissao_conjuge") or target_owner.get("profissao_conjuge") or "do lar"
    rg_conjuge = formatar_rg(params.get("rg_conjuge") or target_owner.get("rg_conjuge")) or "Não Informado"
    cpf_conjuge = formatar_cpf(params.get("cpf_conjuge") or target_owner.get("cpf_conjuge")) or "Não Informado"
    endereco_conjuge = params.get("endereco_conjuge") or "no mesmo endereço acima indicado"

    # 6. Qualidade do Proprietário e Matrícula
    qualidade_proprietario = "coproprietário(a)" if len(dados["owners"]) > 1 else "proprietário(a)"
    numero_matricula = dados["mat"].get("numero_matricula") or "_____"

    # 7. Dados do Casamento
    data_celebracao = params.get("data_celebracao") or "[DD/MM/AAAA]"
    
    raw_regime = params.get("regime_bens") or target_owner.get("regime_bens") or "Comunhão Parcial de Bens"
    regime_bens = formatar_regime_bens_extenso(raw_regime)

    cartorio_registro_civil = params.get("cartorio_civil") or f"Oficial de Registro Civil das Pessoas Naturais da Comarca de {dados['prop']['municipio']}/{uf_padrao}"

    # Assento de casamento
    livro = params.get("livro")
    folha = params.get("folha")
    termo = params.get("termo")
    mat_certidao = params.get("matricula_certidao") or certidao_matricula_db

    if mat_certidao:
        dados_assento_casamento = f"Matrícula nº {mat_certidao}"
    elif livro or folha or termo:
        dados_assento_casamento = f"Livro nº {livro or '___'}, Folha nº {folha or '___'}, Termo nº {termo or '___'}"
    else:
        dados_assento_casamento = "Livro nº [número], Folha nº [número], Termo nº [número] (ou Matrícula nº [número com 32 dígitos])"

    # Pacto antenupcial
    pacto_param = params.get("pacto_antenupcial")
    if pacto_param:
        pacto_antenupcial = pacto_param
    elif "parcial" in regime_bens.lower():
        pacto_antenupcial = "Não houve, adotado regime legal (Comunhão Parcial de Bens)"
    else:
        pacto_antenupcial = f"Lavrado pelo Tabelionato de Notas da Comarca de {dados['prop']['municipio']}/{uf_padrao}, Livro [nº], Folha [nº], registrado no Registro de Imóveis sob nº [número]"

    # Alteração de nome
    alteracao_param = params.get("alteracao_nome")
    if alteracao_param:
        alteracao_nome = alteracao_param
    else:
        alteracao_nome = "Não houve alteração de nome por ocasião do casamento"

    # 8. Local, Data e Assinaturas
    cidade_uf_emissao = f"{dados['prop']['municipio']}/{uf_padrao}"
    data_extenso = obter_data_extenso()

    bloco_assinaturas = f"""
    <div class="mt-8 flex flex-row flex-wrap justify-around gap-x-8 gap-y-12 w-full">
        <div class="flex flex-col items-center min-w-[260px] flex-1 max-w-[320px]">
            <div class="w-full border-t border-slate-400 mt-6 mb-2"></div>
            <div class="text-xs font-bold text-slate-900 text-center uppercase tracking-wide">{nome_requerente}</div>
            <div class="text-[10px] text-slate-500 text-center font-medium mt-0.5 font-mono">CPF: {cpf_requerente}</div>
            <div class="text-[9px] text-slate-400 text-center uppercase tracking-wider font-semibold">Requerente</div>
        </div>
        <div class="flex flex-col items-center min-w-[260px] flex-1 max-w-[320px]">
            <div class="w-full border-t border-slate-400 mt-6 mb-2"></div>
            <div class="text-xs font-bold text-slate-900 text-center uppercase tracking-wide">{nome_conjuge}</div>
            <div class="text-[10px] text-slate-500 text-center font-medium mt-0.5 font-mono">CPF: {cpf_conjuge}</div>
            <div class="text-[9px] text-slate-400 text-center uppercase tracking-wider font-semibold">Cônjuge</div>
        </div>
    </div>
    """

    template = carregar_template("requerimento_averbacao_casamento.html")
    replacements = {
        "{cabecalho_oficial_cartorio}": cabecalho_oficial_cartorio,
        "{nome_requerente}": nome_requerente,
        "{nacionalidade_requerente}": nacionalidade_requerente,
        "{profissao_requerente}": profissao_requerente,
        "{rg_requerente}": rg_requerente,
        "{orgao_uf_rg_requerente}": orgao_rg_requerente,
        "{cpf_requerente}": cpf_requerente,
        "{endereco_completo_requerente}": endereco_completo_requerente,
        "{telefone_requerente}": telefone_requerente,
        "{email_requerente}": email_requerente,
        "{nome_conjuge}": nome_conjuge,
        "{nacionalidade_conjuge}": nacionalidade_conjuge,
        "{profissao_conjuge}": profissao_conjuge,
        "{rg_conjuge}": rg_conjuge,
        "{orgao_uf_rg_conjuge}": orgao_rg_conjuge,
        "{cpf_conjuge}": cpf_conjuge,
        "{endereco_conjuge}": endereco_conjuge,
        "{qualidade_proprietario}": qualidade_proprietario,
        "{numero_matricula}": numero_matricula,
        "{data_celebracao}": data_celebracao,
        "{regime_bens}": regime_bens,
        "{cartorio_registro_civil}": cartorio_registro_civil,
        "{dados_assento_casamento}": dados_assento_casamento,
        "{pacto_antenupcial}": pacto_antenupcial,
        "{alteracao_nome}": alteracao_nome,
        "{cidade_uf_emissao}": cidade_uf_emissao,
        "{data_extenso}": data_extenso,
        "{bloco_assinaturas}": bloco_assinaturas
    }

    for key, val in replacements.items():
        template = template.replace(key, str(val))

    return template
