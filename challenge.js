(function () {
  "use strict";
  const CHALLENGES_KEY = "bibleEscapeReadingChallengesV1";
  const CHALLENGE_RESULTS_KEY = "bibleEscapeReadingResultsV1";

  function readChallenges() {
    try { return JSON.parse(localStorage.getItem(CHALLENGES_KEY) || "[]"); }
    catch (_) { return []; }
  }
  function saveChallenges(list) {
    localStorage.setItem(CHALLENGES_KEY, JSON.stringify(list));
  }
  function readChallengeResults() {
    try { return JSON.parse(localStorage.getItem(CHALLENGE_RESULTS_KEY) || "[]"); }
    catch (_) { return []; }
  }
  function id() {
    return "bc_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
  }
  function challengeById(challengeId) {
    return readChallenges().find(function (item) { return item.id === challengeId; });
  }
  function lines(value) {
    return String(value || "").split(/\r?\n/).map(function (x) { return x.trim(); }).filter(Boolean);
  }
  function splitAnswers(value) {
    return String(value || "").split(/[,\n;]/).map(function (x) { return x.trim(); }).filter(Boolean);
  }
  function field(idValue, label, value, rtl) {
    return "<div class='field'><label for='" + idValue + "'>" + label + "</label><input id='" + idValue + "' value='" + esc(value || "") + "'" +
      (rtl ? " class='lang-ar' dir='rtl'" : "") + "></div>";
  }
  function textareaField(idValue, label, value, rtl) {
    return "<div class='field'><label for='" + idValue + "'>" + label + "</label><textarea id='" + idValue + "'" +
      (rtl ? " class='lang-ar' dir='rtl'" : "") + ">" + esc(value || "") + "</textarea></div>";
  }
  function newQuestion(number) {
    return {
      id: id(),
      type: "choice",
      q: "",
      qAr: "",
      opts: ["", "", ""],
      optsAr: ["", "", ""],
      a: 0,
      hint: "",
      hintAr: "",
      explanation: "",
      explanationAr: "",
      points: 100,
      accepted: [],
      acceptedAr: []
    };
  }
  function emptyChallenge() {
    return {
      id: id(),
      title: "Neue Bibel-Challenge",
      titleAr: "تحدي كتابي جديد",
      passage: "",
      instructions: "",
      instructionsAr: "",
      status: "draft",
      questions: [newQuestion(1), newQuestion(2), newQuestion(3)],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }
  function readyToPublish(challenge) {
    if (!challenge.title || !challenge.titleAr || !challenge.passage ||
        !challenge.instructions || !challenge.instructionsAr) {
      return "Bitte Titel, Bibelstelle und Anweisungen in beiden Sprachen ausfüllen.";
    }
    if (challenge.questions.length < 3 || challenge.questions.length > 4) {
      return "Eine Bibel-Challenge braucht 3 oder 4 Fragen.";
    }
    for (let i = 0; i < challenge.questions.length; i++) {
      const q = challenge.questions[i];
      if (!q.q || !q.qAr) return "Frage " + (i + 1) + " braucht deutschen und arabischen Fragetext.";
      if (q.type === "choice") {
        if (!q.opts || q.opts.length < 2 || q.opts.some(function (x) { return !x; }) ||
            !q.optsAr || q.optsAr.length !== q.opts.length || q.optsAr.some(function (x) { return !x; })) {
          return "Bitte bei Frage " + (i + 1) + " alle Antwortoptionen in Deutsch und Arabisch ausfüllen.";
        }
        if (Number(q.a) < 0 || Number(q.a) >= q.opts.length) return "Bitte die richtige Antwort bei Frage " + (i + 1) + " auswählen.";
      } else if (q.type === "truefalse") {
        if (q.a !== "true" && q.a !== "false") return "Bitte die richtige Antwort bei Frage " + (i + 1) + festlegen.";
      } else if (q.type === "order") {
        if (!q.items || q.items.length < 2 || !q.itemsAr || q.itemsAr.length !== q.items.length ||
            q.items.some(function (x) { return !x; }) || q.itemsAr.some(function (x) { return !x; })) {
          return "Bitte bei der Reihenfolge-Frage " + (i + 1) + mindestens zwei Ereignisse in beiden Sprachen eintragen.";
        }
      } else if (!q.a && !(q.accepted || []).length && !q.aAr && !(q.acceptedAr || []).length) {
        return "Bitte eine richtige oder akzeptierte Antwort bei Frage " + (i + 1) + hinterlegen.";
      }
    }
    return "";
  }
  function localResultCount(challengeId) {
    return readChallengeResults().filter(function (r) { return r.challengeId === challengeId; }).length;
  }

  const originalRender = render;
  render = function () {
    if (state.view === "challengeList") return renderChallengeList();
    if (state.view === "challengeIntro") return renderChallengeIntro();
    if (state.view === "challengeQuestion") return renderChallengeQuestion();
    if (state.view === "challengeResult") return renderChallengeResult();
    if (state.view === "teacherChallenges") return renderTeacherChallenges();
    if (state.view === "teacherChallengeEdit") return renderTeacherChallengeEdit(state.teacherChallengeId);
    if (state.view === "teacherChallengeResults") return renderTeacherChallengeResults(state.teacherChallengeId);
    return originalRender();
  };

  const originalHome = home;
  home = function () {
    originalHome();
    if (state.view !== "home") return;
    const anchor = document.querySelector(".student-tools");
    if (!anchor || document.getElementById("bibelChallengeEntry")) return;
    anchor.insertAdjacentHTML("afterend",
      "<section id='bibelChallengeEntry' class='challenge-entry'>" +
      "<div class='challenge-entry-icon'>📖</div><div class='challenge-entry-copy'>" +
      "<span class='challenge-kicker'>NEU · BIBEL LESEN & ENTDECKEN</span>" +
      "<h2>Bibel-Challenge / تحدّي الكتاب المقدس</h2>" +
      "<p>Lest einen Bibelabschnitt, schaut bei Bedarf noch einmal nach und beantwortet 3–4 Fragen in Deutsch und Arabisch.</p>" +
      "</div><button class='btn challenge-entry-button' onclick='studentChallenges()'>Challenges entdecken / اكتشف التحديات →</button></section>");
  };

  const originalTeacherDashboard = teacherDashboard;
  teacherDashboard = function () {
    originalTeacherDashboard();
    if (!isTeacher()) return;
    const nav = document.querySelector(".teacher-nav");
    if (nav && !document.getElementById("teacherChallengeNav")) {
      nav.insertAdjacentHTML("beforeend", "<button id='teacherChallengeNav' class='btn' onclick='teacherChallengeDashboard()'>📖 Bibel-Challenges</button>");
    }
    const hero = document.querySelector(".teacher-nav + .hero");
    if (hero && !document.getElementById("teacherChallengeShortcut")) {
      hero.insertAdjacentHTML("afterend",
        "<section id='teacherChallengeShortcut' class='challenge-entry teacher-challenge-shortcut'>" +
        "<div class='challenge-entry-icon'>📚</div><div class='challenge-entry-copy'>" +
        "<h2>Bibel-Challenges verwalten</h2><p>Veröffentlicht Leseaktivitäten mit 3–4 Fragen – unabhängig vom Escape-Room-Modus.</p></div>" +
        "<button class='btn challenge-entry-button' onclick='teacherChallengeDashboard()'>Challenge-Verwaltung öffnen →</button></section>");
    }
  };

  function studentChallenges() {
    state.view = "challengeList";
    render();
  }
  function renderChallengeList() {
    clearInterval(state.timer);
    const published = readChallenges().filter(function (c) { return c.status === "published"; });
    const cards = published.map(function (c) {
      return "<article class='card challenge-card'><div class='challenge-card-icon'>📖</div>" +
        bi(c.title, c.titleAr) + "<div class='challenge-passage'>📍 " + esc(c.passage) + "</div>" +
        bi(c.instructions, c.instructionsAr) +
        "<div class='small'>" + c.questions.length + " Fragen · Deutsch / العربية</div>" +
        "<button class='btn' onclick='beginChallengeSetup(\"" + esc(c.id) + "\")'>Lesen & beantworten / اقرأ وأجب →</button></article>";
    }).join("");
    app.innerHTML = "<main class='app'>" + header("Bibel-Challenge / تحدي الكتاب المقدس") +
      "<button class='btn secondary back' onclick='home()'>← Zur Startseite / العودة للرئيسية</button>" +
      "<section class='hero challenge-hero'><h1>📖 Bibel-Challenge</h1><p>Lest zuerst den angegebenen Bibelabschnitt. Ihr könnt den Text jederzeit wieder öffnen, bevor ihr antwortet.</p><p class='lang-ar' dir='rtl'>اقرأوا المقطع الكتابي أولًا. يمكنكم الرجوع إلى النص في أي وقت قبل الإجابة.</p></section>" +
      (published.length ? "<div class='challenge-list-grid'>" + cards + "</div>" :
        "<section class='card empty-challenge'><div style='font-size:42px'>📖</div><h2>Noch keine Challenge veröffentlicht</h2><p>Schaut später wieder vorbei. Eure Diener/innen veröffentlichen hier neue Bibel-Leseaktivitäten.</p><p class='lang-ar' dir='rtl'>لم يتم نشر أي تحدٍ بعد. عودوا لاحقًا للاطلاع على أنشطة قراءة الكتاب المقدس الجديدة.</p></section>") +
      "</main>";
  }
  function beginChallengeSetup(challengeId) {
    const challenge = challengeById(challengeId);
    if (!challenge || challenge.status !== "published") return studentChallenges();
    state.activeChallenge = JSON.parse(JSON.stringify(challenge));
    state.challengeIndex = 0;
    state.challengeAnswers = [];
    state.challengeName = "";
    state.challengeScore = 0;
    state.challengeStartedAt = 0;
    state.challengeScreen = "intro";
    state.challengeOrder = [];
    state.challengeOrderIndex = -1;
    state.view = "challengeIntro";
    render();
  }
  function renderChallengeIntro() {
    const c = state.activeChallenge;
    if (!c) return studentChallenges();
    clearInterval(state.timer);
    app.innerHTML = "<main class='app'>" + header("Bibel-Challenge / تحدي الكتاب المقدس") +
      "<button class='btn secondary back' onclick='studentChallenges()'>← Zurück zu den Challenges / العودة للتحديات</button>" +
      "<section class='hero challenge-hero'><div class='challenge-hero-icon'>📖</div><h1>" + esc(c.title) + "</h1><h2 class='lang-ar' dir='rtl'>" + esc(c.titleAr) + "</h2>" +
      "<p class='challenge-passage'>📍 " + esc(c.passage) + "</p>" +
      bi(c.instructions, c.instructionsAr) +
      "<div class='actions' style='justify-content:center;margin-top:18px'><button class='btn gold' onclick='openChallengeBible()'>📖 Bibelabschnitt erneut lesen / إعادة قراءة المقطع</button></div></section>" +
      "<section class='card setup'><h2>Wer löst die Challenge? / من سيحل التحدي؟</h2>" +
      "<div class='field'><label>Name oder Team / الاسم أو الفريق</label><input id='challengeStudentName' maxlength='50' placeholder='Name eingeben / اكتب الاسم'></div>" +
      "<p class='small'>Lest den Bibeltext aufmerksam. Ihr dürft die Bibel während jeder Frage erneut öffnen.</p>" +
      "<button class='btn' onclick='startChallenge()'>Challenge starten / ابدأ التحدي →</button></section></main>";
  }
  function startChallenge() {
    const nameInput = document.getElementById("challengeStudentName");
    const name = (nameInput && nameInput.value || "").trim();
    if (!name) { alert("Bitte gebt einen Namen ein. / من فضلكم اكتبوا الاسم."); return; }
    state.challengeName = name;
    state.challengeStartedAt = Date.now();
    state.challengeIndex = 0;
    state.challengeAnswers = [];
    state.challengeScore = 0;
    state.challengeScreen = "question";
    state.challengeOrderIndex = -1;
    state.view = "challengeQuestion";
    render();
  }
  function ensureChallengeAnswer() {
    if (!state.challengeAnswers[state.challengeIndex]) {
      state.challengeAnswers[state.challengeIndex] = { selected: null, text: "", correct: null, points: 0 };
    }
    return state.challengeAnswers[state.challengeIndex];
  }
  function shuffleNumbers(n) {
    const values = Array.from({ length: n }, function (_, i) { return i; });
    for (let i = values.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = values[i]; values[i] = values[j]; values[j] = tmp;
    }
    return values;
  }
  function renderChallengeQuestion() {
    const c = state.activeChallenge;
    if (!c) return studentChallenges();
    clearInterval(state.timer);
    state.challengeScreen = "question";
    const index = state.challengeIndex;
    const q = c.questions[index];
    if (!q) return finishChallenge();
    const answer = ensureChallengeAnswer();
    if (q.type === "order" && state.challengeOrderIndex !== index) {
      state.challengeOrder = shuffleNumbers((q.items || []).length);
      state.challengeOrderIndex = index;
    }
    let input = "";
    if (q.type === "choice") {
      input = (q.opts || []).map(function (opt, i) {
        return "<button class='challenge-answer-choice " + (answer.selected === i ? "selected" : "") + "' onclick='chooseChallengeAnswer(" + i + ")'>" +
          "<span class='challenge-choice-index'>" + String.fromCharCode(65 + i) + "</span><span class='challenge-choice-text'>" +
          bi(opt, (q.optsAr || [])[i] || "") + "</span></button>";
      }).join("");
    } else if (q.type === "truefalse") {
      input = "<div class='challenge-binary-grid'>" +
        "<button class='challenge-answer-choice " + (answer.selected === "true" ? "selected" : "") + "' onclick='chooseChallengeAnswer(\"true\")'><strong>✅ Richtig</strong><span class='lang-ar'>صحيح</span></button>" +
        "<button class='challenge-answer-choice " + (answer.selected === "false" ? "selected" : "") + "' onclick='chooseChallengeAnswer(\"false\")'><strong>❌ Falsch</strong><span class='lang-ar'>خطأ</span></button></div>";
    } else if (q.type === "order") {
      input = "<p class='small'>Bringt die Ereignisse mit ↑ und ↓ in die richtige Reihenfolge. / رتّبوا الأحداث باستخدام ↑ و↓.</p><div class='challenge-order-list'>" +
        state.challengeOrder.map(function (originalIndex, displayIndex) {
          return "<div class='challenge-order-item'><div class='challenge-order-label'><span class='challenge-choice-index'>" + (displayIndex + 1) + "</span>" +
            "<div class='challenge-order-text'>" + bi(q.items[originalIndex], (q.itemsAr || [])[originalIndex] || "") + "</div></div>" +
            "<div class='challenge-order-actions'><button class='btn secondary' onclick='moveChallengeOrder(" + displayIndex + ",-1)' " + (displayIndex === 0 ? "disabled" : "") + ">↑</button>" +
            "<button class='btn secondary' onclick='moveChallengeOrder(" + displayIndex + ",1)' " + (displayIndex === state.challengeOrder.length - 1 ? "disabled" : "") + ">↓</button></div></div>";
        }).join("") + "</div>";
    } else {
      input = "<div class='field'><label>Deine Antwort / إجابتك</label><input id='challengeTextAnswer' value='" + esc(answer.text || "").replace(/'/g, "&#039;") +
        "' oninput='saveChallengeTextAnswer(this.value)' placeholder='Antwort hier eingeben / اكتب الإجابة هنا'></div>";
    }
    let feedback = "";
    if (answer.correct !== null) {
      const rightAnswer = challengeCorrectAnswer(q);
      feedback = "<section class='challenge-feedback " + (answer.correct ? "correct" : "incorrect") + "'>" +
        "<h3>" + (answer.correct ? "✅ Richtig! / إجابة صحيحة!" : "↪ Schaut noch einmal nach / راجعوا النص مرة أخرى") + "</h3>" +
        (answer.correct ? "<p>" + Number(answer.points || 0) + " Punkte</p>" : "<p>0 Punkte für diese Frage / لا توجد نقاط لهذا السؤال</p>") +
        "<div class='challenge-correct-answer'><strong>Richtige Antwort / الإجابة الصحيحة</strong>" + rightAnswer + "</div>" +
        (q.explanation || q.explanationAr ? "<h4>Warum? / لماذا؟</h4>" + bi(q.explanation || "", q.explanationAr || "") :
          "<p class='small'>Vergleicht eure Antwort mit dem Bibeltext. / قارنوا إجابتكم بالنص الكتابي.</p>") +
        "</section><button class='btn' onclick='nextChallengeQuestion()'>" +
        (index < c.questions.length - 1 ? "Nächste Frage / السؤال التالي →" : "Ergebnis anzeigen / عرض النتيجة →") + "</button>";
    } else {
      feedback = "<div class='actions challenge-question-actions'><button class='btn' onclick='checkChallengeAnswer()'>Antwort prüfen / تحقّق من الإجابة</button>" +
        (q.hint || q.hintAr ? "<button class='btn secondary' onclick='toggleChallengeHint()'>💡 Hinweis / تلميح</button>" : "") + "</div>" +
        (state.challengeShowHint ? "<div class='hint-box'>" + bi(q.hint || "", q.hintAr || "") + "</div>" : "");
    }
    app.innerHTML = "<main class='app'>" + header("Bibel-Challenge / تحدي الكتاب المقدس") +
      "<div class='challenge-session-bar'><div><strong>" + esc(state.challengeName) + "</strong><div class='small'>" + esc(c.title) + " / " + esc(c.titleAr) + "</div></div>" +
      "<button class='btn secondary' onclick='openChallengeBible()'>📖 Bibel erneut öffnen / فتح الكتاب المقدس</button></div>" +
      "<div class='challenge-progress-row'><span>Frage " + (index + 1) + " von " + c.questions.length + " / السؤال " + (index + 1) + " من " + c.questions.length + "</span><strong>" + state.challengeScore + " Punkte</strong></div>" +
      "<div class='progress'><div style='width:" + Math.round((index + (answer.correct !== null ? 1 : 0)) / c.questions.length * 100) + "%'></div></div>" +
      "<section class='card challenge-question-card'><div class='challenge-question-type'>" + esc(typeLabel(q.type)) + "</div>" +
      "<div class='challenge-passage-inline'>📖 " + esc(c.passage) + "</div>" + bi(q.q, q.qAr) +
      (answer.correct === null ? input : "") + feedback + "</section>" +
      "<div class='actions' style='margin-top:16px'><button class='btn secondary' onclick='studentChallenges()'>← Challenges / التحديات</button></div></main>";
  }
  function saveChallengeTextAnswer(value) {
    ensureChallengeAnswer().text = value;
  }
  function chooseChallengeAnswer(value) {
    const answer = ensureChallengeAnswer();
    if (answer.correct !== null) return;
    answer.selected = value;
    renderChallengeQuestion();
  }
  function moveChallengeOrder(displayIndex, delta) {
    const answer = ensureChallengeAnswer();
    if (answer.correct !== null) return;
    const j = displayIndex + delta;
    if (j < 0 || j >= state.challengeOrder.length) return;
    const tmp = state.challengeOrder[displayIndex];
    state.challengeOrder[displayIndex] = state.challengeOrder[j];
    state.challengeOrder[j] = tmp;
    renderChallengeQuestion();
  }
  function toggleChallengeHint() {
    state.challengeShowHint = !state.challengeShowHint;
    renderChallengeQuestion();
  }
  function challengeCorrectAnswer(q) {
    if (q.type === "choice") {
      const i = Number(q.a);
      return bi((q.opts || [])[i] || "", (q.optsAr || [])[i] || "");
    }
    if (q.type === "truefalse") return bi(String(q.a) === "true" ? "Richtig" : "Falsch", String(q.a) === "true" ? "صحيح" : "خطأ");
    if (q.type === "order") return bi((q.items || []).join(" → "), (q.itemsAr || []).join(" ← "));
    return bi(q.a || (q.accepted || [])[0] || "", q.aAr || (q.acceptedAr || [])[0] || "");
  }
  function checkChallengeAnswer() {
    const c = state.activeChallenge;
    const q = c.questions[state.challengeIndex];
    const answer = ensureChallengeAnswer();
    if (answer.correct !== null) return;
    if (q.type === "choice" && answer.selected === null) { alert("Bitte wählt eine Antwort. / اختاروا إجابة من فضلكم."); return; }
    if (q.type === "truefalse" && answer.selected === null) { alert("Bitte wählt Richtig oder Falsch. / اختاروا صحيح أو خطأ."); return; }
    if (q.type === "order" && !state.challengeOrder.length) { alert("Für diese Frage wurden keine Ereignisse angelegt."); return; }
    if (!["choice", "truefalse", "order"].includes(q.type) && !String(answer.text || "").trim()) { alert("Bitte gebt eine Antwort ein. / اكتبوا الإجابة من فضلكم."); return; }
    let correct = false;
    if (q.type === "choice") correct = Number(answer.selected) === Number(q.a);
    else if (q.type === "truefalse") correct = String(answer.selected) === String(q.a);
    else if (q.type === "order") correct = state.challengeOrder.every(function (value, i) { return value === i; });
    else correct = accepted(q, answer.text);
    answer.correct = correct;
    answer.points = correct ? Number(q.points || 100) : 0;
    answer.given = q.type === "choice" ? (q.opts || [])[Number(answer.selected)] :
      q.type === "truefalse" ? (String(answer.selected) === "true" ? "Richtig / صحيح" : "Falsch / خطأ") :
      q.type === "order" ? state.challengeOrder.map(function (i) { return q.items[i]; }).join(" → ") : answer.text;
    if (correct) state.challengeScore += answer.points;
    state.challengeShowHint = false;
    renderChallengeQuestion();
  }
  function nextChallengeQuestion() {
    const c = state.activeChallenge;
    if (state.challengeIndex < c.questions.length - 1) {
      state.challengeIndex++;
      state.challengeShowHint = false;
      state.challengeOrderIndex = -1;
      state.view = "challengeQuestion";
      render();
    } else finishChallenge();
  }
  function finishChallenge() {
    const c = state.activeChallenge;
    const answers = state.challengeAnswers || [];
    const correctCount = answers.filter(function (a) { return a && a.correct; }).length;
    const totalPoints = c.questions.reduce(function (sum, q) { return sum + Number(q.points || 100); }, 0);
    const elapsedSeconds = Math.max(0, Math.round((Date.now() - state.challengeStartedAt) / 1000));
    const result = {
      id: id(),
      challengeId: c.id,
      challengeTitle: c.title,
      challengeTitleAr: c.titleAr,
      passage: c.passage,
      studentName: state.challengeName,
      score: state.challengeScore,
      totalPoints: totalPoints,
      correctCount: correctCount,
      questionCount: c.questions.length,
      elapsedSeconds: elapsedSeconds,
      completedAt: new Date().toISOString(),
      answers: c.questions.map(function (q, i) {
        const a = answers[i] || {};
        return { questionId: q.id, question: q.q, questionAr: q.qAr, correct: !!a.correct, given: a.given || a.text || "", points: Number(a.points || 0) };
      })
    };
    const results = readChallengeResults();
    results.push(result);
    localStorage.setItem(CHALLENGE_RESULTS_KEY, JSON.stringify(results));
    state.challengeResult = result;
    state.view = "challengeResult";
    render();
  }
  function renderChallengeResult() {
    const c = state.activeChallenge;
    const r = state.challengeResult;
    if (!c || !r) return studentChallenges();
    app.innerHTML = "<main class='app'>" + header("Bibel-Challenge / تحدي الكتاب المقدس") +
      "<section class='hero challenge-result-hero center'><div style='font-size:48px'>" + (r.correctCount === r.questionCount ? "🏆" : "📖") + "</div>" +
      "<h1>Challenge abgeschlossen! / اكتمل التحدي!</h1><p>" + esc(r.studentName) + "</p><h2>" + r.score + " / " + r.totalPoints + " Punkte</h2>" +
      "<p>" + r.correctCount + " von " + r.questionCount + " richtig / " + r.correctCount + " من " + r.questionCount + " إجابات صحيحة</p>" +
      "<p>📍 " + esc(r.passage) + " · " + Math.floor(r.elapsedSeconds / 60) + ":" + String(r.elapsedSeconds % 60).padStart(2, "0") + "</p></section>" +
      "<section class='card'><h2>Das habt ihr gelernt / ماذا تعلمتم</h2>" +
      c.questions.map(function (q, i) {
        const a = r.answers[i] || {};
        return "<article class='challenge-review-item'><div class='challenge-review-status'>" + (a.correct ? "✅" : "📖") + " " + (a.correct ? "Richtig / صحيح" : "Noch einmal lesen / أعد القراءة") + "</div>" +
          bi(q.q, q.qAr) + (a.correct ? "" : "<div><strong>Eure Antwort / إجابتكم:</strong> " + esc(a.given || "—") + "</div>") +
          "<div><strong>Richtige Antwort / الإجابة الصحيحة:</strong></div>" + challengeCorrectAnswer(q) +
          (q.explanation || q.explanationAr ? bi(q.explanation || "", q.explanationAr || "") : "") + "</article>";
      }).join("") + "</section><div class='actions' style='margin-top:16px'><button class='btn' onclick='studentChallenges()'>Weitere Challenge / تحدٍ آخر</button><button class='btn secondary' onclick='home()'>Zur Startseite / العودة للرئيسية</button></div></main>";
  }

  function teacherChallengeDashboard() {
    if (!isTeacher()) { teacherLogin(); return; }
    state.view = "teacherChallenges";
    render();
  }
  function renderTeacherChallenges() {
    clearInterval(state.timer);
    const challenges = readChallenges().slice().sort(function (a, b) { return String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")); });
    const rows = challenges.map(function (c) {
      const results = localResultCount(c.id);
      return "<tr><td><strong>" + esc(c.title) + "</strong><br><span class='lang-ar'>" + esc(c.titleAr) + "</span><br><span class='small'>" + esc(c.passage) + "</span></td>" +
        "<td>" + (c.status === "published" ? "<span class='badge green'>Veröffentlicht</span>" : "<span class='badge gray'>Entwurf</span>") + "</td>" +
        "<td>" + c.questions.length + "</td><td>" + results + "</td><td><div class='actions'><button class='btn secondary' onclick='editBibleChallenge(\"" + esc(c.id) + "\")'>Bearbeiten</button>" +
        "<button class='btn gold' onclick='previewBibleChallenge(\"" + esc(c.id) + "\")'>Vorschau</button>" +
        "<button class='btn secondary' onclick='viewBibleChallengeResults(\"" + esc(c.id) + "\")'>Ergebnisse</button>" +
        "<button class='btn danger' onclick='archiveBibleChallenge(\"" + esc(c.id) + "\")'>Archivieren</button></div></td></tr>";
    }).join("");
    app.innerHTML = "<main class='app'>" + header("Lehrerbereich · Bibel-Challenges") +
      "<div class='teacher-nav'><button class='btn secondary' onclick='teacherDashboard()'>← Lehrer-Dashboard</button><button class='btn' onclick='newBibleChallenge()'>➕ Neue Bibel-Challenge</button><button class='btn secondary' onclick='state.role=\"teacher\";home()'>🎮 Spiele spielen</button></div>" +
      "<section class='hero challenge-hero'><h1>📖 Bibel-Challenges</h1><p>Erstellt Leseaktivitäten mit einer Bibelstelle und 3–4 Fragen. Schülerinnen und Schüler können den Bibeltext jederzeit erneut öffnen.</p><p class='lang-ar' dir='rtl'>أنشئوا أنشطة قراءة مع مقطع كتابي وثلاثة أو أربعة أسئلة. يمكن للطلاب الرجوع إلى النص في أي وقت.</p></section>" +
      "<div class='notice'>Hinweis zum aktuellen Prototyp: Challenges und Ergebnisse werden vorerst lokal in diesem Browser gespeichert. Die gemeinsame Veröffentlichung für verschiedene Geräte folgt mit der gesicherten Firebase-Anbindung.</div>" +
      "<section class='card'><div class='editor-head'><div><h2>Meine Bibel-Challenges</h2><p class='small'>Titel, Bibelstelle, Anweisungen und Fragen können zweisprachig bearbeitet werden.</p></div><button class='btn' onclick='newBibleChallenge()'>➕ Neue Challenge</button></div>" +
      (challenges.length ? "<div style='overflow:auto'><table class='data-table'><thead><tr><th>Challenge</th><th>Status</th><th>Fragen</th><th>Ergebnisse</th><th>Aktionen</th></tr></thead><tbody>" + rows + "</tbody></table></div>" :
        "<div class='empty'><h3>Noch keine Bibel-Challenges</h3><p>Erstelle die erste Aktivität für eure tägliche Bibellektüre.</p><button class='btn' onclick='newBibleChallenge()'>➕ Erste Challenge erstellen</button></div>") +
      "</section></main>";
  }
  function newBibleChallenge() {
    if (!isTeacher()) { teacherLogin(); return; }
    const c = emptyChallenge();
    const list = readChallenges();
    list.push(c);
    saveChallenges(list);
    state.teacherChallengeId = c.id;
    state.view = "teacherChallengeEdit";
    render();
  }
  function editBibleChallenge(challengeId) {
    if (!isTeacher()) { teacherLogin(); return; }
    if (!challengeById(challengeId)) return teacherChallengeDashboard();
    state.teacherChallengeId = challengeId;
    state.view = "teacherChallengeEdit";
    render();
  }
  function renderTeacherChallengeEdit(challengeId) {
    if (!isTeacher()) { teacherLogin(); return; }
    const c = challengeById(challengeId);
    if (!c) return teacherChallengeDashboard();
    const questions = c.questions.map(function (q, i) { return challengeQuestionEditor(c, q, i); }).join("");
    app.innerHTML = "<main class='app'>" + header("Bibel-Challenge bearbeiten") +
      "<div class='teacher-nav'><button class='btn secondary' onclick='teacherChallengeDashboard()'>← Challenges</button><button class='btn secondary' onclick='previewBibleChallenge(\"" + esc(c.id) + "\")'>▶ Vorschau</button></div>" +
      "<div class='two-col'><section><div class='card'><div class='editor-head'><div><h1>📖 Bibel-Challenge bearbeiten</h1><p class='small'>Die Aktivität wird erst für Schülerinnen und Schüler sichtbar, wenn sie veröffentlicht ist.</p></div><span class='badge " + (c.status === "published" ? "green" : "gray") + "'>" + (c.status === "published" ? "Veröffentlicht" : "Entwurf") + "</span></div>" +
      "<div class='bilingual-fields'>" + field("bc_title", "Titel (Deutsch)", c.title, false) + field("bc_titlear", "العنوان (العربية)", c.titleAr, true) + "</div>" +
      field("bc_passage", "Bibelstelle (z. B. Esther 4,1–17)", c.passage, false) +
      "<div class='bilingual-fields'>" + textareaField("bc_instructions", "Anweisungen (Deutsch)", c.instructions, false) + textareaField("bc_instructionsar", "التعليمات (العربية)", c.instructionsAr, true) + "</div>" +
      "<div class='field'><label>Status</label><select id='bc_status'><option value='draft' " + (c.status !== "published" ? "selected" : "") + ">Entwurf</option><option value='published' " + (c.status === "published" ? "selected" : "") + ">Veröffentlicht</option></select></div>" +
      "<div class='actions'><button class='btn' onclick='saveBibleChallengeMeta(\"" + esc(c.id) + "\")'>💾 Speichern</button><button class='btn gold' onclick='previewBibleChallenge(\"" + esc(c.id) + "\")'>▶ Testen</button></div></div>" +
      "<section class='card' style='margin-top:16px'><div class='editor-head'><div><h2>Fragen (" + c.questions.length + "/4)</h2><p class='small'>Mindestens 3 und höchstens 4 Fragen zum angegebenen Bibelabschnitt.</p></div>" +
      "<button class='btn' onclick='addBibleChallengeQuestion(\"" + esc(c.id) + "\")' " + (c.questions.length >= 4 ? "disabled" : "") + ">➕ Frage hinzufügen</button></div>" +
      questions + "</section></section><aside class='sticky'><section class='card'><h2>📖 Passage erneut lesen</h2><p class='small'>Teste, ob die angegebene Stelle in der zweisprachigen Bibel gut auffindbar ist.</p><button class='btn secondary' style='width:100%' onclick='previewChallengeBible(\"" + esc(c.id) + "\")'>Bibel öffnen</button></section>" +
      "<section class='card' style='margin-top:14px'><h2>🧭 Veröffentlichungs-Check</h2><p class='small'>Vor dem Veröffentlichen prüfen wir automatisch, ob die Aktivität 3–4 zweisprachige Fragen und Antworten enthält.</p><div class='muted-box'><strong>Wichtig</strong><br><span class='small'>Bitte Antworten und Erklärungen am angegebenen Bibeltext ausrichten. AI bleibt deaktiviert.</span></div></section></aside></div></main>";
  }
  function challengeQuestionEditor(c, q, i) {
    let type = "<div class='field'><label>Fragetyp</label><select id='bcq_type_" + i + "' onchange='changeBibleChallengeQuestionType(\"" + esc(c.id) + "\"," + i + ",this.value)'>" +
      ["truefalse", "order", "choice", "text", "number", "bible"].map(function (t) { return "<option value='" + t + "' " + (q.type === t ? "selected" : "") + ">" + esc(typeLabel(t)) + "</option>"; }).join("") + "</select></div>";
    let answerFields = "";
    if (q.type === "choice") {
      const opts = q.opts || ["", "", ""];
      const optsAr = q.optsAr || opts.map(function () { return ""; });
      answerFields = "<div class='bilingual-fields'>" +
        textareaField("bcq_opts_" + i, "Antwortoptionen Deutsch (eine pro Zeile)", opts.join("\n"), false) +
        textareaField("bcq_optsar_" + i, "خيارات الإجابة بالعربية (كل إجابة في سطر)", optsAr.join("\n"), true) +
        "</div><div class='field'><label>Nummer der richtigen Antwort</label><select id='bcq_correct_" + i + "'>" +
        opts.map(function (x, j) { return "<option value='" + j + "' " + (Number(q.a) === j ? "selected" : "") + ">" + (j + 1) + (x ? " · " + esc(x) : "") + "</option>"; }).join("") + "</select></div>";
    } else if (q.type === "truefalse") {
      answerFields = "<div class='field'><label>Richtige Antwort</label><select id='bcq_answer_" + i + "'><option value='true' " + (String(q.a) === "true" ? "selected" : "") + ">Richtig / صحيح</option><option value='false' " + (String(q.a) === "false" ? "selected" : "") + ">Falsch / خطأ</option></select></div>";
    } else if (q.type === "order") {
      answerFields = "<div class='bilingual-fields'>" +
        textareaField("bcq_items_" + i, "Ereignisse Deutsch (richtige Reihenfolge, eine pro Zeile)", (q.items || []).join("\n"), false) +
        textareaField("bcq_itemsar_" + i, "الأحداث بالعربية (بالترتيب الصحيح، حدث في كل سطر)", (q.itemsAr || []).join("\n"), true) +
        "</div><p class='small'>Die richtige Reihenfolge entspricht der Reihenfolge, die du hier einträgst.</p>";
    } else {
      answerFields = "<div class='bilingual-fields'>" +
        field("bcq_answer_" + i, "Richtige Antwort (Deutsch)", q.a || "", false) +
        field("bcq_answerar_" + i, "الإجابة الصحيحة (العربية)", q.aAr || "", true) +
        "</div><div class='bilingual-fields'>" +
        field("bcq_accepted_" + i, "Alternative Antworten (Deutsch, mit Komma trennen)", (q.accepted || []).join(", "), false) +
        field("bcq_acceptedar_" + i, "إجابات بديلة بالعربية (افصل بينها بفاصلة)", (q.acceptedAr || []).join(", "), true) +
        "</div>";
    }
    return "<article class='puzzle-editor challenge-editor-question'><div class='puzzle-toolbar'><div><h3>Frage " + (i + 1) + "</h3><span class='badge'>" + esc(typeLabel(q.type)) + "</span></div>" +
      "<button class='btn danger' onclick='deleteBibleChallengeQuestion(\"" + esc(c.id) + "\"," + i + ")' " + (c.questions.length <= 3 ? "disabled title='Mindestens drei Fragen erforderlich'" : "") + ">Löschen</button></div>" + type +
      "<div class='bilingual-fields'>" + textareaField("bcq_q_" + i, "Frage (Deutsch)", q.q, false) + textareaField("bcq_qar_" + i, "السؤال (العربية)", q.qAr, true) + "</div>" +
      answerFields + "<div class='bilingual-fields'>" +
      textareaField("bcq_explanation_" + i, "Erklärung (Deutsch, optional)", q.explanation || "", false) +
      textareaField("bcq_explanationar_" + i, "الشرح (العربية، اختياري)", q.explanationAr || "", true) +
      "</div><div class='bilingual-fields'>" +
      field("bcq_hint_" + i, "Hinweis (Deutsch, optional)", q.hint || "", false) +
      field("bcq_h intar_" + i, "التلميح (العربية، اختياري)", q.hintAr || "", true).replace("bcq_h intar_", "bcq_hintar_") +
      "</div><div class='field-row'><div class='field'><label>Punkte</label><input id='bcq_points_" + i + "' type='number' min='0' value='" + Number(q.points || 100) + "'></div></div>" +
      "<button class='btn' onclick='saveBibleChallengeQuestion(\"" + esc(c.id) + "\"," + i + ")'>💾 Frage speichern</button></article>";
  }
  function saveBibleChallengeMeta(challengeId) {
    const list = readChallenges();
    const c = list.find(function (x) { return x.id === challengeId; });
    if (!c) return teacherChallengeDashboard();
    c.title = (document.getElementById("bc_title").value || "").trim();
    c.titleAr = (document.getElementById("bc_titlear").value || "").trim();
    c.passage = (document.getElementById("bc_passage").value || "").trim();
    c.instructions = (document.getElementById("bc_instructions").value || "").trim();
    c.instructionsAr = (document.getElementById("bc_instructionsar").value || "").trim();
    c.status = document.getElementById("bc_status").value;
    c.updatedAt = new Date().toISOString();
    if (c.status === "published") {
      const problem = readyToPublish(c);
      if (problem) { alert(problem); c.status = "draft"; }
    }
    saveChallenges(list);
    state.view = "teacherChallengeEdit";
    render();
  }
  function saveBibleChallengeQuestion(challengeId, i) {
    const list = readChallenges();
    const c = list.find(function (x) { return x.id === challengeId; });
    if (!c || !c.questions[i]) return;
    const q = c.questions[i];
    q.type = document.getElementById("bcq_type_" + i).value;
    q.q = (document.getElementById("bcq_q_" + i).value || "").trim();
    q.qAr = (document.getElementById("bcq_qar_" + i).value || "").trim();
    q.explanation = (document.getElementById("bcq_explanation_" + i).value || "").trim();
    q.explanationAr = (document.getElementById("bcq_explanationar_" + i).value || "").trim();
    q.hint = (document.getElementById("bcq_hint_" + i).value || "").trim();
    q.hintAr = (document.getElementById("bcq_hintar_" + i).value || "").trim();
    q.points = Math.max(0, Number(document.getElementById("bcq_points_" + i).value || 100));
    if (q.type === "choice") {
      q.opts = lines(document.getElementById("bcq_opts_" + i).value);
      q.optsAr = lines(document.getElementById("bcq_optsar_" + i).value);
      q.a = Number(document.getElementById("bcq_correct_" + i).value || 0);
      q.aAr = q.optsAr[q.a] || "";
      q.accepted = [];
      q.acceptedAr = [];
    } else if (q.type === "truefalse") {
      q.a = document.getElementById("bcq_answer_" + i).value;
      q.aAr = q.a === "true" ? "صحيح" : "خطأ";
      q.accepted = [];
      q.acceptedAr = [];
    } else if (q.type === "order") {
      q.items = lines(document.getElementById("bcq_items_" + i).value);
      q.itemsAr = lines(document.getElementById("bcq_itemsar_" + i).value);
      q.correctItems = q.items.slice();
      q.a = "";
      q.aAr = "";
    } else {
      q.a = (document.getElementById("bcq_answer_" + i).value || "").trim();
      q.aAr = (document.getElementById("bcq_answerar_" + i).value || "").trim();
      q.accepted = splitAnswers(document.getElementById("bcq_accepted_" + i).value);
      q.acceptedAr = splitAnswers(document.getElementById("bcq_acceptedar_" + i).value);
    }
    c.updatedAt = new Date().toISOString();
    saveChallenges(list);
    state.view = "teacherChallengeEdit";
    render();
  }
  function changeBibleChallengeQuestionType(challengeId, i, type) {
    const list = readChallenges();
    const c = list.find(function (x) { return x.id === challengeId; });
    if (!c || !c.questions[i]) return;
    const old = c.questions[i];
    const q = Object.assign(newQuestion(i + 1), old, { type: type });
    if (type === "choice") Object.assign(q, { opts: ["", "", ""], optsAr: ["", "", ""], a: 0 });
    else if (type === "truefalse") Object.assign(q, { a: "true", aAr: "صحيح" });
    else if (type === "order") Object.assign(q, { items: ["", ""], itemsAr: ["", ""], correctItems: [] });
    else Object.assign(q, { a: "", aAr: "", accepted: [], acceptedAr: [] });
    c.questions[i] = q;
    saveChallenges(list);
    state.view = "teacherChallengeEdit";
    render();
  }
  function addBibleChallengeQuestion(challengeId) {
    const list = readChallenges();
    const c = list.find(function (x) { return x.id === challengeId; });
    if (!c || c.questions.length >= 4) return alert("Maximal vier Fragen pro Challenge. / أربعة أسئلة كحد أقصى.");
    c.questions.push(newQuestion(c.questions.length + 1));
    c.updatedAt = new Date().toISOString();
    saveChallenges(list);
    renderTeacherChallengeEdit(challengeId);
  }
  function deleteBibleChallengeQuestion(challengeId, i) {
    const list = readChallenges();
    const c = list.find(function (x) { return x.id === challengeId; });
    if (!c || c.questions.length <= 3) return alert("Eine Challenge braucht mindestens drei Fragen. / يجب أن يحتوي التحدي على ثلاثة أسئلة على الأقل.");
    if (!confirm("Diese Frage wirklich löschen? / هل تريد حذف هذا السؤال؟")) return;
    c.questions.splice(i, 1);
    c.updatedAt = new Date().toISOString();
    saveChallenges(list);
    renderTeacherChallengeEdit(challengeId);
  }
  function archiveBibleChallenge(challengeId) {
    const list = readChallenges();
    const c = list.find(function (x) { return x.id === challengeId; });
    if (!c) return;
    if (!confirm("Challenge „" + c.title + "“ archivieren? / أرشفة هذا التحدي؟")) return;
    c.status = "archived";
    c.updatedAt = new Date().toISOString();
    saveChallenges(list);
    renderTeacherChallenges();
  }
  function previewBibleChallenge(challengeId) {
    const c = challengeById(challengeId);
    if (!c) return;
    state.activeChallenge = JSON.parse(JSON.stringify(c));
    state.challengeIndex = 0;
    state.challengeAnswers = [];
    state.challengeName = "TEST – Lehrerbereich";
    state.challengeScore = 0;
    state.challengeStartedAt = Date.now();
    state.challengeScreen = "intro";
    state.challengeOrderIndex = -1;
    state.view = "challengeIntro";
    render();
  }
  function previewChallengeBible(challengeId) {
    const c = challengeById(challengeId);
    if (!c) return;
    state.activeChallenge = JSON.parse(JSON.stringify(c));
    state.challengeScreen = "editor";
    openChallengeBible();
  }
  function openChallengeBible() {
    state.challengeReturnScreen = state.challengeScreen || "intro";
    openBible("challenge");
  }
  function viewBibleChallengeResults(challengeId) {
    state.teacherChallengeId = challengeId;
    state.view = "teacherChallengeResults";
    render();
  }
  function renderTeacherChallengeResults(challengeId) {
    if (!isTeacher()) { teacherLogin(); return; }
    const c = challengeById(challengeId);
    if (!c) return teacherChallengeDashboard();
    const results = readChallengeResults().filter(function (r) { return r.challengeId === challengeId; })
      .sort(function (a, b) { return String(b.completedAt).localeCompare(String(a.completedAt)); });
    app.innerHTML = "<main class='app'>" + header("Challenge-Ergebnisse") +
      "<div class='teacher-nav'><button class='btn secondary' onclick='editBibleChallenge(\"" + esc(c.id) + "\")'>← Zur Challenge</button><button class='btn secondary' onclick='teacherChallengeDashboard()'>Alle Challenges</button></div>" +
      "<section class='hero'><h1>" + esc(c.title) + "</h1><p>" + esc(c.passage) + "</p></section>" +
      (results.length ? "<section class='card'><div style='overflow:auto'><table class='data-table'><thead><tr><th>Name</th><th>Punkte</th><th>Richtig</th><th>Zeit</th><th>Datum</th></tr></thead><tbody>" +
        results.map(function (r) { return "<tr><td>" + esc(r.studentName) + "</td><td>" + r.score + "/" + r.totalPoints + "</td><td>" + r.correctCount + "/" + r.questionCount + "</td><td>" + Math.floor(r.elapsedSeconds / 60) + ":" + String(r.elapsedSeconds % 60).padStart(2, "0") + "</td><td>" + new Date(r.completedAt).toLocaleDateString("de-DE") + "</td></tr>"; }).join("") +
        "</tbody></table></div></section>" : "<section class='card empty'>Noch keine Ergebnisse auf diesem Gerät. / لا توجد نتائج على هذا الجهاز بعد.</section>") + "</main>";
  }

  const BOOKS = [
    [["1 mose","genesis"],"GEN"], [["2 mose","exodus"],"EXO"], [["3 mose","levitikus","leviticus"],"LEV"],
    [["4 mose","numeri","numbers"],"NUM"], [["5 mose","deuteronomium","deuteronomy"],"DEU"],
    [["josua","joshua"],"JOS"], [["richter","judges"],"JDG"], [["rut","ruth"],"RUT"],
    [["1 samuel","1 sam","1 samuelbuch"],"1SA"], [["2 samuel","2 sam"],"2SA"],
    [["1 konige","1 könige","1 kings"],"1KI"], [["2 konige","2 könige","2 kings"],"2KI"],
    [["1 chronik","1 chronicles"],"1CH"], [["2 chronik","2 chronicles"],"2CH"],
    [["esra","ezra"],"EZR"], [["nehemia","nehemiah"],"NEH"], [["esther","ester"],"EST"],
    [["hiob","job"],"JOB"], [["psalmen","psalm","psalms"],"PSA"], [["spruche","sprüche","proverbs"],"PRO"],
    [["prediger","ecclesiastes"],"ECC"], [["hohelied","song of solomon"],"SNG"], [["jesaja","isaiah"],"ISA"],
    [["jeremia","jeremiah"],"JER"], [["klagelieder","lamentations"],"LAM"], [["hesekiel","hesekiel","ezekiel"],"EZK"],
    [["daniel"],"DAN"], [["hosea"],"HOS"], [["joel"],"JOL"], [["amos"],"AMO"], [["obadja","obadiah"],"OBA"],
    [["jona","jonah"],"JON"], [[" Micha ","mi cha","micha","micah"],"MIC"], [["nahum"],"NAM"], [["habakuk","habakkuk"],"HAB"],
    [["zephanja","zephaniah"],"ZEP"], [["haggai"],"HAG"], [["sacharja","zechariah"],"ZEC"], [["maleachi","malachi"],"MAL"],
    [["matthaus","matthäus","matthew"],"MAT"], [["markus","mark"],"MRK"], [["lukas","luke"],"LUK"], [["johannes","john"],"JHN"],
    [["apostelgeschichte","acts"],"ACT"], [["romer","römer","romans"],"ROM"], [["1 korinther","1 corinthians"],"1CO"],
    [["2 korinther","2 corinthians"],"2CO"], [["galater","galatians"],"GAL"], [["epheser","ephesians"],"EPH"],
    [["philipper","philippians"],"PHP"], [["kolosser","colossians"],"COL"], [["1 thessalonicher","1 thessalonians"],"1TH"],
    [["2 thessalonicher","2 thessalonians"],"2TH"], [["1 timotheus","1 timothy"],"1TI"], [["2 timotheus","2 timothy"],"2TI"],
    [["titus"],"TIT"], [["philemon"],"PHM"], [["hebraer","hebräer","hebrews"],"HEB"], [["jakobus","james"],"JAS"],
    [["1 petrus","1 peter"],"1PE"], [["2 petrus","2 peter"],"2PE"], [["1 johannes","1 john"],"1JN"],
    [["2 johannes","2 john"],"2JN"], [["3 johannes","3 john"],"3JN"], [["judas","jude","jude"],"JUD"],
    [["offenbarung","offenbarung des johannes","revelation"],"REV"]
  ];
  function bibleUrl(ref, version) {
    const clean = String(ref || "").replace(/[–—]/g, "-").trim();
    const match = clean.match(/^(.+?)\s+(\d{1,3})(?:\s*[:,.]\s*\d+.*)?$/);
    if (!match) return version === "ar" ? "https://www.bible.com/de/bible/13/JHN.1.AVD" : "https://www.bible.com/de/bible/157/JHN.1.SCH2000";
    const book = norm(match[1]).replace(/\./g, "").trim();
    let code = "";
    for (let i = 0; i < BOOKS.length && !code; i++) {
      if (BOOKS[i][0].some(function (alias) { return norm(alias).replace(/\./g, "").trim() === book; })) code = BOOKS[i][1];
    }
    if (!code) return version === "ar" ? "https://www.bible.com/de/bible/13/JHN.1.AVD" : "https://www.bible.com/de/bible/157/JHN.1.SCH2000";
    return version === "ar" ? "https://www.bible.com/de/bible/13/" + code + "." + match[2] + ".AVD" :
      "https://www.bible.com/de/bible/157/" + code + "." + match[2] + ".SCH2000";
  }
  const originalOpenBible = openBible;
  openBible = function (from) {
    if (from !== "challenge") return originalOpenBible(from);
    state.bibleReturn = "challenge";
    originalOpenBible("challenge");
    const c = state.activeChallenge;
    if (!c) return;
    const deUrl = bibleUrl(c.passage, "de");
    const arUrl = bibleUrl(c.passage, "ar");
    const frames = document.querySelectorAll(".bible-frame");
    if (frames[0]) frames[0].src = deUrl;
    if (frames[1]) frames[1].src = arUrl;
    const links = document.querySelectorAll(".bible-fallback a");
    if (links[0]) links[0].href = deUrl;
    if (links[1]) links[1].href = arUrl;
    const p = document.querySelector(".hero p");
    if (p) p.textContent = "Aktuelle Lesestelle: " + c.passage + " / المقطع المطلوب: " + c.passage;
    const note = document.createElement("div");
    note.className = "challenge-passage-note";
    note.innerHTML = "<strong>Aktuelle Lesestelle / المقطع المطلوب:</strong> " + esc(c.passage) +
      "<p class='small'>Die Bibel öffnet das passende Kapitel, sofern die Stelle erkannt wird. Bitte prüft die Stellenangabe beim Erstellen der Challenge.</p>";
    const bibleGrid = document.querySelector(".bible-grid");
    if (bibleGrid) bibleGrid.parentNode.insertBefore(note, bibleGrid);
  };
  const originalCloseBible = closeBible;
  closeBible = function () {
    if (state.bibleReturn === "challenge") {
      state.view = state.challengeReturnScreen === "question" ? "challengeQuestion" : "challengeIntro";
      render();
      return;
    }
    originalCloseBible();
  };

  Object.assign(window, {
    studentChallenges: studentChallenges,
    beginChallengeSetup: beginChallengeSetup,
    startChallenge: startChallenge,
    chooseChallengeAnswer: chooseChallengeAnswer,
    saveChallengeTextAnswer: saveChallengeTextAnswer,
    moveChallengeOrder: moveChallengeOrder,
    toggleChallengeHint: toggleChallengeHint,
    checkChallengeAnswer: checkChallengeAnswer,
    nextChallengeQuestion: nextChallengeQuestion,
    teacherChallengeDashboard: teacherChallengeDashboard,
    newBibleChallenge: newBibleChallenge,
    editBibleChallenge: editBibleChallenge,
    saveBibleChallengeMeta: saveBibleChallengeMeta,
    saveBibleChallengeQuestion: saveBibleChallengeQuestion,
    changeBibleChallengeQuestionType: changeBibleChallengeQuestionType,
    addBibleChallengeQuestion: addBibleChallengeQuestion,
    deleteBibleChallengeQuestion: deleteBibleChallengeQuestion,
    archiveBibleChallenge: archiveBibleChallenge,
    previewBibleChallenge: previewBibleChallenge,
    previewChallengeBible: previewChallengeBible,
    openChallengeBible: openChallengeBible,
    viewBibleChallengeResults: viewBibleChallengeResults
  });
})();