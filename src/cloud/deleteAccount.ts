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
 * so the user confirms with Google first, before anything is wiped: a cancelled or wrong
 * account there must leave both the data and the account untouched. `reauthenticate`
 * resolves the uid that is signed in afterwards, which has to be the same account.
 */
export async function deleteAccountAndData(
  uid: string,
  reauthenticate: () => Promise<string | null>,
): Promise<void> {
  let confirmedUid: string | null;
  try {
    confirmedUid = await reauthenticate();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/cancel/i.test(message)) throw new Error('Sign-in was cancelled. Nothing was deleted.');
    throw new Error("Couldn't confirm your Google account. Nothing was deleted.");
  }
  if (confirmedUid !== uid) {
    throw new Error('That is a different Google account. Sign in with the account you want to delete.');
  }

  for (const collection of SYNCED_COLLECTIONS) {
    await deleteCollection(uid, collection);
  }
  await FirebaseAuthentication.deleteUser();
}
