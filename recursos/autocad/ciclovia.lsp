;;; =========================================================================
;;; SUÍTE CICLOVIA V6 - CONTROLE DE EIXO PARA MÃO ÚNICA (UNIDIRECIONAL)
;;; =========================================================================

(vl-load-com)

;; --- 1. CICLOFAIXA CONTÍNUA ---
(defun c:CICLOFAIXA ( / sel eName w dashScale objAxis doc acadObj modelSpace
                         oldCmd oldError createdEnts totalGrupos resp bidirecional )
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
  (avisarUnidadeCiclo)

  ;; Pergunta o Sentido da Via
  (initget "B U")
  (setq resp (getkword "\nSentido da ciclofaixa [Bidirecional/Unidirecional] <Bidirecional>: "))
  (if (null resp) (setq resp "B"))
  (setq bidirecional (= resp "B"))

  (setq w (getreal "\nInforme a largura total da ciclofaixa (m) <2.50>: "))
  (if (null w) (setq w 2.50))

  ;; Só pergunta a escala do tracejado se for Bidirecional
  (setq dashScale 2.0)
  (if bidirecional
    (progn
      (setq dashScale (getreal "\nInforme a escala do tracejado amarelo <2.0>: "))
      (if (null dashScale) (setq dashScale 2.0))
    )
  )

  (vla-StartUndoMark doc)
  (setq totalGrupos 0)

  (princ "\nSelecione a Polilinha do Eixo da Ciclofaixa (ENTER para finalizar): ")
  (setq sel (entsel))

  (while sel
    (setq eName (car sel))
    (setq objAxis (vlax-ename->vla-object eName))

    (if (not (vlax-property-available-p objAxis 'ConstantWidth))
      (princ "\n[AVISO] Entidade ignorada: não é uma POLILINHA (LWPOLYLINE).")
      (progn
        ;; Passa a variável 'bidirecional' para controlar o eixo amarelo
        (setq createdEnts (gerarSinalizacaoCiclo objAxis w bidirecional dashScale nil 1.0 0.10))
        (vla-delete objAxis)
        (criarGrupoCiclo doc "CICLOFAIXA" createdEnts)
        (setq totalGrupos (1+ totalGrupos))
      )
    )

    (princ "\nSelecione a próxima Polilinha do Eixo (ENTER para finalizar): ")
    (setq sel (entsel))
  )

  (vla-EndUndoMark doc)
  (if (> totalGrupos 0)
    (princ (strcat "\n[OK] " (itoa totalGrupos) " ciclofaixa(s) gerada(s) com sucesso!"))
    (princ "\nNenhuma polilinha foi processada.")
  )

  (setvar "CMDECHO" oldCmd)
  (setq *error* oldError)
  (princ)
)

;; --- 2. TRAVESSIA DE RUA ---
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
  (avisarUnidadeCiclo)

  (setq w (getreal "\nInforme a largura da travessia (m) <2.50>: "))
  (if (null w) (setq w 2.50))

  (setq dashScale (getreal "\nInforme a escala do tracejado do bordo branco <1.5>: "))
  (if (null dashScale) (setq dashScale 1.5))

  (vla-StartUndoMark doc)
  (setq totalGrupos 0)

  (princ "\nSelecione a Polilinha do Eixo da Travessia na Rua (ENTER para finalizar): ")
  (setq sel (entsel))

  (while sel
    (setq eName (car sel))
    (setq objAxis (vlax-ename->vla-object eName))

    (if (not (vlax-property-available-p objAxis 'ConstantWidth))
      (princ "\n[AVISO] Entidade ignorada: não é uma POLILINHA (LWPOLYLINE).")
      (progn
        (setq createdEnts (gerarSinalizacaoCiclo objAxis w nil 1.0 T dashScale 0.10))
        (vla-delete objAxis)
        (criarGrupoCiclo doc "CICLOTRAVESSIA" createdEnts)
        (setq totalGrupos (1+ totalGrupos))
      )
    )

    (princ "\nSelecione a próxima Polilinha do Eixo (ENTER para finalizar): ")
    (setq sel (entsel))
  )

  (vla-EndUndoMark doc)
  (if (> totalGrupos 0)
    (princ (strcat "\n[OK] " (itoa totalGrupos) " travessia(s) gerada(s) com sucesso!"))
    (princ "\nNenhuma polilinha foi processada.")
  )

  (setvar "CMDECHO" oldCmd)
  (setq *error* oldError)
  (princ)
)

;; --- 3. PICTOGRAMAS AUTOMÁTICOS AO LONGO DO EIXO ---
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
  (avisarUnidadeCiclo)

  ;; Sentido
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

      ;; Correção de ângulo (-90 graus)
      (setq anguloBase (/ pi -2.0))

      (vla-StartUndoMark doc)
      (setq totalGrupos 0)

      (princ "\nSelecione a polilinha/eixo de referência (ENTER para finalizar): ")
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
                (criarGrupoCiclo doc "PICTOS" createdEnts)
                (setq totalGrupos (1+ totalGrupos))
              )
              (princ "\n[AVISO] Eixo muito curto; nada inserido para esta entidade.")
            )
          )
        )

        (princ "\nSelecione o próximo eixo (ENTER para finalizar): ")
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

;; =========================================================================
;; FUNÇÕES AUXILIARES COMPARTILHADAS
;; =========================================================================

(defun gerarSinalizacaoCiclo (objAxis w criarEixoAmarelo dashScaleEixo bordoTracejado dashScaleBordo bordoWidth
                               / halfW objRed objYellow r1 r2 off1 off2 createdEnts okOff1 okOff2 oldGapType)
  (setq oldGapType (getvar "OFFSETGAPTYPE"))
  (setvar "OFFSETGAPTYPE" 1)

  (setq halfW (/ w 2.0))
  (setq createdEnts '())

  ;; 1. Fundo vermelho
  (setq objRed (vla-copy objAxis))
  (vla-put-Layer objRed "SINAL_CICLO_FUNDO")
  (vla-put-ConstantWidth objRed w)
  (setq createdEnts (cons objRed createdEnts))

  ;; 2. Eixo amarelo tracejado (SÓ CRIA SE A VARIÁVEL FOR TRUE)
  (if criarEixoAmarelo
    (progn
      (setq objYellow (vla-copy objAxis))
      (vla-put-Layer objYellow "SINAL_CICLO_EIXO")
      (vla-put-Linetype objYellow "DASHED")
      (vla-put-LinetypeScale objYellow dashScaleEixo)
      (vla-put-ConstantWidth objYellow 0.10)
      (vla-put-LinetypeGeneration objYellow :vlax-true)
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
        (vla-put-ConstantWidth item bordoWidth)
        (if bordoTracejado
          (progn
            (vla-put-Linetype item "DASHED")
            (vla-put-LinetypeScale item dashScaleBordo)
            (vla-put-LinetypeGeneration item :vlax-true)
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
        (vla-put-ConstantWidth item bordoWidth)
        (if bordoTracejado
          (progn
            (vla-put-Linetype item "DASHED")
            (vla-put-LinetypeScale item dashScaleBordo)
            (vla-put-LinetypeGeneration item :vlax-true)
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

;; LÓGICA ESPACIAL CORRIGIDA PARA OS PICTOGRAMAS
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
        
        ;; Ângulo real da curva no ponto (tangente pura)
        (setq tangAngle (atan (cadr deriv) (car deriv)))

        ;; Vetores perpendiculares REAIS baseados na curva (Mão Direita)
        (setq perpAngRight (- tangAngle (/ pi 2.0)))
        (setq perpAngLeft  (+ tangAngle (/ pi 2.0)))

        ;; Ângulos de inserção final do bloco
        (setq ang1 (+ tangAngle anguloBase))       ; Sentido ida
        (setq ang2 (+ tangAngle pi anguloBase))    ; Sentido volta (girado 180 graus)

        (if bidirecional
          (progn
            ;; 1. Ida (Lado Direito)
            (setq pt1 (polar pt perpAngRight afastamento))
            (setq obj1 (vla-InsertBlock modelSpace (vlax-3d-point pt1) blkName escala escala escala ang1))
            (setq createdEnts (cons obj1 createdEnts))

            ;; 2. Volta (Lado Esquerdo)
            (setq pt2 (polar pt perpAngLeft afastamento))
            (setq obj2 (vla-InsertBlock modelSpace (vlax-3d-point pt2) blkName escala escala escala ang2))
            (setq createdEnts (cons obj2 createdEnts))
          )
          (progn
            ;; Unidirecional (Eixo Central)
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

(defun criarGrupoCiclo (doc prefixo createdEnts / grpObj grpName sarr i n)
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

(defun criarCicloLayer (doc lyrName lyrColor / lyrObj)
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

(defun makeCicloLayers (doc)
  (vl-catch-all-apply '(lambda () (vla-load (vla-get-Linetypes doc) "DASHED" "acad.lin")))
  (criarCicloLayer doc "SINAL_CICLO_FUNDO" "1")   
  (criarCicloLayer doc "SINAL_CICLO_BORDO" "7")   
  (criarCicloLayer doc "SINAL_CICLO_EIXO"  "2")   
)

(defun avisarUnidadeCiclo ( / u)
  (setq u (getvar "INSUNITS"))
  (if (/= u 6)
    (princ "\n[AVISO] As unidades (INSUNITS) não estão em Metros.")
  )
  (princ)
)

(princ "\nSuíte V6 carregada! O comando CICLOFAIXA agora permite desativar o eixo amarelo central em vias unidirecionais.")
(princ)