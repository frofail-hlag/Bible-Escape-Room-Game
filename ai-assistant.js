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

  // Strip only one optional outer Markdown JSON fence; never modify JSON content itself.
  function normalizePastedJson(text) {
    let candidate = String(text == null ? "" : text).replace(/^\uFEFF/, "").trim();
    const fenced = candidate.match(/^\`\`\`(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n\`\`\`[ \t]*$/i);
    if (fenced) candidate = fenced[1].trim();
    return candidate;
  }

  function validateEnvelope(text, expectedType) {
    const result = { envelope: null, errors: [], warnings: [] };
    let data;
    try { data = JSON.parse(text); }
    catch (error) {
      const rawJson = String(text || "");
      const detail = /"reviewNotes"\s*:\s*,/.test(rawJson)
        ? 'Das Feld "reviewNotes" hat keinen Wert. Wenn keine Hinweise vorhanden sind, verwende [] — zum Beispiel "reviewNotes": [].'
        : String(error.message || error);
      result.errors.push("Das JSON ist ungültig: " + detail);
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
      if (puzzles.length < 3 || puzzles.length > 10) result.errors.push("Ein Escape Room benötigt 3 bis 10 Rätsel. Die Prompt-Auswahl bietet 3, 4, 6, 7 oder 10.");
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
      if (questions.length < 3 || questions.length > 10) result.errors.push("Eine Bibel-Challenge benötigt 3 bis 10 Fragen. Die Prompt-Auswahl bietet 3, 4, 6, 7 oder 10.");
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


  let activePromptLanguage = "de";
  const ALLOWED_PROMPT_COUNTS = [3, 4, 6, 7, 10];

  function buildGuidedPrompt(kind, fields) {
    const isEscape = kind === "escape-room";
    const asked = Number(fields.count);
    const count = ALLOWED_PROMPT_COUNTS.includes(asked) ? asked : 4;
    const lang = ["de", "ar", "en"].includes(fields.language) ? fields.language : "de";
    activePromptLanguage = lang;
    const L = function (de, ar, en) { return lang === "ar" ? ar : (lang === "en" ? en : de); };
    const typeLabel = L("Bibel Escape Room", "غرفة الهروب الكتابية", "Bible Escape Room");
    const difficultyLabel = ({
      "Einfach": L("Einfach", "سهل", "Easy"),
      "Mittel": L("Mittel", "متوسط", "Medium"),
      "Schwer": L("Schwer", "صعب", "Hard")
    })[fields.difficulty] || L("Mittel", "متوسط", "Medium");
    const example = isEscape ? {
      schemaVersion: "bibelreise-ai-v1",
      gameType: "escape-room",
      reviewNotes: [],
      draft: {
        title: "Titel auf Deutsch",
        titleAr: "عنوان باللغة العربية",
        ref: "Bibelstelle",
        intro: "Einführung auf Deutsch",
        introAr: "مقدمة باللغة العربية",
        color: "📖",
        duration: 15,
        difficulty: fields.difficulty || "Mittel",
        status: "draft",
        puzzles: [{
          type: "choice",
          q: "Frage auf Deutsch",
          qAr: "السؤال باللغة العربية",
          opts: ["Deutsche Option A", "Deutsche Option B", "Deutsche Option C"],
          optsAr: ["الخيار العربي أ", "الخيار العربي ب", "الخيار العربي ج"],
          a: 0,
          hint: "Hinweis auf Deutsch",
          hintAr: "تلميح باللغة العربية",
          points: 100,
          clue: "A"
        }],
        final: "A"
      }
    } : {
      schemaVersion: "bibelreise-ai-v1",
      gameType: "bibel-challenge",
      reviewNotes: [],
      draft: {
        title: "Titel auf Deutsch",
        titleAr: "عنوان باللغة العربية",
        passage: fields.passage,
        instructions: "Leseanweisung auf Deutsch",
        instructionsAr: "تعليمات القراءة باللغة العربية",
        status: "draft",
        questions: [{
          type: "choice",
          q: "Frage auf Deutsch",
          qAr: "السؤال باللغة العربية",
          opts: ["Deutsche Option A", "Deutsche Option B", "Deutsche Option C"],
          optsAr: ["الخيار العربي أ", "الخيار العربي ب", "الخيار العربي ج"],
          a: 0,
          hint: "Hinweis auf Deutsch",
          hintAr: "تلميح باللغة العربية",
          explanation: "Erklärung auf Deutsch",
          explanationAr: "شرح باللغة العربية",
          points: 100,
          accepted: [],
          acceptedAr: []
        }]
      }
    };
    const difficultyRule = L(
      "Der Wert von difficulty muss genau Einfach, Mittel oder Schwer sein, da die App diese festen Werte erwartet.",
      "يجب أن تكون قيمة difficulty واحدة بالضبط من Einfach أو Mittel أو Schwer لأن التطبيق يتطلب هذه القيم المحددة.",
      "The difficulty value must be exactly Einfach, Mittel, or Schwer because the app expects these fixed enum values."
    );
    const lines = [
      L(
        "Du bist eine sorgfältige Fachperson für zweisprachige Inhalte einer koptisch-orthodoxen Sonntagsschule und erstellst Material für Bibelreise (رحلة في الكتاب المقدس).",
        "أنت متخصص دقيق في إعداد محتوى ثنائي اللغة لمدارس الأحد القبطية الأرثوذكسية، وتُعد مواد لتطبيق Bibelreise (رحلة في الكتاب المقدس).",
        "You are a careful bilingual content designer for a Coptic Orthodox Sunday School creating material for Bibelreise (رحلة في الكتاب المقدس)."
      ),
      "",
      L("AUFGABE UND RAHMEN", "المهمة والإطار", "TASK AND BRIEF"),
      "- " + L("Aktivitätstyp", "نوع النشاط", "Activity type") + ": " + typeLabel,
      "- " + L("Altersgruppe", "الفئة العمرية", "Age group") + ": " + String(fields.age || ""),
      "- " + L("Bibelgeschichte/Thema", "القصة أو الموضوع الكتابي", "Bible story/topic") + ": " + String(fields.topic || ""),
      "- " + L("Vorgegebene Bibelstelle", "المرجع الكتابي المحدد", "Required Bible passage") + ": " + String(fields.passage || ""),
      "- " + L("Lernziel", "الهدف التعليمي", "Learning objective") + ": " + String(fields.objective || L("Leite ein passendes Lernziel aus Thema und Bibelstelle ab.", "استنتج هدفًا تعليميًا مناسبًا من الموضوع والمرجع الكتابي.", "Derive a suitable learning objective from the topic and Bible passage.")),
      "- " + L("Schwierigkeit", "مستوى الصعوبة", "Difficulty") + ": " + difficultyLabel,
      "- " + L("Gewünschte Anzahl", "العدد المطلوب", "Requested count") + ": " + count + (isEscape ? " " + L("Rätsel", "ألغاز", "puzzles") : " " + L("Fragen", "أسئلة", "questions")),
      "- " + L("Zusätzliche Hinweise der Lehrkraft", "ملاحظات إضافية من الخادم/الخادمة", "Additional teacher notes") + ": " + String(fields.notes || L("Keine", "لا توجد", "None")),
      "",
      L("VERBINDLICHE SPRACHREGEL", "قاعدة اللغة الإلزامية", "MANDATORY LANGUAGE RULE"),
      L(
        "- Obwohl dieser Prompt auf Deutsch geschrieben ist, müssen alle Inhalte für Kinder/Jugendliche IMMER vollständig auf Deutsch UND Arabisch vorliegen.",
        "- رغم أن هذا الطلب مكتوب باللغة العربية، يجب أن يكون كل المحتوى الموجّه للأطفال والشباب دائمًا كاملًا بالألمانية والعربية معًا.",
        "- Although this prompt is written in English, all student-facing content MUST always be complete in both German AND Arabic."
      ),
      L(
        "- Verwende natürliches, altersgerechtes Deutsch in deutschen Feldern und klares Hocharabisch (Modern Standard Arabic) in arabischen Feldern. Beide Fassungen müssen inhaltlich gleichwertig sein.",
        "- استخدم الألمانية الطبيعية المناسبة للعمر في الحقول الألمانية والعربية الفصحى الواضحة في الحقول العربية. يجب أن تتطابق النسختان في المعنى.",
        "- Use natural age-appropriate German for German fields and clear Modern Standard Arabic for Arabic fields. Both versions must have equivalent meaning."
      ),
      L(
        "- Verstehe die Eingaben der Lehrkraft auch dann, wenn sie in einer anderen Sprache formuliert wurden; die Ausgabe bleibt dennoch immer Deutsch UND Arabisch. Erzeuge alle vorgesehenen Sprachfelder.",
        "- افهم مدخلات الخادم/الخادمة حتى إن كُتبت بلغة أخرى؛ لكن يجب أن يظل الإخراج دائمًا بالألمانية والعربية معًا. أنشئ جميع الحقول اللغوية المطلوبة.",
        "- Interpret the teacher's inputs even if they were entered in another language; the output must still always be German AND Arabic. Include all required language fields."
      ),
      "",
      L("QUALITÄTSREGELN", "قواعد الجودة", "QUALITY RULES"),
      L(
        "- Schreibe altersgerecht, biblisch fundiert und ohne mehrdeutige Fangfragen. Falsche Antwortoptionen müssen eindeutig falsch sein.",
        "- اكتب محتوى مناسبًا للعمر ومستندًا إلى الكتاب المقدس، وتجنّب الأسئلة الخادعة أو الغامضة. يجب أن تكون الخيارات الخاطئة غير صحيحة بوضوح.",
        "- Make the content age-appropriate and grounded in the Bible. Avoid ambiguous trick questions and ensure wrong answer options are clearly wrong."
      ),
      L(
        "- Verankere Fakten, richtige Antworten und Erklärungen in der angegebenen Bibelstelle. Erfinde keine Verse oder Verweise.",
        "- اجعل الحقائق والإجابات الصحيحة والتفسيرات مستندة إلى المرجع الكتابي المحدد. لا تخترع آيات أو مراجع.",
        "- Ground facts, correct answers and explanations in the specified passage. Never invent verses or references."
      ),
      L("- Gib kurze, hilfreiche Hinweise, die die Antwort nicht direkt verraten.", "- قدّم تلميحات قصيرة ومفيدة لا تكشف الإجابة مباشرة.", "- Give concise, helpful hints without revealing the answer directly."),
      L(
        "- Notiere unsichere oder nicht belegbare Details in reviewNotes, statt etwas zu erfinden.",
        "- دوّن التفاصيل غير المؤكدة أو غير المدعومة في reviewNotes بدلًا من اختلاقها.",
        "- Record uncertain or unsupported details in reviewNotes instead of inventing them."
      ),
      L(
        "- Erfinde keine IDs oder Zeitstempel und füge keine nicht unterstützten Felder hinzu. Der Status muss draft sein; veröffentliche niemals automatisch.",
        "- لا تنشئ معرّفات أو طوابع زمنية ولا تضف حقولًا غير مدعومة. يجب أن تكون الحالة draft ولا تنشر النشاط تلقائيًا أبدًا.",
        "- Do not invent IDs or timestamps or add unsupported fields. The status must be draft; never publish automatically."
      ),
      L(
        "- Schreibe das JSON in einem gut lesbaren, formatierten Format.",
        "- اكتب JSON بتنسيق واضح وسهل القراءة.",
        "- Write it in a readable JSON format."
      ),
      difficultyRule,
      "",
      L("REGELN FÜR DEN ESCAPE ROOM", "قواعد غرفة الهروب", "ESCAPE ROOM RULES") + (isEscape ? "" : " — " + L("nicht zutreffend", "لا ينطبق", "not applicable")),
      ...(isEscape ? [
        L(
          "- Erstelle genau " + count + " zusammenhängende Rätsel als sinnvolle Lernreise und nutze eine passende Mischung aus choice, truefalse, order, text, number und bible.",
          "- أنشئ بالضبط " + count + " ألغاز مترابطة تشكّل رحلة تعليمية هادفة، مع تنويع مناسب بين choice وtruefalse وorder وtext وnumber وbible.",
          "- Create exactly " + count + " connected puzzles that form a meaningful learning journey, using a suitable mix of choice, truefalse, order, text, number and bible."
        ),
        L(
          "- Jedes Rätsel braucht ein kurzes clue-Fragment aus Großbuchstaben A–Z oder Ziffern. Aneinandergereiht müssen alle Fragmente exakt final ergeben, ohne Leerzeichen oder Satzzeichen. Bei einer Aktivität mit mehreren Rätseln darf kein einzelnes Rätsel den vollständigen final-Code verraten.",
          "- يجب أن ينتج كل لغز جزءًا قصيرًا من clue باستخدام الأحرف اللاتينية الكبيرة A–Z أو الأرقام. يجب أن تكوّن الأجزاء مجتمعة قيمة final تمامًا دون مسافات أو علامات ترقيم.",
          "- Every puzzle needs a short clue fragment using uppercase Latin letters A–Z or digits. Concatenating the fragments must equal final exactly, with no spaces or punctuation."
        ),
        L(
          "- Bei choice ist a der nullbasierte Index der richtigen Option; opts und optsAr müssen gleich lang und bedeutungsgleich sein.",
          "- في choice تمثل a فهرس الخيار الصحيح بدءًا من الصفر؛ ويجب أن تكون opts وoptsAr متساويتين في الطول ومتطابقتين في المعنى.",
          "- For choice, a is the zero-based index of the correct option; opts and optsAr must have equal lengths and equivalent meaning."
        ),
        L(
          "- Bei truefalse muss a genau der String true oder false sein. Bei order müssen items, itemsAr und correctItems die richtige Reihenfolge wiedergeben.",
          "- في truefalse يجب أن تكون a هي النص true أو false حرفيًا. وفي order يجب أن تعبّر items وitemsAr وcorrectItems عن الترتيب الصحيح.",
          "- For truefalse, a must be exactly the string true or false. For order, items, itemsAr and correctItems must represent the correct sequence."
        ),
        L(
          "- Bei text, number und bible gib a und aAr sowie bei Bedarf accepted und acceptedAr an.",
          "- في text وnumber وbible أدرج a وaAr، وأضف accepted وacceptedAr عند الحاجة.",
          "- For text, number and bible, provide a and aAr and include accepted and acceptedAr where useful."
        )
      ] : []),
      "",
      L("REGELN FÜR DIE BIBEL-CHALLENGE", "قواعد التحدي الكتابي", "BIBLE CHALLENGE RULES") + (isEscape ? " — " + L("nicht zutreffend", "لا ينطبق", "not applicable") : ""),
      ...(!isEscape ? [
        L(
          "- Erstelle genau " + count + " Fragen zur angegebenen Bibelstelle. Formuliere klare Leseanweisungen auf Deutsch und Arabisch.",
          "- أنشئ بالضبط " + count + " أسئلة حول المرجع الكتابي المحدد، مع تعليمات قراءة واضحة بالألمانية والعربية.",
          "- Create exactly " + count + " questions about the specified passage, with clear reading instructions in German and Arabic."
        ),
        L(
          "- Jede Frage benötigt eine richtige Antwort sowie eine kurze Erklärung auf Deutsch und Arabisch.",
          "- يحتاج كل سؤال إلى إجابة صحيحة وتفسير قصير بالألمانية والعربية.",
          "- Each question requires a correct answer and a short explanation in German and Arabic."
        ),
        L(
          "- Bei choice ist a der nullbasierte Index der richtigen Option; opts und optsAr müssen gleich lang und bedeutungsgleich sein.",
          "- في choice تمثل a فهرس الخيار الصحيح بدءًا من الصفر؛ ويجب أن تكون opts وoptsAr متساويتين في الطول ومتطابقتين في المعنى.",
          "- For choice, a is the zero-based index of the correct option; opts and optsAr must have equal lengths and equivalent meaning."
        ),
        L(
          "- Bei truefalse muss a genau der String true oder false sein. Bei order müssen items und itemsAr gleich lange, sinngleiche Listen sein.",
          "- في truefalse يجب أن تكون a هي النص true أو false حرفيًا. وفي order يجب أن تكون items وitemsAr قائمتين متساويتين في الطول ومتطابقتين في المعنى.",
          "- For truefalse, a must be exactly the string true or false. For order, items and itemsAr must be equivalent arrays of equal length."
        ),
        L(
          "- Bei text, number und bible gib a, aAr sowie bei Bedarf accepted und acceptedAr an.",
          "- في text وnumber وbible أدرج a وaAr، وأضف accepted وacceptedAr عند الحاجة.",
          "- For text, number and bible, provide a and aAr and include accepted and acceptedAr where useful."
        )
      ] : []),
      "",
      L("STRIKTE JSON-FORMATREGELN", "قواعد JSON الصارمة", "STRICT JSON FORMATTING RULES"),
      L(
        "- Gib genau EIN vollständiges JSON-Objekt in genau einem Markdown-Codeblock mit der Kennzeichnung json zurück. Keine Kommentare, Auslassungspunkte wie ... oder Texte außerhalb des Codeblocks.",
        "- أخرج كائن JSON كاملًا واحدًا فقط داخل كتلة Markdown برمجية واحدة تحمل اسم json. لا تستخدم التعليقات أو نقاط الحذف مثل ... أو أي نص خارج الكتلة البرمجية.",
        "- Return exactly ONE complete JSON object inside exactly one Markdown code block labelled json. Do not include comments, ellipses such as ..., or any text outside the code block."
      ),
      L(
        "- Formatiere das JSON lesbar und eingerückt wie ein formatiertes Codebeispiel: genau zwei Leerzeichen Einrückung, jede Eigenschaft und jedes Array-Element in einer eigenen Zeile. Gib kein kompaktes Einzeilen-JSON aus.",
        "- نسّق JSON بطريقة واضحة ومنظمة مثل مثال برمجي منسّق: استخدم مسافتين بالضبط للمسافة البادئة، وضع كل خاصية وكل عنصر في المصفوفة في سطر مستقل. لا تُخرج JSON مضغوطًا في سطر واحد.",
        "- Pretty-print the JSON in a readable, indented format like a formatted code example: use exactly two spaces for indentation, with each property and array item on its own line. Do not return minified one-line JSON."
      ),
      L(
        "- Verwende ausschließlich gerade ASCII-Doppelanführungszeichen (Codepunkt U+0022) als JSON-Begrenzer. Verwende niemals typografische/geschwungene Anführungszeichen wie “ ” oder „ “ für Schlüssel oder Textbegrenzungen.",
        "- استخدم علامات الاقتباس المزدوجة المستقيمة من ASCII فقط (رمز U+0022) لتحديد مفاتيح JSON والقيم النصية. لا تستخدم أبدًا علامات الاقتباس الطباعية أو المنحنية مثل “ ” أو „ “ كفواصل للنص.",
        "- Use only straight ASCII double quotes (\u0022, character U+0022) as JSON delimiters. Never use curly or typographic quotation marks such as “ ” or „ “ to delimit keys or string values."
      ),
      L(
        "- Jeder Schlüssel muss direkt nach dem Doppelpunkt einen gültigen Wert haben. Niemals fehlende Werte wie \"reviewNotes\": , oder \"accepted\": , ausgeben. Wenn keine Hinweise oder akzeptierten Alternativantworten vorhanden sind, verwende für reviewNotes, accepted und acceptedAr jeweils [].",
        "- يجب أن تكون لكل مفتاح قيمة JSON صحيحة مباشرة بعد النقطتين. لا تُخرج مطلقًا قيمًا مفقودة مثل \"reviewNotes\": , أو \"accepted\": , . إذا لم توجد ملاحظات أو إجابات بديلة مقبولة، فاستخدم [] لكل من reviewNotes وaccepted وacceptedAr.",
        "- Every key must have a valid JSON value immediately after its colon. Never output missing values such as \"reviewNotes\": , or \"accepted\": , . If there are no review notes or accepted alternative answers, use [] for reviewNotes, accepted, and acceptedAr."
      ),
      L(
        "- Schreibe jeden Array-Wert mit öffnender und schließender eckiger Klammer. opts und optsAr müssen vollständige Arrays in derselben Reihenfolge und mit gleich vielen Einträgen sein; optsAr darf niemals als einzelner Textwert ausgegeben werden.",
        "- اكتب كل مصفوفة بين قوسين مربعين مفتوح ومغلق. يجب أن تكون opts وoptsAr مصفوفتين كاملتين بالترتيب نفسه وبالعدد نفسه من العناصر؛ لا تُخرج optsAr أبدًا كنص واحد.",
        "- Write every array with opening and closing square brackets. opts and optsAr must both be complete arrays with the same order and number of items; never output optsAr as a single string."
      ),
      L(
        "- Prüfe vor der Ausgabe intern das gesamte Objekt: alle Klammern sind geschlossen, alle Kommas korrekt, alle Zeichenfolgen mit geraden Anführungszeichen begrenzt, jeder Schlüssel hat einen Wert, alle Arrays sind korrekt und es gibt keine trailing commas. Stelle sicher, dass das JSON-Objekt innerhalb des Codeblocks direkt von JSON.parse akzeptiert würde. Gib nur den JSON-Codeblock aus, ohne Erklärung davor oder danach.",
        "- قبل الإخراج، تحقّق داخليًا من الكائن كاملًا: جميع الأقواس مغلقة، والفواصل صحيحة، والنصوص محاطة بعلامات اقتباس مستقيمة، ولكل مفتاح قيمة، وجميع المصفوفات صحيحة، ولا توجد فواصل زائدة. تأكد أن كائن JSON داخل الكتلة البرمجية سيُقبل مباشرة بواسطة JSON.parse. أخرج كتلة JSON البرمجية فقط، دون أي شرح قبلها أو بعدها.",
        "- Before responding, internally validate the entire object: all brackets are closed, commas are correct, strings use straight double quotes, every key has a value, arrays are complete, and there are no trailing commas. Ensure the JSON object inside the code block would be accepted directly by JSON.parse. Output only the json code block, with no explanation before or after it."
      ),
      L(
        "- Prüfe vor der Ausgabe alle öffnenden/schließenden Klammern und Kommas. Nutze true, false und null ohne Anführungszeichen, wenn diese JSON-Werte gemeint sind.",
        "- قبل الإخراج، راجع جميع الأقواس الافتتاحية والختامية والفواصل. استخدم true وfalse وnull دون علامات اقتباس عندما تكون هذه قيم JSON المقصودة.",
        "- Before responding, check all opening and closing brackets and commas. Use true, false and null without quotes when those JSON values are intended."
      ),
      L(
        "- Verwende keine undefinierten Werte, NaN oder zusätzlichen Kommata. Das Ergebnis muss direkt mit JSON.parse funktionieren.",
        "- لا تستخدم قيمًا غير معرّفة أو NaN أو فواصل زائدة. يجب أن تعمل النتيجة مباشرة مع JSON.parse.",
        "- Do not use undefined values, NaN or trailing commas. The result must work directly with JSON.parse."
      ),
      "",
      L("UNTERSTÜTZTE JSON-STRUKTUR", "بنية JSON المدعومة", "SUPPORTED JSON STRUCTURE"),
      L(
        "Die Struktur zeigt nur Feldnamen und Datentypen. Erweitere puzzles bzw. questions in der echten Antwort auf genau " + count + " vollständige Elemente.",
        "تعرض البنية أسماء الحقول وأنواع البيانات فقط. وسّع puzzles أو questions في الإجابة الفعلية إلى " + count + " عناصر كاملة بالضبط.",
        "The structure only demonstrates field names and data types. Expand puzzles or questions in the actual response to exactly " + count + " complete items."
      ),
      JSON.stringify(example, null, 2),
      "",
      L(
        "Abschließende Kontrolle: Zähle alle Rätsel/Fragen und kontrolliere, dass jedes deutsche und arabische Feld vorhanden ist. Lass reviewNotes als [] wenn es keine konkrete Unsicherheit gibt. Die Lehrkraft prüft den Entwurf vor einer späteren Veröffentlichung.",
        "التحقق النهائي: احسب جميع الألغاز/الأسئلة وتأكد من وجود كل حقل ألماني وعربي. اترك reviewNotes فارغة [] إذا لم توجد نقطة غير مؤكدة. يجب على الخادم/الخادمة مراجعة المسودة قبل نشرها لاحقًا.",
        "Final check: count every puzzle/question and confirm each German and Arabic field is present. Keep reviewNotes as [] if no specific uncertainty exists. The teacher must review the draft before any later publication."
      )
    ];
    return lines.join("\n");
  }

  function buildJsonRepairPrompt(rawJson, expectedType, language) {
    const lang = ["de", "ar", "en"].includes(language) ? language : "de";
    const L = function (de, ar, en) { return lang === "ar" ? ar : (lang === "en" ? en : de); };
    const expected = expectedType === "escape-room" ? "escape-room" : "bibel-challenge";
    return [
      L("Bitte korrigiere ausschließlich die JSON-Syntax des folgenden Bibelreise-Entwurfs.",
        "يرجى تصحيح صياغة JSON فقط في مسودة Bibelreise التالية.",
        "Please correct only the JSON syntax of the following Bibelreise draft."),
      L("WICHTIG: Ändere, übersetze, kürze, erweitere, sortiere oder paraphrasiere keine Inhalte. Bewahre alle deutschen und arabischen Textwerte, Fragen, Antworten, Hinweise, Erklärungen, Reihenfolgen und Bedeutungen unverändert. Alle deutschen und arabischen Felder müssen erhalten bleiben.",
        "مهم: لا تغيّر أو تترجم أو تختصر أو توسّع أو تعيد ترتيب أو تعيد صياغة أي محتوى. احتفظ بجميع النصوص الألمانية والعربية والأسئلة والإجابات والتلميحات والتفسيرات والترتيبات والمعاني دون تغيير. يجب الحفاظ على جميع الحقول الألمانية والعربية.",
        "IMPORTANT: Do not change, translate, shorten, expand, reorder or paraphrase any content. Preserve all German and Arabic text values, questions, answers, hints, explanations, ordering and meanings unchanged. Keep every German and Arabic field."),
      L("Behebe nur Syntaxfehler wie überflüssige Kommata vor } oder ], fehlende Kommata, fehlerhafte Anführungszeichen oder nicht geschlossene Klammern. Ändere keine Schema-Schlüssel. gameType muss " + expected + " und schemaVersion muss bibelreise-ai-v1 bleiben.",
        "أصلح أخطاء الصياغة فقط، مثل الفواصل الزائدة قبل } أو ] أو الفواصل المفقودة أو علامات الاقتباس الخاطئة أو الأقواس غير المغلقة. لا تغيّر مفاتيح البنية. يجب أن تبقى gameType هي " + expected + " وأن تبقى schemaVersion هي bibelreise-ai-v1.",
        "Fix syntax errors only, such as trailing commas before } or ], missing commas, malformed quotation marks or unclosed brackets. Do not change schema keys. Keep gameType as " + expected + " and schemaVersion as bibelreise-ai-v1."),
      L("Gib genau ein vollständiges, parsebares JSON-Objekt zurück, ohne Markdown-Codezaun, Kommentare, Auslassungspunkte oder Zusatztext. Keine trailing commas. Anzahl und Reihenfolge der Rätsel/Fragen bleiben unverändert.",
        "أخرج كائن JSON كاملًا واحدًا قابلًا للتحليل فقط، دون كتل Markdown أو تعليقات أو نقاط حذف أو نص إضافي. لا تستخدم فواصل زائدة. يجب الحفاظ على عدد الألغاز/الأسئلة وترتيبها كما هو.",
        "Return exactly one complete parseable JSON object, with no Markdown fences, comments, ellipses or extra text. No trailing commas. Preserve the number and order of puzzles/questions."),
      L("Wenn ein Wert fehlt – insbesondere bei \"reviewNotes\": , – ergänze einen gültigen, schema-konformen JSON-Wert. Für reviewNotes verwende [] wenn keine Hinweise vorhanden sind; entferne das Feld nicht. Prüfe jede Eigenschaft auf einen gültigen Wert nach dem Doppelpunkt.",
        "إذا كانت قيمة مفقودة، وخصوصًا في \"reviewNotes\": , فأكمل قيمة JSON صحيحة ومتوافقة مع البنية. استخدم [] للحقل reviewNotes إذا لم توجد ملاحظات، ولا تحذف الحقل. تحقّق من وجود قيمة صحيحة بعد النقطتين لكل مفتاح.",
        "If a value is missing—especially \"reviewNotes\": ,—supply a valid JSON value that matches the schema. Use [] for reviewNotes when there are no notes; do not remove the field. Check that every property has a valid value after its colon."),
      "",
      L("JSON mit Syntaxfehlern:", "JSON الذي يحتوي على أخطاء:", "JSON WITH SYNTAX ERRORS:"),
      String(rawJson || "")
    ].join("\n");
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
    const countOptions = [3, 4, 6, 7, 10].map(function (count) {
      return "<option value='" + count + "' " + (count === 4 ? "selected" : "") + ">" + count + (isEscape ? " Rätsel" : " Fragen") + "</option>";
    }).join("");
    panel.innerHTML =
      "<div class='editor-head'><div><h2>🧠 ChatGPT-Prompt erstellen / إعداد طلب ChatGPT</h2>" +
      "<p class='small'>Wähle die Sprache des generierten Prompts. Das Spiel selbst bleibt immer Deutsch und Arabisch. Kein KI/API-Aufruf.</p></div></div>" +
      "<div class='field'><label for='bibelreisePromptLanguage'>Sprache des ChatGPT-Prompts / لغة الطلب</label><select id='bibelreisePromptLanguage'>" +
      "<option value='de'>Deutsch</option><option value='ar'>العربية</option><option value='en'>English</option></select></div>" +
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

    const languageInput = panel.querySelector("#bibelreisePromptLanguage");
    languageInput.value = activePromptLanguage;
    languageInput.addEventListener("change", function () { activePromptLanguage = languageInput.value; });
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
        language: languageInput.value,
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
      languageInput.value = "de";
      activePromptLanguage = "de";
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
      "<div class='editor-head'><div><h2>📥 JSON-Entwurf importieren</h2><p class='small'>Füge den JSON-Code aus ChatGPT ein (am besten über „Code kopieren“). Ein äußerer ```json-Codeblock wird automatisch entfernt. Der Entwurf wird als neues Spiel angelegt und nie automatisch veröffentlicht.</p></div></div>" +
      "<div class='field'><label for='bibelreiseAiJson'>JSON aus ChatGPT / بيانات JSON من ChatGPT</label><textarea id='bibelreiseAiJson' spellcheck='false' placeholder='Hier das vollständige JSON-Objekt einfügen…' style='min-height:210px;font-family:ui-monospace,Consolas,monospace'></textarea></div>" +
      "<div class='actions'><button class='btn' id='bibelreiseAiValidate' type='button'>Prüfen & Vorschau / تحقّق واعرض المعاينة</button><button class='btn secondary' id='bibelreiseAiClear' type='button'>Leeren</button><button class='btn success' id='bibelreiseAiImport' type='button' disabled>Als neuen Entwurf übernehmen / استيراد كمسودة</button></div>" +
      "<div id='bibelreiseAiMessages' aria-live='polite'></div><div id='bibelreiseAiPreview'></div>" +
      "<section id='bibelreiseAiRepairBox' class='card' hidden style='margin-top:14px;border:2px solid #e5c77d'>" +
      "<h3>🛠️ JSON-Syntax korrigieren / إصلاح صياغة JSON</h3>" +
      "<p class='small'>Der Korrekturprompt fordert ChatGPT auf, nur die Syntax zu reparieren und alle deutschen und arabischen Inhalte unverändert zu lassen. Bibelreise ändert JSON nicht automatisch.</p>" +
      "<div class='field'><label for='bibelreiseAiRepairPrompt'>Korrekturprompt für ChatGPT</label><textarea id='bibelreiseAiRepairPrompt' spellcheck='false' style='min-height:230px;font-family:ui-monospace,Consolas,monospace'></textarea></div>" +
      "<div class='actions'><button class='btn gold' id='bibelreiseAiRepairCopy' type='button'>📋 Korrekturprompt kopieren / نسخ طلب التصحيح</button></div></section>" +
      "<p class='small'>Kein KI/API-Aufruf. Die Antwort wird nur nach deiner ausdrücklichen Bestätigung in Bibelreise gespeichert. Der Lehrer muss Antworten und Bibelstellen vor dem Veröffentlichen prüfen.</p>";
    nav.insertAdjacentElement("afterend", panel);

    const textArea = panel.querySelector("#bibelreiseAiJson");
    const messages = panel.querySelector("#bibelreiseAiMessages");
    const preview = panel.querySelector("#bibelreiseAiPreview");
    const repairBox = panel.querySelector("#bibelreiseAiRepairBox");
    const repairPromptArea = panel.querySelector("#bibelreiseAiRepairPrompt");
    const repairCopyButton = panel.querySelector("#bibelreiseAiRepairCopy");
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
      repairBox.hidden = true;
      repairPromptArea.value = "";
    }
    textArea.addEventListener("input", reset);
    clearButton.addEventListener("click", function () {
      textArea.value = "";
      reset();
      textArea.focus();
    });
    repairCopyButton.addEventListener("click", async function () {
      if (!repairPromptArea.value.trim()) return;
      try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
          await navigator.clipboard.writeText(repairPromptArea.value);
          messages.innerHTML = "<div class='feedback ok'>Korrekturprompt kopiert. Füge ihn in ChatGPT ein und kopiere danach das korrigierte JSON zurück.</div>";
          return;
        }
      } catch (_) {}
      repairPromptArea.focus();
      repairPromptArea.select();
      let copied = false;
      try { copied = document.execCommand("copy"); } catch (_) {}
      messages.innerHTML = copied
        ? "<div class='feedback ok'>Korrekturprompt kopiert. Füge ihn in ChatGPT ein und kopiere danach das korrigierte JSON zurück.</div>"
        : "<div class='notice'>Automatisches Kopieren wurde blockiert. Markiere den Korrekturprompt und kopiere ihn manuell.</div>";
    });
    validateButton.addEventListener("click", function () {
      reset();
      const normalizedText = normalizePastedJson(textArea.value);
      if (normalizedText !== textArea.value) textArea.value = normalizedText;
      const checked = validateEnvelope(normalizedText, currentKind);
      if (checked.errors.length) {
        messages.innerHTML = "<div class='notice' style='background:#fff0f1;border-color:#f3b6bf;color:#8b1f2d'><strong>Bitte korrigiere " + checked.errors.length + " Problem(e):</strong><ul>" +
          checked.errors.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul></div>";
        const hasSyntaxError = checked.errors.some(function (x) { return x.startsWith("Das JSON ist ungültig:"); });
        if (hasSyntaxError) {
          messages.insertAdjacentHTML("beforeend", "<button class='btn secondary' id='bibelreiseAiCreateRepairPrompt' type='button' style='margin-top:10px'>🛠️ Korrekturprompt für ChatGPT erstellen / إعداد طلب التصحيح</button>");
          panel.querySelector("#bibelreiseAiCreateRepairPrompt").addEventListener("click", function () {
            repairPromptArea.value = buildJsonRepairPrompt(textArea.value, currentKind, activePromptLanguage);
            repairBox.hidden = false;
            repairPromptArea.focus();
          });
        }
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
