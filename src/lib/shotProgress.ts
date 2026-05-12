export const SHOT_PROGRESS_STORAGE_KEY = 'tudtor-shot-progress';
export const SHOT_PROGRESS_EVENT = 'tudtor-shot-progress-updated';

type ShotProgressMap = Record<string, Record<number, boolean>>;

function readAllProgress(): ShotProgressMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(SHOT_PROGRESS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeAllProgress(progress: ShotProgressMap) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(SHOT_PROGRESS_STORAGE_KEY, JSON.stringify(progress));
  window.dispatchEvent(new CustomEvent(SHOT_PROGRESS_EVENT));
}

export function getShotProgress(projectId: string): Record<number, boolean> {
  const progress = readAllProgress();
  const current = progress[projectId];
  return current && typeof current === 'object' ? current : {};
}

export function setShotProgress(projectId: string, next: Record<number, boolean>) {
  const progress = readAllProgress();
  progress[projectId] = next;
  writeAllProgress(progress);
}

export function markShotCompleted(projectId: string, orderIndex: number, completed = true) {
  const progress = readAllProgress();
  const current = progress[projectId] && typeof progress[projectId] === 'object' ? progress[projectId] : {};
  progress[projectId] = {
    ...current,
    [orderIndex]: completed,
  };
  writeAllProgress(progress);
}

export function getProgressSummary(projectId: string, totalShots: number) {
  const progress = getShotProgress(projectId);
  const completed = Object.values(progress).filter(Boolean).length;
  const safeTotal = Math.max(totalShots, 1);
  return {
    completed,
    total: totalShots,
    percent: Math.min(100, Math.round((completed / safeTotal) * 100)),
  };
}
