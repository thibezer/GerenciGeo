"""
services/processamento/vertices_virtuais.py
Módulo de cálculo analítico e propagação rigorosa de incertezas para vértices virtuais (PA1/PA2).
Padrão INCRA/SIGEF (3ª Edição) - SIRGAS 2000.
"""

from dataclasses import dataclass
from enum import Enum
import math
from typing import Tuple, Optional
import numpy as np


class LadoOffset(str, Enum):
    DIREITA = "DIREITA"
    ESQUERDA = "ESQUERDA"


@dataclass(frozen=True)
class PontoApoio:
    nome: str
    este: float
    norte: float
    altitude: float
    sigma_este: float
    sigma_norte: float
    sigma_altitude: float


@dataclass(frozen=True)
class ResultadoVerticeVirtual:
    nome: str
    este: float
    norte: float
    altitude: float
    sigma_este: float
    sigma_norte: float
    sigma_altitude: float
    sigma_planimetrico: float
    tipo_ponto: str = "V"
    metodo: str = "PA1+PA2"
    conforme_norma_incra: bool = True
    alerta: str = ""
    angulo_intersecao_graus: float = 0.0


class MotorVerticesVirtuais:
    """
    Motor matemático para determinação analítica de vértices virtuais (Tipo 'V')
    pelos métodos PA1 (Paralela/Faixa de Domínio) e PA2 (Interseção de Alinhamentos),
    com propagação estocástica rigorosa de incertezas (LPV) por matriz Jacobiana numérica.
    """
    TOLERANCIA_ARTIFICIAL = 0.50  # Limite Artificial (LA) = 0.50 m (Norma Técnica INCRA)
    EPSILON_SINGULARIDADE = 1e-7
    ANGULO_MINIMO_GRAUS = 1.0     # Rejeição de interseções extremamente oblíquas/instáveis

    @staticmethod
    def _calcular_offset_pa1(
        p1: np.ndarray, p2: np.ndarray, distancia: float, lado: LadoOffset
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        Calcula os dois pontos da diretriz paralela a partir do alinhamento do eixo.
        Sentido de avanço de p1 para p2:
        - DIREITA: [dN/L, -dE/L]
        - ESQUERDA: [-dN/L, dE/L]
        """
        delta = p2 - p1
        comprimento = float(np.linalg.norm(delta))
        if comprimento < 1e-5:
            raise ValueError("Os vértices do eixo são coincidentes ou a distância é inferior a 0.01 mm.")

        sinal = 1.0 if lado == LadoOffset.DIREITA else -1.0
        # Vetor normal unitário [dE, dN] -> [dN/L, -dE/L] para a direita
        normal_unitaria = np.array([delta[1] / comprimento, -delta[0] / comprimento])
        vetor_deslocamento = sinal * distancia * normal_unitaria

        return p1 + vetor_deslocamento, p2 + vetor_deslocamento

    @classmethod
    def _intersecao_retas_2d(
        cls, p1: np.ndarray, p2: np.ndarray, p3: np.ndarray, p4: np.ndarray
    ) -> Tuple[np.ndarray, float, float]:
        """
        Calcula o ponto de interseção bidimensional entre a reta (p1->p2) e (p3->p4).
        Retorna:
            (ponto_intersecao [E, N], denominador D, angulo_intersecao_graus)
        """
        x1, y1 = float(p1[0]), float(p1[1])
        x2, y2 = float(p2[0]), float(p2[1])
        x3, y3 = float(p3[0]), float(p3[1])
        x4, y4 = float(p4[0]), float(p4[1])

        l1 = math.hypot(x2 - x1, y2 - y1)
        l2 = math.hypot(x4 - x3, y4 - y3)
        if l1 < 1e-5 or l2 < 1e-5:
            raise ValueError("Um ou ambos os alinhamentos possuem comprimento nulo.")

        denominador = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
        if abs(denominador) < cls.EPSILON_SINGULARIDADE:
            raise ValueError("Alinhamentos paralelos ou coincidentes. Interseção indeterminada.")

        # Ângulo de interseção theta = arcsin(|D| / (L1 * L2))
        sin_theta = min(1.0, max(0.0, abs(denominador) / (l1 * l2)))
        theta_rad = math.asin(sin_theta)
        theta_graus = math.degrees(theta_rad)

        if theta_graus < cls.ANGULO_MINIMO_GRAUS:
            raise ValueError(
                f"Ângulo de interseção muito agudo ({theta_graus:.2f}° < {cls.ANGULO_MINIMO_GRAUS}°). "
                "Condicionamento numérico instável para determinação de vértice seguro."
            )

        k1 = x1 * y2 - y1 * x2
        k2 = x3 * y4 - y3 * x4

        px = (k1 * (x3 - x4) - (x1 - x2) * k2) / denominador
        py = (k1 * (y3 - y4) - (y1 - y2) * k2) / denominador

        return np.array([px, py]), denominador, theta_graus

    @classmethod
    def calcular_combo_pa1_pa2(
        cls,
        eixo_1: PontoApoio,
        eixo_2: PontoApoio,
        divisa_1: PontoApoio,
        divisa_2: PontoApoio,
        largura_faixa: float,
        lado: LadoOffset,
        nome_vertice: str = "V01",
    ) -> ResultadoVerticeVirtual:
        """
        Executa o cálculo conjugado PA1 + PA2:
        1. Desloca o eixo (eixo_1 -> eixo_2) pela largura de faixa na lateralidade informada (PA1).
        2. Intercepta a diretriz paralela resultante com a divisa confrontante (divisa_1 -> divisa_2) (PA2).
        3. Realiza a Lei de Propagação de Variâncias (LPV) via diferenciação numérica central (Jacobiana 2x8).
        4. Interpola a altitude elipsoidal h_V e propaga a incerteza vertical.
        5. Audita conformidade com a tolerância de Limite Artificial do INCRA (<= 0.50 m).
        """
        if largura_faixa < 0:
            raise ValueError("A largura da faixa de domínio não pode ser negativa.")

        p_e1 = np.array([eixo_1.este, eixo_1.norte], dtype=float)
        p_e2 = np.array([eixo_2.este, eixo_2.norte], dtype=float)
        p_d1 = np.array([divisa_1.este, divisa_1.norte], dtype=float)
        p_d2 = np.array([divisa_2.este, divisa_2.norte], dtype=float)

        # 1. Função vetorial pura para a propagação da incerteza: Y = f(X)
        def resolver_plano(X: np.ndarray) -> np.ndarray:
            pe1 = X[0:2]
            pe2 = X[2:4]
            pd1 = X[4:6]
            pd2 = X[6:8]
            off_1, off_2 = cls._calcular_offset_pa1(pe1, pe2, largura_faixa, lado)
            coords, _, _ = cls._intersecao_retas_2d(off_1, off_2, pd1, pd2)
            return coords

        # Vetor de parâmetros observados X0 (8x1)
        X0 = np.concatenate([p_e1, p_e2, p_d1, p_d2])
        coords_v, _, angulo_intersecao = cls._intersecao_retas_2d(
            *cls._calcular_offset_pa1(p_e1, p_e2, largura_faixa, lado),
            p_d1,
            p_d2,
        )

        # 2. Matriz de Variâncias-Covariâncias de Entrada (Σ_X 8x8)
        sigmas_x = np.array([
            eixo_1.sigma_este, eixo_1.sigma_norte,
            eixo_2.sigma_este, eixo_2.sigma_norte,
            divisa_1.sigma_este, divisa_1.sigma_norte,
            divisa_2.sigma_este, divisa_2.sigma_norte,
        ], dtype=float)
        Sigma_X = np.diag(sigmas_x**2)

        # 3. Cálculo da Matriz Jacobiana (J 2x8) via Diferenças Centrais
        h = 1e-5
        J = np.zeros((2, 8), dtype=float)
        for i in range(8):
            X_forward = X0.copy()
            X_backward = X0.copy()
            X_forward[i] += h
            X_backward[i] -= h
            J[:, i] = (resolver_plano(X_forward) - resolver_plano(X_backward)) / (2.0 * h)

        # 4. Propagação de Covariâncias: Σ_Y = J * Σ_X * J^T (2x2)
        Sigma_Y = J @ Sigma_X @ J.T

        sigma_este = float(np.sqrt(max(0.0, Sigma_Y[0, 0])))
        sigma_norte = float(np.sqrt(max(0.0, Sigma_Y[1, 1])))
        sigma_p = float(math.hypot(sigma_este, sigma_norte))

        # 5. Interpolação Altimétrica ao longo do vetor da divisa confrontante materializada (D1 -> D2)
        delta_divisa = p_d2 - p_d1
        norma2_divisa = float(np.dot(delta_divisa, delta_divisa))
        if norma2_divisa < 1e-6:
            t = 0.0
        else:
            t = float(np.dot(coords_v - p_d1, delta_divisa) / norma2_divisa)

        alt_v = float(divisa_1.altitude + t * (divisa_2.altitude - divisa_1.altitude))
        sigma_alt = float(math.sqrt((1.0 - t)**2 * (divisa_1.sigma_altitude**2) + (t**2) * (divisa_2.sigma_altitude**2)))

        conforme = sigma_p <= cls.TOLERANCIA_ARTIFICIAL
        alerta = "" if conforme else (
            f"Precisão planimétrica de {sigma_p:.3f} m excede o limite regulamentar do INCRA ({cls.TOLERANCIA_ARTIFICIAL:.2f} m)."
        )

        return ResultadoVerticeVirtual(
            nome=nome_vertice,
            este=round(float(coords_v[0]), 3),
            norte=round(float(coords_v[1]), 3),
            altitude=round(alt_v, 3),
            sigma_este=round(sigma_este, 4),
            sigma_norte=round(sigma_norte, 4),
            sigma_altitude=round(sigma_alt, 4),
            sigma_planimetrico=round(sigma_p, 4),
            tipo_ponto="V",
            metodo="PA1+PA2",
            conforme_norma_incra=conforme,
            alerta=alerta,
            angulo_intersecao_graus=round(angulo_intersecao, 2),
        )

    @classmethod
    def calcular_pa2_puro(
        cls,
        alinhamento1_p1: PontoApoio,
        alinhamento1_p2: PontoApoio,
        alinhamento2_p1: PontoApoio,
        alinhamento2_p2: PontoApoio,
        nome_vertice: str = "V01",
    ) -> ResultadoVerticeVirtual:
        """
        Executa o cálculo PA2 Puro (interseção analítica de 2 alinhamentos sem offset).
        Propagação estocástica por LPV Jacobiana (2x8).
        """
        p1 = np.array([alinhamento1_p1.este, alinhamento1_p1.norte], dtype=float)
        p2 = np.array([alinhamento1_p2.este, alinhamento1_p2.norte], dtype=float)
        p3 = np.array([alinhamento2_p1.este, alinhamento2_p1.norte], dtype=float)
        p4 = np.array([alinhamento2_p2.este, alinhamento2_p2.norte], dtype=float)

        def resolver_plano(X: np.ndarray) -> np.ndarray:
            pt1 = X[0:2]
            pt2 = X[2:4]
            pt3 = X[4:6]
            pt4 = X[6:8]
            coords, _, _ = cls._intersecao_retas_2d(pt1, pt2, pt3, pt4)
            return coords

        X0 = np.concatenate([p1, p2, p3, p4])
        coords_v, _, angulo_intersecao = cls._intersecao_retas_2d(p1, p2, p3, p4)

        sigmas_x = np.array([
            alinhamento1_p1.sigma_este, alinhamento1_p1.sigma_norte,
            alinhamento1_p2.sigma_este, alinhamento1_p2.sigma_norte,
            alinhamento2_p1.sigma_este, alinhamento2_p1.sigma_norte,
            alinhamento2_p2.sigma_este, alinhamento2_p2.sigma_norte,
        ], dtype=float)
        Sigma_X = np.diag(sigmas_x**2)

        h = 1e-5
        J = np.zeros((2, 8), dtype=float)
        for i in range(8):
            X_forward = X0.copy()
            X_backward = X0.copy()
            X_forward[i] += h
            X_backward[i] -= h
            J[:, i] = (resolver_plano(X_forward) - resolver_plano(X_backward)) / (2.0 * h)

        Sigma_Y = J @ Sigma_X @ J.T

        sigma_este = float(np.sqrt(max(0.0, Sigma_Y[0, 0])))
        sigma_norte = float(np.sqrt(max(0.0, Sigma_Y[1, 1])))
        sigma_p = float(math.hypot(sigma_este, sigma_norte))

        # Interpolação altimétrica média entre os dois alinhamentos
        delta1 = p2 - p1
        norma2_1 = float(np.dot(delta1, delta1))
        t1 = float(np.dot(coords_v - p1, delta1) / norma2_1) if norma2_1 > 1e-6 else 0.0
        alt_1 = float(alinhamento1_p1.altitude + t1 * (alinhamento1_p2.altitude - alinhamento1_p1.altitude))

        delta2 = p4 - p3
        norma2_2 = float(np.dot(delta2, delta2))
        t2 = float(np.dot(coords_v - p3, delta2) / norma2_2) if norma2_2 > 1e-6 else 0.0
        alt_2 = float(alinhamento2_p1.altitude + t2 * (alinhamento2_p2.altitude - alinhamento2_p1.altitude))

        alt_v = (alt_1 + alt_2) / 2.0
        sigma_alt1 = math.sqrt((1.0 - t1)**2 * (alinhamento1_p1.sigma_altitude**2) + (t1**2) * (alinhamento1_p2.sigma_altitude**2))
        sigma_alt2 = math.sqrt((1.0 - t2)**2 * (alinhamento2_p1.sigma_altitude**2) + (t2**2) * (alinhamento2_p2.sigma_altitude**2))
        sigma_alt = math.sqrt(sigma_alt1**2 + sigma_alt2**2) / 2.0

        conforme = sigma_p <= cls.TOLERANCIA_ARTIFICIAL
        alerta = "" if conforme else (
            f"Precisão planimétrica de {sigma_p:.3f} m excede o limite regulamentar do INCRA ({cls.TOLERANCIA_ARTIFICIAL:.2f} m)."
        )

        return ResultadoVerticeVirtual(
            nome=nome_vertice,
            este=round(float(coords_v[0]), 3),
            norte=round(float(coords_v[1]), 3),
            altitude=round(alt_v, 3),
            sigma_este=round(sigma_este, 4),
            sigma_norte=round(sigma_norte, 4),
            sigma_altitude=round(sigma_alt, 4),
            sigma_planimetrico=round(sigma_p, 4),
            tipo_ponto="V",
            metodo="PA2",
            conforme_norma_incra=conforme,
            alerta=alerta,
            angulo_intersecao_graus=round(angulo_intersecao, 2),
        )
