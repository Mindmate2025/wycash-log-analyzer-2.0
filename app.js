/* ============================================================
   WYCASH LOG ANALYZER
   Parsing 100% client-side del log WYCASH PRO (nessun upload).
   Legenda dei formati riconosciuti in TYPE_DEFS più sotto:
   se il tuo gestionale usa etichette leggermente diverse,
   modifica qui le regex — è l'unico posto da toccare.
   ============================================================ */

(() => {
  "use strict";

  // ---------------------------------------------------------
  // 1) DEFINIZIONE DEI TIPI DI OPERAZIONE RICONOSCIUTI
  //    ogni tipo "semplice" viene rilevato riga per riga.
  //    "scontrino_fiscale" è invece ricostruito dalla coppia
  //    di comandi W/...X/ verso la stampante fiscale (SF20).
  // ---------------------------------------------------------
  const TYPE_DEFS = {
    subtotale: {
      label: "Subtotale (tasto)",
      color: "#8C8672",
      re: /CLICCATO TASTO - SUBTOTALE/i,
      detail: () => "Calcolo subtotale richiesto"
    },
    preconto_sospeso: {
      label: "Preconto sospeso",
      color: "#2F5D53",
      synthetic: true // ricostruito dal blocco di stampa "DOLLINO...m/"
    },
    movimento_gestionale: {
      label: "Movimento gestionale (non fiscale)",
      color: "#3E6B8A",
      synthetic: true // stesso blocco "DOLLINO...m/" ma con Tavolo/Sala = BANCO (vendita al banco, non un tavolo)
    },
    scontrino_contanti_diretto: {
      label: "Scontrino contanti (diretto)",
      color: "#201D18",
      re: /CLICCATO TASTO - SCONTRINO CONTANTI/i,
      detail: () => "Contanti — tasto diretto"
    },
    scontrino_fiscale: {
      label: "Scontrino fiscale",
      color: "#201D18",
      synthetic: true // generato nel secondo passaggio, non da regex riga-per-riga
    },
    coperto: {
      label: "Coperto",
      color: "#B08A3E",
      synthetic: true // estratto dalla riga articolo "3/S/COPERTO//qty/prezzo/..." dentro lo scontrino fiscale
    },
    elimina_riga: {
      label: "Elimina riga",
      color: "#A3231C",
      re: /CLICCATO ELIMINA RIGA\s+(.*)$/i,
      detail: (m) => m[1].trim() || "(prodotto non specificato)"
    },
    modifica_riga: {
      label: "Modifica riga",
      color: "#C24B3F",
      re: /CLICCATO TASTO MODIFICA RIGA\s+(.*)$/i,
      detail: (m) => m[1].trim() || "(prodotto non specificato)"
    },
    dividi_conto: {
      label: "Conto diviso",
      color: "#6B6558",
      re: /CLICCATO TASTO - DIVIDO CONTO/i,
      detail: () => "Divisione conto"
    },
    chiusura_fiscale: {
      label: "Chiusura fiscale (Z)",
      color: "#4C7A6E",
      // Sia il click dell'operatore che il comando reale mandato alla stampante (x/7)
      re: /CLICCATO TASTO CHIUSURA FISCALE|SENT COMMAND x\/7\//i,
      detail: () => "Report di chiusura giornaliera"
    },
    annulla_conto: {
      label: "Annulla conto",
      color: "#C0392B",
      re: /AVVIATA PROCEDURA RIMOZIONE PRODOTTI AL CONTO\s*(\d+)/i,
      detail: (m) => `Conto ${m[1]}`
    },
    documento_annullo: {
      label: "Documento di annullo",
      color: "#B02A2A",
      // Comando reale alla stampante fiscale: +/<campo>/<ggmmaaaa>/<n.documento>/<campo>/<crc>
      re: /SENT COMMAND \+\/(\d+)\/(\d{2})(\d{2})(\d{4})\/(\d+)/,
      detail: (m) => `Annullo documento fiscale · Rif. scontrino n. ${m[5]} del ${m[2]}/${m[3]}/${m[4]}`
    },
    sconto: {
      label: "Sconto applicato",
      color: "#9C7A2E",
      re: /APPLICATO SCONTO (PERCENTUALE|IN EURO) SUL TOTALE\s*([\d.,]+)/i,
      detail: (m) => `${m[1] === "PERCENTUALE" ? "Percentuale" : "In euro"} — ${m[2]}`
    },
    possibile_annullo: {
      label: "Possibile annullo/storno",
      color: "#7A0F0A",
      // Esclude "ANNULLATI" (contatore del report Z), "RIMOZIONE PRODOTTI" (già tipo a parte) e falsi positivi tipo "PRESO"
      re: /\bANNULL(O|A|ANDO)\b|\bSTORNO\b/i,
      detail: (m) => "Verificare manualmente: " + m[0]
    },
    login: {
      label: "Login operatore",
      color: "#A39C89",
      re: /CASSIERE\s+(\w+)\s+LOGGATO/i,
      detail: (m) => `Operatore: ${m[1]}`
    }
  };

  // Etichetta pagamento usata come FALLBACK quando il codice del comando 5/ non è mappato
  const PAYMENT_MARKERS = [
    { re: /Cliccato TASTO CARTE/i,               label: "Carta" },
    { re: /Cliccato TASTO CONTANTI/i,            label: "Contanti" },
    { re: /CLICCATO TASTO - SCONTRINO CONTANTI/i, label: "Contanti (diretto)" }
  ];

  // Fonte primaria (affidabile): il codice metodo di pagamento dentro il comando
  // "SENT COMMAND 5/<codice>/<importo>" inviato alla stampante fiscale.
  // NB: per i pagamenti con carta WYCASH NON scrive nessuna riga di testo leggibile
  // con l'importo (a differenza dei contanti, che hanno "AVVIO PAGAMENTO CONTANTI...").
  // L'unico posto in cui importo e metodo carta compaiono è questo comando grezzo:
  // è per questo che un parser basato solo sul testo perde tutti gli scontrini con carta.
  const PAYMENT_CODES = {
    "1": "Contanti",
    "4": "Carta / Elettronico"
  };
  const PAYMENT_CMD_RE = /SENT COMMAND 5\/(\d+)\/([\d.,]+)/;

  // Blocco di stampa del preconto non fiscale ("dollino"): inizia con l'intestazione
  // "DOLLINO IN <sala>" e finisce con il comando m/ — diverso dal blocco W/...X/
  // dello scontrino fiscale. Dentro, ogni riga di contenuto arriva come
  // "SENT COMMAND 7/x/y/<testo>/<checksum>".
  const ITEM_LINE_RE = /SENT COMMAND 7\/\d+\/\d+\/(.*)\/\d{2}$/;
  const DOLLINO_RE   = /^DOLLINO IN\s+/i;
  const TAVOLO_RE     = /^Tavolo:\s*(.+)$/i;
  const SALA_RE        = /^Sala:\s*(.+)$/i;
  const CONTO_RE       = /^Conto:?\s*(\d+)$/i;
  const TOTAL_RE       = /^TOTAL\s+([\d.,]+)$/i;
  // Sullo scontrino fiscale il tavolo compare in forma diversa: "TAV 21-PIAZZA"
  const TAV_SALA_RE    = /^TAV\s+(\S+)-(.+)$/i;
  // Riga articolo "coperto" dentro il blocco scontrino fiscale (comando 3/S/...)
  const COPERTO_RE = /SENT COMMAND 3\/S\/COPERTO\/\/([\d.]+)\/([\d.]+)/;

  const LINE_RE = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}\.\d{3});([^;]*);\s?(.*)$/;

  // ---------------------------------------------------------
  // STATO GLOBALE
  // ---------------------------------------------------------
  let allEvents = [];      // tutti gli eventi riconosciuti, ordinati cronologicamente
  let operators = new Set();
  let fileName = "";

  // ---------------------------------------------------------
  // DOM
  // ---------------------------------------------------------
  const dropzone      = document.getElementById("dropzone");
  const fileInput     = document.getElementById("fileInput");
  const dropLabel     = document.getElementById("dropLabel");
  const fileMeta      = document.getElementById("fileMeta");
  const filterBlock   = document.getElementById("filterBlock");
  const emptyState    = document.getElementById("emptyState");
  const resultsWrap   = document.getElementById("resultsWrap");
  const dateFrom      = document.getElementById("dateFrom");
  const dateTo        = document.getElementById("dateTo");
  const operatorSel   = document.getElementById("operatorFilter");
  const typeChecks    = document.getElementById("typeChecks");
  const textSearch    = document.getElementById("textSearch");
  const resetBtn      = document.getElementById("resetBtn");
  const resultsList   = document.getElementById("resultsList");
  const summaryChips  = document.getElementById("summaryChips");
  const receiptRange  = document.getElementById("receiptRange");
  const totalCount    = document.getElementById("totalCount");
  const exportBtn     = document.getElementById("exportBtn");

  // ---------------------------------------------------------
  // CARICAMENTO FILE
  // ---------------------------------------------------------
  dropzone.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("dragover", (e) => { e.preventDefault(); dropzone.classList.add("drag-over"); });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("drag-over"));
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("drag-over");
    if (e.dataTransfer.files && e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener("change", (e) => {
    if (e.target.files && e.target.files[0]) loadFile(e.target.files[0]);
  });

  function loadFile(file) {
    fileName = file.name;
    dropLabel.innerHTML = `Analisi in corso…`;
    const reader = new FileReader();
    reader.onload = (e) => {
      parseLog(e.target.result);
      dropLabel.innerHTML = `File caricato.<br><small>Clicca per sostituirlo</small>`;
      fileMeta.textContent = `${fileName} — ${(file.size / 1024).toFixed(0)} KB — ${allEvents.length.toLocaleString("it-IT")} operazioni riconosciute`;
      filterBlock.hidden = false;
      buildOperatorOptions();
      buildTypeChecks();
      applyDefaultDateRange();
      render();
    };
    reader.onerror = () => {
      dropLabel.innerHTML = `Errore di lettura file.<br><small>Riprova</small>`;
    };
    reader.readAsText(file, "utf-8");
  }

  // ---------------------------------------------------------
  // PARSING
  // ---------------------------------------------------------
  function parseLog(text) {
    allEvents = [];
    operators = new Set();

    const lines = text.split(/\r\n|\n|\r/);
    let lastPayment = null;      // fallback testuale: { label, operator }
    let pendingPayment = null;   // fonte primaria: { code, amount } dal comando 5/
    let currentOperator = "";    // le righe SF20/di sistema non riportano l'operatore: eredita l'ultimo noto
    let openPreconto = null;     // blocco preconto in costruzione: { date, time, table, sala, conto, total }
    let pendingTable = null;     // tavolo/sala letti sullo scontrino fiscale in chiusura: { table, sala }
    let pendingCoperti = null;   // coperti letti nello scontrino in chiusura: { qty, amount }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      const m = LINE_RE.exec(line);
      if (!m) continue;

      const date = m[1];
      const time = m[2];
      const operatorRaw = m[3].trim();
      const rest = m[4];
      const operator = operatorRaw ? operatorRaw.split("-")[0].trim() : "";

      if (operator) {
        operators.add(operator);
        currentOperator = operator;
      }

      // Contenuto stampato dalla stampante (sia il preconto che lo scontrino passano da qui)
      const im = ITEM_LINE_RE.exec(rest);
      if (im) {
        const content = im[1].trim();

        if (DOLLINO_RE.test(content)) {
          // Inizio stampa di un nuovo preconto non fiscale
          openPreconto = { table: null, sala: null, conto: null, total: null };
        } else if (openPreconto) {
          let mm;
          if ((mm = TAVOLO_RE.exec(content))) openPreconto.table = mm[1].trim();
          else if ((mm = SALA_RE.exec(content))) openPreconto.sala = mm[1].trim();
          else if ((mm = CONTO_RE.exec(content))) openPreconto.conto = mm[1];
          else if ((mm = TOTAL_RE.exec(content))) openPreconto.total = parseFloat(mm[1].replace(",", "."));
        }

        // Tavolo/sala stampati anche sul corpo dello scontrino fiscale ("TAV 21-PIAZZA")
        const tm = TAV_SALA_RE.exec(content);
        if (tm) pendingTable = { table: tm[1].trim(), sala: tm[2].trim() };
      }

      // Chiusura del blocco preconto non fiscale (comando m/): genera l'evento "Preconto sospeso"
      // (oppure "Movimento gestionale" se è una vendita al banco, tavolo/sala = BANCO)
      if (/SENT COMMAND m\//.test(rest) && openPreconto) {
        const isBanco = (openPreconto.table || "").toUpperCase().includes("BANCO")
                     || (openPreconto.sala || "").toUpperCase() === "BANCO";
        allEvents.push({
          ...openPreconto,
          date, time, type: isBanco ? "movimento_gestionale" : "preconto_sospeso", operator: currentOperator,
          amount: openPreconto.total,
          detail: `Tavolo: ${openPreconto.table || "?"} · Sala: ${openPreconto.sala || "?"} · Conto: ${openPreconto.conto || "?"}`
        });
        openPreconto = null;
        continue;
      }

      // Traccia l'ultimo metodo di pagamento selezionato (fallback, se il comando 5/ mancasse)
      for (const pm of PAYMENT_MARKERS) {
        if (pm.re.test(rest)) {
          lastPayment = { label: pm.label };
          break;
        }
      }

      // Fonte primaria: comando reale inviato alla stampante fiscale con codice metodo + importo.
      // Funziona identicamente per contanti e carta (a differenza delle righe di testo).
      const pay = PAYMENT_CMD_RE.exec(rest);
      if (pay) {
        pendingPayment = { code: pay[1], amount: parseFloat(pay[2].replace(",", ".")) };
      }

      // Riga articolo "coperto" venduta nello scontrino (quantità × prezzo unitario)
      const cop = COPERTO_RE.exec(rest);
      if (cop) {
        const qty = parseFloat(cop[1]);
        const prezzo = parseFloat(cop[2]);
        pendingCoperti = { qty, amount: qty * prezzo };
      }

      // Chiusura di uno scontrino fiscale verso la stampante (comando X/ dopo W/)
      // NB: case-sensitive di proposito — il comando minuscolo "x/" è un comando diverso
      if (/SENT COMMAND X\//.test(rest)) {
        const methodLabel = pendingPayment
          ? (PAYMENT_CODES[pendingPayment.code] || `Metodo non mappato (codice ${pendingPayment.code})`)
          : (lastPayment ? lastPayment.label : null);
        const amount = pendingPayment ? pendingPayment.amount : null;

        allEvents.push({
          date, time, type: "scontrino_fiscale",
          operator: currentOperator,
          amount,
          table: pendingTable ? pendingTable.table : null,
          sala: pendingTable ? pendingTable.sala : null,
          detail: methodLabel
            ? `Pagamento: ${methodLabel}${pendingTable ? ` · Tavolo: ${pendingTable.table} · Sala: ${pendingTable.sala}` : ""}`
            : "Metodo di pagamento non determinato"
        });

        if (pendingCoperti) {
          allEvents.push({
            date, time, type: "coperto",
            operator: currentOperator,
            amount: pendingCoperti.amount,
            qty: pendingCoperti.qty,
            detail: `${pendingCoperti.qty} coperto/i · € ${pendingCoperti.amount.toFixed(2).replace(".", ",")}`
          });
        }

        pendingPayment = null;
        pendingTable = null;
        pendingCoperti = null;
        lastPayment = null;
        continue;
      }

      // Tutti gli altri tipi semplici, riga per riga
      for (const [key, def] of Object.entries(TYPE_DEFS)) {
        if (def.synthetic) continue;
        const mm = def.re.exec(rest);
        if (mm) {
          // "ANNULLATI" è un contatore del report Z, non un'operazione di annullo: escludilo esplicitamente
          if (key === "possibile_annullo" && /ANNULLATI/i.test(rest)) continue;
          allEvents.push({ date, time, type: key, operator: operator || currentOperator, detail: def.detail(mm) });
          break;
        }
      }
    }

    allEvents.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    pairPrecontiConScontrini(allEvents);
    attachChiusuraTotals(allEvents);
    emptyState.hidden = true;
    resultsWrap.hidden = false;
  }

  // ---------------------------------------------------------
  // TOTALE INCASSATO PER CHIUSURA FISCALE
  // La stampante fiscale non restituisce il totale del giorno in chiaro nel
  // log (stampa il report Z fisicamente): lo calcoliamo sommando gli
  // scontrini fiscali della stessa data e lo associamo a ogni evento di
  // chiusura di quel giorno.
  // ---------------------------------------------------------
  function attachChiusuraTotals(events) {
    const totaliPerData = {};
    events.filter((e) => e.type === "scontrino_fiscale" && typeof e.amount === "number")
      .forEach((e) => { totaliPerData[e.date] = (totaliPerData[e.date] || 0) + e.amount; });

    events.filter((e) => e.type === "chiusura_fiscale").forEach((e) => {
      const totale = totaliPerData[e.date] || 0;
      e.amount = totale;
      e.detail = `Report di chiusura giornaliera · Incassato: € ${totale.toFixed(2).replace(".", ",")}`;
    });
  }

  // ---------------------------------------------------------
  // ABBINAMENTO PRECONTO SOSPESO <-> SCONTRINO FISCALE
  // Ogni preconto dovrebbe avere uno scontrino fiscale corrispondente.
  // Prova prima un abbinamento diretto (stesso tavolo, stesso importo,
  // il primo scontrino utile dopo il preconto); se non trova nulla,
  // prova a vedere se il conto è stato DIVISO in più scontrini sullo
  // stesso tavolo la cui somma torna con il totale del preconto.
  // Chi resta senza abbinamento viene segnalato come "non abbinato".
  // ---------------------------------------------------------
  function pairPrecontiConScontrini(events) {
    const preconti = events
      .filter((e) => e.type === "preconto_sospeso" || e.type === "movimento_gestionale")
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    const scontrini = events.filter((e) => e.type === "scontrino_fiscale");
    const used = new Set();

    const toMs = (e) => new Date(`${e.date}T${e.time}`).getTime();
    const tableNum = (t) => (t || "").replace(/TAV/i, "").trim();

    // Passo 1: abbinamento diretto 1:1 (stesso importo, stesso tavolo se disponibile, il più vicino nel tempo)
    preconti.forEach((p) => {
      if (typeof p.amount !== "number" || isNaN(p.amount)) { p.matchStatus = "no-amount"; return; }
      let best = null, bestScore = Infinity;
      scontrini.forEach((s, idx) => {
        if (used.has(idx)) return;
        if (s.date !== p.date) return;
        if (typeof s.amount !== "number") return;
        if (toMs(s) < toMs(p)) return;
        if (Math.abs(s.amount - p.amount) > 0.05) return;
        const sameTable = p.table && s.table && tableNum(p.table) === s.table;
        const score = (sameTable ? 0 : 1000) + (toMs(s) - toMs(p));
        if (score < bestScore) { bestScore = score; best = idx; }
      });
      if (best !== null) {
        used.add(best);
        p.matchStatus = "diretto";
        p.linkedScontrini = [scontrini[best]];
      }
    });

    // Passo 2: conto diviso — somma dei prossimi scontrini non ancora usati sullo stesso tavolo
    preconti.filter((p) => !p.matchStatus || p.matchStatus === "no-amount").forEach((p) => {
      if (typeof p.amount !== "number" || isNaN(p.amount)) return;
      const table = tableNum(p.table);
      const candidates = scontrini
        .map((s, idx) => ({ s, idx }))
        .filter(({ s, idx }) => !used.has(idx) && s.date === p.date && s.table === table
          && toMs(s) >= toMs(p) && toMs(s) - toMs(p) <= 30 * 60 * 1000)
        .sort((a, b) => toMs(a.s) - toMs(b.s));

      let sum = 0;
      const consumed = [];
      for (const c of candidates) {
        sum += c.s.amount;
        consumed.push(c);
        if (Math.abs(sum - p.amount) <= 0.05) break;
      }
      if (Math.abs(sum - p.amount) <= 0.05 && consumed.length > 1) {
        consumed.forEach((c) => used.add(c.idx));
        p.matchStatus = "diviso";
        p.linkedScontrini = consumed.map((c) => c.s);
      } else {
        p.matchStatus = "orfano";
      }
    });

    // Passo 3: tra chi resta senza scontrino, chi ha un "gemello" — stesso tavolo,
    // stesso importo, stampato entro 10 minuti — è quasi certamente una RISTAMPA
    // dello stesso conto (es. copia per il cliente, errore di stampa), non un conto
    // realmente senza scontrino. Lo segnaliamo separatamente per non generare falsi allarmi.
    preconti.filter((p) => p.matchStatus === "orfano").forEach((p) => {
      const table = tableNum(p.table);
      const sibling = preconti.find((q) => q !== p && tableNum(q.table) === table
        && typeof q.amount === "number" && Math.abs(q.amount - p.amount) <= 0.05
        && Math.abs(toMs(q) - toMs(p)) <= 10 * 60 * 1000);
      if (sibling) {
        p.matchStatus = "ristampa";
        p.reprintOf = sibling;
      }
    });

    // Aggiorna il testo di dettaglio in base all'esito dell'abbinamento
    preconti.forEach((p) => {
      const base = `Tavolo: ${p.table || "?"} · Sala: ${p.sala || "?"} · Conto: ${p.conto || "?"}`;
      if (p.matchStatus === "diretto") {
        p.detail = `${base} · ✓ scontrino delle ${p.linkedScontrini[0].time.slice(0, 8)}`;
      } else if (p.matchStatus === "diviso") {
        const orari = p.linkedScontrini.map((s) => s.time.slice(0, 8)).join(", ");
        p.detail = `${base} · ✓ conto diviso in ${p.linkedScontrini.length} scontrini (${orari})`;
      } else if (p.matchStatus === "ristampa") {
        p.detail = `${base} · ↻ probabile ristampa dello stesso conto (${p.reprintOf.time.slice(0, 8)}), non un'anomalia`;
      } else {
        p.orphan = true;
        p.detail = `⚠ NESSUNO SCONTRINO ASSOCIATO — ${base}`;
      }
    });
  }

  // ---------------------------------------------------------
  // UI DINAMICA: operatori e tipi
  // ---------------------------------------------------------
  function buildOperatorOptions() {
    operatorSel.innerHTML = `<option value="">Tutti gli operatori</option>`;
    [...operators].sort().forEach((op) => {
      const o = document.createElement("option");
      o.value = op; o.textContent = op;
      operatorSel.appendChild(o);
    });
  }

  function buildTypeChecks() {
    typeChecks.innerHTML = "";
    const counts = {};
    allEvents.forEach((e) => { counts[e.type] = (counts[e.type] || 0) + 1; });

    Object.entries(TYPE_DEFS).forEach(([key, def]) => {
      const n = counts[key] || 0;
      const id = `chk_${key}`;
      const label = document.createElement("label");
      label.className = "check-item" + (n === 0 ? " disabled" : "");
      label.innerHTML = `
        <input type="checkbox" id="${id}" data-type="${key}" ${n === 0 ? "disabled" : "checked"}>
        <span class="swatch" style="background:${def.color}"></span>
        <span>${def.label}</span>
        <span class="count">${n}</span>
      `;
      typeChecks.appendChild(label);
    });

    typeChecks.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.addEventListener("change", render);
    });
  }

  function applyDefaultDateRange() {
    if (allEvents.length === 0) return;
    dateFrom.value = allEvents[0].date;
    dateTo.value = allEvents[allEvents.length - 1].date;
  }

  // ---------------------------------------------------------
  // FILTRI + RENDER
  // ---------------------------------------------------------
  [dateFrom, dateTo, operatorSel, textSearch].forEach((el) => {
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });

  resetBtn.addEventListener("click", () => {
    applyDefaultDateRange();
    operatorSel.value = "";
    textSearch.value = "";
    typeChecks.querySelectorAll('input[type="checkbox"]:not(:disabled)').forEach((cb) => (cb.checked = true));
    render();
  });

  function getActiveTypes() {
    const active = new Set();
    typeChecks.querySelectorAll('input[type="checkbox"]:checked').forEach((cb) => active.add(cb.dataset.type));
    return active;
  }

  function getFiltered() {
    const from = dateFrom.value || "0000-00-00";
    const to = dateTo.value || "9999-99-99";
    const op = operatorSel.value;
    const q = textSearch.value.trim().toLowerCase();
    const activeTypes = getActiveTypes();

    return allEvents.filter((e) => {
      if (e.date < from || e.date > to) return false;
      if (!activeTypes.has(e.type)) return false;
      if (op && e.operator !== op) return false;
      if (q && !(e.detail.toLowerCase().includes(q) || TYPE_DEFS[e.type].label.toLowerCase().includes(q))) return false;
      return true;
    });
  }

  function render() {
    const filtered = getFiltered();

    // --- intestazione periodo ---
    receiptRange.textContent = filtered.length
      ? `${filtered[0].date} → ${filtered[filtered.length - 1].date}`
      : "Nessun risultato";

    // --- chips di riepilogo ---
    const counts = {};
    filtered.forEach((e) => { counts[e.type] = (counts[e.type] || 0) + 1; });
    summaryChips.innerHTML = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([type, n]) => `
        <span class="chip">
          <span class="dot" style="background:${TYPE_DEFS[type].color}"></span>
          ${TYPE_DEFS[type].label} <b>${n}</b>
        </span>
      `).join("") || `<span class="chip">Nessuna operazione nel periodo selezionato</span>`;

    // --- avviso preconti senza scontrino associato (log interno) ---
    const orphans = filtered.filter((e) => (e.type === "preconto_sospeso" || e.type === "movimento_gestionale") && e.orphan);
    const orphanBanner = document.getElementById("orphanBanner");
    if (orphans.length > 0) {
      orphanBanner.hidden = false;
      orphanBanner.innerHTML = `
        <div class="orphan-title">⚠ ${orphans.length} preconto/i senza scontrino fiscale associato</div>
        ${orphans.map((o) => `
          <div class="orphan-row">
            <span class="time">${o.date} ${o.time.slice(0, 8)}</span>
            <span>${escapeHtml(o.detail.replace("⚠ NESSUNO SCONTRINO ASSOCIATO — ", ""))}</span>
            <b class="amount">€ ${(o.amount || 0).toFixed(2).replace(".", ",")}</b>
          </div>`).join("")}
      `;
    } else {
      orphanBanner.hidden = true;
      orphanBanner.innerHTML = "";
    }

    // --- lista raggruppata per giorno ---
    if (filtered.length === 0) {
      resultsList.innerHTML = `<div class="no-results">Nessuna operazione corrisponde ai filtri attuali.</div>`;
    } else {
      const byDay = {};
      filtered.forEach((e) => { (byDay[e.date] = byDay[e.date] || []).push(e); });

      resultsList.innerHTML = Object.keys(byDay).sort().map((date) => {
        const rows = byDay[date].map((e) => {
          const def = TYPE_DEFS[e.type];
          const amountTxt = (typeof e.amount === "number" && !isNaN(e.amount))
            ? `<b class="amount">€ ${e.amount.toFixed(2).replace(".", ",")}</b> — `
            : "";
          return `
            <div class="row${e.orphan ? " row-orphan" : ""}">
              <span class="time">${e.time.slice(0, 8)}</span>
              <span class="dot" style="background:${def.color}"></span>
              <span class="desc">
                <b>${def.label}</b> — ${amountTxt}${escapeHtml(e.detail)}
                ${e.operator ? `<span class="op">· ${escapeHtml(e.operator)}</span>` : ""}
              </span>
            </div>`;
        }).join("");
        return `
          <div class="day-group">
            <div class="day-heading">${formatDateIt(date)} <span class="n">${byDay[date].length} operazioni</span></div>
            ${rows}
          </div>`;
      }).join("");
    }

    const incassato = filtered
      .filter((e) => e.type === "scontrino_fiscale" && typeof e.amount === "number" && !isNaN(e.amount))
      .reduce((sum, e) => sum + e.amount, 0);
    const incassatoTxt = incassato > 0
      ? ` · incassato € ${incassato.toFixed(2).replace(".", ",")}`
      : "";

    const coperti = filtered.filter((e) => e.type === "coperto");
    const coperiQty = coperti.reduce((sum, e) => sum + (e.qty || 0), 0);
    const coperiImporto = coperti.reduce((sum, e) => sum + (e.amount || 0), 0);
    const coperchioBox = document.getElementById("coperchioCounter");
    if (coperiQty > 0) {
      coperchioBox.hidden = false;
      coperchioBox.innerHTML = `
        <span class="chip chip-coperto">
          🍽️ Coperti nel periodo: <b>${coperiQty.toLocaleString("it-IT")}</b>
          · Incassato coperti: <b>€ ${coperiImporto.toFixed(2).replace(".", ",")}</b>
        </span>`;
    } else {
      coperchioBox.hidden = true;
      coperchioBox.innerHTML = "";
    }

    totalCount.textContent = `${filtered.length.toLocaleString("it-IT")} righe${incassatoTxt}`;
    exportBtn.disabled = filtered.length === 0;
    exportBtn.onclick = () => exportCsv(filtered);
  }

  function formatDateIt(iso) {
    const [y, mo, d] = iso.split("-");
    return `${d}/${mo}/${y}`;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  // ---------------------------------------------------------
  // EXPORT CSV
  // ---------------------------------------------------------
  function exportCsv(rows) {
    const header = ["Data", "Ora", "Operatore", "Tipo", "Importo", "Tavolo", "Sala", "Conto", "Abbinamento", "Dettaglio"];
    const lines = [header.join(";")];
    rows.forEach((e) => {
      const label = TYPE_DEFS[e.type].label;
      const importo = (typeof e.amount === "number" && !isNaN(e.amount)) ? e.amount.toFixed(2).replace(".", ",") : "";
      const abbinamento = (e.type === "preconto_sospeso" || e.type === "movimento_gestionale")
        ? (e.matchStatus === "diretto" ? "Abbinato" : e.matchStatus === "diviso" ? "Abbinato (conto diviso)" : e.matchStatus === "ristampa" ? "Probabile ristampa" : "NON ABBINATO")
        : "";
      lines.push([e.date, e.time, e.operator, label, importo, e.table || "", e.sala || "", e.conto || "", abbinamento, e.detail]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(";"));
    });
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wycash-report-${dateFrom.value || "tutti"}_${dateTo.value || "tutti"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

})();
