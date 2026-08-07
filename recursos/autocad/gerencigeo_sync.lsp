;; -------------------------------------------------------------------------
;; GERENCIGEO - Sincronização LISP para AutoCAD / TopoCAD2000
;; Comando: GCOLA
;; Descrição: Lê os dados da área de transferência (Clipboard) no formato
;; do GerenciGeo e insere ou atualiza os blocos correspondentes.
;; -------------------------------------------------------------------------

(vl-load-com)

;; Função principal
(defun c:GCOLA ( / clip_text lines line )
  (setq clip_text (get-clipboard-text))
  
  (if (or (not clip_text) (= clip_text ""))
    (princ "\n[GerenciGeo] Área de transferência vazia ou formato inválido.")
    (progn
      (setq lines (string-split clip_text "\n"))
      (setq count 0)
      (foreach line lines
        (setq line (vl-string-trim " \r\n" line))
        (if (> (strlen line) 0)
          (progn
            (process-payload-line line)
            (setq count (1+ count))
          )
        )
      )
      (princ (strcat "\n[GerenciGeo] Sincronização concluída. " (itoa count) " vértice(s) processado(s)."))
    )
  )
  (princ)
)

;; Lê o Clipboard do Windows via HTMLFile COM Object
(defun get-clipboard-text ( / html result )
  (setq html (vlax-create-object "htmlfile"))
  (setq result (vl-catch-all-apply 'vlax-invoke (list (vlax-get (vlax-get html 'ParentWindow) 'ClipboardData) 'GetData "Text")))
  (vlax-release-object html)
  (if (vl-catch-all-error-p result)
    nil
    result
  )
)

;; Divide uma string baseado num delimitador
(defun string-split (str delim / pos lst)
  (while (setq pos (vl-string-search delim str))
    (setq lst (cons (substr str 1 pos) lst))
    (setq str (substr str (+ pos 1 (strlen delim))))
  )
  (reverse (cons str lst))
)

;; Processa cada linha (Ex: ACAO=NOVO;BLOCO=BL-MEMOVEM3;X=123;Y=456;Z=0;ATRIB(ID:V-01,TIPO:M,SIGMA:0.02))
(defun process-payload-line ( line / parts part pos param val acao bloco x y z id tipo sigma metpos tiplim cns matr confro attrStr attrList attr p k v pt old_attreq acadObj doc space insPt blkRef )
  (setq parts (string-split line ";"))
  (setq acao "NOVO" bloco "BL-MEMOVEP3" x 0.0 y 0.0 z 0.0 id "" tipo "" sigma "" metpos "" tiplim "" cns "" matr "" confro "")
  
  (foreach part parts
    ;; Extrai os parâmetros chave=valor
    (if (setq pos (vl-string-search "=" part))
      (progn
        (setq param (strcase (substr part 1 pos)))
        (setq val (substr part (+ pos 2)))
        (cond
          ((= param "ACAO") (setq acao (strcase val)))
          ((= param "BLOCO") (setq bloco val))
          ((= param "X") (setq x (atof val)))
          ((= param "Y") (setq y (atof val)))
          ((= param "Z") (setq z (atof val)))
        )
      )
    )
    
    ;; Extrai atributos: ATRIB(ID:V-01,TIPO:M,SIGMA:0.02)
    (if (and (> (strlen part) 6) (= (substr part 1 6) "ATRIB("))
      (progn
        (setq attrStr (substr part 7 (- (strlen part) 7))) ; Remove 'ATRIB(' e ')'
        (setq attrList (string-split attrStr ","))
        (foreach attr attrList
          (setq attr (vl-string-trim " " attr))
          (if (setq p (vl-string-search ":" attr))
            (progn
              (setq k (strcase (substr attr 1 p)))
              (setq v (substr attr (+ p 2)))
              (cond
                ((= k "ID") (setq id v))
                ((= k "TIPO") (setq tipo v))
                ((= k "SIGMA") (setq sigma v))
                ((= k "METPOS") (setq metpos v))
                ((= k "TIPLIM") (setq tiplim v))
                ((= k "CNS") (setq cns v))
                ((= k "MATR") (setq matr v))
                ((= k "CONFRO") (setq confro v))
              )
            )
          )
        )
      )
    )
  )
  
  (setq pt (list x y z))
  
  (if (= acao "NOVO")
    (progn
      ;; Tenta carregar o bloco do disco se ele ainda não estiver na tabela do desenho
      (if (not (tblsearch "BLOCK" bloco))
        (if (findfile (strcat bloco ".dwg"))
          (progn
            (setq old_attreq (getvar "ATTREQ"))
            (setvar "ATTREQ" 0)
            (vl-cmdf "_.-INSERT" bloco "0,0,0" "1" "1" "0")
            (setvar "ATTREQ" old_attreq)
            (entdel (entlast)) ; Remove a inserção temporária
          )
        )
      )
      
      (if (tblsearch "BLOCK" bloco)
        (progn
          (setq acadObj (vlax-get-acad-object))
          (setq doc (vla-get-ActiveDocument acadObj))
          ;; Tenta inserir no espaço atual (Model ou Paper)
          (setq space (if (= (vla-get-ActiveSpace doc) 1)
                          (vla-get-ModelSpace doc)
                          (vla-get-PaperSpace doc)))
          (setq insPt (vlax-3d-point pt))
          
          ;; Insere o bloco via ActiveX (garante a criação das referências de atributos silenciosamente)
          (setq blkRef (vla-InsertBlock space insPt bloco 1.0 1.0 1.0 0.0))
          
          ;; Preenche os atributos do bloco
          (update-attributes-vla blkRef id tipo sigma (rtos z 2 3) metpos tiplim cns matr confro)
          (princ (strcat "\n[GerenciGeo] Vértice " id " inserido (" bloco ")."))
        )
        (princ (strcat "\n[Erro] Bloco '" bloco "' não encontrado no desenho atual ou nas pastas de suporte. Não foi possível inserir o vértice " id "."))
      )
    )
    (if (= acao "ATUALIZAR")
      (princ "\n[GerenciGeo] Ação de atualização via clique na tela ainda não implementada para este vértice.")
    )
  )
)

;; Atualiza os atributos da entidade ActiveX informada
(defun update-attributes-vla ( blkRef id tipo sigma cota metpos tiplim cns matr confro / atts att tag i )
  (if (= (vla-get-HasAttributes blkRef) :vlax-true)
    (progn
      (setq atts (vlax-variant-value (vla-GetAttributes blkRef)))
      (if (>= (vlax-safearray-get-u-bound atts 1) 0)
        (progn
          (setq i 0)
          (while (<= i (vlax-safearray-get-u-bound atts 1))
            (setq att (vlax-safearray-get-element atts i))
            (setq tag (strcase (vla-get-TagString att)))
            (cond
              ((or (= tag "ID") (= tag "NOME") (= tag "VERTICE") (= tag "PONTO")) (vla-put-TextString att id))
              ((or (= tag "TIPO") (= tag "TIP_VERT")) (vla-put-TextString att tipo))
              ((or (= tag "SIGMA") (= tag "SIGMAX") (= tag "SIGMAY") (= tag "SIGMAZ")) (vla-put-TextString att sigma))
              ((or (= tag "COTA") (= tag "Z") (= tag "ALT") (= tag "ALTITUDE")) (vla-put-TextString att cota))
              ((or (= tag "METPOS") (= tag "METODO")) (vla-put-TextString att metpos))
              ((or (= tag "TIPLIM") (= tag "LIMITE")) (vla-put-TextString att tiplim))
              ((or (= tag "CNS") (= tag "CARTORIO")) (vla-put-TextString att cns))
              ((or (= tag "MATR") (= tag "MATRICULA")) (vla-put-TextString att matr))
              ((or (= tag "CONFRO") (= tag "CONFRONTANTE") (= tag "NOME_CONFRO")) (vla-put-TextString att confro))
            )
            (setq i (1+ i))
          )
        )
      )
    )
  )
)

(princ "\n[GerenciGeo] Rotina carregada com sucesso! Digite GCOLA para colar os pontos ou GCOPIAR para copiar pontos do CAD pro sistema.")
(princ)

;; Grava texto na Área de Transferência (Clipboard) do Windows via HTMLFile
(defun set-clipboard-text ( str / html window clip result )
  (setq html (vlax-create-object "htmlfile"))
  (if html
    (progn
      (setq window (vlax-get html 'ParentWindow))
      (setq clip (vlax-get window 'ClipboardData))
      (setq result (vl-catch-all-apply 'vlax-invoke (list clip 'SetData "Text" str)))
      (vlax-release-object html)
      (not (vl-catch-all-error-p result))
    )
    nil
  )
)

;; Extrai atributos de um bloco VLA e retorna uma lista de associativa
(defun get-block-attributes-assoc ( blkRef / atts att tag val i res )
  (setq res '())
  (if (= (vla-get-HasAttributes blkRef) :vlax-true)
    (progn
      (setq atts (vlax-variant-value (vla-GetAttributes blkRef)))
      (if (>= (vlax-safearray-get-u-bound atts 1) 0)
        (progn
          (setq i 0)
          (while (<= i (vlax-safearray-get-u-bound atts 1))
            (setq att (vlax-safearray-get-element atts i))
            (setq tag (strcase (vla-get-TagString att)))
            (setq val (vla-get-TextString att))
            (setq res (cons (cons tag val) res))
            (setq i (1+ i))
          )
        )
      )
    )
  )
  res
)

;; Busca valor de chave na lista associativa com fallbacks de tags
(defun find-attr-val ( alist tags default_val / found pair tag )
  (setq found default_val)
  (foreach pair alist
    (setq tag (car pair))
    (if (member tag tags)
      (setq found (cdr pair))
    )
  )
  found
)

;; Comando GCOPIAR / GCOPIA: Seleciona blocos no CAD e copia payload pro Clipboard
(defun c:GCOPIAR ( / ss i ent obj blkName pt x y z attList id tipo sigma metpos tiplim cns matr confro line lines payloadStr count )
  (princ "\n[GerenciGeo] Selecione os blocos de pontos para copiar (ou Enter para todos): ")
  (setq ss (ssget '((0 . "INSERT"))))
  (if (not ss)
    (setq ss (ssget "_X" '((0 . "INSERT"))))
  )
  
  (if (not ss)
    (princ "\n[GerenciGeo] Nenhum bloco encontrado no desenho.")
    (progn
      (setq lines '())
      (setq count 0)
      (setq i 0)
      (while (< i (sslength ss))
        (setq ent (ssname ss i))
        (setq obj (vlax-ename->vla-object ent))
        (if (= (vla-get-HasAttributes obj) :vlax-true)
          (progn
            ;; Nome do bloco (suporta blocos dinâmicos)
            (setq blkName (if (vlax-property-available-p obj 'EffectiveName)
                            (vla-get-EffectiveName obj)
                            (vla-get-Name obj)))
            ;; Coordenadas
            (setq pt (vlax-safearray->list (vlax-variant-value (vla-get-InsertionPoint obj))))
            (setq x (car pt))
            (setq y (cadr pt))
            (setq z (caddr pt))
            
            ;; Atributos
            (setq attList (get-block-attributes-assoc obj))
            (setq id (find-attr-val attList '("ID" "NOME" "VERTICE" "PONTO") ""))
            (setq tipo (find-attr-val attList '("TIPO" "TIP_VERT") "V"))
            (setq sigma (find-attr-val attList '("SIGMA" "SIGMAX" "SIGMAY" "SIGMAZ") "0.000"))
            (setq metpos (find-attr-val attList '("METPOS" "METODO") ""))
            (setq tiplim (find-attr-val attList '("TIPLIM" "LIMITE") ""))
            (setq cns (find-attr-val attList '("CNS" "CARTORIO") ""))
            (setq matr (find-attr-val attList '("MATR" "MATRICULA") ""))
            (setq confro (find-attr-val attList '("CONFRO" "CONFRONTANTE" "NOME_CONFRO") ""))
            
            ;; Formata a linha de payload
            (if (> (strlen id) 0)
              (progn
                (setq line (strcat "ACAO=NOVO;BLOCO=" blkName 
                                  ";X=" (rtos x 2 4) 
                                  ";Y=" (rtos y 2 4) 
                                  ";Z=" (rtos z 2 4) 
                                  ";ATRIB(ID:" id 
                                  ",TIPO:" tipo 
                                  ",SIGMA:" sigma 
                                  ",METPOS:" metpos 
                                  ",TIPLIM:" tiplim 
                                  ",CNS:" cns 
                                  ",MATR:" matr 
                                  ",CONFRO:" confro ")"))
                (setq lines (cons line lines))
                (setq count (1+ count))
              )
            )
          )
        )
        (setq i (1+ i))
      )
      
      (if (> count 0)
        (progn
          (setq lines (reverse lines))
          ;; Monta a string dividida por quebras de linha
          (setq payloadStr "")
          (foreach l lines
            (setq payloadStr (if (= payloadStr "") l (strcat payloadStr "\n" l)))
          )
          (if (set-clipboard-text payloadStr)
            (princ (strcat "\n[GerenciGeo] Sucesso! " (itoa count) " vértice(s) copiado(s) para o Clipboard no formato GerenciGeo. Cole na Mesa de Trabalho do sistema."))
            (princ "\n[GerenciGeo Erro] Falha ao gravar dados na Área de Transferência.")
          )
        )
        (princ "\n[GerenciGeo] Nenhum bloco de vértice válido com ID encontrado na seleção.")
      )
    )
  )
  (princ)
)

(defun c:GCOPIA () (c:GCOPIAR))

