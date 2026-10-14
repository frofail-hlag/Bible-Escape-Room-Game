(function () {
  "use strict";

  const PANEL_ID = "bibelreiseAiImportPanel";
  const BUTTON_ID = "bibelreiseAiImportButton";
  const PROMPT_PANEL_ID = "bibelreiseAiPromptPanel";
  const PROMPT_BUTTON_ID = "bibelreiseAiPromptButton";
  const PROMPT_ESCAPE_EDITOR_BUTTON_ID = "bibelreiseAiPromptEscapeEditorButton";
  const PROMPT_CHALLENGE_EDITOR_BUTTON_ID = "bibelreiseAiPromptChallengeEditorButton";
  const CHALLENGE_KEY = "bibleEscapeReadingChallengesV1";

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[ch];
    });
  }
  function asArray(value) { return Array.isArray(value) ? value : []; }
  function makeId(prefix) {
    return prefix + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }
  function readChallengeList() {
    try { return JSON.parse(localStorage.getItem(CHALLENGE_KEY) || "[]"); }
    catch (_) { return []; }
  }
  function writeChallengeList(list) {
    localStorage.setItem(CHALLENGE_KEY, JSON.stringify(list));
  }
  function typeOk(type) {
    return ["choice", "truefalse", "order", "text", "number", "bible"].includes(type);
  }

  function validateEnvelope(text, expectedType) {
    const result = { envelope: null, errors: [], warnings: [] };
    let data;
    try { data = JSON.parse(text); }
    catch (error) {
      result.errors.push("Das JSON ist ungültig: " + String(error.message || error));
      return result;
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      result.errors.push("Die JSON-Wurzel muss ein Objekt sein.");
      return result;
    }
    if (data.schemaVersion !== "bibelreise-ai-v1") result.errors.push("schemaVersion muss „bibelreise-ai-v1“ sein.");
    if (data.gameType !== expectedType) {
      result.errors.push("Dieser Bereich erwartet den Typ „" + expectedType + "“.");
      return result;
    }
    if (!data.draft || typeof data.draft !== "object" || Array.isArray(data.draft)) {
      result.errors.push("Das Feld „draft“ fehlt oder ist kein Objekt.");
      return result;
    }
    const d = data.draft;
    if (d.status !== "draft") result.warnings.push("Der Status wird beim Import immer auf „draft“ gesetzt. Es wird nichts veröffentlicht.");
    d.status = "draft";
    if (Array.isArray(data.reviewNotes)) {
      data.reviewNotes.forEach(function (note) { result.warnings.push("Bitte prüfen: " + String(note)); });
    }

    if (expectedType === "escape-room") {
      ["title", "titleAr", "ref", "intro", "introAr", "final"].forEach(function (key) {
        if (!String(d[key] || "").trim()) result.errors.push("Escape Room: Pflichtfeld „" + key + "“ fehlt.");
      });
      if (!["Einfach", "Mittel", "Schwer"].includes(d.difficulty)) result.warnings.push("Die Schwierigkeit ist nicht als Einfach/Mittel/Schwer erkannt; beim Import wird „Mittel“ verwendet.");
      const puzzles = asArray(d.puzzles);
      if (puzzles.length < 3 || puzzles.length > 6) result.errors.push("Ein Escape Room benötigt 3 bis 6 Rätsel.");
      puzzles.forEach(function (p, i) {
        const n = i + 1;
        if (!p || typeof p !== "object") { result.errors.push("Rätsel " + n + " ist kein Objekt."); return; }
        ["q", "qAr", "hint", "hintAr", "clue"].forEach(function (key) {
          if (!String(p[key] || "").trim()) result.errors.push("Rätsel " + n + ": „" + key + "“ fehlt.");
        });
        if (!typeOk(p.type)) { result.errors.push("Rätsel " + n + ": unbekannter Rätseltyp."); return; }
        if (p.type === "choice") {
          if (!Array.isArray(p.opts) || !Array.isArray(p.optsAr) || p.opts.length < 2 || p.opts.length !== p.optsAr.length || p.opts.some(function (x) { return !String(x || "").trim(); }) || p.optsAr.some(function (x) { return !String(x || "").trim(); })) result.errors.push("Rätsel " + n + ": deutsche und arabische Antwortoptionen müssen vollständig und gleich lang sein.");
          if (!Number.isInteger(p.a) || p.a < 0 || p.a >= asArray(p.opts).length) result.errors.push("Rätsel " + n + ": Index der richtigen Antwort ist ungültig.");
        } else if (p.type === "truefalse") {
          if (p.a !== "true" && p.a !== "false") result.errors.push("Rätsel " + n + ": a muss der Text „true“ oder „false“ sein.");
        } else if (p.type === "order") {
          if (!Array.isArray(p.items) || !Array.isArray(p.itemsAr) || p.items.length < 2 || p.items.length !== p.itemsAr.length || p.items.some(function (x) { return !String(x || "").trim(); }) || p.itemsAr.some(function (x) { return !String(x || "").trim(); })) result.errors.push("Rätsel " + n + ": Ereignislisten müssen mindestens zwei gleich viele Einträge in beiden Sprachen enthalten.");
          if (!Array.isArray(p.correctItems) || p.correctItems.join("\u0000") !== asArray(p.items).join("\u0000")) result.errors.push("Rätsel " + n + ": correctItems muss der richtigen deutschen Reihenfolge entsprechen.");
        } else {
          if (!String(p.a == null ? "" : p.a).trim() || !String(p.aAr == null ? "" : p.aAr).trim()) result.errors.push("Rätsel " + n + ": richtige Antwort muss auf Deutsch und Arabisch vorhanden sein.");
          if (p.accepted != null && !Array.isArray(p.accepted)) result.errors.push("Rätsel " + n + ": accepted muss eine Liste sein.");
          if (p.acceptedAr != null && !Array.isArray(p.acceptedAr)) result.errors.push("Rätsel " + n + ": acceptedAr muss eine Liste sein.");
        }
      });
      const clueCode = puzzles.map(function (p) { return String(p && p.clue || ""); }).join("").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
      const finalCode = String(d.final || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
      if (!clueCode || clueCode !== finalCode) result.errors.push("Die Hinweisfragmente ergeben nicht das finale Lösungswort.");
    } else {
      ["title", "titleAr", "passage", "instructions", "instructionsAr"].forEach(function (key) {
        if (!String(d[key] || "").trim()) result.errors.push("Bibel-Challenge: Pflichtfeld „" + key + "“ fehlt.");
      });
      const questions = asArray(d.questions);
      if (questions.length < 3 || questions.length > 4) result.errors.push("Eine Bibel-Challenge benötigt 3 oder 4 Fragen.");
      questions.forEach(function (q, i) {
        const n = i + 1;
        if (!q || typeof q !== "object") { result.errors.push("Frage " + n + " ist kein Objekt."); return; }
        ["q", "qAr", "hint", "hintAr", "explanation", "explanationAr"].forEach(function (key) {
          if (!String(q[key] || "").trim()) result.errors.push("Frage " + n + ": „" + key + "“ fehlt.");
        });
        if (!typeOk(q.type)) { result.errors.push("Frage " + n + ": unbekannter Fragetyp."); return; }
        if (q.type === "choice") {
          if (!Array.isArray(q.opts) || !Array.isArray(q.optsAr) || q.opts.length < 2 || q.opts.length !== q.optsAr.length || q.opts.some(function (x) { return !String(x || "").trim(); }) || q.optsAr.some(function (x) { return !String(x || "").trim(); })) result.errors.push("Frage " + n + ": deutsche und arabische Antwortoptionen müssen vollständig und gleich lang sein.");
          if (!Number.isInteger(q.a) || q.a < 0 || q.a >= asArray(q.opts).length) result.errors.push("Frage " + n + ": Index der richtigen Antwort ist ungültig.");
        } else if (q.type === "truefalse") {
          if (q.a !== "true" && q.a !== "false") result.errors.push("Frage " + n + ": a muss der Text „true“ oder „false“ sein.");
        } else if (q.type === "order") {
          if (!Array.isArray(q.items) || !Array.isArray(q.itemsAr) || q.items.length < 2 || q.items.length !== q.itemsAr.length || q.items.some(function (x) { return !String(x || "").trim(); }) || q.itemsAr.some(function (x) { return !String(x || "").trim(); })) result.errors.push("Frage " + n + ": Ereignislisten müssen in beiden Sprachen vollständig und gleich lang sein.");
        } else {
          if (!String(q.a == null ? "" : q.a).trim() || !String(q.aAr == null ? "" : q.aAr).trim()) result.errors.push("Frage " + n + ": richtige Antwort muss auf Deutsch und Arabisch vorhanden sein.");
          if (q.accepted != null && !Array.isArray(q.accepted)) result.errors.push("Frage " + n + ": accepted muss eine Liste sein.");
          if (q.acceptedAr != null && !Array.isArray(q.acceptedAr)) result.errors.push("Frage " + n + ": acceptedAr muss eine Liste sein.");
        }
      });
    }
    result.envelope = data;
    return result;
  }

  function correctAnswer(p) {
    if (p.type === "choice") return String(asArray(p.opts)[Number(p.a)] || "") + " / " + String(asArray(p.optsAr)[Number(p.a)] || "");
    if (p.type === "truefalse") return p.a === "true" ? "Richtig / صحيح" : "Falsch / خطأ";
    if (p.type === "order") return asArray(p.items).join(" → ") + " / " + asArray(p.itemsAr).join(" ← ");
    return String(p.a || "") + " / " + String(p.aAr || "");
  }
  function renderPreview(data) {
    const d = data.draft;
    const isChallenge = data.gameType === "bibel-challenge";
    const things = isChallenge ? asArray(d.questions) : asArray(d.puzzles);
    let html = "<div class='notice' style='margin-top:14px'><strong>Vorschau für den Lehrerbereich – noch nicht gespeichert</strong><div style='margin-top:8px'><strong>" +
      esc(d.title) + "</strong><div class='lang-ar' dir='rtl'>" + esc(d.titleAr) + "</div><div class='small'>Bibelstelle: " + esc(isChallenge ? d.passage : d.ref) +
      " · " + things.length + (isChallenge ? " Fragen" : " Rätsel") + " · Status nach Import: Entwurf / مسودة</div></div></div>";
    things.forEach(function (p, i) {
      html += "<article class='puzzle-editor' style='margin-top:10px'><h3>" + (isChallenge ? "Frage " : "Rätsel ") + (i + 1) + " · " + esc(p.type) + "</h3>" +
        "<div><strong>" + esc(p.q) + "</strong><div class='lang-ar' dir='rtl'>" + esc(p.qAr) + "</div></div>" +
        "<div class='small' style='margin-top:8px'>Richtige Antwort: " + esc(correctAnswer(p)) + "</div>" +
        (p.type === "choice" ? "<ul>" + asArray(p.opts).map(function (o, j) { return "<li>" + esc(o) + (j === Number(p.a) ? " ✓" : "") + " / " + esc(asArray(p.optsAr)[j]) + "</li>"; }).join("") + "</ul>" : "") +
        (p.type === "order" ? "<div class='small'>Reihenfolge: " + esc(asArray(p.items).join(" → ")) + "</div>" : "") +
        (isChallenge ? "<p class='small'>Erklärung: " + esc(p.explanation) + " / " + esc(p.explanationAr) + "</p>" : "<p class='small'>Hinweiscode: <strong>" + esc(p.clue) + "</strong></p>") +
        "</article>";
    });
    if (Array.isArray(data.reviewNotes) && data.reviewNotes.length) {
      html += "<div class='notice'><strong>Hinweise zur Prüfung</strong><ul>" + data.reviewNotes.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul></div>";
    }
    html += "<p class='small'>Bitte prüfe Bibelstelle, Antworten, Altersgerechtigkeit und die Bedeutung in beiden Sprachen. Das Importieren prüft die Struktur, nicht die theologische Richtigkeit.</p>";
    return html;
  }

  function buildEscapeGame(d) {
    return {
      id: makeId("g_ai"),
      title: String(d.title).trim(),
      titleAr: String(d.titleAr).trim(),
      ref: String(d.ref).trim(),
      intro: String(d.intro).trim(),
      introAr: String(d.introAr).trim(),
      color: String(d.color || "📖").replace(/[\u0000-\u001F<>"'&]/g, "").slice(0, 12) || "📖",
      duration: Math.max(1, Number(d.duration) || 15),
      difficulty: ["Einfach", "Mittel", "Schwer"].includes(d.difficulty) ? d.difficulty : "Mittel",
      status: "draft",
      puzzles: asArray(d.puzzles).map(function (p) {
        const item = {
          id: makeId("p_ai"),
          type: p.type,
          q: String(p.q).trim(),
          qAr: String(p.qAr).trim(),
          hint: String(p.hint).trim(),
          hintAr: String(p.hintAr).trim(),
          points: Math.max(0, Number(p.points) || 100),
          clue: String(p.clue).trim()
        };
        if (p.type === "choice") {
          item.opts = p.opts.slice();
          item.optsAr = p.optsAr.slice();
          item.a = Number(p.a);
        } else if (p.type === "truefalse") {
          item.a = p.a;
        } else if (p.type === "order") {
          item.items = p.items.slice();
          item.itemsAr = p.itemsAr.slice();
          item.correctItems = p.items.slice();
        } else {
          item.a = String(p.a);
          item.aAr = String(p.aAr);
          item.accepted = asArray(p.accepted).slice();
          item.acceptedAr = asArray(p.acceptedAr).slice();
        }
        return item;
      }),
      final: String(d.final).trim()
    };
  }

  function buildChallenge(d) {
    const now = new Date().toISOString();
    return {
      id: makeId("bc_ai"),
      title: String(d.title).trim(),
      titleAr: String(d.titleAr).trim(),
      passage: String(d.passage).trim(),
      instructions: String(d.instructions).trim(),
      instructionsAr: String(d.instructionsAr).trim(),
      status: "draft",
      questions: asArray(d.questions).map(function (q) {
        const item = {
          id: makeId("q_ai"),
          type: q.type,
          q: String(q.q).trim(),
          qAr: String(q.qAr).trim(),
          hint: String(q.hint || "").trim(),
          hintAr: String(q.hintAr || "").trim(),
          explanation: String(q.explanation || "").trim(),
          explanationAr: String(q.explanationAr || "").trim(),
          points: Math.max(0, Number(q.points) || 100),
          accepted: asArray(q.accepted).slice(),
          acceptedAr: asArray(q.acceptedAr).slice()
        };
        if (q.type === "choice") {
          item.opts = q.opts.slice();
          item.optsAr = q.optsAr.slice();
          item.a = Number(q.a);
          item.aAr = item.optsAr[item.a] || "";
        } else if (q.type === "truefalse") {
          item.a = q.a;
          item.aAr = q.a === "true" ? "صحيح" : "خطأ";
        } else if (q.type === "order") {
          item.items = q.items.slice();
          item.itemsAr = q.itemsAr.slice();
          item.correctItems = q.items.slice();
          item.a = "";
          item.aAr = "";
        } else {
          item.a = String(q.a);
          item.aAr = String(q.aAr);
        }
        return item;
      }),
      createdAt: now,
      updatedAt: now
    };
  }


  function buildGuidedPrompt(kind, fields) {
    const isEscape = kind === "escape-room";
    const count = Number(fields.count);
    const typeLabel = isEscape ? "Bibel Escape Room" : "Bibel-Challenge";
    const example = isEscape ? {
      schemaVersion: "bibelreise-ai-v1",
      gameType: "escape-room",
      reviewNotes: [],
      draft: {
        title: "Deutscher Titel",
        titleAr: "عنوان عربي",
        ref: "Bibelstelle",
        intro: "Deutsche Einführung",
        introAr: "مقدمة عربية",
        color: "📖",
        duration: 15,
        difficulty: fields.difficulty,
        status: "draft",
        puzzles: [{
          type: "choice",
          q: "Deutsche Frage",
          qAr: "السؤال بالعربية",
          opts: ["Option A", "Option B", "Option C"],
          optsAr: ["الخيار أ", "الخيار ب", "الخيار ج"],
          a: 0,
          hint: "Deutscher Hinweis",
          hintAr: "تلميح عربي",
          points: 100,
          clue: "A"
        }],
        final: "ABCD"
      }
    } : {
      schemaVersion: "bibelreise-ai-v1",
      gameType: "bibel-challenge",
      reviewNotes: [],
      draft: {
        title: "Deutscher Titel",
        titleAr: "عنوان عربي",
        passage: fields.passage,
        instructions: "Deutsche Leseanweisung",
        instructionsAr: "تعليمات القراءة بالعربية",
        status: "draft",
        questions: [{
          type: "choice",
          q: "Deutsche Frage",
          qAr: "السؤال بالعربية",
          opts: ["Option A", "Option B", "Option C"],
          optsAr: ["الخيار أ", "الخيار ب", "الخيار ج"],
          a: 0,
          hint: "Deutscher Hinweis",
          hintAr: "تلميح عربي",
          explanation: "Deutsche Erklärung",
          explanationAr: "شرح عربي",
          points: 100,
          accepted: [],
          acceptedAr: []
        }]
      }
    };
    const lines = [
      "Du bist eine sorgfältige Fachperson für zweisprachige Inhalte einer koptisch-orthodoxen Sonntagsschule und erstellst Material für Bibelreise (رحلة في الكتاب المقدس).",
      "",
      "AUFGABE UND RAHMEN",
      "- Aktivitätstyp: " + typeLabel,
      "- Altersgruppe: " + fields.age,
      "- Bibelgeschichte/Thema: " + fields.topic,
      "- Vorgegebene Bibelstelle: " + fields.passage,
      "- Lernziel: " + (fields.objective || "Leite ein passendes, klares Lernziel aus Thema und Bibelstelle ab."),
      "- Schwierigkeit: " + fields.difficulty,
      "- Gewünschte Anzahl: " + count + (isEscape ? " Rätsel" : " Fragen"),
      "- Zusätzliche Hinweise der Lehrkraft: " + (fields.notes || "Keine"),
      "",
      "QUALITÄTSREGELN",
      "- Schreibe alle Inhalte für Kinder/Jugendliche der angegebenen Altersgruppe verständlich und altersgerecht.",
      "- Erstelle vollständige, sinngleiche deutsche und arabische Texte. Verwende natürliches Deutsch und klares Hocharabisch (Modern Standard Arabic).",
      "- Verankere alle Fakten, richtigen Antworten und Erklärungen in der angegebenen Bibelstelle. Erfinde keine Bibelverse oder Verweise.",
      "- Verwende keine mehrdeutigen Fangfragen. Falsche Antwortoptionen müssen eindeutig falsch sein.",
      "- Gib kurze, hilfreiche Hinweise, die die Antwort nicht direkt verraten.",
      "- Falls ein Detail unsicher ist oder die Bibelstelle nicht genügend Informationen bietet, notiere dies in reviewNotes, statt etwas zu erfinden.",
      "- Gib nur Felder aus, die im vorgegebenen Schema unterstützt werden. Erfinde keine IDs, Zeitstempel oder zusätzlichen Eigenschaften.",
      "- Der Status muss draft sein. Veröffentliche die Aktivität nicht.",
      "",
      isEscape ? "ESCAPE-ROOM-REGELN" : "BIBEL-CHALLENGE-REGELN",
      ...(isEscape ? [
        "- Erstelle genau " + count + " zusammenhängende Rätsel als sinnvolle Lernreise, mit einer geeigneten Mischung aus choice, truefalse, order, text, number und bible.",
        "- Jedes Rätsel braucht ein kurzes clue-Fragment aus Großbuchstaben A–Z oder Ziffern. Die Fragmente in Reihenfolge müssen exakt den Wert von final ergeben, ohne Leerzeichen oder Satzzeichen.",
        "- Bei choice ist a der nullbasierte Index der richtigen Option; opts und optsAr müssen gleich lang und Index für Index bedeutungsgleich sein.",
        "- Bei truefalse muss a der String true oder false sein.",
        "- Bei order sind items und itemsAr parallel angeordnete Listen, und correctItems entspricht exakt der richtigen deutschen Reihenfolge in items.",
        "- Bei text, number und bible gib a und aAr sowie bei Bedarf accepted und acceptedAr als Listen alternativer Antworten an."
      ] : [
        "- Erstelle genau " + count + " Fragen zur angegebenen Bibelstelle. Beginne mit klaren zweisprachigen Leseanweisungen.",
        "- Jede Frage benötigt einen richtigen Antwortwert und eine kurze Erklärung sowohl auf Deutsch als auch auf Arabisch.",
        "- Bei choice ist a der nullbasierte Index der richtigen Option; opts und optsAr müssen gleich lang sein und in beiden Sprachen übereinstimmen.",
        "- Bei truefalse muss a der String true oder false sein.",
        "- Bei order müssen items und itemsAr gleich lange, sinngleiche Listen der korrekten Reihenfolge sein.",
        "- Bei text, number und bible gib a, aAr sowie bei Bedarf accepted und acceptedAr als Listen alternativer Antworten an."
      ]),
      "",
      "AUSGABEFORMAT",
      "Gib genau ein vollständiges, gültiges JSON-Objekt zurück. Keine Markdown-Codezäune, keine Kommentare und keinen erklärenden Text außerhalb des JSON.",
      "Die folgende Struktur zeigt die unterstützte Feldform. Erstelle in der tatsächlichen Antwort genau " + count + (isEscape ? " puzzles-Elemente." : " questions-Elemente.") + " und fülle alle notwendigen Inhalte aus:",
      JSON.stringify(example, null, 2),
      "",
      "Wichtig: Der Importer prüft die Struktur, nicht automatisch die theologische Richtigkeit. Lass reviewNotes als leere Liste, wenn es keine konkreten Prüfhinweise gibt. Die Lehrkraft prüft den Entwurf vor einer späteren Veröffentlichung."
    ];
    return lines.join("\n");
  }

  function injectPromptBuilder(kind, specificTriggerId) {
    const root = document.querySelector(".app");
    const nav = root && root.querySelector(".teacher-nav");
    if (!root || !nav) return;
    const targetId = specificTriggerId || PROMPT_BUTTON_ID;
    let trigger = document.getElementById(targetId);
    if (!trigger && !specificTriggerId) {
      trigger = document.createElement("button");
      trigger.id = targetId;
      trigger.className = "btn gold";
      trigger.type = "button";
      trigger.textContent = "🧠 ChatGPT-Prompt erstellen / إعداد طلب ChatGPT";
      nav.appendChild(trigger);
    }
    if (!trigger) return;
    if (!specificTriggerId && trigger.parentNode !== nav) nav.appendChild(trigger);
    if (trigger.dataset.bibelreisePromptBound !== "true") {
      trigger.dataset.bibelreisePromptBound = "true";
      trigger.addEventListener("click", function () {
        const panel = document.getElementById(PROMPT_PANEL_ID);
        if (!panel) return;
        panel.hidden = !panel.hidden;
        if (!panel.hidden) {
          const importPanel = document.getElementById(PANEL_ID);
          if (importPanel) importPanel.hidden = true;
          const age = panel.querySelector("#bibelreisePromptAge");
          if (age) age.focus();
        }
      });
    }

    let panel = document.getElementById(PROMPT_PANEL_ID);
    if (panel) panel.remove();
    panel = document.createElement("section");
    panel.id = PROMPT_PANEL_ID;
    panel.className = "card";
    panel.hidden = true;
    panel.style.cssText = "margin:0 0 18px;border:2px solid #b6c9f5";
    const isEscape = kind === "escape-room";
    const countOptions = isEscape
      ? "<option value='3'>3 Rätsel</option><option value='4' selected>4 Rätsel</option><option value='5'>5 Rätsel</option><option value='6'>6 Rätsel</option>"
      : "<option value='3'>3 Fragen</option><option value='4' selected>4 Fragen</option>";
    panel.innerHTML =
      "<div class='editor-head'><div><h2>🧠 ChatGPT-Prompt erstellen / إعداد طلب ChatGPT</h2>" +
      "<p class='small'>Fülle den kurzen Auftrag aus. Bibelreise erstellt daraus einen Prompt zum Kopieren in deine ChatGPT-Unterhaltung. Es erfolgt kein KI/API-Aufruf.</p></div></div>" +
      "<div class='field'><label for='bibelreisePromptAge'>Altersgruppe / الفئة العمرية</label><input id='bibelreisePromptAge' required maxlength='60' value='9–15 Jahre' placeholder='z. B. 9–15 Jahre'></div>" +
      "<div class='field'><label for='bibelreisePromptTopic'>Bibelgeschichte oder Thema / القصة أو الموضوع الكتابي *</label><input id='bibelreisePromptTopic' required maxlength='180' placeholder='z. B. Daniel in der Löwengrube'></div>" +
      "<div class='field'><label for='bibelreisePromptPassage'>Bibelstelle / المرجع الكتابي *</label><input id='bibelreisePromptPassage' required maxlength='120' placeholder='z. B. Daniel 6,1–29'></div>" +
      "<div class='field'><label for='bibelreisePromptObjective'>Lernziel (empfohlen) / الهدف التعليمي</label><textarea id='bibelreisePromptObjective' rows='2' maxlength='500' placeholder='Was sollen die Kinder verstehen oder behalten?'></textarea></div>" +
      "<div class='field-row'><div class='field'><label for='bibelreisePromptDifficulty'>Schwierigkeit / مستوى الصعوبة</label><select id='bibelreisePromptDifficulty'><option>Einfach</option><option selected>Mittel</option><option>Schwer</option></select></div>" +
      "<div class='field'><label for='bibelreisePromptCount'>" + (isEscape ? "Anzahl Rätsel / عدد الألغاز" : "Anzahl Fragen / عدد الأسئلة") + "</label><select id='bibelreisePromptCount'>" + countOptions + "</select></div></div>" +
      "<div class='field'><label for='bibelreisePromptNotes'>Zusätzliche Hinweise (optional) / ملاحظات إضافية</label><textarea id='bibelreisePromptNotes' rows='3' maxlength='1000' placeholder='z. B. Schwerpunkt, Unterrichtskontext oder gewünschte Bibelbotschaft'></textarea></div>" +
      "<div class='actions'><button class='btn' id='bibelreisePromptGenerate' type='button'>Prompt erstellen / إنشاء الطلب</button><button class='btn secondary' id='bibelreisePromptClear' type='button'>Leeren</button></div>" +
      "<div id='bibelreisePromptFeedback' aria-live='polite'></div>" +
      "<div class='field'><label for='bibelreisePromptOutput'>Fertiger Prompt für ChatGPT / الطلب الجاهز لـ ChatGPT</label><textarea id='bibelreisePromptOutput' spellcheck='false' rows='14' placeholder='Hier erscheint der fertige Prompt…' style='min-height:260px;font-family:ui-monospace,Consolas,monospace'></textarea></div>" +
      "<div class='actions'><button class='btn gold' id='bibelreisePromptCopy' type='button' disabled>📋 Prompt kopieren / نسخ الطلب</button><button class='btn secondary' id='bibelreisePromptOpenImporter' type='button'>Zum JSON-Import / الانتقال إلى استيراد JSON</button></div>" +
      "<p class='small'>Ablauf: Prompt kopieren → in ChatGPT einfügen und verfeinern → das vollständige JSON kopieren → hier im JSON-Import prüfen und als Entwurf übernehmen. Kein API-Schlüssel, keine automatische Veröffentlichung.</p>";
    nav.insertAdjacentElement("afterend", panel);

    const ageInput = panel.querySelector("#bibelreisePromptAge");
    const topicInput = panel.querySelector("#bibelreisePromptTopic");
    const passageInput = panel.querySelector("#bibelreisePromptPassage");
    const objectiveInput = panel.querySelector("#bibelreisePromptObjective");
    const difficultyInput = panel.querySelector("#bibelreisePromptDifficulty");
    const countInput = panel.querySelector("#bibelreisePromptCount");
    const notesInput = panel.querySelector("#bibelreisePromptNotes");
    const output = panel.querySelector("#bibelreisePromptOutput");
    const feedback = panel.querySelector("#bibelreisePromptFeedback");
    const copyButton = panel.querySelector("#bibelreisePromptCopy");

    panel.querySelector("#bibelreisePromptGenerate").addEventListener("click", function () {
      const age = ageInput.value.trim();
      const topic = topicInput.value.trim();
      const passage = passageInput.value.trim();
      if (!age || !topic || !passage) {
        feedback.innerHTML = "<div class='notice'>Bitte fülle Altersgruppe, Bibelgeschichte/Thema und Bibelstelle aus, bevor du den Prompt erstellst.</div>";
        return;
      }
      const prompt = buildGuidedPrompt(kind, {
        age: age,
        topic: topic,
        passage: passage,
        objective: objectiveInput.value.trim(),
        difficulty: difficultyInput.value,
        count: countInput.value,
        notes: notesInput.value.trim()
      });
      output.value = prompt;
      copyButton.disabled = false;
      feedback.innerHTML = "<div class='feedback ok'>Prompt erstellt. Kopiere ihn jetzt in deine ChatGPT-Unterhaltung. / تم إنشاء الطلب. انسخه الآن إلى محادثة ChatGPT.</div>";
      output.focus();
    });

    panel.querySelector("#bibelreisePromptClear").addEventListener("click", function () {
      topicInput.value = "";
      passageInput.value = "";
      objectiveInput.value = "";
      notesInput.value = "";
      output.value = "";
      copyButton.disabled = true;
      feedback.textContent = "";
      topicInput.focus();
    });

    copyButton.addEventListener("click", async function () {
      if (!output.value.trim()) return;
      try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
          await navigator.clipboard.writeText(output.value);
          feedback.innerHTML = "<div class='feedback ok'>Prompt in die Zwischenablage kopiert. / تم نسخ الطلب.</div>";
          return;
        }
      } catch (_) {}
      output.focus();
      output.select();
      let copied = false;
      try { copied = document.execCommand("copy"); } catch (_) {}
      feedback.innerHTML = copied
        ? "<div class='feedback ok'>Prompt in die Zwischenablage kopiert. / تم نسخ الطلب.</div>"
        : "<div class='notice'>Automatisches Kopieren wurde vom Browser blockiert. Markiere den Text im Feld und kopiere ihn manuell.</div>";
    });

    panel.querySelector("#bibelreisePromptOpenImporter").addEventListener("click", function () {
      panel.hidden = true;
      const importPanel = document.getElementById(PANEL_ID);
      if (importPanel) {
        importPanel.hidden = false;
        const json = importPanel.querySelector("#bibelreiseAiJson");
        if (json) json.focus();
      }
    });
  }


  function injectImportPanel(kind, specificTriggerId) {
    const root = document.querySelector(".app");
    const nav = root && root.querySelector(".teacher-nav");
    if (!root || !nav) return;
    let trigger = document.getElementById(specificTriggerId || BUTTON_ID);
    if (!trigger && !specificTriggerId) {
      trigger = document.createElement("button");
      trigger.id = BUTTON_ID;
      trigger.className = "btn gold";
      trigger.type = "button";
      trigger.textContent = "📥 JSON-Entwurf importieren";
      nav.appendChild(trigger);
    }
    if (!trigger) return;
    // Dashboard controls live in navigation; a dedicated editor control stays inside the editor card.
    if (!specificTriggerId && trigger.parentNode !== nav) nav.appendChild(trigger);
    if (trigger.dataset.bibelreiseImportBound !== "true") {
      trigger.dataset.bibelreiseImportBound = "true";
      trigger.addEventListener("click", function () {
        const panel = document.getElementById(PANEL_ID);
        if (!panel) return;
        panel.hidden = !panel.hidden;
        if (!panel.hidden) {
          const promptPanel = document.getElementById(PROMPT_PANEL_ID);
          if (promptPanel) promptPanel.hidden = true;
          const input = panel.querySelector("textarea");
          if (input) input.focus();
        }
      });
    }
    let panel = document.getElementById(PANEL_ID);
    if (panel) panel.remove();
    panel = document.createElement("section");
    panel.id = PANEL_ID;
    panel.className = "card";
    panel.hidden = true;
    panel.style.cssText = "margin:0 0 18px;border:2px solid #e5c77d";
    panel.innerHTML =
      "<div class='editor-head'><div><h2>📥 JSON-Entwurf importieren</h2><p class='small'>Füge die vollständige JSON-Antwort aus ChatGPT ein. Der Entwurf wird als neues Spiel angelegt und nie automatisch veröffentlicht.</p></div></div>" +
      "<div class='field'><label for='bibelreiseAiJson'>JSON aus ChatGPT / بيانات JSON من ChatGPT</label><textarea id='bibelreiseAiJson' spellcheck='false' placeholder='Hier das vollständige JSON-Objekt einfügen…' style='min-height:210px;font-family:ui-monospace,Consolas,monospace'></textarea></div>" +
      "<div class='actions'><button class='btn' id='bibelreiseAiValidate' type='button'>Prüfen & Vorschau / تحقّق واعرض المعاينة</button><button class='btn secondary' id='bibelreiseAiClear' type='button'>Leeren</button><button class='btn success' id='bibelreiseAiImport' type='button' disabled>Als neuen Entwurf übernehmen / استيراد كمسودة</button></div>" +
      "<div id='bibelreiseAiMessages' aria-live='polite'></div><div id='bibelreiseAiPreview'></div>" +
      "<p class='small'>Kein KI/API-Aufruf. Die Antwort wird nur nach deiner ausdrücklichen Bestätigung in Bibelreise gespeichert. Der Lehrer muss Antworten und Bibelstellen vor dem Veröffentlichen prüfen.</p>";
    nav.insertAdjacentElement("afterend", panel);

    const textArea = panel.querySelector("#bibelreiseAiJson");
    const messages = panel.querySelector("#bibelreiseAiMessages");
    const preview = panel.querySelector("#bibelreiseAiPreview");
    const validateButton = panel.querySelector("#bibelreiseAiValidate");
    const clearButton = panel.querySelector("#bibelreiseAiClear");
    const importButton = panel.querySelector("#bibelreiseAiImport");
    let currentEnvelope = null;
    let currentKind = kind;

    function reset() {
      currentEnvelope = null;
      importButton.disabled = true;
      messages.innerHTML = "";
      preview.innerHTML = "";
    }
    textArea.addEventListener("input", reset);
    clearButton.addEventListener("click", function () {
      textArea.value = "";
      reset();
      textArea.focus();
    });
    validateButton.addEventListener("click", function () {
      reset();
      const checked = validateEnvelope(textArea.value, currentKind);
      if (checked.errors.length) {
        messages.innerHTML = "<div class='notice' style='background:#fff0f1;border-color:#f3b6bf;color:#8b1f2d'><strong>Bitte korrigiere " + checked.errors.length + " Problem(e):</strong><ul>" +
          checked.errors.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul></div>";
        return;
      }
      currentEnvelope = checked.envelope;
      importButton.disabled = false;
      messages.innerHTML = "<div class='feedback ok'><strong>Strukturprüfung bestanden.</strong> Prüfe jetzt die Vorschau. Das bestätigt nicht automatisch die biblische Richtigkeit.</div>" +
        (checked.warnings.length ? "<div class='notice'><strong>Hinweise</strong><ul>" + checked.warnings.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul></div>" : "");
      preview.innerHTML = renderPreview(currentEnvelope);
    });
    importButton.addEventListener("click", async function () {
      if (!currentEnvelope) return;
      if (typeof window.isTeacher === "function" && !window.isTeacher()) {
        alert("Bitte melde dich zuerst als Diener/in an. / يرجى تسجيل الدخول أولًا.");
        return;
      }
      importButton.disabled = true;
      importButton.textContent = "Import läuft…";
      try {
        if (currentKind === "escape-room") {
          const list = window.games();
          const game = buildEscapeGame(currentEnvelope.draft);
          list.push(game);
          window.saveGames(list);
          alert("Der Escape Room wurde als Entwurf gespeichert. Prüfe ihn im Editor und veröffentliche ihn erst nach dem Test.");
          window.teacherEditGame(game.id);
        } else {
          const challenge = buildChallenge(currentEnvelope.draft);
          const list = readChallengeList();
          list.push(challenge);
          writeChallengeList(list);
          let cloudSaved = false;
          try {
            if (typeof window.waitForBibleFirebaseApi === "function") {
              const api = await window.waitForBibleFirebaseApi();
              const saved = await api.saveChallenge(challenge);
              if (saved) {
                const latest = readChallengeList();
                const index = latest.findIndex(function (x) { return x.id === challenge.id; });
                if (index >= 0) latest[index] = saved;
                writeChallengeList(latest);
                cloudSaved = true;
              }
            }
          } catch (error) {
            console.warn("Imported Bibel-Challenge stays local until sync:", error);
          }
          alert(cloudSaved
            ? "Die Bibel-Challenge wurde als Entwurf gespeichert. Prüfe sie im Editor; sie ist noch nicht veröffentlicht."
            : "Die Bibel-Challenge wurde lokal als Entwurf gespeichert. Firebase-Synchronisierung wird beim nächsten Lehrerbereich-Aufruf erneut versucht.");
          if (typeof window.editBibleChallenge === "function") await window.editBibleChallenge(challenge.id);
          else if (typeof window.teacherChallengeDashboard === "function") await window.teacherChallengeDashboard();
        }
      } catch (error) {
        importButton.disabled = false;
        importButton.textContent = "Als neuen Entwurf übernehmen / استيراد كمسودة";
        messages.innerHTML = "<div class='notice'><strong>Import fehlgeschlagen.</strong><br>" + esc(error && error.message || error) + "</div>";
      }
    });
    const promptTriggerId = specificTriggerId
      ? (kind === "escape-room" ? PROMPT_ESCAPE_EDITOR_BUTTON_ID : PROMPT_CHALLENGE_EDITOR_BUTTON_ID)
      : null;
    injectPromptBuilder(kind, promptTriggerId);
  }

  function safeBibleLinksMarkup(passage) {
    if (typeof window.bibelreiseBibleUrl !== "function") return "";
    const deLinks = typeof window.bibelreiseBibleUrls === "function"
      ? window.bibelreiseBibleUrls(passage, "de") : [{ chapter: null, url: window.bibelreiseBibleUrl(passage, "de") }];
    const arLinks = typeof window.bibelreiseBibleUrls === "function"
      ? window.bibelreiseBibleUrls(passage, "ar") : [{ chapter: null, url: window.bibelreiseBibleUrl(passage, "ar") }];
    function group(links, language) {
      const arabic = language === "ar";
      const isRange = links.length > 1;
      const label = arabic ? "🇪🇬 الكتاب المقدس العربي — AVD" : "🇩🇪 Deutsche Bibel — SCH2000";
      return "<div class='challenge-reading-link-group' style='display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin:6px 0'>" +
        "<span class='small' " + (arabic ? "dir='rtl' " : "") + "style='font-weight:800;margin-inline-end:4px'>" + label + "</span>" +
        links.map(function (item) {
          const unknown = item.url === "https://www.bible.com/";
          const linkLabel = unknown
            ? (arabic ? "ابحث عن المقطع ↗" : "Stelle auf Bible.com suchen ↗")
            : isRange
              ? (arabic ? "الإصحاح " + item.chapter + " ↗" : "Kapitel " + item.chapter + " ↗")
              : (arabic ? "فتح المقطع ↗" : "Bibelstelle öffnen ↗");
          return "<a class='btn secondary " + (arabic ? "lang-ar" : "") + "' " + (arabic ? "dir='rtl' " : "") +
            "style='padding:8px 11px' href='" + esc(item.url) + "' target='_blank' rel='noopener noreferrer'>" + linkLabel + "</a>";
        }).join("") + "</div>";
    }
    return "<div class='challenge-reading-links' style='display:flex;flex-direction:column;gap:5px;margin:10px 0 14px'>" +
      group(deLinks, "de") + group(arLinks, "ar") +
      (deLinks.some(function (x) { return x.url === "https://www.bible.com/"; })
        ? "<p class='small'>Die Bibelstelle wurde nicht automatisch erkannt. Bitte suche sie direkt auf Bible.com. / لم يتم التعرف على المرجع تلقائيًا، يرجى البحث عنه في موقع Bible.com.</p>" : "") +
      "</div>";
  }
  function injectBibleLinks() {
    if (typeof state === "undefined" || !state) return;
    if (state.view === "challengeList") {
      const cards = document.querySelectorAll(".challenge-card");
      const list = readChallengeList().filter(function (c) { return c.status === "published"; });
      cards.forEach(function (card, i) {
        if (card.querySelector(".challenge-reading-links")) return;
        const passage = list[i] && list[i].passage;
        const anchor = card.querySelector(".challenge-passage");
        if (passage && anchor) anchor.insertAdjacentHTML("afterend", safeBibleLinksMarkup(passage));
      });
    }
    if (state.view === "teacherChallengeEdit") {
      const editorChallenge = readChallengeList().find(function (item) { return item.id === state.teacherChallengeId; });
      const passageCard = Array.from(document.querySelectorAll(".sticky .card")).find(function (card) { return card.textContent.includes("Passage erneut lesen"); });
      const editorAnchor = passageCard && (passageCard.querySelector("button") || passageCard.querySelector("p"));
      if (editorChallenge && editorChallenge.passage && editorAnchor && !passageCard.querySelector(".challenge-reading-links")) {
        editorAnchor.insertAdjacentHTML("afterend", safeBibleLinksMarkup(editorChallenge.passage));
      }
      return;
    }
    if (state.view !== "challengeIntro" && state.view !== "challengeQuestion") return;
    const c = state.activeChallenge;
    if (!c || !c.passage) return;
    const anchor = state.view === "challengeIntro"
      ? document.querySelector(".challenge-hero .challenge-passage")
      : document.querySelector(".challenge-question-card .challenge-passage-inline");
    if (anchor && !anchor.parentNode.querySelector(".challenge-reading-links")) {
      anchor.insertAdjacentHTML("afterend", safeBibleLinksMarkup(c.passage));
    }
  }

  const originalRender = window.render;
  if (typeof originalRender === "function") {
    window.render = function () {
      const output = originalRender.apply(this, arguments);
      injectBibleLinks();
      return output;
    };
  }

  const originalEscapeRenderer = window.renderTeacherEscapeDashboard;
  if (typeof originalEscapeRenderer === "function") {
    window.renderTeacherEscapeDashboard = function () {
      const output = originalEscapeRenderer.apply(this, arguments);
      injectImportPanel("escape-room");
      return output;
    };
  }
  const originalEscapeRoute = window.bibleEscapeRouteTeacherDashboard;
  if (typeof originalEscapeRoute === "function") {
    window.bibleEscapeRouteTeacherDashboard = function () {
      const output = originalEscapeRoute.apply(this, arguments);
      injectImportPanel("escape-room");
      return output;
    };
  }
  const originalChallengeManagement = window.teacherChallengeManagement;
  if (typeof originalChallengeManagement === "function") {
    window.teacherChallengeManagement = function () {
      const output = originalChallengeManagement.apply(this, arguments);
      injectImportPanel("bibel-challenge");
      return output;
    };
  }

  const originalChallengeDashboard = window.teacherChallengeDashboard;
  if (typeof originalChallengeDashboard === "function") {
    window.teacherChallengeDashboard = async function () {
      const output = await originalChallengeDashboard.apply(this, arguments);
      injectImportPanel("bibel-challenge");
      return output;
    };
  }
  window.bibelreiseValidateAiEnvelope = validateEnvelope;
  window.bibelreiseInjectChallengeBibleLinks = injectBibleLinks;
  window.bibelreiseInjectTeacherImportPanel = injectImportPanel;
  window.bibelreiseBuildGuidedPrompt = buildGuidedPrompt;
})();
