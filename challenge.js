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
  function saveChallengeResults(list) {
    localStorage.setItem(CHALLENGE_RESULTS_KEY, JSON.stringify(list));
  }
  function firebaseErrorText(error) {
    const code = String(error && error.code || "");
    if (code.includes("permission-denied")) return "Firestore hat den Zugriff abgelehnt. Bitte die firestore.rules aus dem Repository im Firebase-Console-Bereich Firestore → Rules veröffentlichen.";
    if (code.includes("unauthenticated") || code.includes("auth/invalid-credential") || code.includes("auth/invalid-login-credentials")) return "E-Mail oder Passwort stimmen nicht. Bitte das Lehrer-Konto in Firebase Authentication prüfen.";
    if (code.includes("auth/unauthorized-domain")) return "Diese Domain ist in Firebase Authentication nicht freigeschaltet. Füge frofail-hlag.github.io unter Authentication → Settings → Authorized domains hinzu.";
    if (code.includes("auth/operation-not-allowed")) return "Die anonyme Anmeldung ist noch nicht aktiviert. Aktiviere in Firebase Authentication → Sign-in method den Anbieter Anonymous.";
    if (code.includes("failed-precondition")) return "Cloud Firestore ist möglicherweise noch nicht eingerichtet. Erstelle die Firestore-Datenbank in der Firebase Console.";
    if (code.includes("unavailable") || code.includes("network") || code.includes("auth/network-request-failed")) return "Firebase ist momentan nicht erreichbar. Prüfe die Internetverbindung und die Firestore-Datenbank.";
    if (error && error.message === "TEACHER_NOT_ALLOWED") return "Dieses Konto ist noch nicht als Diener/in freigeschaltet. Es benötigt ein aktives teachers-Dokument mit der Firebase-UID.";
    return String(error && error.message || "Unbekannter Firebase-Fehler").slice(0, 260);
  }
  function cloudNoticeHtml() {
    if (state.firebaseSyncMessage) {
      return "<div class='notice'><strong>Firebase-Synchronisierung nicht vollständig</strong><br>" + esc(state.firebaseSyncMessage) +
        "<br><span class='small'>Lokale Daten bleiben auf diesem Gerät erhalten. Bitte korrigiere die Firebase-Einrichtung, bevor du eine Challenge als teamweit veröffentlicht betrachtest.</span></div>";
    }
    if (state.firebaseConnected) {
      return "<p class='small' style='margin-top:8px'>☁️ Firebase verbunden · veröffentlichte Challenges und Ergebnisse werden zwischen Geräten geteilt.</p>";
    }
    return "<div class='notice'>Cloud-Verbindung wird beim Öffnen des Bereichs geprüft. Lokale Daten bleiben erhalten.</div>";
  }
  async function firebaseApi() {
    if (typeof window.waitForBibleFirebaseApi === "function") return await window.waitForBibleFirebaseApi();
    if (!window.bibleFirebaseReady) throw new Error("Das Firebase-Modul wurde nicht geladen. Prüfe firebase-service.js und die Internetverbindung.");
    return await window.bibleFirebaseReady;
  }
  async function syncChallengesFromFirebase(forTeacher) {
    try {
      const api = await firebaseApi();
      const remote = await api.loadChallenges({ teacher: Boolean(forTeacher) });
      const local = readChallenges();
      if (forTeacher) {
        const merged = new Map(remote.map(function (c) { return [c.id, c]; }));
        const warnings = [];
        for (const localChallenge of local) {
          const cloudChallenge = merged.get(localChallenge.id);
          const localTime = Date.parse(localChallenge.updatedAt || localChallenge.createdAt || "") || 0;
          const cloudTime = cloudChallenge ? (Date.parse(cloudChallenge.updatedAt || cloudChallenge.createdAt || "") || 0) : -1;
          if (!cloudChallenge || localTime > cloudTime) {
            const candidate = JSON.parse(JSON.stringify(localChallenge));
            if (candidate.status === "published" && readyToPublish(candidate)) candidate.status = "draft";
            try {
              const saved = await api.saveChallenge(candidate);
              merged.set(saved.id, saved);
            } catch (error) {
              warnings.push("„" + (candidate.title || candidate.id) + "“ konnte nicht hochgeladen werden: " + firebaseErrorText(error));
              merged.set(candidate.id, candidate);
            }
          }
        }
        saveChallenges(Array.from(merged.values()));
        state.firebaseSyncMessage = warnings.length ? warnings.join(" ") : "";
      } else {
        const remoteIds = new Set(remote.map(function (c) { return c.id; }));
        // Preserve local drafts on a shared device, but let Firebase decide which published
        // activities students should see, including archived/unpublished changes.
        const localDrafts = local.filter(function (c) { return c.status !== "published" && !remoteIds.has(c.id); });
        saveChallenges(remote.concat(localDrafts));
        state.firebaseSyncMessage = "";
      }
      state.firebaseConnected = true;
      return true;
    } catch (error) {
      state.firebaseConnected = false;
      state.firebaseSyncMessage = firebaseErrorText(error);
      console.warn("Bible Escape Firebase challenge sync:", error);
      return false;
    }
  }
  async function persistChallengeToFirebase(challenge) {
    try {
      const api = await firebaseApi();
      const saved = await api.saveChallenge(challenge);
      state.firebaseConnected = true;
      state.firebaseSyncMessage = "";
      return saved;
    } catch (error) {
      state.firebaseSyncMessage = firebaseErrorText(error);
      state.firebaseConnected = false;
      console.warn("Bible Escape Firebase challenge save:", error);
      return null;
    }
  }
  async function syncResultsFromFirebase() {
    try {
      const api = await firebaseApi();
      const remote = await api.loadResults();
      const local = readChallengeResults();
      const merged = new Map(remote.map(function (r) { return [r.id, r]; }));
      local.forEach(function (r) { if (!merged.has(r.id)) merged.set(r.id, r); });
      saveChallengeResults(Array.from(merged.values()));
      state.firebaseConnected = true;
      return true;
    } catch (error) {
      state.firebaseSyncMessage = firebaseErrorText(error);
      console.warn("Bible Escape Firebase results sync:", error);
      return false;
    }
  }
  async function submitResultToFirebase(result) {
    try {
      const api = await firebaseApi();
      await api.saveStudentResult(result);
      state.challengeCloudSaveStatus = "saved";
      return true;
    } catch (error) {
      state.challengeCloudSaveStatus = "failed";
      state.firebaseSyncMessage = firebaseErrorText(error);
      console.warn("Bible Escape Firebase result save:", error);
      return false;
    }
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
    if (challenge.questions.length < 3 || challenge.questions.length > 10) {
      return "Eine Bibel-Challenge braucht mindestens 3 und höchstens 10 Fragen.";
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
        if (q.a !== "true" && q.a !== "false") return "Bitte die richtige Antwort bei Frage " + (i + 1) + " festlegen.";
      } else if (q.type === "order") {
        if (!q.items || q.items.length < 2 || !q.itemsAr || q.itemsAr.length !== q.items.length ||
            q.items.some(function (x) { return !x; }) || q.itemsAr.some(function (x) { return !x; })) {
          return "Bitte bei der Reihenfolge-Frage " + (i + 1) + " mindestens zwei Ereignisse in beiden Sprachen eintragen.";
        }
      } else if (!q.a && !(q.accepted || []).length && !q.aAr && !(q.acceptedAr || []).length) {
        return "Bitte eine richtige oder akzeptierte Antwort bei Frage " + (i + 1) + " hinterlegen.";
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
    if (state.view === "teacherAdmin") return renderTeacherAdministration();
    if (state.view === "teacherChallengeEdit") return renderTeacherChallengeEdit(state.teacherChallengeId);
    if (state.view === "teacherChallengeResults") return renderTeacherChallengeResults(state.teacherChallengeId);
    return originalRender();
  };

  const originalHome = home;
  const originalChooseStudent = chooseStudent;
  const originalTeacherDashboard = window.renderTeacherEscapeDashboard;
  const originalTeacherChallengeDashboard = teacherChallengeDashboard;
  const originalTeacherLogin = teacherLogin;
  const originalTeacherLogout = teacherLogout;
  const originalTeacherEditGame = window.teacherEditGame;

  function insertTeacherGreeting() {
    if (state.role !== "teacher") return;
    const name = String(state.firebaseTeacherName || localStorage.getItem("bibleEscapeTeacherDisplayName") || "").trim();
    if (!name) return;
    const root = app.querySelector(".app");
    const top = root && root.querySelector(".top");
    if (!root || !top) return;
    let greeting = root.querySelector(".teacher-greeting");
    if (!greeting) {
      greeting = document.createElement("section");
      greeting.className = "teacher-greeting";
      greeting.setAttribute("aria-label", "Lehrerbegrüßung");
      top.insertAdjacentElement("afterend", greeting);
    }
    greeting.innerHTML = "<div class='teacher-greeting-icon' aria-hidden='true'>👋</div>" +
      "<div class='teacher-greeting-copy'><div class='teacher-greeting-title'>Hallo, <strong>" + esc(name) + "!</strong></div>" +
      "<div class='teacher-greeting-subtitle'>Willkommen im Lehrerbereich · أهلاً بك في منطقة الخدام</div></div>";
  }
  if (typeof originalTeacherEditGame === "function") {
    window.teacherEditGame = function (gameId) {
      originalTeacherEditGame(gameId);
      insertTeacherGreeting();

      // Keep the JSON importer available inside the individual Escape Room editor too.
      const editorNav = document.querySelector(".app .teacher-nav");
      if (editorNav && !document.getElementById("bibelreiseAiImportEscapeEditorButton")) {
        const importButton = document.createElement("button");
        importButton.id = "bibelreiseAiImportEscapeEditorButton";
        importButton.className = "btn gold";
        importButton.type = "button";
        importButton.textContent = "📥 JSON-Entwurf importieren / استيراد مسودة JSON";
        editorNav.appendChild(importButton);
      }
      if (editorNav && !document.getElementById("bibelreiseAiPromptEscapeEditorButton")) {
        const promptButton = document.createElement("button");
        promptButton.id = "bibelreiseAiPromptEscapeEditorButton";
        promptButton.className = "btn gold";
        promptButton.type = "button";
        promptButton.textContent = "🧠 ChatGPT-Prompt erstellen / إعداد طلب ChatGPT";
        editorNav.appendChild(promptButton);
      }
      if (typeof window.bibelreiseInjectTeacherImportPanel === "function") {
        window.bibelreiseInjectTeacherImportPanel("escape-room", "bibelreiseAiImportEscapeEditorButton");
      }
    };
  }

  function renderActivityModeSelect(audience) {
    clearInterval(state.timer);
    const teacherPlay = audience === "teacherPlay";
    state.view = teacherPlay ? "playModeSelect" : (audience === "teacher" ? "teacherModeSelect" : "studentModes");
    const title = teacherPlay ? "Welche Art möchtest du spielen? / أي نوع تريد أن تلعب؟" :
      audience === "teacher" ? "Lehrerbereich / منطقة الخدام" : "Was möchtest du spielen? / ماذا تريد أن تلعب؟";
    const back = teacherPlay
      ? "<button class='btn secondary back' onclick='teacherDashboard()'>← Zurück zum Lehrerbereich / العودة لمنطقة الخدام</button>"
      : audience === "teacher"
        ? "<div class='actions' style='margin:0 0 16px'>" +
          ((state.firebaseTeacherAdmin === true || localStorage.getItem("bibleEscapeTeacherAdmin") === "1")
            ? "<button class='btn gold' onclick='teacherAdminDashboard()'>👥 Lehrerverwaltung</button>" : "") +
          "<button class='btn secondary' onclick='teacherPlayModeSelect()'>🎮 Spiele spielen</button><button class='btn secondary' onclick='teacherLogout()'>Abmelden</button></div>"
        : "<button class='btn secondary back' onclick='roleSelect()'>← Zur Rollenwahl / العودة لاختيار الدور</button>";
    let firstAction, secondAction;
    if (audience === "teacher") {
      firstAction = "openTeacherEscapeManagement()";
      secondAction = "teacherChallengeManagement()";
    } else if (teacherPlay) {
      firstAction = "openTeacherEscapePlay()";
      secondAction = "openTeacherChallengePlay()";
    } else {
      firstAction = "openStudentEscapeMode()";
      secondAction = "openStudentChallengeMode()";
    }
    const headingOne = audience === "teacher" ? "Bibel Escape Room verwalten" : "Bibel Escape Room";
    const headingTwo = audience === "teacher" ? "Bibel-Challenge verwalten" : "Bibel-Challenge";
    const descOne = audience === "teacher"
      ? "Die drei vorhandenen Escape-Room-Spiele bearbeiten, Rätsel ändern, neue Abenteuer erstellen und testen."
      : "Wähle eine biblische Mission, sammle Hinweise und löse das finale Rätsel.";
    const descTwo = audience === "teacher"
      ? "Leseaktivitäten erstellen, 3–4 Fragen zweisprachig bearbeiten, Vorschau öffnen und Ergebnisse ansehen."
      : "Lies einen Bibelabschnitt, öffne ihn bei Bedarf erneut und beantworte 3–4 Fragen auf Deutsch und Arabisch.";
    app.innerHTML = "<main class='app'>" + header(audience === "teacher" ? "Lehrerbereich" : "Bibelreise · رحلة في الكتاب المقدس") +
      back +
      "<section class='hero activity-mode-hero'><h1>" + title + "</h1><p>" +
      (audience === "teacher" ? "Wähle aus, welchen Bereich du öffnen möchtest. Beide Bereiche bleiben getrennt verwaltbar." :
        "Wähle eine Aktivität. Jede öffnet sich auf einer eigenen Seite.") +
      "</p></section><div class='activity-mode-grid'>" +
      "<article class='card activity-mode-card'><div class='activity-mode-icon'>🔐</div><div class='activity-mode-kicker'>ABENTEUER / مغامرة</div><h2>" + headingOne + "</h2><p>" + descOne + "</p><button class='btn' onclick='" + firstAction + "'>" +
      (audience === "teacher" ? "Escape Rooms öffnen →" : "Escape Room öffnen →") + "</button></article>" +
      "<article class='card activity-mode-card'><div class='activity-mode-icon'>📖</div><div class='activity-mode-kicker'>LESEN & ENTDECKEN / اقرأ واكتشف</div><h2>" + headingTwo + "</h2><p>" + descTwo + "</p><button class='btn' onclick='" + secondAction + "'>" +
      (audience === "teacher" ? "Challenges öffnen →" : "Bibel-Challenge öffnen →") + "</button></article></div></main>";
    if (audience === "teacher" || teacherPlay) insertTeacherGreeting();
  }

  function enhanceEscapeHome(audience) {
    const modeBack = audience === "teacherPlay"
      ? "<button class='btn secondary back' onclick='teacherPlayModeSelect()'>← Zur Spielauswahl / العودة لاختيار اللعبة</button>"
      : "<button class='btn secondary back' onclick='studentModeSelect()'>← Zur Spielauswahl / العودة لاختيار اللعبة</button>";
    const hero = document.querySelector(".app .hero");
    if (hero && !document.getElementById("activityModeBack")) {
      hero.insertAdjacentHTML("afterend", "<div id='activityModeBack'>" + modeBack + "</div>");
    }
    if (audience === "teacherPlay") {
      document.querySelector(".teacher-entry")?.remove();
      const roleNav = document.querySelector(".student-role-nav");
      if (roleNav) roleNav.remove();
    }
  }

  function studentModeSelect() {
    state.role = "student";
    state.playMode = null;
    renderActivityModeSelect("student");
  }
  function openStudentEscapeMode() {
    state.role = "student";
    state.playMode = "escape";
    originalHome();
    enhanceEscapeHome("student");
  }
  function openStudentChallengeMode() {
    state.role = "student";
    state.playMode = "challenge";
    studentChallenges();
  }
  function returnToModeSelection() {
    if (state.role === "teacher" && String(state.playMode || "").startsWith("teacher-play")) {
      teacherPlayModeSelect();
    } else {
      studentModeSelect();
    }
  }
  function ensureTeacherAreaBack() {
    const nav = document.querySelector(".teacher-nav");
    if (!nav || document.getElementById("teacherAreaBack")) return;
    const button = document.createElement("button");
    button.id = "teacherAreaBack";
    button.className = "btn secondary";
    button.textContent = "← Bereichsauswahl";
    button.setAttribute("onclick", "teacherManagementModeSelect()");
    nav.insertBefore(button, nav.firstChild);
  }
  function teacherManagementModeSelect() {
    state.teacherSection = null;
    state.playMode = null;
    teacherDashboard();
  }
  function teacherDashboard() {
    if (!isTeacher()) { teacherLogin(); return; }
    if (state.teacherSection === "escape") {
      originalTeacherDashboard();
      insertTeacherGreeting();
      ensureTeacherAreaBack();
      const playButton = Array.from(document.querySelectorAll(".teacher-nav button"))
        .find(function (button) { return button.textContent.includes("Spiele spielen"); });
      if (playButton) playButton.setAttribute("onclick", "teacherPlayModeSelect()");
      return;
    }
    renderActivityModeSelect("teacher");
  }
  function teacherEscapeManagement() {
    if (!isTeacher()) { teacherLogin(); return; }
    state.teacherSection = "escape";
    state.playMode = null;
    originalTeacherDashboard();
    insertTeacherGreeting();
    ensureTeacherAreaBack();
    const playButton = Array.from(document.querySelectorAll(".teacher-nav button"))
      .find(function (button) { return button.textContent.includes("Spiele spielen"); });
    if (playButton) playButton.setAttribute("onclick", "teacherPlayModeSelect()");
  }
  function openTeacherEscapeManagement() {
    if (!isTeacher()) { teacherLogin(); return; }
    state.role = "teacher";
    state.teacherSection = "escape";
    state.playMode = null;
    try {
      const dashboard = window.renderTeacherEscapeDashboard;
      if (typeof dashboard !== "function") {
        app.innerHTML = "<main class='app'><section class='card'><h2>Lehrerbereich konnte nicht geöffnet werden</h2><p>Die Escape-Room-Verwaltung wurde nicht geladen. Bitte die Seite neu laden.</p><button class='btn secondary' onclick='teacherDashboard()'>Zur Bereichsauswahl</button></section></main>";
        return;
      }
      dashboard();
      insertTeacherGreeting();
      ensureTeacherAreaBack();
      const playButton = Array.from(document.querySelectorAll(".teacher-nav button"))
        .find(function (button) { return button.textContent.includes("Spiele spielen"); });
      if (playButton) playButton.setAttribute("onclick", "teacherPlayModeSelect()");
    } catch (error) {
      console.error("Escape Room teacher management navigation failed:", error);
      app.innerHTML = "<main class='app'><section class='card'><h2>Lehrerbereich konnte nicht geöffnet werden</h2><p>Beim Öffnen der Escape-Room-Verwaltung ist ein Fehler aufgetreten. Bitte die Seite neu laden.</p><button class='btn secondary' onclick='teacherDashboard()'>Zur Bereichsauswahl</button></section></main>";
    }
  }
  function teacherChallengeManagement() {
    if (!isTeacher()) { teacherLogin(); return; }
    state.teacherSection = "challenge";
    state.playMode = null;
    teacherChallengeDashboard();
  }
  function adminErrorMessage(error) {
    const message = String(error && error.message || "Unbekannter Fehler");
    if (message.includes("Admin-Freigabe erforderlich")) return "Dieses Konto hat keine Administratorrechte.";
    if (message.includes("functions/not-found") || message.includes("FUNCTIONS_NOT_FOUND") || message.includes("NOT_FOUND")) return "Die Bereinigungsfunktion ist noch nicht bereitgestellt. Bitte deploye die Firebase Functions gemäß der Anleitung im Repository.";
    if (message.includes("functions/permission-denied") || message.includes("Administratorkonto erforderlich")) return "Die Bereinigung ist nur mit einem aktiven Administratorkonto möglich. Prüfe in Firestore teachers/{deine UID}: active = true und admin = true (Boolean).";
    if (message.includes("permission-denied")) return "Firebase hat den Zugriff verweigert. Bitte veröffentliche die aktuelle firestore.rules und prüfe, ob dein teachers-Dokument admin = true (Boolean) enthält.";
    return message;
  }
  function renderTeacherAdministration() {
    clearInterval(state.timer);
    const requests = state.teacherAdminRequests || [];
    const rows = requests.map(function (request) {
      const verified = request.emailVerified === true;
      return "<article class='teacher-request-card'><div class='teacher-request-main'>" +
        "<div class='teacher-request-name'>" + esc(request.displayName || "Ohne Anzeigename") + "</div>" +
        "<div class='teacher-request-email'>" + esc(request.email || "") + "</div>" +
        "<div class='teacher-request-meta'>" +
        (verified ? "<span class='badge green'>E-Mail bestätigt</span>" : "<span class='badge gray'>E-Mail noch nicht bestätigt</span>") +
        "<span class='small'>Registriert: " + (request.createdAt ? esc(new Date(request.createdAt).toLocaleDateString("de-DE")) : "—") + "</span></div></div>" +
        "<div class='actions teacher-request-actions'><button class='btn success' onclick='approveTeacherSignup(\"" + esc(request.uid) + "\")' " +
        (verified ? "" : "disabled title='Die Lehrkraft muss zuerst ihre E-Mail bestätigen und sich einmal anmelden.'") +
        ">Freigeben</button><button class='btn danger' onclick='rejectTeacherSignup(\"" + esc(request.uid) + "\")'>Ablehnen</button></div></article>";
    }).join("");
    app.innerHTML = "<main class='app'>" + header("Lehrerverwaltung") +
      "<div class='teacher-nav'><button class='btn secondary' onclick='teacherDashboard()'>← Lehrerbereich</button><button class='btn secondary' onclick='refreshTeacherAdministration()'>↻ Aktualisieren</button><button class='btn gold' onclick='cleanupOrphanTeacherData()'>🧹 Verwaiste Konten bereinigen</button><button class='btn secondary' onclick='teacherLogout()'>Abmelden</button></div>" +
      "<section class='hero activity-mode-hero'><h1>👥 Lehrerverwaltung</h1><p>Prüfe neue Registrierungen und gib nur bekannten Sonntagsschul-Diener/innen Zugang. Die E-Mail-Adresse muss vor der Freigabe bestätigt sein.</p><p class='small'>Die Bereinigung entfernt nur Lehrer-Anfragen und Lehrerprofile, für deren UID kein Konto mehr in Firebase Authentication existiert.</p><p class='lang-ar' dir='rtl'>راجع طلبات التسجيل الجديدة وامنح الوصول فقط لخدام مدارس الأحد المعروفين. يجب تأكيد البريد الإلكتروني قبل الموافقة.</p></section>" +
      cloudNoticeHtml() +
      (state.teacherAdminMessage ? "<div class='notice'>" + esc(state.teacherAdminMessage) + "</div>" : "") +
      "<section class='card'><div class='editor-head'><div><h2>Anfragen zur Freigabe</h2><p class='small'>Freigegebene Konten erhalten Diener/in-Rechte, aber keine Administratorrechte.</p></div><span class='badge'>" + requests.length + " offen</span></div>" +
      (requests.length ? "<div class='teacher-request-list'>" + rows + "</div>" :
       "<div class='empty'><div style='font-size:40px'>✅</div><h3>Keine offenen Anfragen</h3><p>Neue Registrierungen erscheinen hier, sobald die E-Mail-Adresse bestätigt und die Anmeldung einmal versucht wurde.</p></div>") +
      "</section></main>";
    insertTeacherGreeting();
  }
  async function refreshTeacherAdministration(message) {
    if (!isTeacher()) { teacherLogin(); return; }
    state.view = "teacherAdmin";
    state.teacherAdminMessage = message || "";
    try {
      const api = await firebaseApi();
      const profile = await api.getCurrentTeacher();
      if (!profile || profile.admin !== true) {
        state.firebaseTeacherAdmin = false;
        localStorage.setItem("bibleEscapeTeacherAdmin", "0");
        state.teacherAdminMessage = "Dieses Konto ist nicht als Administrator freigeschaltet.";
        state.teacherAdminRequests = [];
      } else {
        state.firebaseTeacherAdmin = true;
        state.firebaseTeacherName = profile.displayName || state.firebaseTeacherName || "";
        localStorage.setItem("bibleEscapeTeacherAdmin", "1");
        state.teacherAdminRequests = await api.listTeacherRequests();
        state.firebaseSyncMessage = "";
      }
    } catch (error) {
      state.teacherAdminMessage = adminErrorMessage(error);
      state.teacherAdminRequests = [];
    }
    render();
  }
  async function teacherAdminDashboard() {
    if (!isTeacher()) { teacherLogin(); return; }
    return await refreshTeacherAdministration("");
  }
  async function approveTeacherSignup(uid) {
    try {
      const api = await firebaseApi();
      const approved = await api.approveTeacherRequest(uid);
      await refreshTeacherAdministration("Freigegeben: " + (approved.displayName || approved.email) + ". Die Lehrkraft kann sich jetzt anmelden.");
    } catch (error) {
      await refreshTeacherAdministration(adminErrorMessage(error));
    }
  }
  async function rejectTeacherSignup(uid) {
    if (!confirm("Diese Registrierungsanfrage wirklich ablehnen? / هل تريد رفض طلب التسجيل؟")) return;
    try {
      const api = await firebaseApi();
      await api.rejectTeacherRequest(uid);
      await refreshTeacherAdministration("Registrierungsanfrage abgelehnt.");
    } catch (error) {
      await refreshTeacherAdministration(adminErrorMessage(error));
    }
  }
  async function cleanupOrphanTeacherData() {
    const approved = confirm(
      "Verwaiste Lehrer-Datensätze wirklich bereinigen? / Clean up orphaned teacher records?\n\n" +
      "Es werden nur Dokumente in teachers und teacherRequests gelöscht, deren UID in Firebase Authentication nicht mehr existiert. Diese Aktion kann nicht rückgängig gemacht werden."
    );
    if (!approved) return;
    try {
      const api = await firebaseApi();
      const result = await api.cleanupOrphanTeacherRecords();
      const requests = Number(result.deletedTeacherRequests || 0);
      const profiles = Number(result.deletedTeacherProfiles || 0);
      const examined = Number(result.examined || 0);
      await refreshTeacherAdministration(
        "Bereinigung abgeschlossen: " + requests + " Registrierungsanfrage(n) und " +
        profiles + " Lehrerprofil(e) gelöscht. Geprüfte Dokumente: " + examined + "."
      );
    } catch (error) {
      await refreshTeacherAdministration(adminErrorMessage(error));
    }
  }
  teacherChallengeDashboard = async function () {
    if (!isTeacher()) { originalTeacherChallengeDashboard(); return; }
    await syncChallengesFromFirebase(true);
    await syncResultsFromFirebase();
    originalTeacherChallengeDashboard();
    if (!isTeacher()) return;
    insertTeacherGreeting();
    ensureTeacherAreaBack();
    const playButton = Array.from(document.querySelectorAll(".teacher-nav button"))
      .find(function (button) { return button.textContent.includes("Spiele spielen"); });
    if (playButton) playButton.setAttribute("onclick", "teacherPlayModeSelect()");
  };
  function teacherPlayModeSelect() {
    state.role = "teacher";
    state.teacherSection = null;
    state.playMode = "teacher-play";
    renderActivityModeSelect("teacherPlay");
  }
  function openTeacherEscapePlay() {
    state.role = "teacher";
    state.playMode = "teacher-play-escape";
    originalHome();
    enhanceEscapeHome("teacherPlay");
  }
  function openTeacherChallengePlay() {
    state.role = "teacher";
    state.playMode = "teacher-play-challenge";
    studentChallenges();
  }
  home = function () {
    if (state.role === "student") {
      if (state.playMode === "escape") {
        originalHome();
        enhanceEscapeHome("student");
      } else {
        renderActivityModeSelect("student");
      }
      return;
    }
    if (state.role === "teacher" && state.playMode === "teacher-play") {
      renderActivityModeSelect("teacherPlay");
      return;
    }
    if (state.role === "teacher" && state.playMode === "teacher-play-escape") {
      originalHome();
      enhanceEscapeHome("teacherPlay");
      return;
    }
    originalHome();
  };
  chooseStudent = function () {
    state.playMode = null;
    state.teacherSection = null;
    originalChooseStudent();
  };
  teacherLogin = function () {
    state.teacherSection = null;
    state.playMode = null;
    originalTeacherLogin();
  };
  teacherLogout = function () {
    state.teacherSection = null;
    state.playMode = null;
    originalTeacherLogout();
  };

  async function studentChallenges() {
    state.view = "challengeList";
    await syncChallengesFromFirebase(false);
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
      "<button class='btn secondary back' onclick='returnToModeSelection()'>← Zur Spielauswahl / العودة لاختيار اللعبة</button>" +
      "<div class='student-tools'><button class='btn secondary' onclick='openChallengeBibleFromList()'>📖 Bibel öffnen / افتح الكتاب المقدس</button></div>" +
      "<section class='hero challenge-hero'><h1>📖 Bibel-Challenge</h1><p>Lest zuerst den angegebenen Bibelabschnitt. Ihr könnt den Text jederzeit wieder öffnen, bevor ihr antwortet.</p><p class='lang-ar' dir='rtl'>اقرأوا المقطع الكتابي أولًا. يمكنكم الرجوع إلى النص في أي وقت قبل الإجابة.</p></section>" +
      (state.firebaseSyncMessage ? cloudNoticeHtml() : "") +
      (published.length ? "<div class='challenge-list-grid'>" + cards + "</div>" :
        "<section class='card empty-challenge'><div style='font-size:42px'>📖</div><h2>Noch keine Challenge veröffentlicht</h2><p>Schaut später wieder vorbei. Eure Diener/innen veröffentlichen hier neue Bibel-Leseaktivitäten.</p><p class='lang-ar' dir='rtl'>لم يتم نشر أي تحدٍ بعد. عودوا لاحقًا للاطلاع على أنشطة قراءة الكتاب المقدس الجديدة.</p></section>") +
      "</main>";
    if (typeof window.bibelreiseInjectChallengeBibleLinks === "function") window.bibelreiseInjectChallengeBibleLinks();
  }
  function beginChallengeSetup(challengeId) {
    const challenge = challengeById(challengeId);
    if (!challenge || challenge.status !== "published") return studentChallenges();
    state.activeChallenge = JSON.parse(JSON.stringify(challenge));
    state.challengePreviewMode = false;
    state.challengeCloudSaveStatus = "";
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
      "<div class='field'><label>Vorname oder Teamname (keinen Nachnamen) / الاسم الأول أو اسم الفريق (بدون اسم العائلة)</label><input id='challengeStudentName' maxlength='50' placeholder='Vorname / Teamname / الاسم الأول / اسم الفريق'></div>" +
      "<p class='small'>Lest den Bibeltext aufmerksam. Ihr dürft die Bibel während jeder Frage erneut öffnen.</p>" +
      "<button class='btn' onclick='startChallenge()'>Challenge starten / ابدأ التحدي →</button></section></main>";
    if (typeof window.bibelreiseInjectChallengeBibleLinks === "function") window.bibelreiseInjectChallengeBibleLinks();
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
    if (state.challengePreviewMode && answer.correct !== null) {
      const rightAnswer = challengeCorrectAnswer(q);
      feedback = "<section class='challenge-feedback " + (answer.correct ? "correct" : "incorrect") + "'>" +
        "<h3>" + (answer.correct ? "✅ Richtig! / إجابة صحيحة!" : "↪ Schaut noch einmal nach / راجعوا النص مرة أخرى") + "</h3>" +
        (answer.correct ? "<p>" + Number(answer.points || 0) + " Punkte</p>" : "<p>0 Punkte für diese Frage / لا توجد نقاط لهذا السؤال</p>") +
        "<div class='challenge-correct-answer'><strong>Richtige Antwort / الإجابة الصحيحة</strong>" + rightAnswer + "</div>" +
        (q.explanation || q.explanationAr ? "<h4>Warum? / لماذا؟</h4>" + bi(q.explanation || "", q.explanationAr || "") :
          "<p class='small'>Vergleicht eure Antwort mit dem Bibeltext. / قارنوا إجابتكم بالنص الكتابي.</p>") +
        "</section><button class='btn' onclick='nextChallengeQuestion()'>" +
        (index < c.questions.length - 1 ? "Nächste Frage / السؤال التالي →" : "Ergebnis anzeigen / عرض النتيجة →") + "</button>";
    } else if (answer.submitted === true) {
      feedback = "<section class='challenge-feedback'><h3>Antwort gespeichert / تم حفظ الإجابة</h3>" +
        "<p>Die Antwort wird nach Abschluss der gesamten Challenge ausgewertet. / سيتم تقييم الإجابة بعد إكمال التحدي بالكامل.</p>" +
        "</section><button class='btn' onclick='nextChallengeQuestion()'>" +
        (index < c.questions.length - 1 ? "Nächste Frage / السؤال التالي →" : "Ergebnis anzeigen / عرض النتيجة →") + "</button>";
    } else {
      feedback = "<div class='actions challenge-question-actions'><button class='btn' onclick='checkChallengeAnswer()'>Antwort speichern / حفظ الإجابة</button>" +
        (q.hint || q.hintAr ? "<button class='btn secondary' onclick='toggleChallengeHint()'>💡 Hinweis / تلميح</button>" : "") + "</div>" +
        (state.challengeShowHint ? "<div class='hint-box'>" + bi(q.hint || "", q.hintAr || "") + "</div>" : "");
    }
    app.innerHTML = "<main class='app'>" + header("Bibel-Challenge / تحدي الكتاب المقدس") +
      "<div class='challenge-session-bar'><div><strong>" + esc(state.challengeName) + "</strong><div class='small'>" + esc(c.title) + " / " + esc(c.titleAr) + "</div></div>" +
      "<button class='btn secondary' onclick='openChallengeBible()'>📖 Bibel erneut öffnen / فتح الكتاب المقدس</button></div>" +
      "<div class='challenge-progress-row'><span>Frage " + (index + 1) + " von " + c.questions.length + " / السؤال " + (index + 1) + " من " + c.questions.length + "</span><strong>" + state.challengeScore + " Punkte</strong></div>" +
      "<div class='progress'><div style='width:" + Math.round((index + (answer.submitted || answer.correct !== null ? 1 : 0)) / c.questions.length * 100) + "%'></div></div>" +
      "<section class='card challenge-question-card'><div class='challenge-question-type'>" + esc(typeLabel(q.type)) + "</div>" +
      "<div class='challenge-passage-inline'>📖 " + esc(c.passage) + "</div>" + bi(q.q, q.qAr) +
      (!answer.submitted && answer.correct === null ? input : "") + feedback + "</section>" +
      "<div class='actions' style='margin-top:16px'><button class='btn secondary' onclick='studentChallenges()'>← Challenges / التحديات</button></div></main>";
    if (typeof window.bibelreiseInjectChallengeBibleLinks === "function") window.bibelreiseInjectChallengeBibleLinks();
  }
  function saveChallengeTextAnswer(value) {
    ensureChallengeAnswer().text = value;
  }
  function chooseChallengeAnswer(value) {
    const answer = ensureChallengeAnswer();
    if (answer.submitted === true || (state.challengePreviewMode && answer.correct !== null)) return;
    answer.selected = value;
    renderChallengeQuestion();
  }
  function moveChallengeOrder(displayIndex, delta) {
    const answer = ensureChallengeAnswer();
    if (answer.submitted === true || (state.challengePreviewMode && answer.correct !== null)) return;
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
    if (answer.submitted === true || (state.challengePreviewMode && answer.correct !== null)) return;
    if (q.type === "choice" && answer.selected === null) { alert("Bitte wählt eine Antwort. / اختاروا إجابة من فضلكم."); return; }
    if (q.type === "truefalse" && answer.selected === null) { alert("Bitte wählt Richtig oder Falsch. / اختاروا صحيح أو خطأ."); return; }
    if (q.type === "order" && !state.challengeOrder.length) { alert("Für diese Frage wurden keine Ereignisse angelegt."); return; }
    if (!["choice", "truefalse", "order"].includes(q.type) && !String(answer.text || "").trim()) { alert("Bitte gebt eine Antwort ein. / اكتبوا الإجابة من فضلكم."); return; }
    answer.given = q.type === "choice" ? (q.opts || [])[Number(answer.selected)] :
      q.type === "truefalse" ? (String(answer.selected) === "true" ? "Richtig / صحيح" : "Falsch / خطأ") :
      q.type === "order" ? state.challengeOrder.map(function (i) { return q.items[i]; }).join(" → ") : answer.text;
    if (state.challengePreviewMode) {
      let correct = false;
      if (q.type === "choice") correct = Number(answer.selected) === Number(q.a);
      else if (q.type === "truefalse") correct = String(answer.selected) === String(q.a);
      else if (q.type === "order") correct = state.challengeOrder.every(function (value, i) { return value === i; });
      else correct = accepted(q, answer.text);
      answer.correct = correct;
      answer.points = correct ? Number(q.points || 100) : 0;
      if (correct) state.challengeScore += answer.points;
    } else {
      answer.submitted = true;
    }
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
  async function finishChallenge() {
    const c = state.activeChallenge;
    const answers = state.challengeAnswers || [];
    const elapsedSeconds = Math.max(0, Math.round((Date.now() - state.challengeStartedAt) / 1000));
    let evaluated = [];
    if (state.challengePreviewMode) {
      evaluated = c.questions.map(function (q, i) {
        const a = answers[i] || {};
        return {
          questionId: q.id, correct: !!a.correct, given: a.given || a.text || "",
          correctAnswer: q.type === "choice" ? (q.opts || [])[Number(q.a)] || "" :
            q.type === "truefalse" ? (String(q.a) === "true" ? "Richtig" : "Falsch") :
            q.type === "order" ? (q.items || []).join(" → ") :
            String(q.a || q.aAr || (q.accepted || [])[0] || (q.acceptedAr || [])[0] || ""),
          correctAnswerAr: q.type === "choice" ? (q.optsAr || [])[Number(q.a)] || "" :
            q.type === "truefalse" ? (String(q.a) === "true" ? "صحيح" : "خطأ") :
            q.type === "order" ? (q.itemsAr || []).join(" ← ") :
            String(q.aAr || (q.acceptedAr || [])[0] || ""),
          explanation: q.explanation || "", explanationAr: q.explanationAr || ""
        };
      });
    } else {
      state.challengeCloudSaveStatus = "evaluating";
      render();
      try {
        const api = await firebaseApi();
        const submitted = c.questions.map(function (q, i) {
          const a = answers[i] || {};
          return {
            questionId: q.id,
            answer: q.type === "choice" || q.type === "truefalse" ? a.selected :
              q.type === "order" ? (Array.isArray(state.challengeOrderByQuestion && state.challengeOrderByQuestion[i]) ? state.challengeOrderByQuestion[i] : (a.order || [])) :
              String(a.text || "")
          };
        });
        const response = await api.evaluateBibleChallengeSubmission(c.id, submitted);
        const details = Array.isArray(response.answerDetails) ? response.answerDetails : [];
        if (details.length !== c.questions.length) throw new Error("Die Auswertung war unvollständig. Bitte versuche es erneut.");
        evaluated = details;
      } catch (error) {
        state.challengeCloudSaveStatus = "failed";
        alert("Die Challenge konnte noch nicht sicher ausgewertet werden. Bitte prüfe die Internetverbindung und versuche es erneut. / تعذر تقييم التحدي بأمان. تحقق من الاتصال وحاول مرة أخرى.\n\n" + String(error && error.message || ""));
        renderChallengeQuestion();
        return;
      }
    }
    const detailsById = new Map(evaluated.map(function (item) { return [item.questionId, item]; }));
    const resultAnswers = c.questions.map(function (q, i) {
      const a = answers[i] || {};
      const detail = detailsById.get(q.id) || {};
      const correct = Boolean(detail.correct);
      const points = correct ? Number(q.points || 100) : 0;
      return {
        questionId: q.id, question: q.q, questionAr: q.qAr, correct,
        given: String(detail.given == null ? (a.given || a.text || "") : detail.given),
        points,
        correctAnswer: String(detail.correctAnswer || ""),
        correctAnswerAr: String(detail.correctAnswerAr || ""),
        explanation: String(detail.explanation || q.explanation || ""),
        explanationAr: String(detail.explanationAr || q.explanationAr || "")
      };
    });
    const correctCount = resultAnswers.filter(function (a) { return a.correct; }).length;
    const totalPoints = c.questions.reduce(function (sum, q) { return sum + Number(q.points || 100); }, 0);
    const score = resultAnswers.reduce(function (sum, a) { return sum + a.points; }, 0);
    const result = {
      id: id(), challengeId: c.id, challengeTitle: c.title, challengeTitleAr: c.titleAr,
      passage: c.passage, studentName: state.challengeName, score: Math.round(score),
      totalPoints: Math.round(totalPoints), correctCount, questionCount: c.questions.length,
      elapsedSeconds, completedAt: new Date().toISOString(), answers: resultAnswers
    };
    if (state.challengePreviewMode) {
      state.challengeCloudSaveStatus = "preview";
    } else {
      const results = readChallengeResults();
      results.push(result);
      saveChallengeResults(results);
      state.challengeCloudSaveStatus = "saving";
      await submitResultToFirebase(result);
    }
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
      (state.challengePreviewMode ? "<div class='notice'>Vorschau/Test: Das Ergebnis wurde nicht gespeichert. / تجربة: لم يتم حفظ النتيجة.</div>" :
        state.challengeCloudSaveStatus === "saved" ? "<p class='small'>☁️ Ergebnis wurde mit Firebase synchronisiert. / تم حفظ النتيجة على السحابة.</p>" :
        "<div class='notice'>Ergebnis auf diesem Gerät gespeichert, aber Firebase konnte es noch nicht synchronisieren. / تم حفظ النتيجة على هذا الجهاز، لكن لم تتم مزامنتها بعد.</div>") +
      "<section class='card'><h2>Das habt ihr gelernt / ماذا تعلمتم</h2>" +
      c.questions.map(function (q, i) {
        const a = r.answers[i] || {};
        return "<article class='challenge-review-item'><div class='challenge-review-status'>" + (a.correct ? "✅" : "📖") + " " + (a.correct ? "Richtig / صحيح" : "Noch einmal lesen / أعد القراءة") + "</div>" +
          bi(q.q, q.qAr) + (a.correct ? "" : "<div><strong>Eure Antwort / إجابتكم:</strong> " + esc(a.given || "—") + "</div>") +
          "<div><strong>Richtige Antwort / الإجابة الصحيحة:</strong></div>" +
          bi(a.correctAnswer || (state.challengePreviewMode ? challengeCorrectAnswer(q) : ""), a.correctAnswerAr || "") +
          (a.explanation || a.explanationAr ? bi(a.explanation || "", a.explanationAr || "") : "") + "</article>";
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
      "<div class='teacher-nav'><button class='btn secondary' onclick='teacherDashboard()'>← Lehrer-Dashboard</button><button class='btn' onclick='newBibleChallenge()'>➕ Neue Bibel-Challenge</button><button class='btn secondary' onclick='state.role=\"teacher\";home()'>🎮 Spiele spielen</button><button class='btn gold' id='bibelreiseAiImportButton' type='button'>📥 JSON-Entwurf importieren</button></div>" +
      "<section class='hero challenge-hero'><h1>📖 Bibel-Challenges</h1><p>Erstellt Leseaktivitäten mit einer Bibelstelle und 3–4 Fragen. Schülerinnen und Schüler können den Bibeltext jederzeit erneut öffnen.</p><p class='lang-ar' dir='rtl'>أنشئوا أنشطة قراءة مع مقطع كتابي وثلاثة أو أربعة أسئلة. يمكن للطلاب الرجوع إلى النص في أي وقت.</p></section>" +
      cloudNoticeHtml() +
      "<section class='card'><div class='editor-head'><div><h2>Meine Bibel-Challenges</h2><p class='small'>Titel, Bibelstelle, Anweisungen und Fragen können zweisprachig bearbeitet werden.</p></div><button class='btn' onclick='newBibleChallenge()'>➕ Neue Challenge</button></div>" +
      (challenges.length ? "<div style='overflow:auto'><table class='data-table'><thead><tr><th>Challenge</th><th>Status</th><th>Fragen</th><th>Ergebnisse</th><th>Aktionen</th></tr></thead><tbody>" + rows + "</tbody></table></div>" :
        "<div class='empty'><h3>Noch keine Bibel-Challenges</h3><p>Erstelle die erste Aktivität für eure tägliche Bibellektüre.</p><button class='btn' onclick='newBibleChallenge()'>➕ Erste Challenge erstellen</button></div>") +
      "</section></main>";
    insertTeacherGreeting();
    if (typeof window.bibelreiseInjectTeacherImportPanel === "function") window.bibelreiseInjectTeacherImportPanel("bibel-challenge");
  }
  async function newBibleChallenge() {
    if (!isTeacher()) { teacherLogin(); return; }
    const c = emptyChallenge();
    const list = readChallenges();
    list.push(c);
    saveChallenges(list);
    state.teacherChallengeId = c.id;
    state.view = "teacherChallengeEdit";
    await persistChallengeToFirebase(c);
    render();
  }
  async function editBibleChallenge(challengeId) {
    if (!isTeacher()) { teacherLogin(); return; }
    await syncChallengesFromFirebase(true);
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
      cloudNoticeHtml() +
      "<div class='two-col'><section><div class='card'><div class='editor-head'><div><h1>📖 Bibel-Challenge bearbeiten</h1><p class='small'>Die Aktivität wird erst für Schülerinnen und Schüler sichtbar, wenn sie veröffentlicht ist.</p></div><span class='badge " + (c.status === "published" ? "green" : "gray") + "'>" + (c.status === "published" ? "Veröffentlicht" : "Entwurf") + "</span></div>" +
      "<div class='bilingual-fields'>" + field("bc_title", "Titel (Deutsch)", c.title, false) + field("bc_titlear", "العنوان (العربية)", c.titleAr, true) + "</div>" +
      field("bc_passage", "Bibelstelle (z. B. Esther 4,1–17)", c.passage, false) +
      "<div class='bilingual-fields'>" + textareaField("bc_instructions", "Anweisungen (Deutsch)", c.instructions, false) + textareaField("bc_instructionsar", "التعليمات (العربية)", c.instructionsAr, true) + "</div>" +
      "<div class='field'><label>Status</label><select id='bc_status'><option value='draft' " + (c.status !== "published" ? "selected" : "") + ">Entwurf</option><option value='published' " + (c.status === "published" ? "selected" : "") + ">Veröffentlicht</option></select></div>" +
      "<div class='actions'><button class='btn' onclick='saveBibleChallengeMeta(\"" + esc(c.id) + "\")'>💾 Speichern</button><button class='btn gold' onclick='previewBibleChallenge(\"" + esc(c.id) + "\")'>▶ Testen</button></div><div class='actions' style='margin-top:12px'><button class='btn gold' id='bibelreiseAiImportEditorButton' type='button'>📥 JSON-Entwurf importieren / استيراد مسودة JSON</button><button class='btn gold' id='bibelreiseAiPromptChallengeEditorButton' type='button'>🧠 ChatGPT-Prompt erstellen / إعداد طلب ChatGPT</button></div></div>" +
      "<section class='card' style='margin-top:16px'><div class='editor-head'><div><h2>Fragen (" + c.questions.length + "/10)</h2><p class='small'>Mindestens 3 und höchstens 10 Fragen zum angegebenen Bibelabschnitt.</p></div>" +
      "<button class='btn' onclick='addBibleChallengeQuestion(\"" + esc(c.id) + "\")' " + (c.questions.length >= 10 ? "disabled" : "") + ">➕ Frage hinzufügen</button></div>" +
      questions + "</section></section><aside class='sticky'><section class='card'><h2>📖 Passage erneut lesen</h2><p class='small'>Teste, ob die angegebene Stelle in der zweisprachigen Bibel gut auffindbar ist.</p><button class='btn secondary' style='width:100%' onclick='previewChallengeBible(\"" + esc(c.id) + "\")'>Bibel öffnen</button></section>" +
      "<section class='card' style='margin-top:14px'><h2>🧭 Veröffentlichungs-Check</h2><p class='small'>Vor dem Veröffentlichen prüfen wir automatisch, ob die Aktivität 3–4 zweisprachige Fragen und Antworten enthält.</p><div class='muted-box'><strong>Wichtig</strong><br><span class='small'>Bitte Antworten und Erklärungen am angegebenen Bibeltext ausrichten. AI bleibt deaktiviert.</span></div></section></aside></div></main>";
    insertTeacherGreeting();
    if (typeof window.bibelreiseInjectChallengeBibleLinks === "function") window.bibelreiseInjectChallengeBibleLinks();
    if (typeof window.bibelreiseInjectTeacherImportPanel === "function") window.bibelreiseInjectTeacherImportPanel("bibel-challenge", "bibelreiseAiImportEditorButton");
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
      field("bcq_hintar_" + i, "التلميح (العربية، اختياري)", q.hintAr || "", true) +
      "</div><div class='field-row'><div class='field'><label>Punkte</label><input id='bcq_points_" + i + "' type='number' min='0' value='" + Number(q.points || 100) + "'></div></div>" +
      "<button class='btn' onclick='saveBibleChallengeQuestion(\"" + esc(c.id) + "\"," + i + ")'>💾 Frage speichern</button></article>";
  }
  async function saveBibleChallengeMeta(challengeId) {
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
    const saved = await persistChallengeToFirebase(c);
    if (!saved) {
      alert("Die Änderung wurde lokal gespeichert, aber noch nicht mit Firebase synchronisiert. Bitte prüfe die Firebase-Einrichtung. Die lokale Fassung bleibt erhalten.");
    }
    state.view = "teacherChallengeEdit";
    render();
  }
  async function saveBibleChallengeQuestion(challengeId, i) {
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
    if (c.status === "published") {
      const problem = readyToPublish(c);
      if (problem) {
        c.status = "draft";
        alert("Die Challenge wurde als Entwurf zurückgesetzt, weil die geänderte Frage noch unvollständig ist. Prüfe beide Sprachen und veröffentliche sie erneut.");
      }
    }
    c.updatedAt = new Date().toISOString();
    saveChallenges(list);
    const saved = await persistChallengeToFirebase(c);
    if (!saved) {
      state.firebaseSyncMessage = "Frage lokal gespeichert; Firebase-Synchronisierung steht noch aus.";
      alert("Die Frage wurde lokal gespeichert, aber noch nicht mit Firebase synchronisiert. Die lokale Fassung bleibt erhalten.");
    }
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
  async function addBibleChallengeQuestion(challengeId) {
    const list = readChallenges();
    const c = list.find(function (x) { return x.id === challengeId; });
    if (!c || c.questions.length >= 10) return alert("Maximal zehn Fragen pro Challenge. / الحد الأقصى عشرة أسئلة لكل تحدٍ.");
    c.questions.push(newQuestion(c.questions.length + 1));
    if (c.status === "published") {
      c.status = "draft";
      alert("Die Challenge wurde zum Entwurf zurückgesetzt. Fülle die neue Frage zweisprachig aus und veröffentliche die Challenge danach erneut.");
    }
    c.updatedAt = new Date().toISOString();
    saveChallenges(list);
    await persistChallengeToFirebase(c);
    renderTeacherChallengeEdit(challengeId);
  }
  async function deleteBibleChallengeQuestion(challengeId, i) {
    const list = readChallenges();
    const c = list.find(function (x) { return x.id === challengeId; });
    if (!c || c.questions.length <= 3) return alert("Eine Challenge braucht mindestens drei Fragen. / يجب أن يحتوي التحدي على ثلاثة أسئلة على الأقل.");
    if (!confirm("Diese Frage wirklich löschen? / هل تريد حذف هذا السؤال؟")) return;
    c.questions.splice(i, 1);
    if (c.status === "published" && readyToPublish(c)) {
      c.status = "draft";
      alert("Die Challenge wurde zum Entwurf zurückgesetzt. Prüfe die verbleibenden Fragen und veröffentliche sie danach erneut.");
    }
    c.updatedAt = new Date().toISOString();
    saveChallenges(list);
    await persistChallengeToFirebase(c);
    renderTeacherChallengeEdit(challengeId);
  }
  async function archiveBibleChallenge(challengeId) {
    const list = readChallenges();
    const c = list.find(function (x) { return x.id === challengeId; });
    if (!c) return;
    if (!confirm("Challenge „" + c.title + "“ archivieren? / أرشفة هذا التحدي؟")) return;
    c.status = "archived";
    c.updatedAt = new Date().toISOString();
    saveChallenges(list);
    const saved = await persistChallengeToFirebase(c);
    if (!saved) alert("Lokal archiviert, aber Firebase wurde noch nicht aktualisiert. Die lokale Fassung bleibt erhalten.");
    renderTeacherChallenges();
  }
  function previewBibleChallenge(challengeId) {
    const c = challengeById(challengeId);
    if (!c) return;
    state.activeChallenge = JSON.parse(JSON.stringify(c));
    state.challengePreviewMode = true;
    state.challengeCloudSaveStatus = "";
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
    state.teacherChallengeId = challengeId;
    state.challengeScreen = "editor";
    openChallengeBible();
  }
  function openChallengeBible() {
    state.challengeReturnScreen = state.challengeScreen || "intro";
    openBible("challenge");
  }
  function openChallengeBibleFromList() {
    state.challengeReturnScreen = "list";
    openBible("challenge-list");
  }
  async function viewBibleChallengeResults(challengeId) {
    await syncResultsFromFirebase();
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
    insertTeacherGreeting();
  }

  const BOOKS = [
    [["1 mose","genesis","التكوين","سفر التكوين"],"GEN"], [["2 mose","exodus","الخروج","سفر الخروج"],"EXO"], [["3 mose","levitikus","leviticus","اللاويين"],"LEV"],
    [["4 mose","numeri","numbers","العدد","سفر العدد"],"NUM"], [["5 mose","deuteronomium","deuteronomy","التثنية"],"DEU"],
    [["josua","joshua","يشوع"],"JOS"], [["richter","judges","القضاة"],"JDG"], [["rut","ruth","راعوث"],"RUT"],
    [["1 samuel","1 sam","1 samuelbuch"],"1SA"], [["2 samuel","2 sam"],"2SA"],
    [["1 konige","1 könige","1 kings"],"1KI"], [["2 konige","2 könige","2 kings"],"2KI"],
    [["1 chronik","1 chronicles"],"1CH"], [["2 chronik","2 chronicles"],"2CH"],
    [["esra","ezra"],"EZR"], [["nehemia","nehemiah"],"NEH"], [["esther","ester","أستير","استير","سفر أستير"],"EST"],
    [["hiob","job","أيوب"],"JOB"], [["psalmen","psalm","psalms","المزامير","مزمور"],"PSA"], [["spruche","sprüche","proverbs"],"PRO"],
    [["prediger","ecclesiastes"],"ECC"], [["hohelied","song of solomon"],"SNG"], [["jesaja","isaiah"],"ISA"],
    [["jeremia","jeremiah"],"JER"], [["klagelieder","lamentations"],"LAM"], [["hesekiel","hesekiel","ezekiel"],"EZK"],
    [["daniel","دانيال"],"DAN"], [["hosea"],"HOS"], [["joel"],"JOL"], [["amos"],"AMO"], [["obadja","obadiah"],"OBA"],
    [["jona","jonah"],"JON"], [[" Micha ","mi cha","micha","micah"],"MIC"], [["nahum"],"NAM"], [["habakuk","habakkuk"],"HAB"],
    [["zephanja","zephaniah"],"ZEP"], [["haggai"],"HAG"], [["sacharja","zechariah"],"ZEC"], [["maleachi","malachi"],"MAL"],
    [["matthaus","matthäus","matthew","متى","إنجيل متى"],"MAT"], [["markus","mark","مرقس","إنجيل مرقس"],"MRK"], [["lukas","luke","لوقا","إنجيل لوقا"],"LUK"], [["johannes","john","يوحنا","إنجيل يوحنا"],"JHN"],
    [["apostelgeschichte","acts","أعمال الرسل"],"ACT"], [["romer","römer","romans"],"ROM"], [["1 korinther","1 corinthians"],"1CO"],
    [["2 korinther","2 corinthians"],"2CO"], [["galater","galatians"],"GAL"], [["epheser","ephesians"],"EPH"],
    [["philipper","philippians"],"PHP"], [["kolosser","colossians"],"COL"], [["1 thessalonicher","1 thessalonians"],"1TH"],
    [["2 thessalonicher","2 thessalonians"],"2TH"], [["1 timotheus","1 timothy"],"1TI"], [["2 timotheus","2 timothy"],"2TI"],
    [["titus"],"TIT"], [["philemon"],"PHM"], [["hebraer","hebräer","hebrews"],"HEB"], [["jakobus","james"],"JAS"],
    [["1 petrus","1 peter"],"1PE"], [["2 petrus","2 peter"],"2PE"], [["1 johannes","1 john"],"1JN"],
    [["2 johannes","2 john"],"2JN"], [["3 johannes","3 john"],"3JN"], [["judas","jude","jude"],"JUD"],
    [["offenbarung","offenbarung des johannes","revelation"],"REV"]
  ];
  function splitBibleReferences(ref) {
    return String(ref || "").split(/[;\n|]+/).map(function (item) {
      return item.trim();
    }).filter(Boolean);
  }
  function findBibleBookCode(bookName) {
    const book = norm(String(bookName || "")).replace(/\./g, "").trim();
    for (let i = 0; i < BOOKS.length; i++) {
      if (BOOKS[i][0].some(function (alias) { return norm(alias).replace(/\./g, "").trim() === book; })) return BOOKS[i][1];
    }
    return "";
  }
  function bibleUrl(ref, version) {
    const firstReference = splitBibleReferences(ref)[0] || "";
    const clean = firstReference.replace(/[–—]/g, "-").trim();
    const wholeBook = clean.match(/^(.+?)(?:\s*-\s*|\s+)(?:all chapters(?: of (?:the )?book)?|alle kapitel(?: des buches)?|das ganze buch|das gesamte buch|gesamtes buch|كل الإصحاحات|جميع الإصحاحات)$/i);
    const match = clean.match(/^(.+?)\s+(\d{1,3})(?:\s*[:,.]\s*\d+.*|\s*-\s*\d+)?$/);
    const bookName = wholeBook ? wholeBook[1] : (match ? match[1] : "");
    const chapterNumber = wholeBook ? "1" : (match ? match[2] : "");
    if (!bookName || !chapterNumber) return "https://www.bible.com/";
    const code = findBibleBookCode(bookName);
    if (!code) return "https://www.bible.com/";
    return version === "ar" ? "https://www.bible.com/de/bible/13/" + code + "." + chapterNumber + ".AVD" :
      "https://www.bible.com/de/bible/157/" + code + "." + chapterNumber + ".SCH2000";
  }
  window.bibelreiseBibleUrl = function (ref, version) { return bibleUrl(ref, version); };
  window.bibelreiseBibleUrls = function (ref, version) {
    const references = splitBibleReferences(ref).slice(0, 40);
    const links = [];
    references.forEach(function (reference) {
      const clean = reference.replace(/[–—]/g, "-").trim();
      const wholeBook = clean.match(/^(.+?)(?:\s*-\s*|\s+)(?:all chapters(?: of (?:the )?book)?|alle kapitel(?: des buches)?|das ganze buch|das gesamte buch|gesamtes buch|كل الإصحاحات|جميع الإصحاحات)$/i);
      if (wholeBook) {
        links.push({ chapter: null, url: bibleUrl(reference, version) });
        return;
      }
      const range = clean.match(/^(.+?)\s+(\d{1,3})\s*-\s*(\d{1,3})$/);
      if (range) {
        const first = Number(range[2]), last = Number(range[3]);
        if (last >= first && last - first <= 11) {
          for (let chapter = first; chapter <= last; chapter++) {
            links.push({ chapter: chapter, url: bibleUrl(range[1] + " " + chapter, version) });
          }
          return;
        }
      }
      const single = clean.match(/^(.+?)\s+(\d{1,3})/);
      links.push({ chapter: single ? Number(single[2]) : null, url: bibleUrl(reference, version) });
    });
    return links.length ? links : [{ chapter: null, url: "https://www.bible.com/" }];
  };
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
      "<p class='small'>Die Bibel öffnet die erste erkannte Stelle. Weitere angegebene Lesestellen könnt ihr über die Links bei der Challenge öffnen. Bitte prüft die Stellenangaben beim Erstellen der Challenge. / يفتح الكتاب المقدس أول مرجع معروف. يمكن فتح بقية المقاطع من الروابط الموجودة في التحدي. يرجى مراجعة المراجع عند إعداد النشاط.</p>";
    const bibleGrid = document.querySelector(".bible-grid");
    if (bibleGrid) bibleGrid.parentNode.insertBefore(note, bibleGrid);
  };
  const originalCloseBible = closeBible;
  closeBible = function () {
    if (state.bibleReturn === "challenge-list") {
      state.view = "challengeList";
      render();
      return;
    }
    if (state.bibleReturn === "challenge") {
      state.view = state.challengeReturnScreen === "question" ? "challengeQuestion" : (state.challengeReturnScreen === "editor" ? "teacherChallengeEdit" : "challengeIntro");
      render();
      return;
    }
    originalCloseBible();
  };

  window.bibleEscapeRouteTeacherDashboard = teacherDashboard;
  Object.assign(window, {
    studentChallenges: studentChallenges,
    studentModeSelect: studentModeSelect,
    openStudentEscapeMode: openStudentEscapeMode,
    openStudentChallengeMode: openStudentChallengeMode,
    returnToModeSelection: returnToModeSelection,
    teacherEscapeManagement: teacherEscapeManagement,
    openTeacherEscapeManagement: openTeacherEscapeManagement,
    teacherManagementModeSelect: teacherManagementModeSelect,
    teacherAdminDashboard: teacherAdminDashboard,
    refreshTeacherAdministration: refreshTeacherAdministration,
    approveTeacherSignup: approveTeacherSignup,
    rejectTeacherSignup: rejectTeacherSignup,
    cleanupOrphanTeacherData: cleanupOrphanTeacherData,
    teacherChallengeManagement: teacherChallengeManagement,
    teacherPlayModeSelect: teacherPlayModeSelect,
    openTeacherEscapePlay: openTeacherEscapePlay,
    openTeacherChallengePlay: openTeacherChallengePlay,
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
    openChallengeBibleFromList: openChallengeBibleFromList,
    viewBibleChallengeResults: viewBibleChallengeResults
  });
})();