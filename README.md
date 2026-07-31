# WYCASH LOG — Analizzatore registro di cassa

Web app statica (HTML/CSS/JS puri, nessuna dipendenza) che legge un file di log
di **WYCASH PRO** direttamente nel browser e permette di filtrare le operazioni
per data, operatore, tipo e testo libero.

Il file di log **non viene mai caricato su un server**: la lettura e il parsing
avvengono interamente sul dispositivo di chi usa l'app (`FileReader` del browser).

## Uso rapido

1. Apri `index.html` (doppio clic, oppure pubblicato via GitHub Pages — vedi sotto)
2. Trascina il file `.log` / `.txt` nell'area di caricamento
3. Filtra per data, operatore, tipo operazione o testo
4. Esporta il risultato filtrato in CSV con il bottone in basso

## Pubblicazione su GitHub Pages

```bash
git init
git add .
git commit -m "Prima versione analizzatore WYCASH LOG"
git branch -M main
git remote add origin <URL-del-tuo-repository>
git push -u origin main
```

Poi, su GitHub: **Settings → Pages → Source: branch `main`, cartella `/root`**.
Dopo un paio di minuti l'app sarà raggiungibile all'URL indicato da GitHub
(tipicamente `https://<utente>.github.io/<repo>/`).

Nessuna build, nessun `npm install`: sono 3 file statici.

## Changelog

**v3.0** — Aggiunte 3 card derivate nella sezione "Medie giornaliere":
**Incasso medio totale** (banco + tavoli, al giorno), **Scontrino medio**
(incasso totale ÷ numero scontrini, banco+tavoli insieme) e **Spesa media a
persona** (incasso dai tavoli ÷ numero coperti — include il coperto stesso).

**v2.9** — Il raggruppamento visivo preconto↔scontrino (riquadro blu) ora
funziona **anche quando ci sono altre operazioni in mezzo** (di altri
tavoli, elimina/modifica riga, ecc.) — prima serviva l'adiacenza stretta.
Include anche l'eventuale "Coperto" generato nello stesso istante dello
scontrino. Verificato: 1.227 gruppi su tutto il periodo, combaciante
esattamente con "abbinati direttamente + conto diviso".

**v2.8** — Aggiunta nella tab **Panoramica** una sezione **"Medie
giornaliere"** per il periodo selezionato (usa le date Dal/Al già
impostate nei filtri): media giornaliera di scontrini emessi **al banco**
e **ai tavoli** (sia come numero che come importo), e media giornaliera dei
**coperti** (numero e importo). La distinzione banco/tavoli si basa
sull'informazione del tavolo stampata sullo scontrino: se presente è un
tavolo, se assente (verificato: mai presente per le vendite dirette al
banco) è banco.

**v2.7** — Nella tab **Dettagli**, quando un preconto sospeso/movimento
gestionale abbinato è seguito immediatamente (senza altri eventi in mezzo)
dal suo scontrino collegato — anche in caso di conto diviso in più
scontrini — le righe vengono ora racchiuse in un **riquadro con bordo blu**
per evidenziare a colpo d'occhio l'abbinamento.

**v2.6** — Corretti due bug nell'abbinamento preconto→scontrino:
1. L'abbinamento diretto ora assegna ogni scontrino al preconto **più vicino
   nel tempo** tra tutti i candidati validi (prima veniva assegnato al primo
   preconto processato in ordine cronologico, anche se un altro preconto
   dello stesso tavolo/importo era molto più vicino al pagamento — causando
   falsi "senza scontrino associato" sul preconto sbagliato)
2. La finestra di rilevamento "ristampa" passa da 10 minuti a 3 ore, per
   coprire i conti rimasti aperti più a lungo prima del pagamento effettivo
Effetto sull'intero periodo: i preconti realmente senza scontrino scendono
da 24 a **16**.

**v2.5** — Aggiunte nella tab **Panoramica** le card di riepilogo
dell'abbinamento preconti/movimenti gestionali → scontrini: quanti abbinati
direttamente, quanti come conto diviso, quante ristampe, quanti sostituiti
(corretti) e quanti restano realmente senza scontrino — per capire subito
perché il numero di preconti non coincide 1:1 con quello degli scontrini
(ristampe e sostituiti condividono lo scontrino di un "gemello", quindi non
generano un nuovo scontrino proprio).

**v2.4** — Aggiunto il rilevamento dei preconti **sostituiti da una
correzione**: se sullo stesso tavolo un preconto viene seguito entro 30
minuti da un altro preconto (importo diverso) che invece risulta
regolarmente abbinato a uno scontrino, il primo non è più segnalato come
"orfano" ma come **sostituito** — con riferimento al preconto corretto,
allo scontrino finale e, se presente, all'articolo rimosso nel frattempo
(da un evento "Elimina riga" tra i due). Tipico di: preconto stampato →
cliente rimuove una portata → preconto ristampato con l'importo corretto →
scontrino. Effetto sull'intero periodo analizzato: i preconti realmente
senza scontrino scendono da 58 a **24**.

**v2.3** — Corretto un bug per cui i grafici della Panoramica risultavano
**vuoti quando si impostava un filtro data**, per chi apre l'app da un
fuso orario avanti rispetto a UTC (es. l'Italia): la generazione dei giorni
usava `toISOString()`, che converte in UTC e faceva slittare ogni data di
un giorno indietro, disallineando i conteggi. Ora la generazione dei giorni
lavora in UTC puro end-to-end, indipendente dal fuso orario del browser.

**v2.2** — Allargato il layout: la larghezza massima della pagina passa da
1180px a 1760px, e la barra dei filtri da 300px a 340px, per sfruttare
meglio schermi larghi (grafici e righe risultati più leggibili).

**v2.1** — Ingranditi tutti i font dell'app (+30% circa) per una migliore
leggibilità: titoli, filtri, card, righe risultati, etichette dei grafici.
Allargata anche la colonna orario nell'elenco risultati per il testo più
grande.

**v2.0** — Regolazioni alla tab **Panoramica**: ora è la tab **attiva di
default** all'apertura dell'app (prima era "Dettagli"); i grafici sono più
grandi (altezza raddoppiata, testi più leggibili); colori aggiornati —
**Scontrino contanti: verde**, **Scontrino elettronico: fucsia**,
**Preconto sospeso: blu** (e Movimento gestionale spostato su viola per
restare distinguibile dal nuovo blu).

**v1.9** — Aggiunta la tab **"Panoramica"** (accanto a "Dettagli") con:
- card riassuntive (KPI): preconti sospesi, movimenti gestionali, scontrini
  totali/contanti/elettronico con incassato, coperti, elimina riga, documenti
  di annullo
- grafici a barre SVG per giorno (nessuna libreria esterna): scontrini
  contanti vs elettronico (impilato), preconti sospesi vs movimenti
  gestionali, coperti, elimina riga, documenti di annullo
La Panoramica rispetta i filtri data/operatore ma mostra sempre tutte le
categorie, indipendentemente dalle checkbox "Tipo operazione" (quelle
restano solo per la tab Dettagli).

**v1.8** — Aggiunto il tracciamento dell'articolo **Coperto** dentro ogni
scontrino fiscale (`SENT COMMAND 3/S/COPERTO//qty/prezzo`): quantità ×
prezzo unitario = importo. Un contatore dedicato, sopra la lista risultati,
mostra il totale coperti e l'incassato da coperti nel periodo filtrato
(rispetta gli stessi filtri data/operatore di tutto il resto). Sull'intero
file: 3.297 coperti per € 9.873,00 (media € 3,00/coperto).

**v1.7** — Aggiunto il riconoscimento di **Documento di annullo**
(`SENT COMMAND +/<campo>/<ggmmaaaa>/<n.documento>/...`), il comando reale
che la stampante fiscale usa per annullare un documento fiscale già emesso.
Il dettaglio mostra il numero del documento annullato e la data. Nel file
analizzato risulta **una sola occorrenza** (02/07/2026, ore 13:50:39,
riferita al documento n. 429), circa 1 minuto e mezzo dopo la chiusura di
uno scontrino da €29,50 in contanti.

**v1.6** — Le **Chiusure fiscali (Z)** ora riportano l'importo incassato quel
giorno (somma degli scontrini fiscali della stessa data, calcolata perché la
stampante non restituisce il totale in chiaro nel log). Rilevate sia dal
click dell'operatore che dal comando reale mandato alla stampante (`x/7`),
come nel log reale (due righe per chiusura, stesso operatore ereditato).
Filtrando per data iniziale/finale e selezionando solo questo tipo, vedi
l'incassato giorno per giorno; il totale del periodo resta comunque nel
riepilogo in fondo ai risultati.

**v1.5** — Aggiunto il riconoscimento di **Annulla conto**
(`AVVIATA PROCEDURA RIMOZIONE PRODOTTI AL CONTO <N>`), con numero conto in
dettaglio. È un'azione rara (2 occorrenze nell'intero file analizzato):
in un caso il tavolo è proseguito regolarmente con scontrini fiscali dopo,
nell'altro non risulta nessuna vendita successiva prima della chiusura
fiscale di fine giornata — da verificare caso per caso.

**v1.4** — Distinzione tra **ristampe** e **preconti realmente senza scontrino**:
se due preconti hanno stesso tavolo, stesso importo ed entro 10 minuti l'uno
dall'altro, il secondo è quasi certamente una ristampa dello stesso conto
(non un'anomalia) e viene segnalato come tale invece che come "orfano".
Solo chi non ha alcun gemello resta marcato in rosso come realmente da
verificare. Sull'intero file analizzato: 1.352 preconti totali → 1.180
abbinati direttamente + 47 come conto diviso + 67 ristampe = **54 casi
isolati** senza alcuno scontrino trovato entro 30 minuti (su ~45 giorni).

> Importante: questi 54 casi NON sono automaticamente prova di incasso non
> fiscalizzato. L'algoritmo può fallire l'abbinamento anche per motivi
> innocenti — es. uno sconto applicato dopo la stampa del preconto che
> cambia l'importo finale, o un conto rimasto aperto più di 30 minuti.
> Vanno controllati caso per caso confrontandoli con i tuoi incassi reali.

**v1.3** — Aggiunto il riconoscimento dei **Movimenti gestionali (non fiscali)**:
sono preconti identici a quelli di un tavolo, ma con `Tavolo`/`Sala` = **BANCO**
(vendite dirette al banco, non un tavolo numerato). Vengono mostrati come
categoria separata e comunque abbinati al loro scontrino fiscale con la stessa
logica dei preconti normali.
> Verificato sull'intero file: tutti i 5 movimenti gestionali presenti hanno
> in realtà uno scontrino fiscale associato — la distinzione è quindi solo di
> **categoria** (banco vs tavolo), non "chiusura senza scontrino" come si
> potrebbe pensare dal nome.

**v1.2** — Aggiunto il tracciamento **Preconto sospeso → Scontrino fiscale**:
- Ogni preconto non fiscale (il "dollino" stampato al tavolo, con tavolo/sala/conto/totale) viene ora riconosciuto ed estratto
- Viene abbinato automaticamente allo scontrino fiscale che lo chiude, cercando: 1) stesso tavolo + stesso importo + primo scontrino utile dopo il preconto; 2) se non trovato, se il conto è stato **diviso** in più scontrini sullo stesso tavolo la cui somma torna con il totale del preconto
- I preconti che restano **senza alcuno scontrino associato** vengono evidenziati in rosso ed elencati in un riquadro dedicato ("log interno") sopra la lista risultati
- Aggiunte le colonne Tavolo/Sala/Conto/Abbinamento nell'export CSV

**v1.1** — Corretto un bug per cui gli scontrini pagati con **carta/POS** non
venivano riconosciuti: WYCASH scrive una riga di testo con l'importo solo per
i pagamenti in contanti (`AVVIO PAGAMENTO CONTANTI - Totale ...`); per la carta
questa riga non esiste. Ora l'importo e il metodo di pagamento vengono letti
direttamente dal comando reale inviato alla stampante fiscale
(`SENT COMMAND 5/<codice>/<importo>`), presente per **ogni** scontrino:
codice `1` = contanti, codice `4` = carta/elettronico. Aggiunto anche
l'importo in ogni riga, nell'export CSV e il totale incassato nel periodo.

> Nota: nel log è presente anche un campo a 8 cifre (es. `00000005`) che in
> alcuni tool viene mostrato come "numero documento". Analizzandolo si ripete
> identico su transazioni diverse, quindi **non sembra un numero progressivo
> di scontrino affidabile** — per questo non viene mostrato in questa app.
> Se sai a cosa corrisponde davvero (matricola? tavolo? altro?), fammelo
> sapere e lo aggiungo correttamente.

## Operazioni riconosciute

Il parsing si basa sulle etichette effettivamente scritte da WYCASH PRO nel log.
Se la tua versione del gestionale usa diciture leggermente diverse, le regex da
modificare sono tutte raccolte in cima a `app.js`, nell'oggetto `TYPE_DEFS`.

| Tipo               | Riconosciuto da (nel log)                              |
|---------------------|--------------------------------------------------------|
| Preconto            | `CLICCATO TASTO - SUBTOTALE`                            |
| Scontrino fiscale    | coppia di comandi stampante `W/...` → `X/...`. Importo e metodo di pagamento letti dal comando reale `SENT COMMAND 5/<codice>/<importo>` (codice `1` = contanti, `4` = carta/elettronico) — **non** dal testo del click, perché i pagamenti con carta non hanno una riga di testo leggibile con l'importo (a differenza dei contanti, che hanno "AVVIO PAGAMENTO CONTANTI..."). Un parser basato solo sul testo perde sistematicamente tutti gli scontrini pagati con carta. |
| Scontrino contanti (diretto) | `CLICCATO TASTO - SCONTRINO CONTANTI`           |
| Elimina riga         | `CLICCATO ELIMINA RIGA <prodotto>`                      |
| Modifica riga        | `CLICCATO TASTO MODIFICA RIGA <prodotto>`               |
| Conto diviso         | `CLICCATO TASTO - DIVIDO CONTO`                         |
| Chiusura fiscale (Z) | `CLICCATO TASTO CHIUSURA FISCALE`                       |
| Sconto applicato     | `APPLICATO SCONTO PERCENTUALE/IN EURO SUL TOTALE ...`   |
| Possibile annullo/storno | qualunque riga contenente `ANNULLO`/`ANNULLA`/`STORNO` (esclusi i contatori `ANNULLATI` del report Z) — da verificare manualmente |
| Login operatore      | `CASSIERE <NOME> LOGGATO`                               |

**Nota bene:** questo è uno strumento di lettura del log tecnico del gestionale,
utile per un controllo rapido e per l'export dei dati. Per riscontri fiscali
o legali fai sempre riferimento al report ufficiale del registratore telematico.

## Struttura del progetto

```
index.html   struttura della pagina
style.css    stile ("scontrino di carta")
app.js       parsing del log, filtri, rendering, export CSV
```
