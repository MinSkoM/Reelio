import { openDB, IDBPDatabase } from 'idb';

const DB_NAME = 'CapCutCompanionDB';
const STORE_NAME = 'videos';

export interface VideoRecord {
  id: string;
  projectId: string;
  shotId: string;
  blob: Blob;
  fileName: string;
  createdAt: number;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

export async function saveVideo(record: VideoRecord) {
  const db = await getDB();
  await db.put(STORE_NAME, record);
}

export async function getVideosByProject(projectId: string): Promise<VideoRecord[]> {
  const db = await getDB();
  const all = await db.getAll(STORE_NAME);
  return all.filter(v => v.projectId === projectId);
}

export async function deleteVideo(id: string) {
  const db = await getDB();
  await db.delete(STORE_NAME, id);
}
