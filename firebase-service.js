import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, signInAnonymously
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, query, where, setDoc
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const defaultApp = getApps().some(app => app.name === "[DEFAULT]")
  ? getApp()
  : initializeApp(firebaseConfig);
const auth = getAuth(defaultApp);
const db = getFirestore(defaultApp);

// Students use a separate anonymous-auth context so they do not sign out a teacher
// when a shared device is used for testing.
const studentApp = getApps().find(app => app.name === "BibleEscapeStudent")
  || initializeApp(firebaseConfig, "BibleEscapeStudent");
const studentAuth = getAuth(studentApp);
const studentDb = getFirestore(studentApp);

function teacherRef(uid) {
  return doc(db, "teachers", uid);
}
async function authorizedTeacher(user = auth.currentUser) {
  if (!user) return null;
  const snap = await getDoc(teacherRef(user.uid));
  if (!snap.exists() || snap.data().active !== true) return null;
  return { uid: user.uid, email: user.email || "", displayName: snap.data().displayName || user.displayName || "" };
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
function challengePayload(challenge, ownerUid, createdAt) {
  return {
    id: String(challenge.id),
    title: String(challenge.title || ""),
    titleAr: String(challenge.titleAr || ""),
    passage: String(challenge.passage || ""),
    instructions: String(challenge.instructions || ""),
    instructionsAr: String(challenge.instructionsAr || ""),
    status: ["draft", "published", "archived"].includes(challenge.status) ? challenge.status : "draft",
    questions: Array.isArray(challenge.questions) ? plain(challenge.questions) : [],
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
    correctCount: Math.max(0, Math.min(4, Number(result.correctCount) || 0)),
    questionCount: Math.max(3, Math.min(4, Number(result.questionCount) || 3)),
    elapsedSeconds: Math.max(0, Math.min(86400, Math.round(Number(result.elapsedSeconds) || 0))),
    completedAt: String(result.completedAt || new Date().toISOString()),
    answers: (Array.isArray(result.answers) ? result.answers : []).slice(0, 4).map(a => ({
      questionId: String(a.questionId || ""),
      question: String(a.question || "").slice(0, 500),
      questionAr: String(a.questionAr || "").slice(0, 500),
      correct: Boolean(a.correct),
      given: String(a.given || "").slice(0, 500),
      points: Math.max(0, Math.round(Number(a.points) || 0))
    }))
  };
}

async function signInTeacher(email, password) {
  const credential = await signInWithEmailAndPassword(auth, String(email || "").trim(), password || "");
  try {
    const profile = await authorizedTeacher(credential.user);
    if (!profile) {
      await signOut(auth);
      throw new Error("TEACHER_NOT_ALLOWED");
    }
    return profile;
  } catch (error) {
    if (error && error.message === "TEACHER_NOT_ALLOWED") {
      throw new Error("Login erfolgreich, aber dieses Konto ist noch nicht freigeschaltet. In Firestore muss unter teachers ein Dokument mit der Benutzer-UID und active = true existieren.");
    }
    try { await signOut(auth); } catch (_) {}
    throw error;
  }
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
  return snap.docs.map(item => ({ ...item.data(), id: item.id }));
}
async function saveChallenge(challenge) {
  const user = await requireTeacher();
  if (!challenge || !challenge.id) throw new Error("Challenge-ID fehlt.");
  const ref = doc(db, "challenges", String(challenge.id));
  const existing = await getDoc(ref);
  const old = existing.exists() ? existing.data() : null;
  const payload = challengePayload(challenge, old && old.ownerUid ? old.ownerUid : user.uid, old && old.createdAt);
  await setDoc(ref, payload);
  return payload;
}
async function loadResults() {
  await requireTeacher();
  const snap = await getDocs(collection(db, "challengeResults"));
  return snap.docs.map(item => ({ ...item.data(), id: item.id }));
}
async function saveStudentResult(result) {
  const payload = cleanResult(result);
  if (!payload.id || !payload.challengeId) throw new Error("Ergebnisdaten sind unvollständig.");
  if (!studentAuth.currentUser || !studentAuth.currentUser.isAnonymous) {
    await signInAnonymously(studentAuth);
  }
  const challengeSnap = await getDoc(doc(studentDb, "challenges", payload.challengeId));
  if (!challengeSnap.exists() || challengeSnap.data().status !== "published") {
    throw new Error("Diese Challenge ist nicht mehr veröffentlicht; das Ergebnis wurde lokal gespeichert.");
  }
  await setDoc(doc(studentDb, "challengeResults", payload.id), payload);
  return true;
}

window.bibleFirebaseReady = Promise.resolve({
  projectId: firebaseConfig.projectId,
  signInTeacher,
  signOutTeacher,
  loadChallenges,
  saveChallenge,
  loadResults,
  saveStudentResult,
  getCurrentTeacher: () => authorizedTeacher()
});
