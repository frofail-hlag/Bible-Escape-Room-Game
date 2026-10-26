"use strict";

const { before, after, beforeEach, test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds
} = require("@firebase/rules-unit-testing");
const { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, where } = require("firebase/firestore");

let testEnv;
const projectId = "demo-biblereise-security";

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: { rules: fs.readFileSync("firestore.rules", "utf8") }
  });
});

after(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "teachers", "teacher-1"), {
      active: true, admin: false, email: "teacher@example.test",
      displayName: "Teacher One", createdAt: "2026-01-01T00:00:00.000Z"
    });
    await setDoc(doc(db, "teachers", "admin-1"), {
      active: true, admin: true, email: "admin@example.test",
      displayName: "Admin One", createdAt: "2026-01-01T00:00:00.000Z"
    });
    await setDoc(doc(db, "challenges", "published-1"), {
      id: "published-1", title: "Test", titleAr: "اختبار", passage: "Mark 1",
      instructions: "Answer", instructionsAr: "أجب", status: "published",
      questions: [{ id: "q1", type: "choice", opts: ["A", "B"] }],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z", ownerUid: "teacher-1"
    });
    await setDoc(doc(db, "rewardChallengeAnswerKeys", "published-1"), {
      challengeId: "published-1", questions: [{ id: "q1", a: 1 }]
    });
    await setDoc(doc(db, "rewardStudents", "student-1"), {
      displayName: "Student One", active: true, balance: 6, totalEarned: 6
    });
    await setDoc(doc(db, "rewardStudents", "student-2"), {
      displayName: "Student Two", active: true, balance: 0, totalEarned: 0
    });
    await setDoc(doc(db, "studentCodeLookups", "CODE-1"), {
      studentUid: "student-1", pinHash: "private-hash", active: true
    });
    await setDoc(doc(db, "rewardChallengeAttempts", "attempt-123456"), {
      studentUid: "student-1", challengeId: "published-1", status: "started"
    });
    await setDoc(doc(db, "verifiedChallengeResults", "verified-1"), {
      id: "verified-1", challengeId: "published-1", studentUid: "student-1"
    });
    await setDoc(doc(db, "pointTransactions", "txn-student-1"), {
      studentUid: "student-1", delta: 6, type: "bible_challenge_earned"
    });
    await setDoc(doc(db, "pointTransactions", "txn-student-2"), {
      studentUid: "student-2", delta: 3, type: "bible_challenge_earned"
    });
    await setDoc(doc(db, "rewards", "reward-1"), {
      name: "Bible", cost: 10, active: true
    });
    await setDoc(doc(db, "redemptions", "redemption-1"), {
      studentUid: "student-1", rewardId: "reward-1", status: "pending"
    });
  });
});

test("anonymous students can read published challenges but cannot read private answer keys", async () => {
  const db = testEnv.authenticatedContext("anonymous-1", {
    firebase: { sign_in_provider: "anonymous" }
  }).firestore();
  await assertSucceeds(getDoc(doc(db, "challenges", "published-1")));
  await assertFails(getDoc(doc(db, "rewardChallengeAnswerKeys", "published-1")));
});

test("browser clients cannot create, update, or delete challenge results", async () => {
  const db = testEnv.authenticatedContext("anonymous-1", {
    firebase: { sign_in_provider: "anonymous" }
  }).firestore();
  const resultRef = doc(db, "challengeResults", "forged-result");
  await assertFails(setDoc(resultRef, { id: "forged-result", score: 10000 }));
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "challengeResults", "server-result"), {
      id: "server-result", score: 100, studentName: "Student"
    });
  });
  await assertFails(updateDoc(doc(db, "challengeResults", "server-result"), { score: 0 }));
  await assertFails(deleteDoc(doc(db, "challengeResults", "server-result")));
});

test("active teachers can read results but cannot write them from the browser", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "challengeResults", "teacher-visible"), {
      id: "teacher-visible", score: 100, studentName: "Student"
    });
  });
  const teacherDb = testEnv.authenticatedContext("teacher-1").firestore();
  await assertSucceeds(getDoc(doc(teacherDb, "challengeResults", "teacher-visible")));
  await assertFails(setDoc(doc(teacherDb, "challengeResults", "forged-by-teacher"), {
    id: "forged-by-teacher", score: 10000
  }));
});

test("unauthenticated users cannot read results", async () => {
  const db = testEnv.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(db, "challengeResults", "teacher-visible")));
});

test("reward students can read only their own profile; active teachers can list profiles", async () => {
  const studentDb = testEnv.authenticatedContext("student-1", { rewardStudent: true }).firestore();
  await assertSucceeds(getDoc(doc(studentDb, "rewardStudents", "student-1")));
  await assertFails(getDoc(doc(studentDb, "rewardStudents", "student-2")));
  const teacherDb = testEnv.authenticatedContext("teacher-1").firestore();
  await assertSucceeds(getDocs(collection(teacherDb, "rewardStudents")));
  await assertFails(setDoc(doc(teacherDb, "rewardStudents", "forged-student"), {
    displayName: "Forged", active: true, balance: 999, totalEarned: 999
  }));
});

test("private Rewards collections cannot be read or written by browser clients", async () => {
  const studentDb = testEnv.authenticatedContext("student-1", { rewardStudent: true }).firestore();
  for (const [collectionName, documentId] of [
    ["studentCodeLookups", "CODE-1"],
    ["rewardChallengeAnswerKeys", "published-1"],
    ["rewardChallengeAttempts", "attempt-123456"],
    ["verifiedChallengeResults", "verified-1"]
  ]) {
    await assertFails(getDoc(doc(studentDb, collectionName, documentId)));
    await assertFails(setDoc(doc(studentDb, collectionName, "client-forgery"), { studentUid: "student-1" }));
  }
});

test("students can read only their own point transactions and cannot write ledger entries", async () => {
  const studentDb = testEnv.authenticatedContext("student-1", { rewardStudent: true }).firestore();
  await assertSucceeds(getDoc(doc(studentDb, "pointTransactions", "txn-student-1")));
  await assertFails(getDoc(doc(studentDb, "pointTransactions", "txn-student-2")));
  await assertSucceeds(getDocs(query(collection(studentDb, "pointTransactions"), where("studentUid", "==", "student-1"))));
  await assertFails(setDoc(doc(studentDb, "pointTransactions", "forged-transaction"), {
    studentUid: "student-1", delta: 1000
  }));
});

test("students can read rewards and their own redemptions but cannot create redemptions directly", async () => {
  const studentDb = testEnv.authenticatedContext("student-1", { rewardStudent: true }).firestore();
  await assertSucceeds(getDoc(doc(studentDb, "rewards", "reward-1")));
  await assertSucceeds(getDoc(doc(studentDb, "redemptions", "redemption-1")));
  await assertFails(setDoc(doc(studentDb, "redemptions", "forged-redemption"), {
    studentUid: "student-1", rewardId: "reward-1", status: "approved"
  }));
});

test("active teachers can manage rewards but cannot write redemptions or point transactions", async () => {
  const teacherDb = testEnv.authenticatedContext("teacher-1").firestore();
  await assertSucceeds(setDoc(doc(teacherDb, "rewards", "reward-2"), {
    name: "New reward", cost: 5, active: true
  }));
  await assertFails(setDoc(doc(teacherDb, "pointTransactions", "teacher-forgery"), {
    studentUid: "student-1", delta: 500
  }));
  await assertFails(setDoc(doc(teacherDb, "redemptions", "teacher-forgery"), {
    studentUid: "student-1", status: "approved"
  }));
});
