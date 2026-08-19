;;; =========================================================================
;;; SUÍTE DE SINALIZAÇÃO VIÁRIA E CICLOVIAS - V7 (CONTRAN)
;;; Suporte a Polilinhas, Arcos e Linhas com Geometria e Camadas Dinâmicas
;;; =========================================================================

(vl-load-com)

;;; =========================================================================
;;; 1. COMANDO PRINCIPAL: FAIXAS DA VIA COM ESTACIONAMENTO E EIXO BALANCEADO
;;; =========================================================================

(defun c:FAIXASRUA ( / sel eName wTotal respEst ladoEst wEst respEixo tipoEixo
                       dashScale objAxis doc acadObj modelSpace
                       oldCmd oldError oldGapType createdEnts totalGrupos
                       wCirc wFaixa halfW )
  (setq acadObj (vlax-get-acad-object))
  (setq doc (vla-get-ActiveDocument acadObj))
  (setq modelSpace (vla-get-ModelSpace doc))
  (setq oldCmd (getvar "CMDECHO"))
  (setq oldGapType (getvar "OFFSETGAPTYPE"))
  (setq oldError *error*)

  (defun *error* (msg)
    (if (and msg (/= msg "Function cancelled"))
      (princ (strcat "\n[FAIXASRUA] Erro: " msg))
    )
    (setvar "OFFSETGAPTYPE" oldGapType)
    (setvar "CMDECHO" oldCmd)
    (vl-catch-all-apply 'vla-EndUndoMark (list doc))
    (setq *error* oldError)
    (princ)
  )

  (setvar "CMDECHO" 0)
  (makeViaLayers doc)
  (avisarUnidadeFaixas)

  ;; 1. Largura Total da Via
  (setq wTotal (getreal "\nInforme a largura total da rua (m) <10.00>: "))
  (if (null wTotal) (setq wTotal 10.00))

  ;; 2. Configuração do Estacionamento
  (initget "D E N")
  (setq respEst (getkword "\nLado das vagas de estacionamento [Direito / Esquerdo / Nenhum] <Direito>: "))
  (if (null respEst) (setq respEst "D"))
  (setq ladoEst respEst)

  (setq wEst 0.0)
  (if (/= ladoEst "N")
    (progn
      (setq wEst (getreal "\nInforme a largura da faixa de estacionamento (m) <2.20>: "))
      (if (null wEst) (setq wEst 2.20))
      (if (>= wEst wTotal)
        (progn
          (princ "\n[AVISO] Largura do estacionamento maior ou igual à da rua! Ajustado para 2.20m.")
          (setq wEst 2.20)
        )
      )
    )
  )

  ;; 3. Tipo de Sinalização do Eixo
  (initget "D U N")
  (setq respEixo (getkword "\nTipo de eixo da via [Mão Dupla (Amarelo) / Mão Única (Branco) / Nenhum] <Dupla>: "))
  (if (null respEixo) (setq respEixo "D"))
  (setq tipoEixo respEixo)

  (setq dashScale 2.0)
  (if (/= tipoEixo "N")
    (progn
      (setq dashScale (getreal "\nInforme a escala do tracejado do eixo <2.0>: "))
      (if (null dashScale) (setq dashScale 2.0))
    )
  )

  ;; Resumo do dimensionamento no console
  (setq wCirc (- wTotal wEst))
  (setq wFaixa (/ wCirc 2.0))
  (princ (strcat "\n[FAIXASRUA] Configuração: Rua = " (rtos wTotal 2 2) "m"
                 (if (/= ladoEst "N")
                   (strcat " | Estacionamento (" (if (= ladoEst "D") "Direito" "Esquerdo") ") = " (rtos wEst 2 2) "m")
                   " | Sem Estacionamento")
                 " | Pista útil = " (rtos wCirc 2 2) "m (2 faixas de " (rtos wFaixa 2 2) "m)"))

  (vla-StartUndoMark doc)
  (setq totalGrupos 0)

  (princ "\nSelecione o Eixo Guia da Rua (Polilinha, Arco ou Linha) (ENTER para finalizar): ")
  (setq sel (entsel))

  (while sel
    (setq eName (car sel))
    (setq objAxis (obterEixoComoLwpolyline eName))

    (if (null objAxis)
      (princ "\n[AVISO] Entidade ignorada: selecione uma POLILINHA, ARCO ou LINHA.")
      (progn
        (setq createdEnts (gerarSinalizacaoVia objAxis wTotal ladoEst wEst tipoEixo dashScale))
        (vla-delete objAxis)
        (if createdEnts
          (progn
            (criarGrupoVia doc "VIA" createdEnts)
            (setq totalGrupos (1+ totalGrupos))
          )
        )
      )
    )

    (princ "\nSelecione o próximo Eixo Guia (ENTER para finalizar): ")
    (setq sel (entsel))
  )

  (setvar "OFFSETGAPTYPE" oldGapType)
  (vla-EndUndoMark doc)

  (if (> totalGrupos 0)
    (princ (strcat "\n[OK] " (itoa totalGrupos) " via(s) gerada(s) com sucesso!"))
    (princ "\nNenhuma entidade foi processada.")
  )

  (setvar "CMDECHO" oldCmd)
  (setq *error* oldError)
  (princ)
)

(defun c:FAIXAS () (c:FAIXASRUA))
(defun c:VIA () (c:FAIXASRUA))

;;; =========================================================================
;;; 2. ROTINAS DE CICLOFAIXA, TRAVESSIA E PICTOGRAMAS
;;; =========================================================================

;; --- 2.1 CICLOFAIXA CONTÍNUA ---
(defun c:CICLOFAIXA ( / sel eName w dashScale objAxis doc acadObj modelSpace
                         oldCmd oldError createdEnts totalGrupos )
  (setq acadObj (vlax-get-acad-object))
  (setq doc (vla-get-ActiveDocument acadObj))
  (setq modelSpace (vla-get-ModelSpace doc))
  (setq oldCmd (getvar "CMDECHO"))
  (setq oldError *error*)

  (defun *error* (msg)
    (if (and msg (/= msg "Function cancelled"))
      (princ (strcat "\n[CICLOFAIXA] Erro: " msg))
    )
    (setvar "CMDECHO" oldCmd)
    (vl-catch-all-apply 'vla-EndUndoMark (list doc))
    (setq *error* oldError)
    (princ)
  )

  (setvar "CMDECHO" 0)
  (makeCicloLayers doc)
  (avisarUnidadeFaixas)

  (setq w (getreal "\nInforme a largura total da ciclofaixa (m) <2.50>: "))
  (if (null w) (setq w 2.50))

  (setq dashScale (getreal "\nInforme a escala do tracejado amarelo <2.0>: "))
  (if (null dashScale) (setq dashScale 2.0))

  (vla-StartUndoMark doc)
  (setq totalGrupos 0)

  (princ "\nSelecione o Eixo da Ciclofaixa (Polilinha, Arco ou Linha) (ENTER para finalizar): ")
  (setq sel (entsel))

  (while sel
    (setq eName (car sel))
    (setq objAxis (obterEixoComoLwpolyline eName))

    (if (null objAxis)
      (princ "\n[AVISO] Entidade ignorada: selecione uma POLILINHA, ARCO ou LINHA.")
      (progn
        (setq createdEnts (gerarSinalizacaoCiclo objAxis w T dashScale nil 1.0 0.10))
        (vla-delete objAxis)
        (criarGrupoVia doc "CICLOFAIXA" createdEnts)
        (setq totalGrupos (1+ totalGrupos))
      )
    )

    (princ "\nSelecione o próximo Eixo (ENTER para finalizar): ")
    (setq sel (entsel))
  )

  (vla-EndUndoMark doc)
  (if (> totalGrupos 0)
    (princ (strcat "\n[OK] " (itoa totalGrupos) " ciclofaixa(s) gerada(s) com sucesso!"))
    (princ "\nNenhuma entidade foi processada.")
  )

  (setvar "CMDECHO" oldCmd)
  (setq *error* oldError)
  (princ)
)

;; --- 2.2 TRAVESSIA DE CICLOFAIXA ---
(defun c:CICLOTRAVESSIA ( / sel eName w dashScale objAxis doc acadObj modelSpace
                             oldCmd oldError createdEnts totalGrupos )
  (setq acadObj (vlax-get-acad-object))
  (setq doc (vla-get-ActiveDocument acadObj))
  (setq modelSpace (vla-get-ModelSpace doc))
  (setq oldCmd (getvar "CMDECHO"))
  (setq oldError *error*)

  (defun *error* (msg)
    (if (and msg (/= msg "Function cancelled"))
      (princ (strcat "\n[CICLOTRAVESSIA] Erro: " msg))
    )
    (setvar "CMDECHO" oldCmd)
    (vl-catch-all-apply 'vla-EndUndoMark (list doc))
    (setq *error* oldError)
    (princ)
  )

  (setvar "CMDECHO" 0)
  (makeCicloLayers doc)
  (avisarUnidadeFaixas)

  (setq w (getreal "\nInforme a largura da travessia (m) <2.50>: "))
  (if (null w) (setq w 2.50))

  (setq dashScale (getreal "\nInforme a escala do tracejado do bordo branco <1.5>: "))
  (if (null dashScale) (setq dashScale 1.5))

  (vla-StartUndoMark doc)
  (setq totalGrupos 0)

  (princ "\nSelecione o Eixo da Travessia (Polilinha, Arco ou Linha) (ENTER para finalizar): ")
  (setq sel (entsel))

  (while sel
    (setq eName (car sel))
    (setq objAxis (obterEixoComoLwpolyline eName))

    (if (null objAxis)
      (princ "\n[AVISO] Entidade ignorada: selecione uma POLILINHA, ARCO ou LINHA.")
      (progn
        (setq createdEnts (gerarSinalizacaoCiclo objAxis w nil 1.0 T dashScale 0.10))
        (vla-delete objAxis)
        (criarGrupoVia doc "CICLOTRAVESSIA" createdEnts)
        (setq totalGrupos (1+ totalGrupos))
      )
    )

    (princ "\nSelecione o próximo Eixo (ENTER para finalizar): ")
    (setq sel (entsel))
  )

  (vla-EndUndoMark doc)
  (if (> totalGrupos 0)
    (princ (strcat "\n[OK] " (itoa totalGrupos) " travessia(s) gerada(s) com sucesso!"))
    (princ "\nNenhuma entidade foi processada.")
  )

  (setvar "CMDECHO" oldCmd)
  (setq *error* oldError)
  (princ)
)

;; --- 2.3 PICTOGRAMAS AUTOMÁTICOS ---
(defun c:CICLOPICTOS ( / sel eName curve doc acadObj oldCmd oldError
                         bidirecional blkName blkFile intervalo afastamento
                         escala margem anguloBase
                         modelSpace resp totalGrupos createdEnts )

  (setq acadObj (vlax-get-acad-object))
  (setq doc (vla-get-ActiveDocument acadObj))
  (setq modelSpace (vla-get-ModelSpace doc))
  (setq oldCmd (getvar "CMDECHO"))
  (setq oldError *error*)

  (defun *error* (msg)
    (if (and msg (/= msg "Function cancelled"))
      (princ (strcat "\n[CICLOPICTOS] Erro: " msg))
    )
    (setvar "CMDECHO" oldCmd)
    (vl-catch-all-apply 'vla-EndUndoMark (list doc))
    (setq *error* oldError)
    (princ)
  )

  (setvar "CMDECHO" 0)
  (avisarUnidadeFaixas)

  (initget "B U")
  (setq resp (getkword "\nSentido da ciclofaixa [Bidirecional/Unidirecional] <Bidirecional>: "))
  (if (null resp) (setq resp "B"))
  (setq bidirecional (= resp "B"))

  (setq blkName "ciclofaixa-grupo")

  (if (not (tblsearch "BLOCK" blkName))
    (progn
      (princ (strcat "\nBloco \"" blkName "\" não está carregado neste desenho."))
      (setq blkFile (getfiled (strcat "Selecione o arquivo DWG para " blkName) "" "dwg" 0))
      (if blkFile
        (progn
          (command "_.-INSERT" blkFile "0,0" "1" "1" "0")
          (command "_.ERASE" "_L" "")
        )
        (setq blkName nil)
      )
    )
  )

  (if (null blkName)
    (princ "\nOperação cancelada: nenhum bloco disponível para inserir.")
    (progn
      (setq intervalo (getreal "\nIntervalo entre pictogramas ao longo do eixo (m) <20.0>: "))
      (if (null intervalo) (setq intervalo 20.0))

      (setq escala (getreal "\nFator de escala de inserção do bloco <1.0>: "))
      (if (null escala) (setq escala 1.0))

      (setq margem (getreal (strcat "\nMargem mínima nas extremidades do trecho (m) <"
                                     (rtos (/ intervalo 2.0) 2 1) ">: ")))
      (if (null margem) (setq margem (/ intervalo 2.0)))

      (setq afastamento 0.0)
      (if bidirecional
        (progn
          (setq afastamento (getreal "\nAfastamento do eixo para cada lado (m) <0.60>: "))
          (if (null afastamento) (setq afastamento 0.60))
        )
      )

      (setq anguloBase (/ pi -2.0))

      (vla-StartUndoMark doc)
      (setq totalGrupos 0)

      (princ "\nSelecione o Eixo de referência (Polilinha, Arco ou Linha) (ENTER para finalizar): ")
      (setq sel (entsel))

      (while sel
        (setq eName (car sel))
        (setq curve (vlax-ename->vla-object eName))

        (if (vl-catch-all-error-p (vl-catch-all-apply 'vlax-curve-getStartPoint (list curve)))
          (princ "\n[AVISO] Entidade ignorada: não é uma curva válida.")
          (progn
            (setq createdEnts (inserirPictosEixo modelSpace curve blkName bidirecional intervalo
                                                  afastamento escala margem anguloBase))
            (if createdEnts
              (progn
                (criarGrupoVia doc "PICTOS" createdEnts)
                (setq totalGrupos (1+ totalGrupos))
              )
              (princ "\n[AVISO] Eixo muito curto; nada inserido para esta entidade.")
            )
          )
        )

        (princ "\nSelecione o próximo Eixo (ENTER para finalizar): ")
        (setq sel (entsel))
      )

      (vla-EndUndoMark doc)
      (if (> totalGrupos 0)
        (princ (strcat "\n[OK] Pictogramas inseridos em " (itoa totalGrupos) " trecho(s)."))
        (princ "\nNenhum trecho processado.")
      )
    )
  )

  (setvar "CMDECHO" oldCmd)
  (setq *error* oldError)
  (princ)
)

;;; =========================================================================
;;; 3. CÁLCULOS GEOMÉTRICOS DE SINALIZAÇÃO VIÁRIA (FAIXASRUA)
;;; =========================================================================

(defun gerarSinalizacaoVia (objAxis wTotal ladoEst wEst tipoEixo dashScale
                             / halfW wCirc wFaixa offBordoEsq offBordoDir
                               offEstac offEixo createdEnts rEsq rDir rEst rEixo
                               lyrEixo oldGapType )
  (setq oldGapType (getvar "OFFSETGAPTYPE"))
  (setvar "OFFSETGAPTYPE" 1)

  (setq halfW (/ wTotal 2.0))
  (if (= ladoEst "N")
    (setq wEst 0.0)
  )
  (setq wCirc (- wTotal wEst))
  (setq wFaixa (/ wCirc 2.0))
  (setq createdEnts '())

  ;; Offsets calculados a partir do eixo base:
  ;; Lado Esquerdo = Positivo (+) | Lado Direito = Negativo (-)
  (setq offBordoEsq halfW)
  (setq offBordoDir (- halfW))

  ;; Linha de Estacionamento
  (setq offEstac nil)
  (cond
    ((= ladoEst "D")
     (setq offEstac (- (- halfW wEst))))  ; Deslocamento para o lado direito
    ((= ladoEst "E")
     (setq offEstac (- halfW wEst)))      ; Deslocamento para o lado esquerdo
  )

  ;; Novo Eixo da Pista Útil (Centro de wCirc)
  (setq offEixo 0.0)
  (cond
    ((= ladoEst "D")
     ;; Desloca em direção à esquerda para equilibrar as 2 faixas
     (setq offEixo (- halfW wFaixa)))
    ((= ladoEst "E")
     ;; Desloca em direção à direita para equilibrar as 2 faixas
     (setq offEixo (- (- halfW wFaixa))))
    ((= ladoEst "N")
     (setq offEixo 0.0))
  )

  ;; 1. GERAÇÃO DO BORDO ESQUERDO (+halfW)
  (setq rEsq (vl-catch-all-apply 'vlax-invoke (list objAxis 'Offset offBordoEsq)))
  (if (not (vl-catch-all-error-p rEsq))
    (foreach item rEsq
      (vla-put-Layer item "SINAL_BORDO")
      (if (vlax-property-available-p item 'ConstantWidth)
        (vla-put-ConstantWidth item 0.10)
      )
      (setq createdEnts (cons item createdEnts))
    )
    (princ (strcat "\n[AVISO] Falha ao gerar o bordo esquerdo em +" (rtos offBordoEsq 2 2) "m."))
  )

  ;; 2. GERAÇÃO DO BORDO DIREITO (-halfW)
  (setq rDir (vl-catch-all-apply 'vlax-invoke (list objAxis 'Offset offBordoDir)))
  (if (not (vl-catch-all-error-p rDir))
    (foreach item rDir
      (vla-put-Layer item "SINAL_BORDO")
      (if (vlax-property-available-p item 'ConstantWidth)
        (vla-put-ConstantWidth item 0.10)
      )
      (setq createdEnts (cons item createdEnts))
    )
    (princ (strcat "\n[AVISO] Falha ao gerar o bordo direito em " (rtos offBordoDir 2 2) "m."))
  )

  ;; 3. GERAÇÃO DA LINHA CONTÍNUA DO ESTACIONAMENTO (se houver)
  (if offEstac
    (progn
      (setq rEst (vl-catch-all-apply 'vlax-invoke (list objAxis 'Offset offEstac)))
      (if (not (vl-catch-all-error-p rEst))
        (foreach item rEst
          (vla-put-Layer item "SINAL_ESTACIONAMENTO")
          (if (vlax-property-available-p item 'ConstantWidth)
            (vla-put-ConstantWidth item 0.10)
          )
          (setq createdEnts (cons item createdEnts))
        )
        (princ (strcat "\n[AVISO] Falha ao gerar a linha de estacionamento em " (rtos offEstac 2 2) "m."))
      )
    )
  )

  ;; 4. GERAÇÃO DO EIXO CENTRAL BALANCEADO DA PISTA ÚTIL
  (if (/= tipoEixo "N")
    (progn
      (setq lyrEixo (if (= tipoEixo "D") "SINAL_EIXO_DUPLO" "SINAL_EIXO_UNICO"))
      
      (if (< (abs offEixo) 0.001)
        ;; Eixo perfeitamente centralizado no eixo base (copia direta)
        (progn
          (setq objCopia (vla-copy objAxis))
          (vla-put-Layer objCopia lyrEixo)
          (vla-put-Linetype objCopia "DASHED")
          (vla-put-LinetypeScale objCopia dashScale)
          (if (vlax-property-available-p objCopia 'ConstantWidth)
            (vla-put-ConstantWidth objCopia 0.10)
          )
          (if (vlax-property-available-p objCopia 'LinetypeGeneration)
            (vla-put-LinetypeGeneration objCopia :vlax-true)
          )
          (setq createdEnts (cons objCopia createdEnts))
        )
        ;; Eixo recalculado e deslocado no meio de wCirc
        (progn
          (setq rEixo (vl-catch-all-apply 'vlax-invoke (list objAxis 'Offset offEixo)))
          (if (not (vl-catch-all-error-p rEixo))
            (foreach item rEixo
              (vla-put-Layer item lyrEixo)
              (vla-put-Linetype item "DASHED")
              (vla-put-LinetypeScale item dashScale)
              (if (vlax-property-available-p item 'ConstantWidth)
                (vla-put-ConstantWidth item 0.10)
              )
              (if (vlax-property-available-p item 'LinetypeGeneration)
                (vla-put-LinetypeGeneration item :vlax-true)
              )
              (setq createdEnts (cons item createdEnts))
            )
            (princ (strcat "\n[AVISO] Falha ao gerar o eixo da via em " (rtos offEixo 2 2) "m."))
          )
        )
      )
    )
  )

  (setvar "OFFSETGAPTYPE" oldGapType)
  createdEnts
)

;;; =========================================================================
;;; 4. FUNÇÕES AUXILIARES DE CONVERSÃO E GEOMETRIA
;;; =========================================================================

;; Converte um ARC (DXF) para LWPOLYLINE equivalente mantendo a curvatura exata
(defun arcParaLwpolyline (eName / dxf obj aStart aEnd sweep bulge ptStart ptEnd layer newEnt)
  (setq dxf (entget eName))
  (setq obj (vlax-ename->vla-object eName))
  (setq aStart (cdr (assoc 50 dxf)))
  (setq aEnd   (cdr (assoc 51 dxf)))
  (setq layer  (cdr (assoc 8 dxf)))

  ;; Ângulo central (sweep angle) no sentido anti-horário
  (setq sweep (- aEnd aStart))
  (if (<= sweep 0.0)
    (setq sweep (+ sweep (* 2.0 pi)))
  )
  ;; Bulge = tan(sweep / 4)
  (setq bulge (/ (sin (/ sweep 4.0)) (cos (/ sweep 4.0))))

  (setq ptStart (vlax-curve-getStartPoint obj))
  (setq ptEnd   (vlax-curve-getEndPoint obj))

  (if (entmake
        (list
          '(0 . "LWPOLYLINE")
          '(100 . "AcDbEntity")
          '(100 . "AcDbPolyline")
          '(90 . 2)
          '(70 . 0)
          (cons 8 layer)
          (list 10 (car ptStart) (cadr ptStart))
          (cons 42 bulge)
          (list 10 (car ptEnd) (cadr ptEnd))
          '(42 . 0.0)
        )
      )
    (progn
      (setq newEnt (entlast))
      (entdel eName)
      (vlax-ename->vla-object newEnt)
    )
    nil
  )
)

;; Converte uma LINE para LWPOLYLINE de 2 vértices
(defun lineParaLwpolyline (eName / dxf obj ptStart ptEnd layer newEnt)
  (setq dxf (entget eName))
  (setq obj (vlax-ename->vla-object eName))
  (setq layer (cdr (assoc 8 dxf)))
  (setq ptStart (vlax-curve-getStartPoint obj))
  (setq ptEnd   (vlax-curve-getEndPoint obj))

  (if (entmake
        (list
          '(0 . "LWPOLYLINE")
          '(100 . "AcDbEntity")
          '(100 . "AcDbPolyline")
          '(90 . 2)
          '(70 . 0)
          (cons 8 layer)
          (list 10 (car ptStart) (cadr ptStart))
          '(42 . 0.0)
          (list 10 (car ptEnd) (cadr ptEnd))
          '(42 . 0.0)
        )
      )
    (progn
      (setq newEnt (entlast))
      (entdel eName)
      (vlax-ename->vla-object newEnt)
    )
    nil
  )
)

;; Garante que a entidade selecionada (LWPOLYLINE, ARC, LINE ou POLYLINE) seja retornada como VLA-Object de LWPOLYLINE
(defun obterEixoComoLwpolyline (eName / dxf entType)
  (setq dxf (entget eName))
  (setq entType (cdr (assoc 0 dxf)))
  (cond
    ((= entType "LWPOLYLINE")
     (vlax-ename->vla-object eName)
    )
    ((= entType "ARC")
     (arcParaLwpolyline eName)
    )
    ((= entType "LINE")
     (lineParaLwpolyline eName)
    )
    ((= entType "POLYLINE")
     (vl-cmdf "_.CONVERT" "_P" "_S" eName "")
     (vlax-ename->vla-object (entlast))
    )
    (t nil)
  )
)

;;; =========================================================================
;;; 5. FUNÇÕES AUXILIARES DE CICLOVIA E PICTOGRAMAS
;;; =========================================================================

(defun gerarSinalizacaoCiclo (objAxis w criarEixoAmarelo dashScaleEixo bordoTracejado dashScaleBordo bordoWidth
                               / halfW objRed objYellow r1 r2 off1 off2 createdEnts okOff1 okOff2 oldGapType)
  (setq oldGapType (getvar "OFFSETGAPTYPE"))
  (setvar "OFFSETGAPTYPE" 1)

  (setq halfW (/ w 2.0))
  (setq createdEnts '())

  ;; 1. Fundo vermelho
  (setq objRed (vla-copy objAxis))
  (vla-put-Layer objRed "SINAL_CICLO_FUNDO")
  (if (vlax-property-available-p objRed 'ConstantWidth)
    (vla-put-ConstantWidth objRed w)
  )
  (setq createdEnts (cons objRed createdEnts))

  ;; 2. Eixo amarelo tracejado
  (if criarEixoAmarelo
    (progn
      (setq objYellow (vla-copy objAxis))
      (vla-put-Layer objYellow "SINAL_CICLO_EIXO")
      (vla-put-Linetype objYellow "DASHED")
      (vla-put-LinetypeScale objYellow dashScaleEixo)
      (if (vlax-property-available-p objYellow 'ConstantWidth)
        (vla-put-ConstantWidth objYellow 0.10)
      )
      (if (vlax-property-available-p objYellow 'LinetypeGeneration)
        (vla-put-LinetypeGeneration objYellow :vlax-true)
      )
      (setq createdEnts (cons objYellow createdEnts))
    )
  )

  ;; 3. Bordo +halfW
  (setq r1 (vl-catch-all-apply 'vlax-invoke (list objAxis 'Offset halfW)))
  (setq okOff1 (not (vl-catch-all-error-p r1)))
  (if okOff1
    (progn
      (setq off1 r1)
      (foreach item off1
        (vla-put-Layer item "SINAL_CICLO_BORDO")
        (if (vlax-property-available-p item 'ConstantWidth)
          (vla-put-ConstantWidth item bordoWidth)
        )
        (if bordoTracejado
          (progn
            (vla-put-Linetype item "DASHED")
            (vla-put-LinetypeScale item dashScaleBordo)
            (if (vlax-property-available-p item 'LinetypeGeneration)
              (vla-put-LinetypeGeneration item :vlax-true)
            )
          )
        )
        (setq createdEnts (cons item createdEnts))
      )
    )
    (princ (strcat "\n[AVISO] Falha ao gerar o bordo em +" (rtos halfW 2 2) "m."))
  )

  ;; 4. Bordo -halfW
  (setq r2 (vl-catch-all-apply 'vlax-invoke (list objAxis 'Offset (- halfW))))
  (setq okOff2 (not (vl-catch-all-error-p r2)))
  (if okOff2
    (progn
      (setq off2 r2)
      (foreach item off2
        (vla-put-Layer item "SINAL_CICLO_BORDO")
        (if (vlax-property-available-p item 'ConstantWidth)
          (vla-put-ConstantWidth item bordoWidth)
        )
        (if bordoTracejado
          (progn
            (vla-put-Linetype item "DASHED")
            (vla-put-LinetypeScale item dashScaleBordo)
            (if (vlax-property-available-p item 'LinetypeGeneration)
              (vla-put-LinetypeGeneration item :vlax-true)
            )
          )
        )
        (setq createdEnts (cons item createdEnts))
      )
    )
    (princ (strcat "\n[AVISO] Falha ao gerar o bordo em -" (rtos halfW 2 2) "m."))
  )

  (setvar "OFFSETGAPTYPE" oldGapType)
  createdEnts
)

(defun inserirPictosEixo (modelSpace curve blkName bidirecional intervalo afastamento escala margem anguloBase
                           / totalLen dist param deriv tangAngle ang1 ang2 perpAngRight perpAngLeft pt pt1 pt2 obj1 obj2 createdEnts)
  (setq createdEnts '())
  (setq totalLen (vlax-curve-getDistAtParam curve (vlax-curve-getEndParam curve)))

  (if (> totalLen (* margem 2.0))
    (progn
      (setq dist margem)
      (while (<= dist (- totalLen margem))
        (setq param     (vlax-curve-getParamAtDist curve dist))
        (setq pt        (vlax-curve-getPointAtParam curve param))
        (setq deriv     (vlax-curve-getFirstDeriv curve param))
        
        (setq tangAngle (atan (cadr deriv) (car deriv)))
        (setq perpAngRight (- tangAngle (/ pi 2.0)))
        (setq perpAngLeft  (+ tangAngle (/ pi 2.0)))

        (setq ang1 (+ tangAngle anguloBase))
        (setq ang2 (+ tangAngle pi anguloBase))

        (if bidirecional
          (progn
            (setq pt1 (polar pt perpAngRight afastamento))
            (setq obj1 (vla-InsertBlock modelSpace (vlax-3d-point pt1) blkName escala escala escala ang1))
            (setq createdEnts (cons obj1 createdEnts))

            (setq pt2 (polar pt perpAngLeft afastamento))
            (setq obj2 (vla-InsertBlock modelSpace (vlax-3d-point pt2) blkName escala escala escala ang2))
            (setq createdEnts (cons obj2 createdEnts))
          )
          (progn
            (setq obj1 (vla-InsertBlock modelSpace (vlax-3d-point pt) blkName escala escala escala ang1))
            (setq createdEnts (cons obj1 createdEnts))
          )
        )
        (setq dist (+ dist intervalo))
      )
    )
  )
  createdEnts
)

;;; =========================================================================
;;; 6. GERENCIAMENTO DE CAMADAS (LAYERS) E GRUPOS
;;; =========================================================================

(defun criarGrupoVia (doc prefixo createdEnts / grpObj grpName sarr i n)
  (if createdEnts
    (progn
      (setq grpName (strcat prefixo "_" (vla-get-Handle (car createdEnts))))
      (setq grpObj (vla-Add (vla-get-Groups doc) grpName))
      (setq n (length createdEnts))
      (setq sarr (vlax-make-safearray vlax-vbObject (cons 0 (1- n))))
      (setq i 0)
      (foreach o createdEnts
        (vlax-safearray-put-element sarr i o)
        (setq i (1+ i))
      )
      (vla-AppendItems grpObj sarr)
      grpObj
    )
  )
)

(defun criarFaixasLayer (doc lyrName lyrColor / lyrObj)
  (if (not (tblsearch "LAYER" lyrName))
    (command "-LAYER" "M" lyrName "C" lyrColor lyrName "")
  )
  (setq lyrObj (vl-catch-all-apply 'vla-item (list (vla-get-Layers doc) lyrName)))
  (if (not (vl-catch-all-error-p lyrObj))
    (progn
      (if (= (vla-get-Lock lyrObj) :vlax-true)
        (princ (strcat "\n[AVISO] A camada \"" lyrName "\" está TRAVADA."))
      )
      (if (= (vla-get-Freeze lyrObj) :vlax-true)
        (princ (strcat "\n[AVISO] A camada \"" lyrName "\" está CONGELADA."))
      )
    )
  )
)

(defun makeViaLayers (doc)
  (vl-catch-all-apply '(lambda () (vla-load (vla-get-Linetypes doc) "DASHED" "acad.lin")))
  (criarFaixasLayer doc "SINAL_BORDO"          "7")   ; Branco
  (criarFaixasLayer doc "SINAL_ESTACIONAMENTO" "7")   ; Branco
  (criarFaixasLayer doc "SINAL_EIXO_DUPLO"     "2")   ; Amarelo (Mão Dupla)
  (criarFaixasLayer doc "SINAL_EIXO_UNICO"     "7")   ; Branco (Mão Única)
)

(defun makeCicloLayers (doc)
  (vl-catch-all-apply '(lambda () (vla-load (vla-get-Linetypes doc) "DASHED" "acad.lin")))
  (criarFaixasLayer doc "SINAL_CICLO_FUNDO" "1")   ; Vermelho
  (criarFaixasLayer doc "SINAL_CICLO_BORDO" "7")   ; Branco
  (criarFaixasLayer doc "SINAL_CICLO_EIXO"  "2")   ; Amarelo
)

(defun avisarUnidadeFaixas ( / u)
  (setq u (getvar "INSUNITS"))
  (if (/= u 6)
    (princ "\n[AVISO] As unidades do desenho (INSUNITS) não estão configuradas em Metros.")
  )
  (princ)
)

;;; =========================================================================
;;; MENSAGEM DE INICIALIZAÇÃO
;;; =========================================================================
(princ "\n=====================================================================")
(princ "\nSuíte Sinalização Viária V7 carregada!")
(princ "\n- Digite FAIXASRUA (ou VIA / FAIXAS) para gerar vias com estacionamento e eixo balanceado.")
(princ "\n- Digite CICLOFAIXA para ciclofaixas contínuas.")
(princ "\n- Digite CICLOTRAVESSIA para travessias em ruas.")
(princ "\n- Digite CICLOPICTOS para distribuição de pictogramas.")
(princ "\n=====================================================================")
(princ)