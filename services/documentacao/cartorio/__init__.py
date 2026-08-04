# -*- coding: utf-8 -*-
"""Pacote de geração de documentos cartoriais.

Este módulo expõe as funções principais para geração de relatórios e documentos
utilizados pela aplicação.
"""

# Reexporta as funções de geração de documentos para facilitar imports
from .laudos_imovel import (
    gerar_requerimento_cartorio_html,
    gerar_declaracao_responsabilidade_html,
    gerar_laudo_tecnico_html,
    gerar_termo_responsabilidade_sigef_html,
    gerar_manual_proprietario_html,
    gerar_declaracao_anuencia_desmembramento_html,
    gerar_js_inicializacao_mapas,
)

from .anuencias import (
    gerar_declaracao_anuencia_html,
    gerar_declaracao_anuencia_lote_html,
)

# Exporta também funções auxiliares se necessário
from .utils import (
    carregar_template,
    obter_data_extenso,
    formatar_cpf,
    formatar_rg,
)
