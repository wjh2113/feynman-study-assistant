const DB_NAME = "zhifan-offline-v1";
const STORE = "kv";

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB 打开失败"));
  });
}

function idbRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB 请求失败"));
  });
}

export async function offlineGet(key) {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readonly");
    return await idbRequest(tx.objectStore(STORE).get(key));
  } finally {
    db.close();
  }
}

export async function offlineSet(key, value) {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readwrite");
    await idbRequest(tx.objectStore(STORE).put(value, key));
  } finally {
    db.close();
  }
}

export async function cacheProjectsSnapshot(userId, projects) {
  if (!userId || !Array.isArray(projects)) return;
  await offlineSet(`projects:${userId}`, {
    savedAt: Date.now(),
    projects
  });
}

export async function loadCachedProjects(userId) {
  if (!userId) return null;
  const row = await offlineGet(`projects:${userId}`);
  return row?.projects || null;
}

export async function cacheProjectDetail(userId, project) {
  if (!userId || !project?.id) return;
  await offlineSet(`project:${userId}:${project.id}`, {
    savedAt: Date.now(),
    project
  });
}

export async function loadCachedProject(userId, projectId) {
  if (!userId || !projectId) return null;
  const row = await offlineGet(`project:${userId}:${projectId}`);
  return row?.project || null;
}

export async function cacheAuthUser(user) {
  if (!user?.id) return;
  await offlineSet("auth:user", { savedAt: Date.now(), user });
}

export async function loadCachedAuthUser() {
  const row = await offlineGet("auth:user");
  return row?.user || null;
}

export async function clearCachedAuthUser() {
  await offlineSet("auth:user", null);
}
