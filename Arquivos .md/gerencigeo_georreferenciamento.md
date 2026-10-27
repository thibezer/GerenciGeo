# Manifesto de Georreferenciamento Avançado — Motor de Vértices Virtuais (PA1 + PA2)

Este documento estabelece a fundamentação matemática analítica, propagação estocástica de incertezas e a arquitetura técnica do **Motor de Vértices Virtuais (Tipo 'V')** do ecossistema GerenciGeo, em conformidade estrita com a Norma Técnica para Georreferenciamento de Imóveis Rurais do INCRA/SIGEF (3ª Edição).

---

## 1. Fundamentação e Métodos de Posicionamento

Na rotina cadastral rural do SIGEF, vértices do tipo **V** (Vértices Virtuais) são definidos de forma analítica e indireta a partir de apoios físicos ocupados (Marcos 'M' ou Pontos 'P'). O motor do GerenciGeo implementa o cálculo conjugado:

- **PA1 (Paralela / Faixa de Domínio)**: Translação vetorial normalizada (offset ortogonal) do eixo de rodovias, ferrovias ou servidões administrativas.
- **PA2 (Interseção de Alinhamentos)**: Resolução determinística da interseção de retas bidimensionais, fixando o vértice $V$ no cruzamento da paralela da faixa de domínio com a divisa confrontante materializada ou no cruzamento de dois alinhamentos arbitrários.

---

## 2. Formulação Analítica

### 2.1 PA1: Offset Vetorial do Eixo
Dado o vetor de avanço do eixo $E_1(E_{E1}, N_{E1}) \to E_2(E_{E2}, N_{E2})$ com comprimento $L = \sqrt{\Delta E^2 + \Delta N^2}$:
- Normal unitária à direita ($s = +1$): $\hat{n} = \begin{bmatrix} \frac{\Delta N}{L} \\ -\frac{\Delta E}{L} \end{bmatrix}$
- Normal unitária à esquerda ($s = -1$): $\hat{n} = \begin{bmatrix} -\frac{\Delta N}{L} \\ \frac{\Delta E}{L} \end{bmatrix}$
- Pontos deslocados: $E'_i = E_i + s \cdot d \cdot \hat{n}$

### 2.2 PA2: Interseção Determinística de Retas 2D
Dadas as retas $(P_1 \to P_2)$ e $(P_3 \to P_4)$:
$$D = (x_1 - x_2)(y_3 - y_4) - (y_1 - y_2)(x_3 - x_4)$$
$$K_1 = x_1 y_2 - y_1 x_2, \quad K_2 = x_3 y_4 - y_3 x_4$$
$$E_V = \frac{K_1(x_3 - x_4) - (x_1 - x_2)K_2}{D}, \quad N_V = \frac{K_1(y_3 - y_4) - (y_1 - y_2)K_2}{D}$$

**Salvaguardas Numéricas**:
1. Rejeição de retas paralelas ou coincidentes se $|D| < 10^{-7}$.
2. Rejeição de ângulos muito oblíquos $\theta = \arcsin\left(\frac{|D|}{L_1 L_2}\right) < 1^\circ$ para evitar singularidades estocásticas.

### 2.3 Interpolação Altimétrica Topográfica
A altitude elipsoidal $h_V$ é interpolada parametrizada ao longo do vetor da divisa materializada ($D_1 \to D_2$):
$$t = \frac{(E_V - E_{D1})\Delta E_D + (N_V - N_{D1})\Delta N_D}{\Delta E_D^2 + \Delta N_D^2}$$
$$h_V = h_{D1} + t \cdot (h_{D2} - h_{D1})$$

---

## 3. Lei de Propagação de Variâncias (LPV)

O preenchimento dos desvios-padrão $\sigma_E, \sigma_N, \sigma_h$ exigidos pelo SIGEF decorre da matriz de covariâncias de entrada $\Sigma_X$ ($8 \times 8$) dos 4 vértices de apoio:
$$\Sigma_X = \operatorname{diag}\left(\sigma_{E_{E1}}^2, \sigma_{N_{E1}}^2, \sigma_{E_{E2}}^2, \sigma_{N_{E2}}^2, \sigma_{E_{D1}}^2, \sigma_{N_{D1}}^2, \sigma_{E_{D2}}^2, \sigma_{N_{D2}}^2\right)$$

A matriz Jacobiana $J$ ($2 \times 8$) é calculada numericamente por diferenças centrais ($h = 10^{-5}$):
$$J_{j, i} = \frac{f_j(X_0 + h \cdot e_i) - f_j(X_0 - h \cdot e_i)}{2h}$$

Propagação de covariâncias no plano:
$$\Sigma_Y = J \cdot \Sigma_X \cdot J^T = \begin{bmatrix} \sigma_{E_V}^2 & \sigma_{E_V N_V} \\ \sigma_{N_V E_V} & \sigma_{N_V}^2 \end{bmatrix}$$
$$\sigma_P = \sqrt{\sigma_{E_V}^2 + \sigma_{N_V}^2} \le 0,50\,\text{m (Tolerância Limite Artificial INCRA)}$$

---

## 4. Endpoints da API FastAPI

### 4.1 Cálculo do Combo PA1+PA2
- **Rota**: `POST /levantamentos/{id}/matriculas/{matricula_id}/vertices-virtuais/calcular-combo-pa1-pa2`
- **Payload**:
```json
{
  "eixo_inicio_id": 101,
  "eixo_fim_id": 102,
  "divisa_inicio_id": 201,
  "divisa_fim_id": 202,
  "largura_faixa": 20.0,
  "lado": "DIREITA",
  "nome_vertice": "V01"
}
```

### 4.2 Cálculo PA2 Puro
- **Rota**: `POST /levantamentos/{id}/matriculas/{matricula_id}/vertices-virtuais/calcular-pa2-puro`
- **Payload**:
```json
{
  "alinhamento1_inicio_id": 101,
  "alinhamento1_fim_id": 102,
  "alinhamento2_inicio_id": 201,
  "alinhamento2_fim_id": 202,
  "nome_vertice": "V01"
}
```

### 4.3 Confirmação e Inserção Atômica
- **Rota**: `POST /levantamentos/{id}/matriculas/{matricula_id}/vertices-virtuais/confirmar`
- Insere atômico em `pontos` com `tipo_ponto = 'V'`, `status_ponto = 'CORRIGIDO'`, `camada_ciclo_vida = 'PERIMETRO'`, conversão automática para SIRGAS 2000 Geográficas (EPSG:4674) e registro no histórico físico de campo.

---

## 5. Integração com AutoCAD / TopoCAD2000 (AutoLISP)

Macro disponível para o Clipboard Estruturado:
```lisp
(defun c:INSVERTICEV ( / pE pN pZ pt nome)
  (setq nome "%NOME_VERTICE%")
  (setq pE %ESTE%)
  (setq pN %NORTE%)
  (setq pZ %ALTITUDE%)
  (setq pt (list pE pN pZ))
  (if (not (tblsearch "LAYER" "GEO_VERTICE_VIRTUAL"))
    (command "-LAYER" "M" "GEO_VERTICE_VIRTUAL" "C" "1" "" "")
  )
  (setvar "CLAYER" "GEO_VERTICE_VIRTUAL")
  (command "POINT" pt)
  (command "-TEXT" "J" "BL" (list (+ pE 0.5) (+ pN 0.5) pZ) 1.5 0.0 (strcat nome " (V)"))
  (princ)
)
```
