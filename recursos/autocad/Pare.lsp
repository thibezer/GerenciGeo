;;; =========================================================================
;;; INSERÇÃO AUTOMÁTICA DA LEGENDA "PARE" (MTP + PARALELISMO CORRIGIDO)
;;; =========================================================================

(vl-load-com)

(defun c:PAREAUTO ( / acadObj doc modelSpace oldCmd oldError
                      p1 p2 pMid angLinha angPerp1 angPerp2
                      ptTest1 ptTest2 angOffset angTexto pDir
                      blkName blkFile escala recuo ptIns objPare )

  (setq acadObj (vlax-get-acad-object))
  (setq doc (vla-get-ActiveDocument acadObj))
  (setq modelSpace (vla-get-ModelSpace doc))
  (setq oldCmd (getvar "CMDECHO"))
  (setq oldError *error*)

  (defun *error* (msg)
    (if (and msg (/= msg "Function cancelled"))
      (princ (strcat "\n[PAREAUTO] Erro: " msg))
    )
    (setvar "CMDECHO" oldCmd)
    (vl-catch-all-apply 'vla-EndUndoMark (list doc))
    (setq *error* oldError)
    (princ)
  )

  (setvar "CMDECHO" 0)

  ;; NOME DO BLOCO FIXADO
  (setq blkName "LEGENDA_PARE_1.6")
  
  (if (not (tblsearch "BLOCK" blkName))
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

  (if blkName
    (progn
      (setq recuo (getreal "\nDistância de recuo antes da faixa de retenção (m) <1.50>: "))
      (if (null recuo) (setq recuo 1.50))

      (setq escala (getreal "\nFator de escala do bloco <1.0>: "))
      (if (null escala) (setq escala 1.0))

      (while (setq p1 (getpoint "\nClique no PRIMEIRO canto da faixa de retenção (ENTER para sair): "))
        (if (setq p2 (getpoint p1 "\nClique no SEGUNDO canto da faixa de retenção: "))
          (progn
            
            (setq pMid (mapcar (function (lambda (a b) (/ (+ a b) 2.0))) p1 p2))

            (if (setq pDir (getpoint pMid "\nClique num ponto qualquer do lado de onde VÊM os veículos: "))
              (progn
                (vla-StartUndoMark doc)

                ;; 1. Acha o ângulo exato da faixa de retenção
                (setq angLinha (angle p1 p2))

                ;; 2. Calcula os dois ângulos perfeitamente perpendiculares à faixa
                (setq angPerp1 (+ angLinha (/ pi 2.0)))
                (setq angPerp2 (- angLinha (/ pi 2.0)))

                ;; 3. Cria dois pontos de teste geométricos (um de cada lado da rua)
                (setq ptTest1 (polar pMid angPerp1 recuo))
                (setq ptTest2 (polar pMid angPerp2 recuo))

                ;; 4. Compara distâncias para ver qual lado o usuário escolheu com o 3º clique
                (if (< (distance ptTest1 pDir) (distance ptTest2 pDir))
                  (setq angOffset angPerp1)
                  (setq angOffset angPerp2)
                )

                ;; O ponto de inserção final usa a perpendicular absoluta, não o clique torto
                (setq ptIns (polar pMid angOffset recuo))

                ;; Gira o texto para ficar sempre paralelo à faixa, lido da base pro topo
                (setq angTexto (+ angOffset (/ pi 2.0)))

                (setq objPare (vla-InsertBlock modelSpace (vlax-3d-point ptIns) blkName escala escala escala angTexto))

                (if (not (tblsearch "LAYER" "SINAL_TEXTO"))
                  (command "-LAYER" "M" "SINAL_TEXTO" "C" "7" "SINAL_TEXTO" "")
                )
                (vla-put-Layer objPare "SINAL_TEXTO")

                (vla-EndUndoMark doc)
                (princ "\n[OK] Legenda PARE inserida perfeitamente paralela à faixa!")
              )
              (princ "\n[AVISO] Direção não informada.")
            )
          )
        )
      )
    )
    (princ "\n[ERRO] Operação cancelada. Bloco não definido.")
  )

  (setvar "CMDECHO" oldCmd)
  (setq *error* oldError)
  (princ)
)

(princ "\nComando PAREAUTO V2 carregado! Bloco fixado em 'LEGENDA_PARE_1.6' e paralelismo corrigido.")
(princ)