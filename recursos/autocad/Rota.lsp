;;; =========================================================================
;;; DISTRIBUIÇÃO AUTOMÁTICA DE SÍMBOLOS DE ROTA DE FUGA
;;; Suporte a Polilinhas, Linhas, Arcos e Splines com controle de sentido
;;; =========================================================================

(vl-load-com)

(defun c:ROTAFUGA ( / acadObj doc space oldCmd oldError
                      blkName blkFile dist escala inverter
                      sel ent obj curLen curDist pt deriv ang objBlk totalInseridos )

  (setq acadObj (vlax-get-acad-object))
  (setq doc (vla-get-ActiveDocument acadObj))
  (setq space (if (= (vla-get-ActiveSpace doc) 1)
                (vla-get-ModelSpace doc)
                (vla-get-PaperSpace doc)))
  (setq oldCmd (getvar "CMDECHO"))
  (setq oldError *error*)

  (defun *error* (msg)
    (if (and msg (/= msg "Function cancelled") (/= msg "quit / exit abort"))
      (princ (strcat "\n[ROTAFUGA] Erro: " msg))
    )
    (setvar "CMDECHO" oldCmd)
    (vl-catch-all-apply 'vla-EndUndoMark (list doc))
    (setq *error* oldError)
    (princ)
  )

  (setvar "CMDECHO" 0)

  ;; 1. Verificação e Busca do Bloco
  (setq blkName "Rota de fuga intermediária")
  (if (not (tblsearch "BLOCK" blkName))
    (if (tblsearch "BLOCK" "Rota de fuga intermediaria")
      (setq blkName "Rota de fuga intermediaria")
      (progn
        (princ (strcat "\nBloco \"" blkName "\" não encontrado no desenho."))
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
  )

  (if (not blkName)
    (princ "\n[ERRO] Operação cancelada. Bloco não definido.")
    (progn
      ;; 2. Parâmetros de Inserção
      (initget 6)
      (setq dist (getdist "\nDistância de espaçamento entre símbolos (m) <2.50>: "))
      (if (null dist) (setq dist 2.50))

      (setq escala (getreal "\nFator de escala do bloco <1.0>: "))
      (if (null escala) (setq escala 1.0))

      (initget "S N")
      (setq inverter (= (getkword "\nInverter sentido das setas/símbolos? [Sim/Nao] <Nao>: ") "S"))

      ;; 3. Seleção e Validação do Eixo/Polyline
      (setq sel (entsel "\nSelecione a Polilinha/Curva da rota de fuga: "))
      (if sel
        (progn
          (setq ent (car sel))
          (setq obj (vlax-ename->vla-object ent))
          
          ;; Valida se a entidade suporta medição de curva
          (if (vl-catch-all-error-p (vl-catch-all-apply 'vlax-curve-getEndParam (list obj)))
            (princ "\n[ERRO] O objeto selecionado não é uma curva/linha/polilinha válida.")
            (progn
              (vla-StartUndoMark doc)

              ;; Criação do Layer Padronizado
              (if (not (tblsearch "LAYER" "ROTA_DE_FUGA"))
                (command "-LAYER" "M" "ROTA_DE_FUGA" "C" "1" "ROTA_DE_FUGA" "")
              )

              (setq curLen (vlax-curve-getDistAtParam obj (vlax-curve-getEndParam obj)))
              (setq curDist (/ dist 2.0))
              (setq totalInseridos 0)

              (while (<= curDist curLen)
                (setq pt (vlax-curve-getPointAtDist obj curDist))
                (setq deriv (vlax-curve-getFirstDeriv obj (vlax-curve-getParamAtDist obj curDist)))
                (setq ang (atan (cadr deriv) (car deriv)))
                
                (if inverter
                  (setq ang (+ ang pi))
                )

                (setq objBlk (vla-InsertBlock space (vlax-3d-point pt) blkName escala escala escala ang))
                (vla-put-Layer objBlk "ROTA_DE_FUGA")

                (setq totalInseridos (1+ totalInseridos))
                (setq curDist (+ curDist dist))
              )

              (vla-EndUndoMark doc)
              (princ (strcat "\n[OK] " (itoa totalInseridos) " símbolos distribuídos com sucesso na camada 'ROTA_DE_FUGA'!"))
            )
          )
        )
        (princ "\n[AVISO] Nenhuma entidade selecionada.")
      )
    )
  )

  (setvar "CMDECHO" oldCmd)
  (setq *error* oldError)
  (princ)
)

(princ "\nComando ROTAFUGA carregado com sucesso! Digite ROTAFUGA para executar.")
(princ)