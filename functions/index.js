const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");

admin.initializeApp();

const db = admin.firestore();

/**
 * Immediate cleanup for accounts deleted after this function is deployed.
 * Only the account's own teacher request and teacher profile are removed.
 */
exports.cleanupTeacherDataOnAuthDelete = functions.region("europe-west3").auth.user().onDelete(async (user) => {
  const uid = user.uid;
  const [requestResult, profileResult] = await Promise.all([
    db.collection("teacherRequests").doc(uid).delete(),
    db.collection("teachers").doc(uid).delete()
  ]);

  console.log("Teacher data cleanup completed after Auth deletion.", {
    uid,
    requestDocumentDeleted: true,
    teacherProfileDeleteRequested: true
  });
});

/**
 * Admin-invoked reconciliation for records left behind by users deleted
 * before the trigger was deployed (and for any missed historical records).
 * A document is removed only when its document ID is absent from Firebase Auth.
 */
exports.cleanupOrphanTeacherRecords = functions.region("europe-west3").https.onCall(async (_data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "Bitte melde dich als Administrator an."
    );
  }

  const callerUid = context.auth.uid;
  const callerProfile = await db.collection("teachers").doc(callerUid).get();
  if (!callerProfile.exists ||
      callerProfile.get("active") !== true ||
      callerProfile.get("admin") !== true) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Für die Bereinigung ist ein aktives Administratorkonto erforderlich."
    );
  }

  // Read every Authentication user (handles accounts beyond the first 1,000).
  const authUids = new Set();
  let pageToken;
  do {
    const page = await admin.auth().listUsers(1000, pageToken);
    for (const user of page.users) authUids.add(user.uid);
    pageToken = page.pageToken;
  } while (pageToken);

  const collections = ["teacherRequests", "teachers"];
  const deleted = { teacherRequests: 0, teachers: 0 };
  let examined = 0;
  let batch = db.batch();
  let pendingWrites = 0;

  for (const collectionName of collections) {
    const snapshot = await db.collection(collectionName).get();
    examined += snapshot.size;

    for (const document of snapshot.docs) {
      if (authUids.has(document.id)) continue;

      batch.delete(document.ref);
      pendingWrites += 1;
      deleted[collectionName] += 1;

      // Keep each write batch safely below Firestore's 500-operation limit.
      if (pendingWrites >= 400) {
        await batch.commit();
        batch = db.batch();
        pendingWrites = 0;
      }
    }
  }

  if (pendingWrites > 0) await batch.commit();

  const result = {
    examined,
    deletedTeacherRequests: deleted.teacherRequests,
    deletedTeacherProfiles: deleted.teachers
  };
  console.log("Orphan teacher record cleanup completed.", {
    callerUid,
    ...result
  });
  return result;
});
