import math

class SigefValidator:
    """Implementa cálculo de erro Sigma e validação de limite da norma técnica do SIGEF"""
    
    # 3a Edicao limites
    LIMITES = {
        'artificial': 0.50,    # metros
        'natural': 3.00,       # metros
        'inacessivel': 7.50,   # metros
    }

    @staticmethod
    def calcular_sigma_p(sigma_phi: float, sigma_lambda: float) -> float:
        """σP = √(σφ² + σλ²)"""
        if sigma_phi is None or sigma_lambda is None:
            return None
        return math.sqrt(sigma_phi**2 + sigma_lambda**2)

    @classmethod
    def validar_conformidade(cls, sigma_p: float, tipo_limite: str) -> tuple[bool, str]:
        """Retorna (conforme: bool, mensagem_alerta: str)"""
        if sigma_p is None:
            return False, "Faltam dados σ"
            
        tipo = str(tipo_limite).lower().strip()
        if tipo not in cls.LIMITES:
            return False, f"Tipo de limite ({tipo_limite}) desconhecido."

        limite_max = cls.LIMITES[tipo]
        is_conforme = sigma_p <= limite_max

        status = "CONFORME" if is_conforme else "REPROVADO"
        msg = f"{status}: σP ({sigma_p:.4f}m) contra limite de {limite_max:.2f}m."
        return is_conforme, msg

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
            
        # Formato exige 4 zeros lpad no mínimo
        # No Topocad as vezes as pessoas não forçam os ZEROs padding mas a norma diz que sim.
        return f"{cod}-{tipo}-{sequencial:04d}"
