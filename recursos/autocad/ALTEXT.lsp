;;; =========================================================================
;;; ALTEXT V2.1 - ALINHAMENTO AUTOMÁTICO DE TEXTOS EM TUBULAÇÕES / LINHAS GUIAS
;;; Projeção Ortogonal pelo Centro do Texto (Sem Pular para o Ponto do Clique)
;;; Suporte a MText e Text, Leitura ABNT NBR 6492, Máscara de Fundo e Modos em Lote
;;; =========================================================================

(vl-load-com)

;; --- 1. FUNÇÃO AUXILIAR: PARSER NUMÉRICO (VÍRGULA E PONTO) ---
(defun altext:lerReal (promptStr defaultVal / inputStr val)
  (setq inputStr (getstring promptStr))
  (if (or (null inputStr) (= inputStr ""))
    defaultVal
    (progn
      (while (vl-string-search "," inputStr)
        (setq inputStr (vl-string-subst "." "," inputStr))
      )
      (setq val (distof inputStr))
      (if (and val (>= val 0.0))
        val
        (progn
          (princ (strcat "\n[AVISO] Valor inválido. Mantido padrão <" (rtos defaultVal 2 2) ">."))
          defaultVal
        )
      )
    )
  )
)

;; --- 2. FUNÇÃO AUXILIAR: VALIDAÇÃO DE ENTIDADE DE CURVA/LINHA ---
(defun altext:ehCurvaValida (ent / obj)
  (if (and ent (setq obj (vlax-ename->vla-object ent)))
    (not (vl-catch-all-error-p (vl-catch-all-apply 'vlax-curve-getEndParam (list obj))))
    nil
  )
)

;; --- 3. FUNÇÃO AUXILIAR: CENTRO GEOMÉTRICO DO TEXTO ---
(defun altext:obterCentroTexto (objTxt / minPt maxPt p1 p2)
  (if (not (vl-catch-all-error-p (vl-catch-all-apply 'vla-GetBoundingBox (list objTxt 'minPt 'maxPt))))
    (progn
      (setq p1 (vlax-safearray->list minPt)
            p2 (vlax-safearray->list maxPt))
      (mapcar '(lambda (a b) (/ (+ a b) 2.0)) p1 p2)
    )
    ;; Fallback seguro caso GetBoundingBox não esteja disponível
    (if (vlax-property-available-p objTxt 'InsertionPoint)
      (vlax-safearray->list (vlax-variant-value (vla-get-InsertionPoint objTxt)))
      (cdr (assoc 10 (entget (vlax-vla-object->ename objTxt))))
    )
  )
)

;; --- 4. NÚCLEO DE ALINHAMENTO E POSICIONAMENTO DO TEXTO ---
(defun altext:alinharTexto (entTxt lineObj ptClick distOffset usarMascara / 
                            objTxt txtType ptCenter ptNearest param deriv ang normAng vRef dotProd newPt)
  (setq objTxt   (vlax-ename->vla-object entTxt)
        txtType  (cdr (assoc 0 (entget entTxt)))
        ptCenter (altext:obterCentroTexto objTxt))

  ;; 1. Projeta o CENTRO DO TEXTO na linha (mantém a posição original ao longo da tubulação)
  (setq ptNearest (vlax-curve-getClosestPointTo lineObj ptCenter))
  (setq param     (vlax-curve-getParamAtPoint lineObj ptNearest))
  
  (if (null param)
    (setq param (vlax-curve-getParamAtDist lineObj (vlax-curve-getDistAtPoint lineObj ptNearest)))
  )

  (setq deriv (vlax-curve-getFirstDeriv lineObj param))
  (setq ang   (atan (cadr deriv) (car deriv)))

  ;; 2. Normalização angular rigorosa ABNT NBR 6492
  ;; Garante leitura da esquerda p/ direita e de baixo p/ cima (+90° no caso vertical)
  (while (> ang (/ pi 2.0))
    (setq ang (- ang pi))
  )
  (while (<= ang (- (/ pi 2.0)))
    (setq ang (+ ang pi))
  )

  ;; Aplica rotação ao texto
  (vla-put-Rotation objTxt ang)

  ;; 3. Determina o Lado do Afastamento
  ;; Usa o vetor do centro do texto em relação à linha para saber de qual lado o texto já estava
  (setq normAng (+ ang (/ pi 2.0)))
  (setq vRef (mapcar '- ptCenter ptNearest))

  ;; Se o texto já estiver sobre o eixo (distância quase zero), usa o clique do mouse como desempate
  (if (< (distance ptCenter ptNearest) 0.001)
    (if ptClick
      (setq vRef (mapcar '- ptClick ptNearest))
      (setq vRef '(0.0 1.0 0.0))
    )
  )

  (setq dotProd (+ (* (car vRef) (cos normAng)) (* (cadr vRef) (sin normAng))))
  (if (< dotProd 0.0)
    (setq normAng (- normAng pi))
  )

  ;; Ponto final deslocado
  (setq newPt (polar ptNearest normAng distOffset))

  ;; 4. Alinhamento Centralizado e Posicionamento
  (if (= txtType "MTEXT")
    (progn
      (vla-put-AttachmentPoint objTxt acAttachmentMiddleCenter)
      (vla-put-InsertionPoint objTxt (vlax-3d-point newPt))
      
      ;; Aplicação segura de Background Mask (apenas MText)
      (if (and usarMascara (vlax-property-available-p objTxt 'BackgroundFill))
        (progn
          (vla-put-BackgroundFill objTxt :vlax-true)
          (vl-catch-all-apply 'vlax-put-property (list objTxt 'BackgroundScaleFactor 1.2))
        )
      )
    )
    (progn
      ;; Objeto TEXT (DText)
      (vla-put-Alignment objTxt acAlignmentMiddleCenter)
      (vla-put-TextAlignmentPoint objTxt (vlax-3d-point newPt))
    )
  )
)

;; --- 5. COMANDO PRINCIPAL ---
(defun c:ALTEXT ( / acadObj doc oldEcho oldError opt entTxt entLine lineObj 
                     txtCount ss i e ptPos loopMain )

  ;; Configurações persistentes da sessão
  (if (null *AlText_Dist*) (setq *AlText_Dist* 0.15))
  (if (null *AlText_Mask*) (setq *AlText_Mask* T))
  (if (null *AlText_Modo*) (setq *AlText_Modo* "D")) ; "D" = Dinâmico, "L" = Linha Fixa

  (setq acadObj  (vlax-get-acad-object))
  (setq doc      (vla-get-ActiveDocument acadObj))
  (setq oldEcho  (getvar "CMDECHO"))
  (setq oldError *error*)

  (defun *error* (msg)
    (if oldEcho (setvar "CMDECHO" oldEcho))
    (if (and msg (/= msg "Function cancelled") (/= msg "quit / exit abort"))
      (princ (strcat "\n[ALTEXT] Erro: " msg))
    )
    (vl-catch-all-apply 'vla-EndUndoMark (list doc))
    (setq *error* oldError)
    (princ)
  )

  (setvar "CMDECHO" 0)

  ;; Menu Interativo de Configuração
  (setq loopMain T)
  (while loopMain
    (initget "D M L I S")
    (setq opt (getkword (strcat "\n[ALTEXT] Afastamento: " (rtos *AlText_Dist* 2 2) "m | Máscara: " 
                                (if *AlText_Mask* "SIM" "NÃO")
                                " | [D]istância / [M]áscara / [L]inha Fixa / [I]ndividual / [S]air <Iniciar>: ")))
    (cond
      ((= opt "D")
       (setq *AlText_Dist* (altext:lerReal "\nInforme o novo afastamento do texto (m): " *AlText_Dist*)))
      
      ((= opt "M")
       (setq *AlText_Mask* (not *AlText_Mask*))
       (princ (strcat "\nMáscara de fundo (Background Mask): " (if *AlText_Mask* "ATIVADA" "DESATIVADA"))))
      
      ((= opt "L")
       (setq *AlText_Modo* "L")
       (setq loopMain nil))
      
      ((= opt "I")
       (setq *AlText_Modo* "D")
       (setq loopMain nil))
      
      ((= opt "S")
       (setq loopMain nil
             *AlText_Modo* nil))
      
      (T ; ENTER -> Prossegue com o modo ativo
       (setq loopMain nil))
    )
  )

  (if *AlText_Modo*
    (progn
      (vla-StartUndoMark doc)

      ;; -------------------------------------------------------------
      ;; MODO 1: LINHA FIXA (SELEÇÃO EM LOTE OU MÚLTIPLOS TEXTOS)
      ;; -------------------------------------------------------------
      (if (= *AlText_Modo* "L")
        (progn
          (princ "\n--- MODO LINHA FIXA ---")
          (setq entLine (entsel "\nSelecione a Tubulação/Linha Guia de referência: "))
          
          (while (and entLine (not (altext:ehCurvaValida (car entLine))))
            (princ "\n[AVISO] Objeto selecionado não é uma linha ou curva válida.")
            (setq entLine (entsel "\nSelecione uma Tubulação/Linha válida: "))
          )

          (if entLine
            (progn
              (setq lineObj (vlax-ename->vla-object (car entLine)))
              (princ "\nSelecione os Textos/MTexts (por clique ou janela) e dê ENTER: ")
              (setq ss (ssget '((0 . "*TEXT"))))
              
              (if ss
                (progn
                  (setq txtCount 0)
                  (repeat (setq i (sslength ss))
                    (setq e (ssname ss (setq i (1- i))))
                    (altext:alinharTexto e lineObj nil *AlText_Dist* *AlText_Mask*)
                    (setq txtCount (1+ txtCount))
                  )
                  (princ (strcat "\n[OK] " (itoa txtCount) " texto(s) alinhado(s) com sucesso à tubulação!"))
                )
                (princ "\n[AVISO] Nenhum texto selecionado.")
              )
            )
          )
        )

        ;; -------------------------------------------------------------
        ;; MODO 2: DINÂMICO / INDIVIDUAL (PAR A PAR CONTÍNUO)
        ;; -------------------------------------------------------------
        (progn
          (princ "\n--- MODO DINÂMICO: Clique no TEXTO e depois na LINHA (ESC para sair) ---")
          (while (setq entTxt (car (entsel "\nSelecione o Texto/MText: ")))
            (if (not (wcmatch (cdr (assoc 0 (entget entTxt))) "*TEXT"))
              (princ "\n[AVISO] O objeto selecionado não é um Texto ou MText.")
              (progn
                (setq entLine (entsel "\nClique na Tubulação/Linha guia: "))
                (if (and entLine (altext:ehCurvaValida (car entLine)))
                  (progn
                    (setq lineObj (vlax-ename->vla-object (car entLine)))
                    ;; Passa o clique como desempate se necessário, mas projeta pela posição real do texto
                    (altext:alinharTexto entTxt lineObj (cadr entLine) *AlText_Dist* *AlText_Mask*)
                    (princ "\n-> Texto posicionado e alinhado com sucesso.")
                  )
                  (princ "\n[AVISO] Linha inválida ou clique fora.")
                )
              )
            )
          )
        )
      )

      (vla-EndUndoMark doc)
    )
  )

  (setvar "CMDECHO" oldEcho)
  (setq *error* oldError)
  (princ)
)

(princ "\nComando ALTEXT V2.1 carregado! Digite ALTEXT para executar.")
(princ)