import type { Annotation } from './strategyBoard'

// 截圖檔案太大，localStorage 放不下，所以最後一塊畫板存在 IndexedDB。

export interface StoredBoard {
  screenshot: Blob
  annotations: Annotation[]
}

const DB_NAME = 'loa-lab'
const STORE = 'strategy-board'
const KEY = 'current'

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = action(db.transaction(STORE, mode).objectStore(STORE))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  } finally {
    db.close()
  }
}

export async function loadBoard() {
  return (await run<StoredBoard | undefined>('readonly', store => store.get(KEY))) ?? null
}

export async function saveBoard(board: StoredBoard | null) {
  if (board) await run('readwrite', store => store.put(board, KEY))
  else await run('readwrite', store => store.delete(KEY))
}
