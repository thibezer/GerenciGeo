import math

class SigefValidator:
    """Implementa cálculo de erro Sigma, validação a 95% de confiança da norma do INCRA e auditoria topológica de polígonos"""
    
    # 3a Edicao limites planimetricos
    LIMITES = {
        'artificial': 0.50,    # metros
        'natural': 3.00,       # metros
        'inacessivel': 7.50,   # metros
    }

    # 3a Edicao limites altimetricos (tipicamente o dobro da planimetria pela Norma INCRA/SIGEF)
    LIMITES_ALTIMETRICOS = {
        'artificial': 1.00,    # metros
        'natural': 6.00,       # metros
        'inacessivel': 15.00,  # metros
    }

    @classmethod
    def validar_conformidade_vertical(cls, sigma_z: float, tipo_limite: str) -> tuple[bool, str]:
        """Retorna (conforme: bool, mensagem_alerta: str) para a componente altimetrica vertical"""
        if sigma_z is None:
            return False, "Faltam dados σZ"
            
        tipo = str(tipo_limite).lower().strip()
        if tipo not in cls.LIMITES_ALTIMETRICOS:
            return False, f"Tipo de limite ({tipo_limite}) desconhecido."

        limite_max = cls.LIMITES_ALTIMETRICOS[tipo]
        is_conforme = sigma_z <= limite_max

        status = "CONFORME VERTICAL" if is_conforme else "REPROVADO VERTICAL"
        msg = f"{status}: σZ ({sigma_z:.4f}m) contra limite de {limite_max:.2f}m (1-Sigma)."
        return is_conforme, msg

    @classmethod
    def validar_autointerssecao(cls, pontos_plano: list) -> bool:
        """
        Algoritmo deterministico e robusto sem dependencias baseado em orientacao CCW (Counter Clockwise)
        para detectar autointerssecao (self-intersection) em poligonos fechados 2D no espaco UTM.
        Retorna True se houver cruzamento irregular de divisas (poligonal autocortante).
        """
        n = len(pontos_plano)
        if n < 4:
            return False # Triangulos nao se autointersectam

        segmentos = []
        for i in range(n):
            p1 = (pontos_plano[i]["e"], pontos_plano[i]["n"])
            p2 = (pontos_plano[(i + 1) % n]["e"], pontos_plano[(i + 1) % n]["n"])
            segmentos.append((p1, p2))

        def ccw(A, B, C):
            # Retorna True se a curva ABC estiver no sentido anti-horario
            return (C[1] - A[1]) * (B[0] - A[0]) > (B[1] - A[1]) * (C[0] - A[0])

        def intersect(A, B, C, D):
            # Ignora intersecoes validas em vertices comuns das extremidades dos segmentos
            if A == C or A == D or B == C or B == D:
                return False
            # Dois segmentos se cruzam se as orientacoes das extremidades forem opostas
            return ccw(A, C, D) != ccw(B, C, D) and ccw(A, B, C) != ccw(A, B, D)

        # Compara todos os pares de segmentos nao consecutivos
        for i in range(n):
            for j in range(i + 2, n):
                # Evita comparar o primeiro segmento com o ultimo (compartilham a base comum de fechamento)
                if i == 0 and j == n - 1:
                    continue
                A, B = segmentos[i]
                C, D = segmentos[j]
                if intersect(A, B, C, D):
                    return True
        return False

    @staticmethod
    def calcular_sigma_p(sigma_phi: float, sigma_lambda: float) -> float:
        """σP = √(σφ² + σλ²) - Sigma simples (1-Sigma, 68% de confiança)"""
        if sigma_phi is None or sigma_lambda is None:
            return None
        return math.sqrt(sigma_phi**2 + sigma_lambda**2)

    @staticmethod
    def calcular_sigma_p_95(sigma_phi: float, sigma_lambda: float) -> float:
        """σP(95%) ≈ 1.73 * σP - Sigma expandido (2-Sigma, 95% de confiança bidimensional)"""
        if sigma_phi is None or sigma_lambda is None:
            return None
        return 1.7308 * math.sqrt(sigma_phi**2 + sigma_lambda**2)

    @classmethod
    def validar_conformidade(cls, sigma_p: float, tipo_limite: str) -> tuple[bool, str]:
        """Retorna (conforme: bool, mensagem_alerta: str) sob nível de 68% de confiança (1-Sigma)"""
        if sigma_p is None:
            return False, "Faltam dados σ"
            
        tipo = str(tipo_limite).lower().strip()
        if tipo not in cls.LIMITES:
            return False, f"Tipo de limite ({tipo_limite}) desconhecido."

        limite_max = cls.LIMITES[tipo]
        is_conforme = sigma_p <= limite_max

        status = "CONFORME" if is_conforme else "REPROVADO"
        msg = f"{status}: σP ({sigma_p:.4f}m) contra limite de {limite_max:.2f}m (1-Sigma)."
        return is_conforme, msg

    @classmethod
    def validar_conformidade_95(cls, sigma_p_95: float, tipo_limite: str) -> tuple[bool, str]:
        """Retorna (conforme: bool, mensagem_alerta: str) sob o nível regulamentar estrito de 95% de confiança (M-Sigma)"""
        if sigma_p_95 is None:
            return False, "Faltam dados σ"
            
        tipo = str(tipo_limite).lower().strip()
        if tipo not in cls.LIMITES:
            return False, f"Tipo de limite ({tipo_limite}) desconhecido."

        limite_max = cls.LIMITES[tipo]
        is_conforme = sigma_p_95 <= limite_max

        status = "CONFORME (95%)" if is_conforme else "REPROVADO (95%)"
        msg = f"{status}: σP_95 ({sigma_p_95:.4f}m) contra limite de {limite_max:.2f}m (2-Sigma/M-Sigma)."
        return is_conforme, msg

    @classmethod
    def auditar_poligonal_matricula(cls, pontos_ordenados: list, area_declarada_ha: float = 0.0) -> dict:
        """
        Executa a auditoria topológica de fechamento de polígono, calcula azimutes/distâncias de divisas,
        perímetro total e área definitiva milimétrica pela Fórmula de Gauss (Shoelace).
        pontos_ordenados: lista de dicts contendo {'nome_vertice', 'lat', 'lon', 'alt'}
        """
        if not pontos_ordenados or len(pontos_ordenados) < 3:
            return {
                "sucesso": False,
                "erro": "Número insuficiente de vértices para fechar polígono. São necessários pelo menos 3 pontos."
            }

        from pyproj import Transformer
        
        # 1. Determinação dinâmica da Zona UTM e EPSG SIRGAS 2000 correspondente no Hemisfério Sul
        lon0 = pontos_ordenados[0]["lon"]
        zona_utm = int((lon0 + 180) / 6) + 1
        epsg_utm = f"319{60 + zona_utm}"
        
        transformer = Transformer.from_crs("epsg:4674", f"epsg:{epsg_utm}", always_xy=True)
        
        # Projetar coordenadas geodésicas para o plano plano-altimétrico UTM
        pontos_plano = []
        for p in pontos_ordenados:
            e, n = transformer.transform(p["lon"], p["lat"])
            pontos_plano.append({
                "nome": p["nome_vertice"],
                "e": e,
                "n": n,
                "alt": p["alt"] or 0.0
            })
            
        n = len(pontos_plano)
        segmentos_analise = []
        perimetro_total = 0.0
        
        # 2. Caminhamento geométrico ao longo do perímetro da divisa
        for i in range(n):
            curr = pontos_plano[i]
            next_pt = pontos_plano[(i + 1) % n]
            
            de = next_pt["e"] - curr["e"]
            dn = next_pt["n"] - curr["n"]
            dh = next_pt["alt"] - curr["alt"]
            
            d_horizontal = math.sqrt(de**2 + dn**2)
            perimetro_total += d_horizontal
            
            az_rad = math.atan2(de, dn)
            az_deg = math.degrees(az_rad) % 360.0
            
            segmentos_analise.append({
                "do_ponto": curr["nome"],
                "para_ponto": next_pt["nome"],
                "distancia_m": round(d_horizontal, 4),
                "azimute_dec": round(az_deg, 4),
                "azimute_formatado": cls._formatar_azimute(az_deg),
                "delta_e": de,
                "delta_n": dn,
                "delta_h": dh
            })

        # 3. Cálculo de Área pela Fórmula de Gauss (Shoelace Algorithm)
        soma_shoelace = 0.0
        for i in range(n):
            curr = pontos_plano[i]
            next_pt = pontos_plano[(i + 1) % n]
            soma_shoelace += (curr["e"] * next_pt["n"]) - (next_pt["e"] * curr["n"])
            
        area_m2 = abs(soma_shoelace) / 2.0
        area_ha = area_m2 / 10000.0

        # 3.1. Validação de Autointerssecção
        autointerssecta = cls.validar_autointerssecao(pontos_plano)
        
        # 4. Análise de Discrepância e Fechamento Lógico
        discrepancia_ha = 0.0
        discrepancia_perc = 0.0
        if area_declarada_ha > 0.0:
            discrepancia_ha = abs(area_ha - area_declarada_ha)
            discrepancia_perc = (discrepancia_ha / area_declarada_ha) * 100.0

        return {
            "sucesso": not autointerssecta,
            "erro": "Polígono autocortante (self-intersecting) detectado! A poligonal se cruza e será rejeitada pelo SIGEF." if autointerssecta else None,
            "zona_utm": zona_utm,
            "epsg_plano": int(epsg_utm),
            "total_vertices": n,
            "perimetro_m": round(perimetro_total, 3),
            "area_m2": round(area_m2, 3),
            "area_ha": round(area_ha, 4),
            "area_declarada_ha": area_declarada_ha,
            "discrepancia_area_ha": round(discrepancia_ha, 4),
            "discrepancia_area_perc": round(discrepancia_perc, 2),
            "fechamento_linear_residuo_m": 0.0, # Fechamento exato pelas coordenadas corrigidas
            "precisao_relativa_fecho": "1:Infinita (Coordenada Ajustada)",
            "conforme_topologia_perimetral": not autointerssecta,
            "segmentos": segmentos_analise
        }

    @staticmethod
    def _formatar_azimute(az_deg: float) -> str:
        """Formata azimute em graus, minutos e segundos decimais (ex: 125° 30' 45.2")"""
        graus = int(az_deg)
        minutos_dec = (az_deg - graus) * 60.0
        minutos = int(minutos_dec)
        segundos = (minutos_dec - minutos) * 60.0
        return f"{graus}° {minutos:02d}' {segundos:05.2f}\""

class VertexGenerator:
    """Gerador e Sequenciador de nomes de vértice (Ex: ABCD-M-0001)"""
    
    @staticmethod
    def gerar_nome_vertice(codigo_credenciado: str, tipo_vertice: str, sequencial: int) -> str:
        """
        Gera nome do vértice 
        Exemplo: ABCD-M-0001, XYZQ-P-1010
        """
        tipo = str(tipo_vertice).upper()
        if tipo not in ['M', 'P', 'V']:
            raise ValueError(f"Tipo de vértice {tipo} inválido. Deve ser M, P ou V.")
            
        cod = str(codigo_credenciado).upper()
        if len(cod) != 4:
            raise ValueError(f"O código do credenciado deve ter 4 dígitos.")
            
        return f"{cod}-{tipo}-{sequencial:04d}"
