;;; =========================================================================
;;; ALTEXT V3.0 - ALINHAMENTO AUTOMATICO DE TEXTOS EM TUBULACOES / LINHAS GUIAS
;;; Robustez em lote (erro isolado por item, sem abortar o restante),
;;; guarda contra tangente 3D degenerada (trecho ~vertical em Z),
;;; afastamento inteligente (baseado na altura real do texto, evita
;;; sobreposicao com a linha) e MODO AUTOMATICO de pareamento texto->linha
;;; mais proxima (sem precisar clicar par a par).
;;; Suporte a MText e Text, leitura ABNT NBR 6492, mascara de fundo.
;;; =========================================================================

(vl-load-com)

;; --- 1. PARSER NUMERICO (ACEITA VIRGULA E PONTO) ---
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
          (princ (strcat "\n[AVISO] Valor invalido. Mantido padrao <" (rtos defaultVal 2 2) ">."))
          defaultVal
        )
      )
    )
  )
)

;; --- 2. VALIDACAO DE ENTIDADE DE CURVA/LINHA (LINE, POLYLINE 2D/3D, ARC, SPLINE...) ---
(defun altext:ehCurvaValida (ent / obj)
  (if (and ent (setq obj (vlax-ename->vla-object ent)))
    (not (vl-catch-all-error-p (vl-catch-all-apply 'vlax-curve-getEndParam (list obj))))
    nil
  )
)

;; --- 3. HANDLE DA ENTIDADE (PARA MENSAGENS DE DIAGNOSTICO EM LOTE) ---
(defun altext:handle (ent)
  (if ent (cdr (assoc 5 (entget ent))) "?")
)

;; --- 4. CENTRO GEOMETRICO DO TEXTO ---
(defun altext:obterCentroTexto (objTxt / minPt maxPt p1 p2)
  (if (not (vl-catch-all-error-p (vl-catch-all-apply 'vla-GetBoundingBox (list objTxt 'minPt 'maxPt))))
    (progn
      (setq p1 (vlax-safearray->list minPt)
            p2 (vlax-safearray->list maxPt))
      (mapcar '(lambda (a b) (/ (+ a b) 2.0)) p1 p2)
    )
    (if (vlax-property-available-p objTxt 'InsertionPoint)
      (vlax-safearray->list (vlax-variant-value (vla-get-InsertionPoint objTxt)))
      (cdr (assoc 10 (entget (vlax-vla-object->ename objTxt))))
    )
  )
)

;; --- 5. ALTURA REAL DO TEXTO (MEDIDA COM ROTACAO ZERADA) ---
;; Zera a rotacao temporariamente para medir a "espessura" do texto
;; perpendicular a linha de leitura (bounding box so fica limpa quando
;; alinhada aos eixos), depois restaura a rotacao original do objeto.
;; Isso permite calcular um afastamento que nunca sobrepoe a linha-guia,
;; em vez de usar sempre a mesma distancia fixa para qualquer tamanho de texto.
(defun altext:obterAlturaTexto (objTxt / rotOriginal minPt maxPt altura ok)
  (setq rotOriginal (vl-catch-all-apply 'vla-get-Rotation (list objTxt)))
  (if (vl-catch-all-error-p rotOriginal) (setq rotOriginal 0.0))
  (vl-catch-all-apply 'vla-put-Rotation (list objTxt 0.0))
  (setq ok (not (vl-catch-all-error-p (vl-catch-all-apply 'vla-GetBoundingBox (list objTxt 'minPt 'maxPt)))))
  (setq altura
    (if ok
      (abs (- (cadr (vlax-safearray->list maxPt)) (cadr (vlax-safearray->list minPt))))
      nil
    )
  )
  (vl-catch-all-apply 'vla-put-Rotation (list objTxt rotOriginal))
  altura
)

;; --- 6. NUCLEO DE ALINHAMENTO ---
;; Retorna (STATUS . MENSAGEM), STATUS em "OK" | "AVISO" | "ERRO".
;; Nao trata erro internamente (isso e feito pelo wrapper abaixo), para
;; que qualquer falha inesperada seja capturada sem derrubar o comando.
(defun altext:alinharTextoNucleo (entTxt lineObj ptClick distOffset usarMascara /
                            objTxt txtType ptCenter ptNearest param deriv ang normAng
                            vRef dotProd newPt magXY alturaTexto clearance avisoMsg)

  (setq objTxt   (vlax-ename->vla-object entTxt)
        txtType  (cdr (assoc 0 (entget entTxt)))
        ptCenter (altext:obterCentroTexto objTxt)
        avisoMsg nil)

  (setq alturaTexto (altext:obterAlturaTexto objTxt))

  ;; 1. Projeta o CENTRO DO TEXTO na linha (mantem a posicao original ao longo da tubulacao)
  (setq ptNearest (vlax-curve-getClosestPointTo lineObj ptCenter))
  (setq param     (vlax-curve-getParamAtPoint lineObj ptNearest))
  (if (null param)
    (setq param (vlax-curve-getParamAtDist lineObj (vlax-curve-getDistAtPoint lineObj ptNearest)))
  )

  (setq deriv (vlax-curve-getFirstDeriv lineObj param))
  (setq magXY (sqrt (+ (* (car deriv) (car deriv)) (* (cadr deriv) (cadr deriv)))))

  ;; --- GUARDA: tangente quase vertical em Z (trecho 3D "subindo reto") ---
  ;; Sem componente XY nao existe angulo de leitura definido no plano da folha;
  ;; aplica orientacao padrao (0 graus) e sinaliza para revisao manual, em vez
  ;; de arriscar um atan(0,0) indefinido.
  (if (< magXY 1.0e-6)
    (progn
      (setq ang 0.0)
      (setq avisoMsg "tangente 3D quase vertical (sem componente XY) - orientacao padrao 0 graus aplicada, revise manualmente")
    )
    (setq ang (atan (cadr deriv) (car deriv)))
  )

  ;; 2. Normalizacao angular ABNT NBR 6492 (leitura esq->dir / baixo->cima)
  (while (> ang (/ pi 2.0)) (setq ang (- ang pi)))
  (while (<= ang (- (/ pi 2.0))) (setq ang (+ ang pi)))

  (vla-put-Rotation objTxt ang)

  ;; 3. Lado do afastamento (preserva o lado onde o texto ja estava)
  (setq normAng (+ ang (/ pi 2.0)))
  (setq vRef (mapcar '- ptCenter ptNearest))
  (if (< (distance ptCenter ptNearest) 0.001)
    (setq vRef (if ptClick (mapcar '- ptClick ptNearest) '(0.0 1.0 0.0)))
  )
  (setq dotProd (+ (* (car vRef) (cos normAng)) (* (cadr vRef) (sin normAng))))
  (if (< dotProd 0.0) (setq normAng (- normAng pi)))

  ;; 4. Afastamento inteligente: gap configurado + metade da altura real do texto
  (setq clearance
    (if alturaTexto
      (+ distOffset (/ alturaTexto 2.0))
      distOffset
    )
  )
  (setq newPt (polar ptNearest normAng clearance))

  ;; 5. Alinhamento centralizado e posicionamento
  (if (= txtType "MTEXT")
    (progn
      (vla-put-AttachmentPoint objTxt acAttachmentMiddleCenter)
      (vla-put-InsertionPoint objTxt (vlax-3d-point newPt))
      (if (and usarMascara (vlax-property-available-p objTxt 'BackgroundFill))
        (progn
          (vla-put-BackgroundFill objTxt :vlax-true)
          (vl-catch-all-apply 'vlax-put-property (list objTxt 'BackgroundScaleFactor 1.2))
        )
      )
    )
    (progn
      (vla-put-Alignment objTxt acAlignmentMiddleCenter)
      (vla-put-TextAlignmentPoint objTxt (vlax-3d-point newPt))
    )
  )

  (if avisoMsg (cons "AVISO" avisoMsg) (cons "OK" nil))
)

;; --- 7. WRAPPER SEGURO ---
;; Isola qualquer erro inesperado (layer travada, entidade em espaco
;; incompativel, etc.) para que um item ruim nunca aborte um lote inteiro.
(defun altext:alinharTexto (entTxt lineObj ptClick distOffset usarMascara / resultado)
  (setq resultado (vl-catch-all-apply 'altext:alinharTextoNucleo
                                       (list entTxt lineObj ptClick distOffset usarMascara)))
  (if (vl-catch-all-error-p resultado)
    (cons "ERRO" (vl-catch-all-error-message resultado))
    resultado
  )
)

;; --- 8. PAREAMENTO AUTOMATICO: encontra a linha-guia mais proxima de um ponto ---
(defun altext:linhaMaisProxima (ptCenter listaLinhas / obj menorDist menorObj pt d)
  (setq menorDist nil menorObj nil)
  (foreach obj listaLinhas
    (setq pt (vlax-curve-getClosestPointTo obj ptCenter))
    (setq d  (distance ptCenter pt))
    (if (or (null menorDist) (< d menorDist))
      (setq menorDist d menorObj obj)
    )
  )
  (list menorObj menorDist)
)

;; --- 9. COMANDO PRINCIPAL ---
(defun c:ALTEXT ( / acadObj doc oldEcho oldError opt entTxt entLine lineObj
                     ss i e loopMain resultado okCount avisoCount erroCount
                     ssLinhas ssTextos listaLinhas parPar melhorLinha melhorDist objTxt )

  (if (null *AlText_Dist*) (setq *AlText_Dist* 0.15))
  (if (null *AlText_Mask*) (setq *AlText_Mask* T))
  (if (null *AlText_Modo*) (setq *AlText_Modo* "D"))

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

  (setq loopMain T)
  (while loopMain
    (initget "D M L I A S")
    (setq opt (getkword (strcat "\n[ALTEXT] Afastamento: " (rtos *AlText_Dist* 2 2) "m | Mascara: "
                                (if *AlText_Mask* "SIM" "NAO")
                                " | [D]istancia / [M]ascara / [L]inha Fixa / [I]ndividual / [A]utomatico / [S]air <Iniciar>: ")))
    (cond
      ((= opt "D")
       (setq *AlText_Dist* (altext:lerReal "\nInforme o novo afastamento do texto (m): " *AlText_Dist*)))
      ((= opt "M")
       (setq *AlText_Mask* (not *AlText_Mask*))
       (princ (strcat "\nMascara de fundo (Background Mask): " (if *AlText_Mask* "ATIVADA" "DESATIVADA"))))
      ((= opt "L") (setq *AlText_Modo* "L") (setq loopMain nil))
      ((= opt "I") (setq *AlText_Modo* "D") (setq loopMain nil))
      ((= opt "A") (setq *AlText_Modo* "A") (setq loopMain nil))
      ((= opt "S") (setq loopMain nil *AlText_Modo* nil))
      (T (setq loopMain nil))
    )
  )

  (if *AlText_Modo*
    (progn
      (vla-StartUndoMark doc)
      (setq okCount 0 avisoCount 0 erroCount 0)

      (cond

        ;; -------------------------------------------------------------
        ;; MODO LINHA FIXA (SELECAO EM LOTE CONTRA UMA UNICA LINHA)
        ;; -------------------------------------------------------------
        ((= *AlText_Modo* "L")
         (princ "\n--- MODO LINHA FIXA ---")
         (setq entLine (entsel "\nSelecione a Tubulacao/Linha Guia de referencia: "))
         (while (and entLine (not (altext:ehCurvaValida (car entLine))))
           (princ "\n[AVISO] Objeto selecionado nao e uma linha ou curva valida.")
           (setq entLine (entsel "\nSelecione uma Tubulacao/Linha valida: "))
         )
         (if entLine
           (progn
             (setq lineObj (vlax-ename->vla-object (car entLine)))
             (princ "\nSelecione os Textos/MTexts (por clique ou janela) e de ENTER: ")
             (setq ss (ssget '((0 . "*TEXT"))))
             (if ss
               (progn
                 (repeat (setq i (sslength ss))
                   (setq e (ssname ss (setq i (1- i))))
                   (setq resultado (altext:alinharTexto e lineObj nil *AlText_Dist* *AlText_Mask*))
                   (cond
                     ((= (car resultado) "OK") (setq okCount (1+ okCount)))
                     ((= (car resultado) "AVISO")
                      (setq avisoCount (1+ avisoCount))
                      (princ (strcat "\n[AVISO] <" (altext:handle e) "> " (cdr resultado))))
                     ((= (car resultado) "ERRO")
                      (setq erroCount (1+ erroCount))
                      (princ (strcat "\n[ERRO] <" (altext:handle e) "> " (cdr resultado))))
                   )
                 )
                 (princ (strcat "\n[OK] " (itoa okCount) " alinhado(s), " (itoa avisoCount)
                                " com aviso, " (itoa erroCount) " falharam."))
               )
               (princ "\n[AVISO] Nenhum texto selecionado.")
             )
           )
         )
        )

        ;; -------------------------------------------------------------
        ;; MODO AUTOMATICO: pareia cada texto com a linha-guia mais proxima
        ;; -------------------------------------------------------------
        ((= *AlText_Modo* "A")
         (princ "\n--- MODO AUTOMATICO ---")
         (princ "\nSelecione TODAS as linhas-guia/tubulacoes candidatas e de ENTER: ")
         (setq ssLinhas (ssget '((0 . "LINE,LWPOLYLINE,POLYLINE,ARC,SPLINE,ELLIPSE,CIRCLE"))))
         (setq listaLinhas nil)
         (if ssLinhas
           (repeat (setq i (sslength ssLinhas))
             (setq e (ssname ssLinhas (setq i (1- i))))
             (if (altext:ehCurvaValida e)
               (setq listaLinhas (cons (vlax-ename->vla-object e) listaLinhas))
             )
           )
         )
         (if (null listaLinhas)
           (princ "\n[AVISO] Nenhuma linha-guia valida selecionada. Modo automatico cancelado.")
           (progn
             (princ (strcat "\n" (itoa (length listaLinhas)) " linha(s)-guia reconhecida(s)."))
             (princ "\nSelecione os Textos/MTexts a alinhar e de ENTER: ")
             (setq ssTextos (ssget '((0 . "*TEXT"))))
             (if ssTextos
               (progn
                 (repeat (setq i (sslength ssTextos))
                   (setq e (ssname ssTextos (setq i (1- i))))
                   (setq objTxt (vlax-ename->vla-object e))
                   (setq parPar (altext:linhaMaisProxima (altext:obterCentroTexto objTxt) listaLinhas))
                   (setq melhorLinha (car parPar) melhorDist (cadr parPar))
                   (if (null melhorLinha)
                     (progn
                       (setq erroCount (1+ erroCount))
                       (princ (strcat "\n[ERRO] <" (altext:handle e) "> nenhuma linha-guia encontrada."))
                     )
                     (progn
                       (setq resultado (altext:alinharTexto e melhorLinha nil *AlText_Dist* *AlText_Mask*))
                       (cond
                         ((= (car resultado) "OK") (setq okCount (1+ okCount)))
                         ((= (car resultado) "AVISO")
                          (setq avisoCount (1+ avisoCount))
                          (princ (strcat "\n[AVISO] <" (altext:handle e) "> " (cdr resultado))))
                         ((= (car resultado) "ERRO")
                          (setq erroCount (1+ erroCount))
                          (princ (strcat "\n[ERRO] <" (altext:handle e) "> " (cdr resultado))))
                       )
                       (if (> melhorDist (* 50.0 *AlText_Dist*))
                         (princ (strcat "\n[ATENCAO] <" (altext:handle e)
                                        "> associado a linha mais proxima a " (rtos melhorDist 2 2)
                                        " - confira se o pareamento esta correto."))
                       )
                     )
                   )
                 )
                 (princ (strcat "\n[OK] " (itoa okCount) " alinhado(s), " (itoa avisoCount)
                                " com aviso, " (itoa erroCount) " falharam."))
               )
               (princ "\n[AVISO] Nenhum texto selecionado.")
             )
           )
         )
        )

        ;; -------------------------------------------------------------
        ;; MODO DINAMICO / INDIVIDUAL (PAR A PAR CONTINUO)
        ;; -------------------------------------------------------------
        (T
         (princ "\n--- MODO DINAMICO: Clique no TEXTO e depois na LINHA (ESC para sair) ---")
         (while (setq entTxt (car (entsel "\nSelecione o Texto/MText: ")))
           (if (not (wcmatch (cdr (assoc 0 (entget entTxt))) "*TEXT"))
             (princ "\n[AVISO] O objeto selecionado nao e um Texto ou MText.")
             (progn
               (setq entLine (entsel "\nClique na Tubulacao/Linha guia: "))
               (if (and entLine (altext:ehCurvaValida (car entLine)))
                 (progn
                   (setq lineObj (vlax-ename->vla-object (car entLine)))
                   (setq resultado (altext:alinharTexto entTxt lineObj (cadr entLine) *AlText_Dist* *AlText_Mask*))
                   (cond
                     ((= (car resultado) "OK") (princ "\n-> Texto posicionado e alinhado com sucesso."))
                     ((= (car resultado) "AVISO") (princ (strcat "\n[AVISO] " (cdr resultado))))
                     ((= (car resultado) "ERRO") (princ (strcat "\n[ERRO] " (cdr resultado))))
                   )
                 )
                 (princ "\n[AVISO] Linha invalida ou clique fora.")
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

(princ "\nComando ALTEXT V3.0 carregado! Digite ALTEXT para executar.")
(princ)