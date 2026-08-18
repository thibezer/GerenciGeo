;;; =========================================================================
;;; GERADOR DE CANTEIRO CENTRAL DINÂMICO (COM PREVIEW AO VIVO)
;;; =========================================================================

(vl-load-com)

(defun c:CANTEIRO ( / acadObj doc modelSpace oldCmd oldError p1 p2 ang L 
                      maxRaio raio loop gr code pt ang2 distP1 
                      C1 C2 v1 v2 v3 v4 ptsArray objPreview )
                      
  (setq acadObj (vlax-get-acad-object))
  (setq doc (vla-get-ActiveDocument acadObj))
  (setq modelSpace (vla-get-ModelSpace doc))
  (setq oldCmd (getvar "CMDECHO"))
  (setq oldError *error*)

  ;; Tratamento de erro robusto para deletar a prévia caso o usuário aperte ESC
  (defun *error* (msg)
    (if (and objPreview (not (vlax-erased-p objPreview)))
      (vla-delete objPreview)
    )
    (if (and msg (/= msg "Function cancelled"))
      (princ (strcat "\n[CANTEIRO] Erro: " msg))
    )
    (setvar "CMDECHO" oldCmd)
    (vl-catch-all-apply 'vla-EndUndoMark (list doc))
    (setq *error* oldError)
    (princ)
  )

  (setvar "CMDECHO" 0)

  ;; Cria a camada dos canteiros
  (if (not (tblsearch "LAYER" "URB_CANTEIRO"))
    (command "-LAYER" "M" "URB_CANTEIRO" "C" "3" "URB_CANTEIRO" "")
  )

  (while (setq p1 (getpoint "\nClique no EXTREMO 1 do canteiro (ENTER para sair): "))
    (if (setq p2 (getpoint p1 "\nClique no EXTREMO 2 do canteiro: "))
      (progn
        (setq L (distance p1 p2))
        (if (> L 0.1) ; Evita bugar se o usuário clicar duas vezes no mesmo lugar
          (progn
            (vla-StartUndoMark doc)
            (setq ang (angle p1 p2))
            
            ;; O raio máximo é quase a metade do comprimento (vira um círculo perfeito)
            (setq maxRaio (* L 0.4999)) 
            (setq raio 0.5) ; Valor inicial fictício

            ;; 1. CRIAR A POLILINHA INICIAL VAZIA (PARA O PREVIEW)
            (setq ptsArray (vlax-make-safearray vlax-vbDouble '(0 . 7)))
            (vlax-safearray-fill ptsArray (list 0 0 0 0 0 0 0 0))
            (setq objPreview (vla-AddLightWeightPolyline modelSpace ptsArray))
            
            (vla-put-Closed objPreview :vlax-true)
            (vla-put-Layer objPreview "URB_CANTEIRO")
            
            ;; Aplica a curvatura (Bulge) nas pontas para fazer o formato de pílula
            (vla-SetBulge objPreview 1 1.0)
            (vla-SetBulge objPreview 3 1.0)

            (princ "\nMova o mouse para definir a largura. CLIQUE para confirmar.")
            
            ;; 2. LOOP DO PREVIEW AO VIVO (Rubber-band effect)
            (setq loop T)
            (while loop
              (setq gr (grread T 15 0))
              (setq code (car gr) pt (cadr gr))
              
              (cond
                ;; MOUSE SE MOVENDO
                ((= code 5) 
                 (setq ang2 (angle p1 pt))
                 (setq distP1 (distance p1 pt))
                 
                 ;; Matemática vetorial: distância perpendicular do mouse até o eixo
                 (setq raio (abs (* distP1 (sin (- ang2 ang)))))

                 ;; Travas de segurança de geometria
                 (if (< raio 0.05) (setq raio 0.05)) 
                 (if (> raio maxRaio) (setq raio maxRaio)) 

                 ;; Calcula o centro dos arcos (recolhidos para dentro do eixo)
                 (setq C1 (polar p1 ang raio))
                 (setq C2 (polar p2 (+ ang pi) raio))

                 ;; Calcula os 4 cantos da pílula
                 (setq v1 (polar C1 (- ang (/ pi 2.0)) raio)) ; Lado Direito, base
                 (setq v2 (polar C2 (- ang (/ pi 2.0)) raio)) ; Lado Direito, topo
                 (setq v3 (polar C2 (+ ang (/ pi 2.0)) raio)) ; Lado Esquerdo, topo
                 (setq v4 (polar C1 (+ ang (/ pi 2.0)) raio)) ; Lado Esquerdo, base

                 ;; Atualiza os vértices da polilinha no AutoCAD instantaneamente
                 (vlax-safearray-fill ptsArray (list (car v1) (cadr v1) 
                                                     (car v2) (cadr v2) 
                                                     (car v3) (cadr v3) 
                                                     (car v4) (cadr v4)))
                 (vla-put-Coordinates objPreview ptsArray)
                )
                
                ;; CLIQUE ESQUERDO (CONFIRMAR)
                ((= code 3) 
                 (setq loop nil)
                 (setq objPreview nil) ; Tira da variável para o *error* não apagar acidentalmente
                 (princ "\n[OK] Canteiro fixado!")
                )
                
                ;; CLIQUE DIREITO OU TECLADO (CANCELAR)
                ((or (= code 2) (= code 25)) 
                 (if objPreview (vla-delete objPreview))
                 (setq objPreview nil)
                 (setq loop nil)
                 (princ "\n[AVISO] Ação cancelada.")
                )
              )
            )
            (vla-EndUndoMark doc)
          )
          (princ "\n[AVISO] Pontos muito próximos. Tente novamente.")
        )
      )
    )
  )

  (setvar "CMDECHO" oldCmd)
  (setq *error* oldError)
  (princ)
)

(princ "\nComando CANTEIRO dinâmico carregado! Clique nos extremos e mova o mouse.")
(princ)