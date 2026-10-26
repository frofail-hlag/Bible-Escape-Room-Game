import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getAuth, connectAuthEmulator, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  updateProfile, sendEmailVerification, reload, signOut, signInAnonymously, signInWithCustomToken
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  getFirestore, connectFirestoreEmulator, collection, doc, getDoc, getDocs, query, where, setDoc,
  updateDoc, writeBatch
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { getFunctions, connectFunctionsEmulator, httpsCallable } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-functions.js";
import { firebaseConfig } from "./firebase-config.js";

// Local development uses an isolated demo project. Hosted builds use the
// existing Biblereise Firebase web-app configuration.
const useEmulators = location.hostname === "localhost" || location.hostname === "127.0.0.1";
const appConfig = useEmulators ? {
  apiKey: "fake-api-key",
  authDomain: "demo-biblereise-security.firebaseapp.com",
  projectId: "demo-biblireise-security",
  appId: "1:123456789:web:emulator",
  messagingSenderId: "123456789"
} : firebaseConfig;

const defaultApp = getApps().some(app => app.name === "[DEFAULT]")
  ? getApp()
  : initializeApp(appConfig);
const auth = getAuth(defaultApp);
const db = getFirestore(defaultApp);

// Students use separate auth contexts so they do not sign out a teacher
// when a shared device is used for testing.
const studentApp = getApps().find(app => app.name === "BibleEscapeStudent")
  || initializeApp(appConfig, "BibleEscapeStudent");
const studentAuth = getAuth(studentApp);
const studentDb = getFirestore(studentApp);

// Separate auth context for Rewards login on shared student devices.
const rewardsApp = getApps().find(app => app.name === "BibleEscapeRewardsStudent")
  || initializeApp(appConfig, "BibleEscapeRewardsStudent");
const rewardsAuth = getAuth(rewardsApp);

if (useEmulators) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectAuthEmulator(studentAuth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectAuthEmulator(rewardsAuth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectFirestoreEmulator(studentDb, "127.0.0.1", 8080);
}

function functionsFor(app) {
  const functions = getFunctions(app, "europe-west3");
  if (useEmulators) connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  return functions;
}

function teacherRef(uid) {
  return doc(db, "teachers", uid);
}
async function authorizedTeacher(user = auth.currentUser) {
  if (!user) return null;
  const snap = await getDoc(teacherRef(user.uid));
  if (!snap.exists() || snap.data().active !== true) return null;
  return {
    uid: user.uid,
    email: user.email || "",
    displayName: snap.data().displayName || user.displayName || "",
    admin: snap.data().admin === true,
    active: snap.data().active === true
  };
}
async function requireTeacher() {
  const profile = await authorizedTeacher();
  if (!profile) {
    throw new Error("Dieses Konto ist nicht als Diener/in freigeschaltet. Bitte den Admin bitten, ein aktives Dokument in der Firestore-Sammlung teachers anzulegen.");
  }
  return profile;
}
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}
function publicQuestion(question) {
  const copy = plain(question || {});
  // Correct-answer material must never be written into the student-readable document.
  delete copy.a;
  delete copy.aAr;
  delete copy.accepted;
  delete copy.acceptedAr;
  // Order questions must not expose the teacher-authored correct sequence in Firestore.
  if (copy.type === "order" && Array.isArray(copy.items)) {
    const items = copy.items.map((text, index) => ({ text, textAr: (copy.itemsAr || [])[index] || "" }));
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    copy.items = items.map(item => item.text);
    copy.itemsAr = items.map(item => item.textAr);
  }
  return copy;
}
function challengePayload(challenge, ownerUid, createdAt) {
  return {
    id: String(challenge.id),
    title: String(challenge.title || ""),
    titleAr: String(challenge.titleAr || ""),
    passage: String(challenge.passage || ""),
    instructions: String(challenge.instructions || ""),
    instructionsAr: String(challenge.instructionsAr || ""),
    status: ["draft", "published", "archived"].includes(challenge.status) ? challenge.status : "draft",
    questions: Array.isArray(challenge.questions) ? (challenge.status === "published" ? challenge.questions.map(publicQuestion) : plain(challenge.questions)) : [],
    createdAt: String(createdAt || challenge.createdAt || new Date().toISOString()),
    updatedAt: new Date().toISOString(),
    ownerUid: String(ownerUid)
  };
}
function cleanResult(result) {
  return {
    id: String(result.id),
    challengeId: String(result.challengeId),
    challengeTitle: String(result.challengeTitle || ""),
    challengeTitleAr: String(result.challengeTitleAr || ""),
    passage: String(result.passage || ""),
    studentName: String(result.studentName || "").trim().slice(0, 50),
    score: Math.round(Number(result.score) || 0),
    totalPoints: Math.round(Number(result.totalPoints) || 0),
    correctCount: Math.max(0, Math.min(10, Number(result.correctCount) || 0)),
    questionCount: Math.max(3, Math.min(10, Number(result.questionCount) || 3)),
    elapsedSeconds: Math.max(0, Math.min(86400, Math.round(Number(result.elapsedSeconds) || 0))),
    completedAt: String(result.completedAt || new Date().toISOString()),
    answers: (Array.isArray(result.answers) ? result.answers : []).slice(0, 10).map(a => ({
      questionId: String(a.questionId || ""),
      question: String(a.question || "").slice(0, 500),
      questionAr: String(a.questionAr || "").slice(0, 500),
      correct: Boolean(a.correct),
      given: String(a.given || "").slice(0, 500),
      points: Math.max(0, Math.round(Number(a.points) || 0))
    }))
  };
}

async function registerTeacher({ displayName, email, password }) {
  const cleanName = String(displayName || "").trim().slice(0, 80);
  const cleanEmail = String(email || "").trim().toLowerCase();
  const cleanPassword = String(password || "");
  if (cleanName.length < 2) throw new Error("Bitte gib einen gültigen Anzeigenamen ein.");
  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) throw new Error("Bitte gib eine gültige E-Mail-Adresse ein.");
  if (cleanPassword.length < 8) throw new Error("Das Passwort muss mindestens 8 Zeichen haben.");

  let user = null;
  try {
    const credential = await createUserWithEmailAndPassword(auth, cleanEmail, cleanPassword);
    user = credential.user;
    await updateProfile(user, { displayName: cleanName });
    const now = new Date().toISOString();
    await setDoc(doc(db, "teacherRequests", user.uid), {
      uid: user.uid,
      email: cleanEmail,
      displayName: cleanName,
      status: "pending",
      emailVerified: false,
      createdAt: now,
      updatedAt: now
    });
    await sendEmailVerification(user);
    await signOut(auth);
    return { uid: user.uid, email: cleanEmail, displayName: cleanName };
  } catch (error) {
    if (auth.currentUser) {
      try { await signOut(auth); } catch (_) {}
    }
    if (error && error.code === "auth/email-already-in-use") {
      throw new Error("Für diese E-Mail-Adresse existiert bereits ein Konto. Bitte melde dich an oder verwende die Passwort-zurücksetzen-Funktion.");
    }
    if (error && error.code === "permission-denied") {
      throw new Error("Das Konto wurde möglicherweise erstellt, aber die Zugriffsanfrage konnte nicht gespeichert werden. Bitte prüfe, ob die aktuellen firestore.rules veröffentlicht wurden. Verwende bei einem erneuten Versuch dieselbe E-Mail-Adresse für die Anmeldung.");
    }
    throw error;
  }
}

async function signInTeacher(email, password) {
  const credential = await signInWithEmailAndPassword(auth, String(email || "").trim(), password || "");
  const user = credential.user;
  try {
    await reload(user);
    await user.getIdToken(true);
    const profile = await authorizedTeacher(user);
    // Existing approved teachers (including the first administrator) continue to work
    // even if they were created before self-registration was introduced.
    if (profile) return profile;

    const requestRef = doc(db, "teacherRequests", user.uid);
    const requestSnap = await getDoc(requestRef);
    if (!user.emailVerified) {
      await signOut(auth);
      throw new Error("EMAIL_VERIFICATION_REQUIRED");
    }
    if (!requestSnap.exists()) {
      await signOut(auth);
      throw new Error("TEACHER_REQUEST_MISSING");
    }
    const requestData = requestSnap.data();
    if (requestData.status === "rejected") {
      await signOut(auth);
      throw new Error("TEACHER_REQUEST_REJECTED");
    }
    if (requestData.status === "pending") {
      await setDoc(requestRef, { emailVerified: true, updatedAt: new Date().toISOString() }, { merge: true });
      await signOut(auth);
      throw new Error("TEACHER_REQUEST_PENDING");
    }
    await signOut(auth);
    throw new Error("TEACHER_NOT_ALLOWED");
  } catch (error) {
    if (error && error.message && error.message.startsWith("EMAIL_VERIFICATION_REQUIRED")) {
      throw new Error("Bitte bestätige zuerst die E-Mail-Adresse über den Link in deiner Registrierungs-E-Mail. Danach kannst du dich erneut anmelden.");
    }
    if (error && error.message === "TEACHER_REQUEST_MISSING") {
      throw new Error("Für dieses Konto liegt keine Registrierungsanfrage vor. Bitte nutze „Neues Konto erstellen“ oder kontaktiere den Admin.");
    }
    if (error && error.message === "TEACHER_REQUEST_REJECTED") {
      throw new Error("Deine Anfrage wurde nicht freigegeben. Bitte sprich direkt mit dem Admin.");
    }
    if (error && error.message === "TEACHER_REQUEST_PENDING") {
      throw new Error("Deine E-Mail-Adresse ist bestätigt. Dein Zugang wartet noch auf die Freigabe durch den Admin.");
    }
    if (error && error.message === "TEACHER_NOT_ALLOWED") {
      throw new Error("Dieses Konto ist noch nicht als Diener/in freigeschaltet.");
    }
    try { if (auth.currentUser) await signOut(auth); } catch (_) {}
    throw error;
  }
}

async function listTeacherRequests() {
  await requireAdmin();
  const snap = await getDocs(query(collection(db, "teacherRequests"), where("status", "==", "pending")));
  return snap.docs.map(item => ({ ...item.data(), uid: item.id }));
}
async function approveTeacherRequest(uid) {
  const admin = await requireAdmin();
  const requestRef = doc(db, "teacherRequests", String(uid));
  const requestSnap = await getDoc(requestRef);
  if (!requestSnap.exists()) throw new Error("Die Registrierungsanfrage wurde nicht gefunden.");
  const requestData = requestSnap.data();
  if (requestData.status !== "pending") throw new Error("Diese Anfrage wurde bereits bearbeitet.");
  if (requestData.emailVerified !== true) throw new Error("Die Lehrkraft muss zuerst ihre E-Mail-Adresse bestätigen.");

  const teacherRefDoc = doc(db, "teachers", String(uid));
  const now = new Date().toISOString();
  const batch = writeBatch(db);
  batch.set(teacherRefDoc, {
    active: true,
    admin: false,
    email: String(requestData.email || ""),
    displayName: String(requestData.displayName || ""),
    createdAt: now
  });
  batch.update(requestRef, {
    status: "approved",
    reviewedBy: admin.uid,
    updatedAt: now
  });
  await batch.commit();
  return { uid, email: requestData.email, displayName: requestData.displayName };
}
async function rejectTeacherRequest(uid) {
  const admin = await requireAdmin();
  const requestRef = doc(db, "teacherRequests", String(uid));
  const requestSnap = await getDoc(requestRef);
  if (!requestSnap.exists()) throw new Error("Die Registrierungsanfrage wurde nicht gefunden.");
  if (requestSnap.data().status !== "pending") throw new Error("Diese Anfrage wurde bereits bearbeitet.");
  await updateDoc(requestRef, {
    status: "rejected",
    reviewedBy: admin.uid,
    updatedAt: new Date().toISOString()
  });
  return true;
}
async function resendTeacherVerification(email, password) {
  const credential = await signInWithEmailAndPassword(auth, String(email || "").trim(), password || "");
  try {
    await reload(credential.user);
    if (credential.user.emailVerified) throw new Error("Diese E-Mail-Adresse ist bereits bestätigt. Du kannst dich normal anmelden.");
    await sendEmailVerification(credential.user);
  } finally {
    if (auth.currentUser) {
      try { await signOut(auth); } catch (_) {}
    }
  }
  return true;
}
async function requireAdmin() {
  const profile = await authorizedTeacher();
  if (!profile || profile.admin !== true) throw new Error("Für diese Funktion ist eine Admin-Freigabe erforderlich.");
  return profile;
}
async function cleanupOrphanTeacherRecords() {
  await requireAdmin();
  const cleanupFunction = httpsCallable(functionsFor(defaultApp), "cleanupOrphanTeacherRecords");
  const response = await cleanupFunction({});
  return response.data || {};
}
async function signOutTeacher() {
  if (auth.currentUser) await signOut(auth);
}
async function loadChallenges(options = {}) {
  const teacher = Boolean(options.teacher);
  if (teacher) await requireTeacher();
  const source = collection(db, "challenges");
  const snap = teacher
    ? await getDocs(source)
    : await getDocs(query(source, where("status", "==", "published")));
  const challenges = snap.docs.map(item => ({ ...item.data(), id: item.id }));
  if (teacher) {
    const getAnswerKey = httpsCallable(functionsFor(defaultApp), "getRewardChallengeAnswerKey");
    for (const challenge of challenges) {
      if (challenge.status !== "published") continue;
      try {
        const response = await getAnswerKey({ challengeId: challenge.id });
        const keys = Array.isArray(response.data && response.data.questions) ? response.data.questions : [];
        const keyById = new Map(keys.map(question => [question.id, question]));
        challenge.questions = (challenge.questions || []).map(question => {
          const key = keyById.get(question.id);
          if (!key) return question;
          const merged = { ...question, a: key.a, aAr: key.aAr,
            accepted: key.accepted || [], acceptedAr: key.acceptedAr || [] };
          if (key.type === "order") {
            merged.items = key.items || [];
            merged.itemsAr = key.itemsAr || [];
          }
          return merged;
        });
      } catch (error) {
        throw new Error("Die privaten Antwortdaten für die veröffentlichte Challenge „" + (challenge.title || challenge.id) +
          "“ konnten nicht geladen werden. Bitte führe zuerst die sichere Challenge-Migration aus. " +
          String(error && error.message || ""));
      }
    }
  }
  return challenges;
}
async function saveChallenge(challenge) {
  const user = await requireTeacher();
  if (!challenge || !challenge.id) throw new Error("Challenge-ID fehlt.");
  const ref = doc(db, "challenges", String(challenge.id));
  const existing = await getDoc(ref);
  const old = existing.exists() ? existing.data() : null;
  const payload = challengePayload(challenge, old && old.ownerUid ? old.ownerUid : user.uid, old && old.createdAt);
  await setDoc(ref, payload);
  if (payload.status === "published") {
    const syncAnswerKey = httpsCallable(functionsFor(defaultApp), "syncRewardChallengeAnswerKey");
    try {
      await syncAnswerKey({
        challengeId: payload.id,
        expectedUpdatedAt: payload.updatedAt,
        questions: plain(challenge.questions || [])
      });
    } catch (error) {
      // Fail closed: never leave a challenge published if its private answer key
      // could not be synchronized. A later teacher save can safely republish it.
      try {
        await updateDoc(ref, {
          status: "draft",
          updatedAt: new Date().toISOString()
        });
      } catch (rollbackError) {
        console.error("Could not roll back publication after answer-key sync failure.", rollbackError);
      }
      throw error;
    }
  }
  return payload;
}
async function loadResults() {
  await requireTeacher();
  const snap = await getDocs(collection(db, "challengeResults"));
  return snap.docs.map(item => ({ ...item.data(), id: item.id }));
}
async function migratePublishedChallengeAnswerKeys() {
  const migrate = httpsCallable(functionsFor(defaultApp), "migratePublishedChallengeAnswerKeys");
  const response = await migrate({});
  return response.data || {};
}
async function evaluateBibleChallengeSubmission(challengeId, answers, metadata = {}) {
  if (!studentAuth.currentUser || !studentAuth.currentUser.isAnonymous) {
    await signInAnonymously(studentAuth);
  }
  const evaluate = httpsCallable(functionsFor(studentApp), "evaluateBibleChallengeSubmission");
  const response = await evaluate({
    challengeId: String(challengeId), answers,
    resultId: String(metadata.resultId || ""),
    studentName: String(metadata.studentName || ""),
    elapsedSeconds: Number(metadata.elapsedSeconds)
  });
  return response.data || {};
}
async function claimBibleChallengeReward(studentCode, pin, resultId) {
  const functions = functionsFor(rewardsApp);
  const login = httpsCallable(functions, "loginRewardStudent");
  const loginResponse = await login({ studentCode: String(studentCode || ""), pin: String(pin || "") });
  const token = loginResponse.data && loginResponse.data.token;
  if (!token) throw new Error("Die Rewards-Anmeldung war nicht erfolgreich.");
  await signInWithCustomToken(rewardsAuth, token);
  const claim = httpsCallable(functions, "claimBibleChallengeReward");
  const claimResponse = await claim({ resultId: String(resultId || "") });
  return claimResponse.data || {};
}


window.bibleFirebaseReady = Promise.resolve({
  projectId: firebaseConfig.projectId,
  signInTeacher,
  registerTeacher,
  resendTeacherVerification,
  listTeacherRequests,
  approveTeacherRequest,
  rejectTeacherRequest,
  cleanupOrphanTeacherRecords,
  signOutTeacher,
  loadChallenges,
  saveChallenge,
  loadResults,
  evaluateBibleChallengeSubmission,
  claimBibleChallengeReward,
  migratePublishedChallengeAnswerKeys,
  getCurrentTeacher: () => authorizedTeacher()
});
