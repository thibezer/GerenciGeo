import os

filepath = r"business/report_generator.py"

with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# Encontra onde a função gerar_requerimento_ratificacao_html começa
start_marker = "    @staticmethod\n    def gerar_requerimento_ratificacao_html"
start_idx = content.find(start_marker)
if start_idx == -1:
    raise ValueError("Não encontrou o início da função gerar_requerimento_ratificacao_html!")

# O trecho a ser substituído vai desde o start_idx até o final do arquivo
old_code = content[start_idx:]

new_code = """    @staticmethod
    def gerar_requerimento_ratificacao_html(lev_id: int, matricula_id: int) -> str:
        \"\"\"Gera a string HTML correspondente ao Requerimento de Ratificação de Fronteira com as tags injetadas\"\"\"
        # 1. Recupera metadados do levantamento
        query_lev = \"\"\"
            SELECT l.propriedade_id, l.profissional_id, p.nome as nome_profissional, p.registro as registro_profissional, p.codigo_credenciado
            FROM levantamentos l
            JOIN profissionais p ON l.profissional_id = p.id
            WHERE l.id = ?
        \"\"\"
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
        query_mat = \"\"\"
            SELECT id, numero_matricula, ccir, itr, area_ha, cri_comarca, cri_circunscricao, livro_registro, folha_registro,
                   valor_itr, denominacao, georreferenciamento
            FROM matriculas
            WHERE id = ? AND propriedade_id = ?
        \"\"\"
        row_mat = execute_query(query_mat, params=(matricula_id, propriedade_id), fetch_one=True)
        if not row_mat:
            raise ValueError(f"Matrícula com ID {matricula_id} não encontrada para a propriedade correspondente.")
        mat_data = dict(row_mat)

        # 4. Busca todos os proprietários vinculados à propriedade com dados completos (incluindo sexo)
        query_proprietarios = \"\"\"
            SELECT c.nome_completo, c.cpf_cnpj, c.rg_ie, c.estado_civil, c.regime_bens, 
                   c.nome_conjuge, c.cpf_conjuge, c.rg_conjuge, c.profissao, c.nacionalidade, c.endereco_completo, c.cidade, c.estado,
                   c.sexo, pc.percentual_participacao
            FROM propriedade_clientes pc
            JOIN clientes c ON pc.cliente_id = c.id
            WHERE pc.propriedade_id = ?
            ORDER BY pc.percentual_participacao DESC, c.id ASC
        \"\"\"
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
                qualif = f'<strong class="text-slate-900">{c_nome}</strong>, {c_nac}, {c_prof}, {c_est_civil}, {pron_c_portador} do RG nº {c_rg} e {pron_c_inscrito} no CPF sob o nº {c_cpf}, residente e domiciliado em {c_domicilio}'
                
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
            texto_requerimento = f"{qualificacao_completa}, na qualidade de {pron_prop_final}, vem requerer e autorizar, nos termos da Lei nº 13.178/2015, bem como nos arts. 656-BU e seguintes do Código de Normas da Corregedoria-Geral da Justiça do Estado do Paraná, a ratificação do imóvel situado em faixa de fronteira, denominado <strong class=\\\"text-slate-900\\\">{nome_lote}</strong>, com área de <strong class=\\\"text-slate-900\\\">{mat_data['area_ha']:.4f} ha</strong>, localizado no município de {prop_data['municipio']}/PR, objeto da matrícula nº <strong class=\\\"text-slate-900\\\">{mat_data['numero_matricula']}</strong> do Registro de Imóveis da Comarca de {comarca_exibicao}, inscrito no CCIR/INCRA sob o nº <strong class=\\\"text-slate-900\\\">{ccir_exibicao}</strong>."
        else:
            if total_owners == 1:
                qualificacao_completa = qualificacoes[0]
            else:
                primeiros = ";<br>".join(qualificacoes[:-1])
                ultimo = qualificacoes[-1]
                qualificacao_completa = f"{primeiros};<br>e {ultimo}"
            
            texto_requerimento = f"{qualificacao_completa}, na qualidade de legítimos proprietários, vêm requerer e autorizar, nos termos da Lei nº 13.178/2015, bem como nos arts. 656-BU e seguintes do Código de Normas da Corregedoria-Geral da Justiça do Estado do Paraná, a ratificação do imóvel situado em faixa de fronteira, denominado <strong class=\\\"text-slate-900\\\">{nome_lote}</strong>, com área de <strong class=\\\"text-slate-900\\\">{mat_data['area_ha']:.4f} ha</strong>, localizado no município de {prop_data['municipio']}/PR, objeto da matrícula nº <strong class=\\\"text-slate-900\\\">{mat_data['numero_matricula']}</strong> do Registro de Imóveis da Comarca de {comarca_exibicao}, inscrito no CCIR/INCRA sob o nº <strong class=\\\"text-slate-900\\\">{ccir_exibicao}</strong>."

        # Geração dinâmica das assinaturas no rodapé
        bloco_assinaturas_html = '<div class="mt-12 pt-6 flex flex-row flex-wrap justify-around gap-x-8 gap-y-8 break-inside-avoid w-full">'
        for owner in rows_owners:
            owner_data = dict(owner)
            o_nome = owner_data["nome_completo"]
            
            # Adiciona o Proprietário
            bloco_assinaturas_html += f"""
            <div class="flex flex-col items-center min-w-[240px] flex-1 max-w-[280px]">
                <div class="w-full border-t border-slate-400 mt-8 mb-2"></div>
                <div class="text-xs font-bold text-slate-900 text-center uppercase tracking-wide">{o_nome}</div>
                <div class="text-[10px] text-slate-500 text-center font-medium mt-0.5">Requerente Proprietário</div>
                <div class="text-[9px] text-slate-400 text-center italic mt-1">(Reconhecer firma)</div>
            </div>
            """
            
            # Adiciona o Cônjuge se for casado
            e_civil = str(owner_data.get("estado_civil", "")).strip().lower()
            if "casad" in e_civil or "estável" in e_civil or "estavel" in e_civil:
                conj_n = owner_data.get("nome_conjuge") or "Cônjuge do Proprietário"
                bloco_assinaturas_html += f\"\"\"
                <div class="flex flex-col items-center min-w-[240px] flex-1 max-w-[280px]">
                    <div class="w-full border-t border-slate-400 mt-8 mb-2"></div>
                    <div class="text-xs font-bold text-slate-900 text-center uppercase tracking-wide">{conj_n}</div>
                    <div class="text-[10px] text-slate-500 text-center font-medium mt-0.5">Requerente Cônjuge</div>
                    <div class="text-[9px] text-slate-400 text-center italic mt-1">(Reconhecer firma)</div>
                </div>
                \"\"\"
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

        # Injeção condicional do item X (SIGEF/INCRA) baseado em limite de 200 hectares (correspondente aproximado a 15 Módulos Fiscais no Paraná)
        codigo_sigef_exibicao = mat_data.get("georreferenciamento") or "____________________"
        exibir_sigef = mat_data.get("area_ha", 0.0) >= 200.0
        bloco_sigef_html = ""
        if exibir_sigef:
            bloco_sigef_html = f\"\"\"
                    <div class="flex items-start gap-2">
                        <span class="font-bold text-slate-800 leading-none">X – </span>
                        <span>Certificação obtida junto ao SIGEF/INCRA código nº <strong class="text-slate-800 font-mono">{codigo_sigef_exibicao}</strong>.</span>
                    </div>
            \"\"\"

        # Gera data de hoje por extenso de forma independente de locale
        meses = {
            1: "janeiro", 2: "fevereiro", 3: "março", 4: "abril",
            5: "maio", 6: "junho", 7: "julho", 8: "agosto",
            9: "setembro", 10: "outubro", 11: "novembro", 12: "dezembro"
        }
        from datetime import datetime
        agora = datetime.now()
        data_hoje_extenso = f"{agora.day} de {meses[agora.month]} de {agora.year}"

        html_content = f\"\"\"<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Requerimento Unificado de Ratificação e Retificação Territorial - {nome_lote}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        body {{
            font-family: 'Inter', sans-serif;
        }}
        @media print {{
            @page {{
                size: A4;
                margin: 1.5cm 2.5cm;
            }}
            .no-print {{
                display: none !important;
            }}
            body {{
                background-color: white !important;
                padding: 0 !important;
            }}
            .page {{
                box-shadow: none !important;
                border: none !important;
                margin: 0 !important;
                padding: 0 !important;
                max-width: 100% !important;
                width: 100% !important;
            }}
        }}
    </style>
    <script>
        document.addEventListener('DOMContentLoaded', function() {{
            const meses = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
            const agora = new Date();
            const dia = agora.getDate();
            const mes = meses[agora.getMonth()];
            const ano = agora.getFullYear();
            const dataFormatada = dia + " de " + mes + " de " + ano;
            const el = document.getElementById('data-impressao');
            if (el) {{
                el.textContent = dataFormatada;
            }}
        }});
    </script>
</head>
<body class="bg-slate-100 text-slate-800 min-h-screen p-4 md:p-8 flex flex-col items-center select-text">
    
    <!-- Barra Superior de Controle (no-print) -->
    <div class="no-print w-full max-w-[21cm] bg-[#0c1510] text-white py-4 px-6 mb-6 flex flex-col sm:flex-row justify-between items-center gap-4 rounded-xl border border-white/10 shadow-[0_4px_20px_rgba(0,0,0,0.15)]">
        <div class="flex items-center gap-3">
            <div class="w-8 h-8 bg-[#00f5a0]/10 border border-[#00f5a0]/30 rounded-lg flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" class="text-[#00f5a0] w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </div>
            <div>
                <h4 class="text-sm font-bold tracking-tight text-white flex items-center gap-2">
                    completa
                    <span class="text-[9px] uppercase bg-[#00f5a0]/20 text-[#00f5a0] px-1.5 py-0.5 rounded font-mono font-bold animate-pulse">PRONTO PARA IMPRESSÃO</span>
                </h4>
                <p class="text-[10px] text-white/40 mt-0.5">Requerimento de Ratificação • A4 Premium</p>
            </div>
        </div>
        
        <button onclick="window.print()" class="px-5 py-2.5 bg-[#00f5a0] hover:bg-[#00d48a] text-[#0c1510] font-bold rounded-lg shadow-[0_0_15px_rgba(0,245,160,0.3)] transition-all flex items-center gap-2 text-xs uppercase tracking-wider cursor-pointer">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            Imprimir / Salvar PDF
        </button>
    </div>
 
    <!-- Página Principal (A4) -->
    <div class="page bg-white text-slate-800 p-12 md:p-16 max-w-[21cm] min-h-[29.7cm] w-full shadow-2xl border border-slate-200 rounded-xl flex flex-col justify-between print:rounded-none print:border-none print:shadow-none">
        
        <div>
            <!-- Cabeçalho Principal -->
            <div class="flex flex-col items-center pb-2 mb-6 text-center border-b border-slate-100">
                <div class="text-2xl font-extrabold text-[#0c1510] tracking-wider uppercase mb-0.5">
                    completa
                </div>
                <div class="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-3">
                    Agrimensura e Projetos Agropecuários
                </div>
                <h2 class="text-sm font-bold text-[#0c1510] tracking-wide uppercase mt-1">REQUERIMENTO DE RATIFICAÇÃO E RETIFICAÇÃO TERRITORIAL</h2>
            </div>
 
            <!-- Endereçamento do Documento -->
            <p class="text-[11px] font-black uppercase tracking-wide text-slate-900 my-5 leading-normal select-all">
                ILMO. SR. OFICIAL DO SERVIÇO DE REGISTRO DE IMÓVEIS DA COMARCA DE {comarca_exibicao} - PARANÁ
            </p>
 
            <!-- Conteúdo do Requerimento -->
            <div class="space-y-4 text-xs text-justify leading-relaxed text-slate-700">
                
                <div>
                    <h3 class="text-[10px] font-bold uppercase tracking-wider text-[#10b981] mb-1.5">REQUERENTES (QUALIFICAÇÃO):</h3>
                    <p class="text-slate-700">{texto_requerimento}</p>
                </div>
                
                <p>Atribui-se a esse imóvel o valor de R$ <strong class="text-slate-900">{valor_venal_itr_str}</strong>, conforme consta no ITR e/ou na declaração de valor venal expedida pela Prefeitura Municipal de {prop_data['municipio']} em <strong class="text-slate-900">____/____/________</strong>.</p>
                
                <p>Para tanto, apresenta os seguintes documentos que seguem em anexo:</p>
                
                <!-- Lista de Documentos Anexos -->
                <div class="pl-4 space-y-2 my-3 text-slate-600 font-medium">
                    <div class="flex items-start gap-2">
                        <span class="font-bold text-slate-800 leading-none">I –</span>
                        <span>Cópia autenticada do RG e CPF, e certidão de casamento ou nascimento, expedidas no máximo de 90 dias;</span>
                    </div>
                    <div class="flex items-start gap-2">
                        <span class="font-bold text-slate-800 leading-none">II –</span>
                        <span>Certidões de inteiro teor das matrículas (e transcrições), com menos de 30 dias, que formam a cadeia dominial do imóvel;</span>
                    </div>
                    <div class="flex items-start gap-2">
                        <span class="font-bold text-slate-800 leading-none">III –</span>
                        <span>Certificado de cadastro do imóvel rural - CCIR atualizado;</span>
                    </div>
                    <div class="flex items-start gap-2">
                        <span class="font-bold text-slate-800 leading-none">IV –</span>
                        <span>Certidão negativa do Imposto Territorial Rural – ITR;</span>
                    </div>
                    <div class="flex items-start gap-2">
                        <span class="font-bold text-slate-800 leading-none">V –</span>
                        <span>Recibo de inscrição no Cadastro Ambiental Rural - CAR, na condição ativo;</span>
                    </div>
                    <div class="flex items-start gap-2">
                        <span class="font-bold text-slate-800 leading-none">VI –</span>
                        <span>Laudo técnico de localização do imóvel na faixa de fronteira;</span>
                    </div>
                    <div class="flex items-start gap-2">
                        <span class="font-bold text-slate-800 leading-none">VII –</span>
                        <span>Certidões negativas da Justiça Estadual (1º e 2º grau);</span>
                    </div>
                    <div class="flex items-start gap-2">
                        <span class="font-bold text-slate-800 leading-none">VIII –</span>
                        <span>Certidão negativa da Justiça Federal da 4ª Região;</span>
                    </div>
                    <div class="flex items-start gap-2 col-span-2">
                        <span class="font-bold text-slate-800 leading-none">IX –</span>
                        <span>Escritura pública declaratória de inexistência de processo administrativo pelo qual o domínio do imóvel esteja sendo questionado nas esferas administrativa ou judicial por órgão ou entidade da administração federal direta e indireta.</span>
                    </div>
                    {bloco_sigef_html}
                </div>
                
                <p class="text-[10px] text-slate-500 italic leading-snug">Declaram, por fim, que temos ciência e concordância, de forma livre, informada e inequívoca, com o fato de que o registrador e seus auxiliares, em decorrência da lavratura do ato, poderão acessar, utilizar, manter e processar, eletrônica e manualmente, dados pessoais e as informações e demais dados prestados, compartilhando-os com outros agentes de tratamento de dados, exclusivamente para fins de execução e conclusão do ato notarial ou registral solicitado pelas partes, tudo em conformidade com a Lei nº 13.709/2018 – Lei Geral de Proteção de Dados Pessoais (LGPD).</p>
                
                <p>Dessa forma, por estar em ordem a documentação necessária, requer seja efetuada averbação na matrícula indicada da ratificação da titulação realizada em faixa de fronteira na forma da Lei nº 13.178/2015.</p>
                
                <p>Requerer e autoriza, ainda, que sejam averbados todos demais dados de especialidade subjetiva e/ou objetiva necessários, como CCIR, ITR, CAR e dados pessoais.</p>
                
                <p class="font-semibold text-slate-800 mt-2">Termos que pede deferimento.</p>
                
                <p class="text-xs text-slate-500 font-semibold text-right pt-4">{prop_data['municipio']}-PR, <span id="data-impressao">{data_hoje_extenso}</span>.</p>
            </div>
        </div>
 
        <!-- Assinaturas Proprietários e Cônjuges (Evita quebra de página) -->
        {bloco_assinaturas_html}
    </div>
</body>
</html>\"\"\"
        return html_content"""

content = content.replace(old_code, new_code)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(content)

print("Substituição efetuada com sucesso absoluto!")
