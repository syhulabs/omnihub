import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { FirebaseFirestore } from '@capacitor-firebase/firestore';

/** Every Firestore subcollection a signed-in user's data can live in, under users/{uid}/. */
const SYNCED_COLLECTIONS = [
  'notes',
  'checklists',
  'expenses',
  'budgets',
  'subscriptions',
  'debts',
  'alarms',
  'vault',
];

const BATCH_LIMIT = 500;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

async function deleteCollection(uid: string, collection: string): Promise<void> {
  const reference = `users/${uid}/${collection}`;
  const { snapshots } = await FirebaseFirestore.getCollection({ reference });
  if (!snapshots.length) return;
  for (const group of chunk(snapshots, BATCH_LIMIT)) {
    await FirebaseFirestore.writeBatch({
      operations: group.map((doc) => ({
        type: 'delete' as const,
        reference: `${reference}/${doc.id}`,
      })),
    });
  }
}

/**
 * Deletes every synced document for the signed-in user, then the Firebase Auth account
 * itself. Firestore's security rules only allow a user to touch their own documents while
 * still authenticated, so the data has to go first - deleting the account first would lock
 * the client out of its own cleanup.
 *
 * Firebase refuses to delete an account on a stale session (`auth/requires-recent-login`),
 * so the user confirms with Google or Apple first, before anything is wiped: a cancelled or wrong
 * account there must leave both the data and the account untouched. `reauthenticate`
 * resolves the uid that is signed in afterwards, which has to be the same account.
 *
 * For an account made with Sign in with Apple, that confirmation also returns an authorization
 * code. Apple requires the app to revoke its token when the account is deleted (App Store
 * guideline 5.1.1(v)), so it is revoked just before the account goes.
 */
export async function deleteAccountAndData(
  uid: string,
  reauthenticate: () => Promise<{ uid: string | null; appleAuthorizationCode?: string }>,
): Promise<void> {
  let confirmedUid: string | null;
  let appleAuthorizationCode: string | undefined;
  try {
    ({ uid: confirmedUid, appleAuthorizationCode } = await reauthenticate());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/cancel/i.test(message)) throw new Error('Sign-in was cancelled. Nothing was deleted.');
    throw new Error("Couldn't confirm your account. Nothing was deleted.");
  }
  if (confirmedUid !== uid) {
    // The chooser has just signed this phone in as that other account. Staying signed in would
    // merge this phone's data into it the next time a synced tool is opened.
    try {
      await FirebaseAuthentication.signOut();
    } catch {
      // best-effort
    }
    throw new Error('That is a different account, so nothing was deleted and you have been signed out. Sign in with the account you want to delete.');
  }

  for (const collection of SYNCED_COLLECTIONS) {
    await deleteCollection(uid, collection);
  }
  if (appleAuthorizationCode) {
    try {
      await FirebaseAuthentication.revokeAccessToken({ token: appleAuthorizationCode });
    } catch {
      // The data is already gone; a failed revoke must not leave the account half-deleted.
    }
  }
  await FirebaseAuthentication.deleteUser();
}
