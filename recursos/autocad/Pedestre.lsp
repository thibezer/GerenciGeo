;;; =========================================================================
;;; GERADOR DE FAIXA DE PEDESTRES E RETENÇÃO (Padrão CONTRAN)
;;; =========================================================================

(vl-load-com)

(defun c:FAIXAPEDESTRE ( / acadObj doc modelSpace oldCmd oldError
                            p1 p2 respRet ptLado dist angEixo angFaixa
                            largFaixa distRetencao passo espessura
                            numFaixas resto ptAtual i
                            ptF1 ptF2 objFaixa createdEnts
                            deslocRetencao ptRet1 ptRet2 ptRet1A ptRet2A ptRet1B ptRet2B objRetencao )

  (setq acadObj (vlax-get-acad-object))
  (setq doc (vla-get-ActiveDocument acadObj))
  (setq modelSpace (vla-get-ModelSpace doc))
  (setq oldCmd (getvar "CMDECHO"))
  (setq oldError *error*)

  (defun *error* (msg)
    (if (and msg (/= msg "Function cancelled"))
      (princ (strcat "\n[FAIXAPEDESTRE] Erro: " msg))
    )
    (setvar "CMDECHO" oldCmd)
    (vl-catch-all-apply 'vla-EndUndoMark (list doc))
    (setq *error* oldError)
    (princ)
  )

  (setvar "CMDECHO" 0)

  ;; Cria a camada da sinalização se não existir
  (if (not (tblsearch "LAYER" "SINAL_PEDESTRE"))
    (command "-LAYER" "M" "SINAL_PEDESTRE" "C" "7" "SINAL_PEDESTRE" "")
  )

  ;; ---------------------------------------------------
  ;; Parâmetros Fixos do CONTRAN (Vol. IV - Sinalização)
  ;; ---------------------------------------------------
  (setq espessura 0.40)      ; Largura de cada fita da pintura zebrada
  (setq passo 0.80)          ; Ciclo: 40cm pintado + 40cm vazio
  (setq distRetencao 1.00)   ; Distância mínima entre a retenção e a travessia

  (if (setq p1 (getpoint "\nClique no ponto inicial da travessia (bordo 1): "))
    (if (setq p2 (getpoint p1 "\nClique no ponto final da travessia (bordo 2): "))
      (progn
        
        (setq largFaixa (getreal "\nComprimento das listras (largura da área de travessia) (m) <3.00>: "))
        (if (null largFaixa) (setq largFaixa 3.00))

        (initget "1 2 N")
        (setq respRet (getkword "\nInserir Faixa de Retenção? [1 lado / 2 lados (Mão Dupla) / Nenhuma] <1>: "))
        (if (null respRet) (setq respRet "1"))

        (if (= respRet "1")
          (setq ptLado (getpoint "\nClique num ponto qualquer no lado da rua de onde os veículos vêm: "))
        )

        (vla-StartUndoMark doc)
        (setq createdEnts '())
        
        (setq dist (distance p1 p2))
        (setq angEixo (angle p1 p2))
        (setq angFaixa (+ angEixo (/ pi 2.0))) ; 90 graus em relação ao eixo da rua

        ;; ---------------------------------------------------
        ;; 1. GERAR AS FAIXAS ZEBRADAS
        ;; ---------------------------------------------------
        (setq numFaixas (fix (/ dist passo)))
        
        ;; Centralizando o padrão zebrado no meio do vão
        (setq resto (- dist (* numFaixas passo)))
        (setq ptAtual (polar p1 angEixo (+ (/ resto 2.0) (/ espessura 2.0))))

        (setq i 0)
        (while (<= i numFaixas)
          (setq ptF1 (polar ptAtual angFaixa (/ largFaixa 2.0)))
          (setq ptF2 (polar ptAtual (+ angFaixa pi) (/ largFaixa 2.0)))

          ;; "_non" ignora o OSNAP temporariamente para não deformar a linha
          (command "_.PLINE" "_non" ptF1 "W" espessura espessura "_non" ptF2 "")
          (setq objFaixa (vlax-ename->vla-object (entlast)))
          (vla-put-Layer objFaixa "SINAL_PEDESTRE")
          (setq createdEnts (cons objFaixa createdEnts))

          (setq ptAtual (polar ptAtual angEixo passo))
          (setq i (1+ i))
        )

        ;; ---------------------------------------------------
        ;; 2. GERAR FAIXA DE RETENÇÃO
        ;; ---------------------------------------------------
        ;; Deslocamento total = (Metade da travessia) + (1.00m de recuo)
        (setq deslocRetencao (+ (/ largFaixa 2.0) distRetencao))

        (if (or (= respRet "1") (= respRet "2"))
          (progn
            
            ;; Se for Mão Única (1 lado)
            (if (= respRet "1")
              (progn
                ;; Lógica vetorial para descobrir se o clique foi na esquerda ou direita do eixo
                (setq diferenca (sin (- (angle p1 ptLado) angEixo)))
                (if (> diferenca 0)
                  (progn ; Lado esquerdo do vetor
                    (setq ptRet1 (polar p1 (+ angEixo (/ pi 2.0)) deslocRetencao))
                    (setq ptRet2 (polar p2 (+ angEixo (/ pi 2.0)) deslocRetencao))
                  )
                  (progn ; Lado direito do vetor
                    (setq ptRet1 (polar p1 (- angEixo (/ pi 2.0)) deslocRetencao))
                    (setq ptRet2 (polar p2 (- angEixo (/ pi 2.0)) deslocRetencao))
                  )
                )
                (command "_.PLINE" "_non" ptRet1 "W" 0.40 0.40 "_non" ptRet2 "")
                (setq objRetencao (vlax-ename->vla-object (entlast)))
                (vla-put-Layer objRetencao "SINAL_PEDESTRE")
                (setq createdEnts (cons objRetencao createdEnts))
              )
            )

            ;; Se for Mão Dupla (2 lados, uma de cada lado do cruzamento)
            (if (= respRet "2")
              (progn
                ;; Lado 1
                (setq ptRet1A (polar p1 (+ angEixo (/ pi 2.0)) deslocRetencao))
                (setq ptRet2A (polar p2 (+ angEixo (/ pi 2.0)) deslocRetencao))
                (command "_.PLINE" "_non" ptRet1A "W" 0.40 0.40 "_non" ptRet2A "")
                (setq objRetencao (vlax-ename->vla-object (entlast)))
                (vla-put-Layer objRetencao "SINAL_PEDESTRE")
                (setq createdEnts (cons objRetencao createdEnts))

                ;; Lado 2
                (setq ptRet1B (polar p1 (- angEixo (/ pi 2.0)) deslocRetencao))
                (setq ptRet2B (polar p2 (- angEixo (/ pi 2.0)) deslocRetencao))
                (command "_.PLINE" "_non" ptRet1B "W" 0.40 0.40 "_non" ptRet2B "")
                (setq objRetencao (vlax-ename->vla-object (entlast)))
                (vla-put-Layer objRetencao "SINAL_PEDESTRE")
                (setq createdEnts (cons objRetencao createdEnts))
              )
            )
          )
        )

        ;; ---------------------------------------------------
        ;; 3. CRIAR GRUPO PARA MANIPULAÇÃO ÚNICA
        ;; ---------------------------------------------------
        (if createdEnts
          (progn
            (setq grpName (strcat "PEDESTRE_" (vla-get-Handle (car createdEnts))))
            (setq grpObj (vla-Add (vla-get-Groups doc) grpName))
            (setq sarr (vlax-make-safearray vlax-vbObject (cons 0 (1- (length createdEnts)))))
            (setq idx 0)
            (foreach o createdEnts
              (vlax-safearray-put-element sarr idx o)
              (setq idx (1+ idx))
            )
            (vla-AppendItems grpObj sarr)
          )
        )

        (vla-EndUndoMark doc)
        (princ "\n[OK] Faixa de pedestres gerada com sucesso!")
      )
    )
  )

  (setvar "CMDECHO" oldCmd)
  (setq *error* oldError)
  (princ)
)

(princ "\nComando FAIXAPEDESTRE carregado! Padrão zebrado de 40cm com retenção a 1.00m.")
(princ)