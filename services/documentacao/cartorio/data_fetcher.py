import math
from database.connection import execute_query
from services.documentacao.cartorio.utils import calcular_azimute_e_distancia

def obter_dados_comuns(lev_id: int, matricula_id: int) -> dict:
    """Carrega profissional, propriedade, matricula e proprietários com dados qualificados"""
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

    # 3. Matrícula e Resolução de Gleba Unificada / Desenho Compartilhado
    row_mat = execute_query(
        """
        SELECT m.id, m.numero_matricula, pr.codigo_ccir as ccir, m.itr, m.area_ha, m.cri_comarca, m.cri_circunscricao, m.livro_registro, m.folha_registro,
               m.valor_itr, m.denominacao, m.georreferenciamento, m.matricula_origem_desenho_id
        FROM matriculas m
        JOIN propriedades pr ON m.propriedade_id = pr.id
        WHERE m.id = ? AND m.propriedade_id = ?
        """,
        params=(matricula_id, prop_id),
        fetch_one=True
    )
    if not row_mat:
        raise ValueError(f"Matrícula ID {matricula_id} não encontrada para esta propriedade.")
    mat_data = dict(row_mat)

    # Identificar a matrícula de origem do desenho perimétrico
    mat_desenho_id = mat_data.get("matricula_origem_desenho_id") or matricula_id

    # Buscar todas as matrículas que compõem esta mesma gleba/desenho unificado
    rows_grupo = execute_query(
        """
        SELECT m.id, m.numero_matricula, m.area_ha, m.denominacao, m.georreferenciamento, m.matricula_origem_desenho_id,
               m.cri_comarca, m.cri_circunscricao, m.livro_registro, m.folha_registro, m.itr, m.valor_itr
        FROM matriculas m
        WHERE m.propriedade_id = ?
          AND (m.id = ? OR m.matricula_origem_desenho_id = ?)
        ORDER BY m.id ASC
        """,
        params=(prop_id, mat_desenho_id, mat_desenho_id),
        fetch_all=True
    )
    matriculas_grupo = [dict(r) for r in rows_grupo] if rows_grupo else [mat_data]
    if not any(m["id"] == mat_data["id"] for m in matriculas_grupo):
        matriculas_grupo.insert(0, mat_data)

    is_unificada = len(matriculas_grupo) > 1
    comarca = str(mat_data.get("cri_comarca") or prop_data.get("municipio") or "").upper()

    nums_mats = [str(m["numero_matricula"]).strip() for m in matriculas_grupo if m.get("numero_matricula")]
    if len(nums_mats) == 1:
        numeros_matricula_str = nums_mats[0]
        rotulo_matricula = "Matrícula nº"
    elif len(nums_mats) == 2:
        numeros_matricula_str = f"{nums_mats[0]} e {nums_mats[1]}"
        rotulo_matricula = "Matrículas nºs"
    elif len(nums_mats) > 2:
        numeros_matricula_str = ", ".join(nums_mats[:-1]) + f" e {nums_mats[-1]}"
        rotulo_matricula = "Matrículas nºs"
    else:
        numeros_matricula_str = str(mat_data.get("numero_matricula") or "SEM MATRÍCULA")
        rotulo_matricula = "Matrícula nº"

    denoms = [str(m["denominacao"]).strip() for m in matriculas_grupo if m.get("denominacao")]
    if len(denoms) == 1:
        denominacoes_str = denoms[0]
    elif len(denoms) == 2:
        denominacoes_str = f"{denoms[0]} e {denoms[1]}"
    elif len(denoms) > 2:
        denominacoes_str = ", ".join(denoms[:-1]) + f" e {denoms[-1]}"
    else:
        denominacoes_str = mat_data.get("denominacao") or prop_data.get("nome_propriedade")

    area_total_acumulada = sum((float(m["area_ha"]) if m.get("area_ha") is not None else 0.0) for m in matriculas_grupo)
    if area_total_acumulada <= 0 and mat_data.get("area_ha"):
        area_total_acumulada = float(mat_data["area_ha"])
    area_total_str = f"{area_total_acumulada:,.4f}".replace(",", "X").replace(".", ",").replace("X", ".")

    if is_unificada:
        clausula_unificacao_html = f"""
        <div class="mt-2 p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-justify text-[11px] leading-snug text-slate-700 break-inside-avoid">
            <p><strong>Parágrafo Único – Da Unificação e Continuidade Territorial:</strong> Declaram os signatários que as divisas e limites perimétricos objeto do presente reconhecimento confrontam com a <strong>gleba contínua e unificada</strong> formada conjuntamente pelas <strong>{rotulo_matricula} {numeros_matricula_str}</strong> (compreendendo os imóveis denominados <em>{denominacoes_str}</em>), perante o Serviço de Registro de Imóveis da Comarca de {comarca}, totalizando a área registrada conjunta de <strong>{area_total_str} ha</strong>, reconhecendo que tais confrontações e vértices perimétricos constituem divisa única, contínua e incontroversa perante os imóveis lindeiros.</p>
        </div>
        """
    else:
        clausula_unificacao_html = ""

    # 4. Proprietários
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

    return {
        "lev": lev_data,
        "prop": prop_data,
        "mat": mat_data,
        "owners": owners,
        "grupo_matriculas": matriculas_grupo,
        "matricula_desenho_id": mat_desenho_id,
        "is_unificada": is_unificada,
        "numeros_matricula_str": numeros_matricula_str,
        "rotulo_matricula": rotulo_matricula,
        "denominacoes_str": denominacoes_str,
        "area_total_ha": area_total_acumulada,
        "area_total_str": area_total_str,
        "clausula_unificacao_html": clausula_unificacao_html
    }


def obter_segmentos_detalhados_confrontante(matricula_id: int, confrontante_id: int) -> list[dict]:
    """Busca e retorna os segmentos de confrontação ordenados com dados topográficos e geométricos completos"""
    # Se a matrícula tiver desenho compartilhado, resolver para a matrícula base
    row_orig = execute_query("SELECT matricula_origem_desenho_id FROM matriculas WHERE id = ?", params=(matricula_id,), fetch_one=True)
    target_mat_id = (row_orig["matricula_origem_desenho_id"] if row_orig and row_orig["matricula_origem_desenho_id"] else matricula_id)

    query = """
        SELECT s.tipo_limite_sigef, s.metodo_posicionamento_sigef,
               pi.nome_vertice as ini_nome, pi.lat as ini_lat, pi.lon as ini_lon, pi.ordem_caminhamento as ini_ordem,
               pf.nome_vertice as fim_nome, pf.lat as fim_lat, pf.lon as fim_lon
        FROM segmentos s
        JOIN pontos pi ON s.ponto_inicio_id = pi.id
        JOIN pontos pf ON s.ponto_fim_id = pf.id
        WHERE s.matricula_id = ? AND s.confrontante_id = ?
    """
    rows = execute_query(query, params=(target_mat_id, confrontante_id), fetch_all=True)
    segs = [dict(r) for r in rows]
    segs.sort(key=lambda x: x["ini_ordem"] if x["ini_ordem"] is not None else 0)
    return segs


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
    <div class="my-1.5 border border-slate-300 rounded-lg overflow-hidden break-inside-avoid">
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
