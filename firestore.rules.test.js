"use strict";

const { before, after, beforeEach, test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds
} = require("@firebase/rules-unit-testing");
const { doc, getDoc, setDoc, updateDoc, deleteDoc } = require("firebase/firestore");

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
