import React, { useEffect, useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import { breakScriptIntoShots, generateScript, GeneratedScript } from '../services/geminiService';
import { getShotTypeLabel } from '../lib/shotLabels';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Download, FileText, Loader2, Clock3, Package2, WandSparkles, Scissors, Sparkles, Camera, Captions, Star, ArrowLeft, CheckCircle2, Library, FolderOpen, Copy, Pencil, Plus, Trash2 } from 'lucide-react';
import { getVideosByProject, type VideoRecord } from '../lib/db';
import { getProgressSummary, getShotProgress, setShotProgress, SHOT_PROGRESS_EVENT } from '../lib/shotProgress';

const topicOptions = ['รีวิวสินค้า', 'สอนทำ', 'เล่าเรื่อง', 'ทริคการเรียน', 'เที่ยว', 'รีวิวอาหาร'];
const platformOptions = ['TikTok', 'Instagram Reels', 'YouTube Shorts'];
const audienceOptions = ['มือใหม่', 'นักเรียน นักศึกษา', 'ครีเอเตอร์', 'คนทำงาน'];
const toneOptions = ['เป็นกันเอง', 'คึกคัก', 'น่าเชื่อถือ', 'สนุก'];
const ctaOptions = ['แชร์ให้เพื่อน', 'บันทึกไว้ก่อน', 'แท็กเพื่อนมาดู', 'กดติดตาม', 'คอมเมนต์คุยกัน', 'กดลิงก์หน้าโปรไฟล์', 'สั่งซื้อในตะกร้า'];
const durationOptions = [15, 30, 45, 60, 90, 120];
const LIBRARY_STORAGE_KEY = 'tudtor-script-library';

type Mode = 'brief' | 'script';
type PageView = 'editor' | 'shot-list' | 'library';

type OptionFieldProps = {
  label: string;
  options: string[];
  value: string;
  customValue: string;
  onSelect: (next: string) => void;
  onCustomChange: (next: string) => void;
  customPlaceholder: string;
  allowCustom?: boolean;
};

type LibraryItem = {
  id: string;
  title: string;
  prompt: string;
  mode: Mode;
  createdAt: string;
  script: GeneratedScript;
};

function buildExportFileBase() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '-',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
  ].join('');
}

function sanitizeFileSegment(value: string) {
  return value.trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-').slice(0, 80) || 'project';
}

function isMp4MimeType(mimeType?: string) {
  return Boolean(mimeType && mimeType.toLowerCase().includes('mp4'));
}

function formatSrtTimestamp(totalMs: number) {
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const seconds = Math.floor((totalMs % 60_000) / 1000);
  const milliseconds = totalMs % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`;
}

function buildImportantTextSrt(script: GeneratedScript) {
  let cursorMs = 0;
  let cueIndex = 1;
  const cues: string[] = [];
  const useLegacyFallback = !script.shots.some((shot) => shot.on_screen_text?.trim());

  script.shots
    .slice()
    .sort((a, b) => a.order_index - b.order_index)
    .forEach((shot) => {
      const text = (shot.on_screen_text?.trim() || (useLegacyFallback ? shot.script_text.trim() : '')).replace(/\s+/g, ' ');
      const durationMs = Math.max(1000, Math.round((shot.duration_seconds || 3) * 1000));
      const startMs = cursorMs;
      const endMs = cursorMs + durationMs;
      cursorMs = endMs;

      if (!text) return;
      cues.push([
        String(cueIndex),
        `${formatSrtTimestamp(startMs)} --> ${formatSrtTimestamp(endMs)}`,
        text,
      ].join('\n'));
      cueIndex += 1;
    });

  return cues.join('\n\n');
}

async function convertBlobToMp4(blob: Blob, fileName: string, mimeType?: string) {
  const params = new URLSearchParams({
    fileName,
    mimeType: mimeType || blob.type || 'video/webm',
  });
  const response = await fetch(`/api/convert-video?${params.toString()}`, {
    method: 'POST',
    headers: { 'Content-Type': mimeType || blob.type || 'application/octet-stream' },
    body: blob,
  });

  if (!response.ok) {
    let message = 'แปลงวิดีโอเป็น MP4 ไม่สำเร็จ';
    try {
      const payload = await response.json();
      if (payload?.error) message = String(payload.error);
    } catch {}
    throw new Error(message);
  }

  return response.blob();
}

function getTopicDetailConfig(topic: string) {
  switch (topic) {
    case 'รีวิวสินค้า':
      return {
        label: 'รีวิวอะไร',
        placeholder: 'เช่น เซรั่มลดสิว, หูฟังบลูทูธ, โต๊ะปรับระดับ',
        helper: 'ใส่ชื่อสินค้า รุ่น หรือสิ่งที่อยากหยิบมารีวิว',
      };
    case 'สอนทำ':
      return {
        label: 'สอนทำอะไร',
        placeholder: 'เช่น แต่งหน้าไปเรียน, ทำกาแฟส้ม, ตัดคลิปใน CapCut',
        helper: 'บอกสิ่งที่อยากสอนหรือขั้นตอนหลักที่อยากให้คนดูทำตาม',
      };
    case 'เล่าเรื่อง':
      return {
        label: 'วันนี้เกี่ยวกับอะไร',
        placeholder: 'เช่น 1 วันของแม่ค้าออนไลน์, 1 วันเตรียมสอบ, 1 วันเที่ยวเชียงใหม่',
        helper: 'บอกธีมหรือบริบทของวันนั้นเพื่อให้ระบบจับ mood ได้ตรงขึ้น',
      };
    case 'ทริคการเรียน':
      return {
        label: 'ทริคเรื่องอะไร',
        placeholder: 'เช่น จำศัพท์ไวขึ้น, อ่านสอบคืนเดียว, จัดตารางอ่านหนังสือ',
        helper: 'ระบุปัญหาหรือทริคหลักที่อยากเล่า',
      };
    case 'เที่ยว':
      return {
        label: 'เที่ยวที่ไหน / ทำอะไร',
        placeholder: 'เช่น คาเฟ่อยุธยา, one day trip บางแสน, เดินตลาดกลางคืน',
        helper: 'บอกสถานที่หรือกิจกรรมหลักที่อยากให้คลิปโฟกัส',
      };
    case 'รีวิวอาหาร':
      return {
        label: 'รีวิวอะไร',
        placeholder: 'เช่น ร้านก๋วยเตี๋ยวเรือ, บุฟเฟต์ชาบู, ครัวซองต์ร้านดัง',
        helper: 'ใส่ชื่อเมนู ร้าน หรือสิ่งที่อยากชิมแล้วเล่าให้คนดูฟัง',
      };
    default:
      return {
        label: 'อยากให้พูดถึงอะไร',
        placeholder: 'เช่น หัวข้อหลักของคลิปนี้',
        helper: 'เพิ่มรายละเอียดสั้น ๆ เพื่อให้ระบบเขียนสคริปต์ได้ตรงขึ้น',
      };
  }
}

function loadLibrary(): LibraryItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LIBRARY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLibrary(items: LibraryItem[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(items));
}

export default function PreProduction({
  initialPageView = 'editor',
  onStartProduction,
  onBackToEditor,
  onBackToLibrary,
}: {
  initialPageView?: 'editor' | 'library';
  onStartProduction?: () => void;
  onBackToEditor?: () => void;
  onBackToLibrary?: () => void;
}) {
  const [pageView, setPageView] = useState<PageView>(initialPageView);
  const [mode, setMode] = useState<Mode>('brief');
  const [topic, setTopic] = useState(topicOptions[0]);
  const [platform, setPlatform] = useState(platformOptions[0]);
  const [topicDetail, setTopicDetail] = useState('');
  const [usp, setUsp] = useState('');
  const [audience, setAudience] = useState(audienceOptions[0]);
  const [tone, setTone] = useState(toneOptions[0]);
  const [cta, setCta] = useState(ctaOptions[0]);
  const [customCta, setCustomCta] = useState('');
  const [customTopic, setCustomTopic] = useState('');
  const [customAudience, setCustomAudience] = useState('');
  const [customTone, setCustomTone] = useState('');
  const [durationSeconds, setDurationSeconds] = useState(durationOptions[1]);
  const [existingScript, setExistingScript] = useState('');
  const [loading, setLoading] = useState(false);
  const [captionCopied, setCaptionCopied] = useState(false);
  const [script, setScript] = useState<GeneratedScript | null>(null);
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);
  const [activeLibraryItemId, setActiveLibraryItemId] = useState<string | null>(null);
  const [completedShots, setCompletedShots] = useState<Record<number, boolean>>({});
  const [libraryVideos, setLibraryVideos] = useState<Record<string, VideoRecord[]>>({});
  const [exportingLibraryItemId, setExportingLibraryItemId] = useState<string | null>(null);
  const [downloadingVideoId, setDownloadingVideoId] = useState<string | null>(null);
  const [progressVersion, setProgressVersion] = useState(0);
  const [editingScript, setEditingScript] = useState(false);

  type ApiStatus =
    | { kind: 'ready' }
    | { kind: 'countdown'; seconds: number }
    | { kind: 'daily'; message: string }
    | { kind: 'error'; message: string };

  const [apiStatus, setApiStatus] = useState<ApiStatus>({ kind: 'ready' });
  const retryIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (retryIntervalRef.current !== null) clearInterval(retryIntervalRef.current);
    };
  }, []);

  const goToEditor = () => {
    setPageView('editor');
    onBackToEditor?.();
  };

  const goToLibrary = () => {
    setPageView('library');
    onBackToLibrary?.();
  };

  useEffect(() => {
    setLibraryItems(loadLibrary());
  }, []);

  useEffect(() => {
    setPageView((current) => {
      if (initialPageView === 'library') return 'library';
      if (current === 'shot-list') return current;
      return 'editor';
    });
  }, [initialPageView]);

  const effectiveTopic = customTopic.trim() || topic;
  const effectiveDetail = topicDetail.trim();
  const topicDetailConfig = useMemo(() => getTopicDetailConfig(topic), [topic]);

  useEffect(() => {
    const activeId = activeLibraryItemId;
    if (!script || !activeId || typeof window === 'undefined') {
      setCompletedShots({});
      return;
    }

    const syncProgress = () => {
      setCompletedShots(getShotProgress(activeId));
      setProgressVersion((current) => current + 1);
    };

    syncProgress();
    window.addEventListener('storage', syncProgress);
    window.addEventListener(SHOT_PROGRESS_EVENT, syncProgress as EventListener);
    return () => {
      window.removeEventListener('storage', syncProgress);
      window.removeEventListener(SHOT_PROGRESS_EVENT, syncProgress as EventListener);
    };
  }, [script, activeLibraryItemId]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const entries = await Promise.all(
        libraryItems.map(async (item) => {
          const videos = await getVideosByProject(item.id);
          videos.sort((a, b) => {
            const shotCompare = Number(a.shotId) - Number(b.shotId);
            if (shotCompare !== 0) return shotCompare;
            return a.createdAt - b.createdAt;
          });
          return [item.id, videos] as const;
        }),
      );

      if (active) {
        setLibraryVideos(Object.fromEntries(entries));
      }
    })();

    return () => {
      active = false;
    };
  }, [libraryItems, progressVersion]);

  const prompt = useMemo(() => {
    if (mode === 'script') {
      return `แตกช็อตจากสคริปต์เดิม ความยาวรวม ${durationSeconds} วินาที`;
    }

    const parts = [effectiveTopic];
    parts.push(platform);
    if (effectiveDetail) parts.push(effectiveDetail);
    if (usp.trim()) parts.push(`USP: ${usp.trim()}`);
    parts.push(`สำหรับ ${audience}`);
    parts.push(`โทน${tone}`);
    parts.push(`CTA: ${cta}`);
    parts.push(`ความยาวรวม ${durationSeconds} วินาที`);
    return parts.join(' · ');
  }, [mode, effectiveTopic, platform, effectiveDetail, usp, audience, tone, cta, durationSeconds]);

  const currentLibraryItem = useMemo(
    () => libraryItems.find((item) => item.id === activeLibraryItemId) || null,
    [libraryItems, activeLibraryItemId],
  );

  const libraryProgress = useMemo(() => {
    return Object.fromEntries(
      libraryItems.map((item) => [item.id, getProgressSummary(item.id, item.script.shots.length)]),
    );
  }, [libraryItems, progressVersion]);


  useEffect(() => {
    if (typeof window === 'undefined') return;
    const refreshLibrary = () => setLibraryItems(loadLibrary());
    const refreshProgress = () => setProgressVersion((current) => current + 1);
    window.addEventListener('storage', refreshLibrary);
    window.addEventListener(SHOT_PROGRESS_EVENT, refreshProgress as EventListener);
    return () => {
      window.removeEventListener('storage', refreshLibrary);
      window.removeEventListener(SHOT_PROGRESS_EVENT, refreshProgress as EventListener);
    };
  }, []);

  const persistLibraryItem = (item: LibraryItem) => {
    const nextItems = [item, ...libraryItems.filter((entry) => entry.id !== item.id)];
    setLibraryItems(nextItems);
    saveLibrary(nextItems);
    setActiveLibraryItemId(item.id);
  };

  const applyScriptUpdate = (updater: (current: GeneratedScript) => GeneratedScript) => {
    setScript((current) => {
      if (!current) return current;
      const nextScript = updater(current);

      if (activeLibraryItemId) {
        setLibraryItems((currentItems) => {
          const nextItems = currentItems.map((item) =>
            item.id === activeLibraryItemId
              ? { ...item, title: nextScript.title || item.title, script: nextScript }
              : item,
          );
          saveLibrary(nextItems);
          return nextItems;
        });
      }

      return nextScript;
    });
  };

  const updateShot = (orderIndex: number, patch: Partial<GeneratedScript['shots'][number]>) => {
    applyScriptUpdate((current) => ({
      ...current,
      shots: current.shots.map((shot) => (shot.order_index === orderIndex ? { ...shot, ...patch } : shot)),
    }));
  };

  const addShot = () => {
    applyScriptUpdate((current) => {
      const nextOrderIndex = Math.max(0, ...current.shots.map((shot) => shot.order_index)) + 1;
      return {
        ...current,
        shots: [
          ...current.shots,
          {
            shot_type: 'A-Roll',
            script_text: '',
            on_screen_text: '',
            visual_description: '',
            order_index: nextOrderIndex,
            duration_seconds: 3,
          },
        ],
      };
    });
  };

  const deleteShot = (orderIndex: number) => {
    applyScriptUpdate((current) => ({
      ...current,
      shots: current.shots
        .filter((shot) => shot.order_index !== orderIndex)
        .map((shot, index) => ({ ...shot, order_index: index + 1 })),
    }));
  };

  const cancelRetry = () => {
    if (retryIntervalRef.current !== null) {
      clearInterval(retryIntervalRef.current);
      retryIntervalRef.current = null;
    }
    setApiStatus({ kind: 'ready' });
  };

  const handleGenerate = async () => {
    if (retryIntervalRef.current !== null) {
      clearInterval(retryIntervalRef.current);
      retryIntervalRef.current = null;
    }
    setApiStatus({ kind: 'ready' });
    setLoading(true);
    try {
      const nextScript = mode === 'brief'
        ? await generateScript({
            topic: effectiveTopic,
            product: effectiveDetail || undefined,
            platform,
            usp: usp.trim() || undefined,
            audience,
            tone,
            cta,
            durationSeconds,
          })
        : await breakScriptIntoShots(existingScript, durationSeconds);

      const libraryItem: LibraryItem = {
        id: typeof window !== 'undefined' && window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}`,
        title: nextScript.title,
        prompt,
        mode,
        createdAt: new Date().toISOString(),
        script: nextScript,
      };

      setScript(nextScript);
      setCompletedShots({});
      setProgressVersion((current) => current + 1);
      persistLibraryItem(libraryItem);
      setPageView('shot-list');
    } catch (error: any) {
      console.error('AI Error:', error);
      if (error?.isRateLimit && error?.retryAfterMs && error?.rateLimitKind !== 'daily') {
        let seconds = Math.ceil(error.retryAfterMs / 1000);
        setApiStatus({ kind: 'countdown', seconds });
        retryIntervalRef.current = setInterval(() => {
          seconds -= 1;
          if (seconds <= 0) {
            clearInterval(retryIntervalRef.current!);
            retryIntervalRef.current = null;
            setApiStatus({ kind: 'ready' });
            void handleGenerate();
          } else {
            setApiStatus({ kind: 'countdown', seconds });
          }
        }, 1000);
      } else if (error?.isRateLimit && error?.rateLimitKind === 'daily') {
        setApiStatus({ kind: 'daily', message: error.message });
      } else {
        setApiStatus({ kind: 'error', message: error?.message || String(error) });
      }
    } finally {
      setLoading(false);
    }
  };

  const openLibraryItem = (item: LibraryItem) => {
    setScript(item.script);
    setActiveLibraryItemId(item.id);
    setCompletedShots(getShotProgress(item.id));
    setEditingScript(false);
    setPageView('shot-list');
  };

  const deleteLibraryItem = (item: LibraryItem) => {
    if (!confirm(`คุณแน่ใจไหมว่าต้องการลบงาน "${item.title}"? การกระทำนี้ไม่สามารถย้อนกลับได้`)) {
      return;
    }
    const nextItems = libraryItems.filter((entry) => entry.id !== item.id);
    setLibraryItems(nextItems);
    saveLibrary(nextItems);
    if (activeLibraryItemId === item.id) {
      setActiveLibraryItemId(null);
      setScript(null);
      setPageView('editor');
    }
  };

  const toggleShotCompleted = (orderIndex: number) => {
    if (!activeLibraryItemId) return;

    setCompletedShots((current) => {
      const next = {
        ...current,
        [orderIndex]: !current[orderIndex],
      };
      setShotProgress(activeLibraryItemId, next);
      return next;
    });

    setProgressVersion((current) => current + 1);
  };

  const downloadFile = (content: string, fileName: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  };

  const downloadBlob = (content: Blob, fileName: string) => {
    const url = URL.createObjectURL(content);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  };

  const buildProjectZipBlob = async (item: LibraryItem, videos: VideoRecord[]) => {
    const zip = new JSZip();
    const takeCounts: Record<string, number> = {};

    const sortedVideos = videos.slice().sort((a, b) => {
      const shotCompare = Number(a.shotId) - Number(b.shotId);
      if (shotCompare !== 0) return shotCompare;
      return a.createdAt - b.createdAt;
    });

    for (const video of sortedVideos) {
      takeCounts[video.shotId] = (takeCounts[video.shotId] || 0) + 1;
      const shotNumber = String(video.shotId).padStart(2, '0');
      const takeNumber = String(takeCounts[video.shotId]).padStart(2, '0');
      const fileName = `shot-${shotNumber}-take-${takeNumber}.mp4`;
      const mp4Blob = isMp4MimeType(video.mimeType) ? video.blob : await convertBlobToMp4(video.blob, video.fileName, video.mimeType);
      zip.file(fileName, mp4Blob);
    }

    const srt = buildImportantTextSrt(item.script);
    if (srt) {
      zip.file('important-text.srt', `${srt}\n`);
    }

    return zip.generateAsync({ type: 'blob' });
  };

  const handleDownloadProjectClips = async (item: LibraryItem) => {
    setExportingLibraryItemId(item.id);
    try {
      const videos = await getVideosByProject(item.id);
      if (videos.length === 0) {
        alert('โปรเจกต์นี้ยังไม่มีคลิปที่ถ่ายไว้');
        return;
      }

      const blob = await buildProjectZipBlob(item, videos);
      downloadBlob(blob, `${buildExportFileBase()}-${sanitizeFileSegment(item.title)}-clips.zip`);
    } catch (error: any) {
      alert(error?.message || 'โหลดคลิปจากคลังไม่สำเร็จ');
    } finally {
      setExportingLibraryItemId(null);
    }
  };

  const getShotTakeFileName = (video: VideoRecord, videos: VideoRecord[]) => {
    const sortedVideos = videos.slice().sort((a, b) => {
      const shotCompare = Number(a.shotId) - Number(b.shotId);
      if (shotCompare !== 0) return shotCompare;
      return a.createdAt - b.createdAt;
    });
    const takeNumber = sortedVideos.filter((item) => item.shotId === video.shotId && item.createdAt <= video.createdAt).length || 1;
    return `shot-${String(video.shotId).padStart(2, '0')}-take-${String(takeNumber).padStart(2, '0')}.mp4`;
  };

  const handleDownloadSingleClip = async (video: VideoRecord, videos: VideoRecord[]) => {
    setDownloadingVideoId(video.id);
    try {
      const mp4Blob = isMp4MimeType(video.mimeType) ? video.blob : await convertBlobToMp4(video.blob, video.fileName, video.mimeType);
      downloadBlob(mp4Blob, getShotTakeFileName(video, videos));
    } catch (error: any) {
      alert(error?.message || 'ดาวน์โหลดคลิปไม่สำเร็จ');
    } finally {
      setDownloadingVideoId(null);
    }
  };

  const buildCaptionText = () => {
    if (!script) return '';

    if (script.caption?.trim()) return script.caption.trim();

    const highlight = script.shots
      .slice()
      .sort((a, b) => a.order_index - b.order_index)
      .slice(0, 2)
      .map((shot) => shot.script_text.trim())
      .filter(Boolean)
      .join(' ');

    return [script.title, prompt, highlight].filter(Boolean).join('\n\n');
  };

  const escapeCsvValue = (value: string) => `"${value.replace(/"/g, '""')}"`;

  const handleDownloadTxt = () => {
    if (!script) return;

    const lines = [
      `${script.title}`,
      `${prompt}`,
      '',
      ...script.shots
        .sort((a, b) => a.order_index - b.order_index)
        .flatMap((shot) => [
          `Shot ${shot.order_index}`,
          `Voice: ${shot.script_text}`,
          `Text on video: ${shot.on_screen_text?.trim() || '-'}`,
          `Description: ${shot.visual_description}`,
          '',
        ]),
    ];

    downloadFile(lines.join('\n'), `${buildExportFileBase()}.txt`, 'text/plain;charset=utf-8');
  };  

  const handleDownloadCsv = () => {
    if (!script) return;

    const rows = [
      ['Shot', 'Description', 'Voice', 'Text on video'],
      ...script.shots
        .slice()
        .sort((a, b) => a.order_index - b.order_index)
        .map((shot) => [String(shot.order_index), shot.visual_description, shot.script_text, shot.on_screen_text?.trim() || '']),
    ];

    const csv = rows.map((row) => row.map((cell) => escapeCsvValue(cell)).join(',')).join('\n');
    downloadFile(csv, `${buildExportFileBase()}.csv`, 'text/csv;charset=utf-8');
  };

  const handleCopyCaption = async () => {
    const captionText = buildCaptionText();
    if (!captionText.trim()) return;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(captionText);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = captionText;
        textarea.setAttribute('readonly', 'true');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }

      setCaptionCopied(true);
      window.setTimeout(() => setCaptionCopied(false), 2000);
    } catch (error) {
      console.error('Copy failed:', error);
      alert('คัดลอกข้อความไม่สำเร็จ');
    }
  };

  const renderOptionRow = ({ label, options, value, customValue, onSelect, onCustomChange, customPlaceholder, allowCustom = true }: OptionFieldProps) => {
    const usingCustom = !options.includes(value);
    const handleSelectCustom = () => {
      onSelect(customValue.trim() || 'อื่น ๆ');
    };

    return (
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-slate-100">{label}</legend>
        <div className="flex flex-wrap gap-2">
          {options.map((option) => {
            const selected = value === option;
            return (
              <Button
                key={option}
                type="button"
                variant={selected ? 'default' : 'outline'}
                aria-pressed={selected}
                className={
                  selected
                    ? 'h-11 rounded-full bg-[#F6D9B8] px-4 text-white shadow-md shadow-cyan-950/20 focus-visible:ring-2 focus-visible:ring-[#f0b35a]/70'
                    : 'h-11 rounded-full border-white/12 bg-[#454963] px-4 text-slate-100 hover:bg-[#50556f] focus-visible:ring-2 focus-visible:ring-[#f0b35a]/70'
                }
                onClick={() => onSelect(option)}
              >
                {selected ? <CheckCircle2 className="mr-2 h-4 w-4" /> : null}
                {option}
              </Button>
            );
          })}
          {allowCustom ? (
            <Button
              type="button"
              variant={usingCustom ? 'default' : 'outline'}
              className={
                usingCustom
                  ? 'h-11 rounded-full border-violet-300/35 bg-[#F6D9B8] px-4 text-white shadow-md shadow-cyan-950/20 focus-visible:ring-2 focus-visible:ring-[#f0b35a]/70'
                  : 'h-11 rounded-full border-white/12 bg-[#454963] px-4 text-slate-100 hover:bg-[#50556f] focus-visible:ring-2 focus-visible:ring-[#f0b35a]/70'
              }
              aria-pressed={usingCustom}
              onPointerDown={handleSelectCustom}
              onClick={handleSelectCustom}
            >
              {usingCustom ? <CheckCircle2 className="mr-2 h-4 w-4" /> : null}
              อื่น ๆ
            </Button>
          ) : null}
        </div>
        {allowCustom && usingCustom ? (
          <div className="space-y-2">
            <Input
              autoFocus
              value={customValue}
              onChange={(e) => {
                const next = e.target.value;
                onCustomChange(next);
                onSelect(next.trim() || 'อื่น ๆ');
              }}
              placeholder={customPlaceholder}
              className="h-12 rounded-2xl border-fuchsia-300/35 bg-fuchsia-400/10 px-4 text-white placeholder:text-violet-100/70 focus-visible:border-[#f0b35a] focus-visible:ring-[#f0b35a]/35"
            />
            <p className="text-xs leading-5 text-slate-200">พิมพ์คำของคุณเองในช่องนี้ เช่น กลุ่มเป้าหมายเฉพาะหรือโทนที่ไม่มีในตัวเลือก</p>
          </div>
        ) : null}
      </fieldset>
    );
  };

  if (pageView === 'library') {
    return (
      <div className="mx-auto mt-5 max-w-6xl space-y-5 animate-in fade-in duration-500 sm:mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={goToEditor}
            className="rounded-2xl border-white/12 bg-[#454963] px-4 text-slate-100 hover:bg-[#50556f]"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            กลับไปสร้างงาน
          </Button>
          <div className="rounded-full bg-[#FFAC6F] px-4 py-2 text-sm font-semibold text-[#efe7ff]">
            มีทั้งหมด {libraryItems.length} งานในคลังของเครื่องนี้
          </div>
        </div>

        <Card className="overflow-hidden border-white/8 bg-[#6d7189] shadow-2xl shadow-slate-950/20 backdrop-blur-xl">
          <CardHeader className="border-b border-white/8 bg-[#6d7189] px-6 pb-2 pt-2 sm:px-8">
            <p className="text-sm font-bold tracking-wide text-[#e7dcff]">My Project</p>
            <CardTitle className="text-3xl font-black tracking-tight text-white sm:text-4xl">สคริปต์และช็อตลิสต์ที่สร้างไว้</CardTitle>
            <p className="max-w-3xl text-base leading-7 text-slate-200">ทุกงานที่สร้างจากหน้านี้จะถูกเก็บไว้ในเครื่องของคุณ และสามารถเปิดกลับมาดูช็อตลิสต์ต่อได้จากหน้านี้</p>
          </CardHeader>
          <CardContent className="-mt-6 -mb-6 grid gap-4 p-5 sm:p-8 lg:grid-cols-2">
            {libraryItems.length === 0 ? (
              <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-6 text-slate-200 lg:col-span-2">
                ยังไม่มีงาน ลองสร้างสคริปต์หรือช็อตลิสต์ก่อน แล้วงานจะมาอยู่ตรงนี้อัตโนมัติ
              </div>
            ) : (
              libraryItems.map((item) => {
                const itemVideos = libraryVideos[item.id] || [];
                return (
                <div
                  key={item.id}
                  className="flex h-full w-full flex-col rounded-[1.5rem] border border-white/10 bg-white/5 p-5 text-left transition-all duration-300 hover:bg-white/10"
                >
                  <div className="flex h-full flex-col gap-4">
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className="bg-[#8d65e7] text-white">{item.mode === 'brief' ? 'วางแผนทั้งหมด' : 'สร้างจากสคริปต์'}</Badge>
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-100">
                          {new Date(item.createdAt).toLocaleString('th-TH')}
                        </span>
                      </div>
                      <p className="text-2xl font-bold text-white">{item.title}</p>
                      <p className="text-sm leading-6 text-slate-200">{item.script.caption?.trim() || 'งานนี้ยังไม่มี AI caption เพราะสร้างไว้ก่อนระบบ caption รุ่นใหม่'}</p>
                      <div className="space-y-2 pt-2">
                        <div className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-200">
                          <span>ถ่ายแล้ว {libraryProgress[item.id]?.completed || 0}/{item.script.shots.length} ช็อต</span>
                          <span>{libraryProgress[item.id]?.percent || 0}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-black/20">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-[#75A9E6] to-[#97C7FF] transition-all duration-500"
                            style={{ width: `${libraryProgress[item.id]?.percent || 0}%` }}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="mt-auto flex w-full flex-col gap-2 sm:flex-row">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => openLibraryItem(item)}
                        className="min-h-12 flex-1 justify-center rounded-2xl border-white/10 bg-[#8d65e7]/30 px-4 py-3 text-sm font-semibold text-[#efe7ff] hover:bg-[#8d65e7]/40"
                      >
                        <FolderOpen className="mr-2 h-4 w-4" />
                        เปิดดู {item.script.shots.length} ช็อต
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => { void handleDownloadProjectClips(item); }}
                        disabled={itemVideos.length === 0 || exportingLibraryItemId === item.id}
                        className="min-h-12 flex-1 justify-center rounded-2xl border-white/10 bg-[#2f334b] px-4 py-3 text-sm font-semibold text-slate-100 hover:bg-[#3b4057] disabled:opacity-45"
                      >
                        {exportingLibraryItemId === item.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                        ดาวน์โหลด ZIP {itemVideos.length}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => deleteLibraryItem(item)}
                        className="min-h-12 justify-center rounded-2xl border-white/10 bg-red-500/40 px-4 py-3 text-sm font-semibold text-slate-100 hover:bg-red-500/30 sm:w-24"
                      >
                        ลบ
                      </Button>
                    </div>
                  </div>
                </div>
              );
              })
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (pageView === 'shot-list' && script) {
    const sortedShots = [...script.shots].sort((a, b) => a.order_index - b.order_index);
    const completedCount = sortedShots.filter((shot) => completedShots[shot.order_index]).length;
    const activeProjectVideos = activeLibraryItemId ? libraryVideos[activeLibraryItemId] || [] : [];

    return (
      <div className="mx-auto mt-5 max-w-6xl space-y-5 animate-in fade-in duration-500 sm:mt-8">
        <Card className="overflow-hidden border-white/8 bg-[#6d7189] shadow-2xl shadow-slate-950/20 backdrop-blur-xl">
          <CardHeader className="space-y-4 border-b border-white/10 bg-[#62677f] px-6 pb-6 pt-6 sm:px-8">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="grid gap-2 sm:flex sm:flex-wrap sm:items-center">
                <Button
                  type="button"
                  variant="outline"
                  onClick={goToLibrary}
                  className="min-h-11 rounded-2xl border-white/12 bg-[#454963] px-4 text-slate-100 hover:bg-[#50556f]"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  ย้อนกลับ
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingScript((current) => !current)}
                  className="min-h-11 rounded-2xl border-emerald-300/20 bg-emerald-400/12 px-4 text-emerald-50 hover:bg-emerald-400/18"
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  {editingScript ? 'เสร็จสิ้นการแก้ไข' : 'แก้ไข script'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleDownloadTxt}
                  className="min-h-11 rounded-2xl border-white/10 bg-white/5 px-4 text-slate-100 hover:bg-white/10"
                >
                  <Download className="mr-2 h-4 w-4" />
                  ไฟล์ข้อความ
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleDownloadCsv}
                  className="min-h-11 rounded-2xl border-white/10 bg-white/5 px-4 text-slate-100 hover:bg-white/10"
                >
                  <Download className="mr-2 h-4 w-4" />
                  ไฟล์ตาราง
                </Button>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full bg-[#8d65e7]/16 px-4 py-2 text-sm font-semibold text-[#efe7ff]">
                <CheckCircle2 className="h-4 w-4" />
                ถ่ายเสร็จแล้ว {completedCount}/{sortedShots.length} ช็อต
              </div>
            </div>
            <div className="space-y-3">
              <p className="text-sm font-bold tracking-wide text-[#e7dcff]">หน้าช็อตลิสต์</p>
              {editingScript ? (
                <Input
                  value={script.title}
                  onChange={(event) => applyScriptUpdate((current) => ({ ...current, title: event.target.value }))}
                  className="h-14 rounded-2xl border-white/12 bg-[#2f334b] px-4 text-2xl font-black text-white placeholder:text-slate-500 sm:text-3xl"
                  placeholder="ชื่อโปรเจกต์"
                />
              ) : (
                <CardTitle className="text-3xl font-black tracking-tight text-white sm:text-4xl">{script.title}</CardTitle>
              )}
              <div className="rounded-2xl border border-white/10 bg-[#2f334b]/65 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  {editingScript ? (
                    <Textarea
                      value={script.caption}
                      onChange={(event) => applyScriptUpdate((current) => ({ ...current, caption: event.target.value }))}
                      className="min-h-28 flex-1 rounded-2xl border-white/12 bg-[#454963] px-4 py-3 text-sm leading-7 text-white placeholder:text-slate-500"
                      placeholder="caption สำหรับโพสต์"
                    />
                  ) : (
                    <p className="max-w-3xl whitespace-pre-line text-sm leading-7 text-slate-100">{buildCaptionText() || 'งานนี้ยังไม่มี AI caption เพราะสร้างไว้ก่อนระบบ caption รุ่นใหม่'}</p>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCopyCaption}
                    className="rounded-2xl border-[#a98eff]/20 bg-[#8d65e7]/16 px-4 text-[#efe7ff] hover:bg-[#8d65e7]/24"
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    {captionCopied ? 'คัดลอกแล้ว' : 'คัดลอก caption'}
                  </Button>
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4 p-4 sm:p-6 lg:p-8">
            {editingScript ? (
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={addShot}
                  className="rounded-2xl border-emerald-300/20 bg-emerald-400/12 px-4 text-emerald-50 hover:bg-emerald-400/18"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  เพิ่มช็อต
                </Button>
              </div>
            ) : null}
            {sortedShots.map((shot) => {
              const isCompleted = Boolean(completedShots[shot.order_index]);
              const shotVideos = activeProjectVideos.filter((video) => video.shotId === String(shot.order_index));
              return (
                <div
                  key={shot.order_index}
                  className={`border border-[#eadfce] shadow-sm transition-all duration-300 ${isCompleted && !editingScript ? 'rounded-[1.25rem] bg-[#FFEDD5] p-2.5' : 'rounded-[1.75rem] bg-white/70 p-5'}`}
                >
                  <div className={isCompleted && !editingScript ? 'flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between' : 'grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-start'}>
                    <div className={`min-w-0 ${isCompleted && !editingScript ? 'space-y-2' : 'space-y-4'}`}>
                      {isCompleted && !editingScript ? (
                        <p className="truncate px-2 text-sm font-black text-[#2f241d]">ช็อต {shot.order_index}</p>
                      ) : (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge
                            variant={shot.shot_type === 'A-Roll' ? 'default' : 'secondary'}
                            className={shot.shot_type === 'A-Roll' ? 'bg-[#8d65e7] text-white' : 'bg-[#c060cc] text-white'}
                          >
                            {getShotTypeLabel(shot.shot_type)}
                          </Badge>
                          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-100">
                            ช็อต {shot.order_index}
                          </span>
                          <span className="rounded-full border border-violet-300/20 bg-[#8d65e7]/16 px-3 py-1 text-xs font-semibold text-[#efe7ff]">
                            {shot.duration_seconds} วินาที
                          </span>
                        </div>
                      )}

                      {isCompleted && !editingScript ? (
                        null
                      ) : editingScript ? (
                        <div className="space-y-3">
                          <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
                            <div className="space-y-2">
                              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">ประเภทช็อต</p>
                              <div className="flex flex-wrap gap-2">
                                {(['A-Roll', 'B-Roll'] as const).map((shotType) => (
                                  <Button
                                    key={shotType}
                                    type="button"
                                    variant={shot.shot_type === shotType ? 'default' : 'outline'}
                                    onClick={() => updateShot(shot.order_index, { shot_type: shotType })}
                                    className={shot.shot_type === shotType ? 'rounded-2xl bg-[#8d65e7] text-white' : 'rounded-2xl border-white/10 bg-white/5 text-slate-100 hover:bg-white/10'}
                                  >
                                    {getShotTypeLabel(shotType)}
                                  </Button>
                                ))}
                              </div>
                            </div>
                            <div className="space-y-2">
                              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">เวลา (วินาที)</p>
                              <Input
                                type="number"
                                min={1}
                                value={shot.duration_seconds}
                                onChange={(event) => updateShot(shot.order_index, { duration_seconds: Math.max(1, Number(event.target.value) || 1) })}
                                className="h-11 rounded-2xl border-white/12 bg-[#2f334b] px-4 text-white"
                              />
                            </div>
                          </div>
                          <div className="rounded-xl bg-[#2f334b] p-4">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">รายละเอียดช็อต</p>
                            <Textarea
                              value={shot.visual_description}
                              onChange={(event) => updateShot(shot.order_index, { visual_description: event.target.value })}
                              className="min-h-24 rounded-xl border-white/12 bg-[#454963] px-4 py-3 text-white"
                              placeholder="อธิบายว่าช็อตนี้ต้องถ่ายอะไร"
                            />
                          </div>
                          <div className="rounded-xl bg-[#8d65e7]/14 p-4">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#e7dcff]">สคริปต์</p>
                            <Textarea
                              value={shot.script_text}
                              onChange={(event) => updateShot(shot.order_index, { script_text: event.target.value })}
                              className="min-h-24 rounded-xl border-white/12 bg-[#454963] px-4 py-3 text-white"
                              placeholder="สิ่งที่พูดหรือใจความของช็อตนี้"
                            />
                          </div>
                          <div className="rounded-xl bg-emerald-400/10 p-4">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-100">Text on video</p>
                            <Textarea
                              value={shot.on_screen_text || ''}
                              onChange={(event) => updateShot(shot.order_index, { on_screen_text: event.target.value })}
                              className="min-h-20 rounded-xl border-emerald-300/20 bg-[#454963] px-4 py-3 text-emerald-50"
                              placeholder="ข้อความสั้นที่จะขึ้นบนวิดีโอ / ใช้ทำ .srt"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="rounded-xl border border-[#eadfce] bg-white/70 p-4">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">รายละเอียดช็อต</p>
                            <p className="text-base leading-7 text-white">{shot.visual_description}</p>
                          </div>
                          <div className="rounded-xl border border-[#eadfce] bg-[#fffaf1] p-4">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#e7dcff]">สคริปต์</p>
                            <p className="text-base leading-7 text-slate-100">{shot.script_text}</p>
                          </div>
                          {shot.on_screen_text?.trim() ? (
                            <div className="rounded-xl border border-[#eadfce] bg-white/70 p-4">
                              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-100">Text on video</p>
                              <p className="text-base font-semibold leading-7 text-emerald-50">{shot.on_screen_text.trim()}</p>
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>
                    <div className={`flex w-full lg:sticky lg:top-24 ${isCompleted && !editingScript ? 'flex-row flex-wrap gap-1.5 sm:w-auto sm:justify-end' : 'flex-col gap-2'}`}>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => toggleShotCompleted(shot.order_index)}
                        className={`inline-flex cursor-pointer items-center justify-center rounded-2xl border font-bold transition-all duration-300 active:scale-[0.98] ${isCompleted && !editingScript ? 'min-h-9 w-auto min-w-0 px-3 py-1.5 text-xs' : 'min-h-14 w-full min-w-[180px] px-6 py-4 text-base sm:w-auto'} ${
                          isCompleted
                            ? 'border-[#eadfce] bg-white text-[#5f5148] shadow-sm'
                            : 'border-[#eadfce] bg-[#fff0dc] text-[#8b3d18] hover:bg-[#ffe1b8]'
                        }`}
                      >
                        {isCompleted ? 'ยกเลิกว่าถ่ายเสร็จแล้ว' : 'ถ่ายเสร็จแล้ว'}
                      </Button>
                      {!editingScript && shotVideos.length > 0 ? (
                        <div className={`flex ${isCompleted && !editingScript ? 'flex-row flex-wrap gap-1.5' : 'flex-col gap-2'}`}>
                          {shotVideos.map((video, index) => (
                            <Button
                              key={video.id}
                              type="button"
                              onClick={() => { void handleDownloadSingleClip(video, activeProjectVideos); }}
                              disabled={downloadingVideoId === video.id}
                              className={`${isCompleted && !editingScript ? 'min-h-9 w-auto min-w-0 px-3 py-1.5 text-xs' : 'min-h-11 w-full min-w-[180px] px-4 text-sm sm:w-auto'} rounded-2xl border border-[#eadfce] bg-white font-bold text-[#5f5148] shadow-sm hover:bg-[#fff7e8] disabled:opacity-50`}
                            >
                              {downloadingVideoId === video.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                              ดาวน์โหลดคลิป {shotVideos.length > 1 ? index + 1 : ''}
                            </Button>
                          ))}
                        </div>
                      ) : null}
                      {editingScript ? (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => deleteShot(shot.order_index)}
                          disabled={sortedShots.length <= 1}
                          className="inline-flex min-h-12 w-full min-w-[180px] cursor-pointer items-center justify-center rounded-2xl border border-red-300/20 bg-red-500/20 px-6 py-3 text-sm font-bold text-red-50 transition-all duration-300 hover:bg-red-500/28 disabled:opacity-40 sm:w-auto"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          ลบช็อต
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
            {onStartProduction ? (
              <div className="rounded-[1.5rem] border border-emerald-300/20 bg-[#2f334b] p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-lg font-black text-white">พร้อมถ่ายคลิปแล้ว?</p>
                    <p className="mt-1 text-sm leading-6 text-slate-300">ไปเชื่อมต่อกล้อง เลือกช็อต แล้วถ่ายคลิปตามสคริปต์นี้ได้ทันที</p>
                  </div>
                  <Button
                    type="button"
                    onClick={onStartProduction}
                    className="min-h-13 rounded-2xl bg-gradient-to-r from-[#97C7FF] via-[#D2E6FF] to-[#97C7FF] px-6 text-base font-black text-[#182032] shadow-lg shadow-emerald-950/20 hover:opacity-95"
                  >
                    <Camera className="mr-2 h-5 w-5" />
                    เชื่อมต่อกับกล้อง เพื่อถ่ายคลิป
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto mt-5 max-w-6xl space-y-5 animate-in fade-in duration-700 sm:mt-8">
      <div className="grid gap-2 rounded-[2rem] border border-[#eadfce] bg-white/65 p-2 shadow-lg shadow-[#7b4a1e]/8 sm:mx-auto sm:w-fit sm:grid-cols-2 sm:rounded-[2.5rem]">
        <button
          type="button"
          onClick={() => setMode('brief')}
          className={`relative flex min-h-16 w-full items-center gap-3 rounded-[2rem] px-5 text-left transition-all duration-300 ${mode === 'brief'
            ? 'bg-[#FFEDD5] text-[#8b3d18] shadow-md'
            : 'bg-transparent text-[#6a5c51] hover:bg-[#fff7e8]'}`}
        >
          <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${mode === 'brief' ? 'bg-white/70' : 'bg-[#fff3df]'}`}>
            <WandSparkles className="h-5 w-5 sm:h-6 sm:w-6" />
          </span>
          <span className="block text-[1rem] font-bold leading-none sm:text-[1.25rem]">วางแผนทั้งหมด</span>
        </button>

        <button
          type="button"
          onClick={() => setMode('script')}
          className={`relative flex min-h-16 w-full items-center gap-3 rounded-[2rem] px-5 text-left transition-all duration-300 ${mode === 'script'
            ? 'bg-[#FFEDD5] text-[#8b3d18] shadow-md'
            : 'bg-transparent text-[#6a5c51] hover:bg-[#fff7e8]'}`}
        >
          <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${mode === 'script' ? 'bg-white/70' : 'bg-[#fff3df]'}`}>
            <Scissors className="h-5 w-5 sm:h-6 sm:w-6" />
          </span>
          <span className="block text-[1rem] font-bold leading-none sm:text-[1.25rem]">สร้างช็อตลิสต์จากสคริปต์</span>
        </button>
      </div>

      <Card className="overflow-hidden border-white/8 bg-[#6d7189] shadow-2xl shadow-slate-950/20 backdrop-blur-xl">
        <CardHeader className="border-b border-white/8 bg-[#6d7189] px-6 pb-6 pt-6 sm:px-8">
          <CardTitle className="text-3xl font-black tracking-tight text-white sm:text-4xl">
            {mode === 'brief' ? 'กรอกข้อมูลเพื่อสร้างสคริปต์' : 'วางสคริปต์เพื่อสร้างเป็นช็อตลิสต์'}
          </CardTitle>
          <p className="max-w-2xl text-base leading-7 text-slate-300">
            {mode === 'brief'
              ? 'เลือกประเภทคลิป แล้วเติมเรื่องที่อยากพูดให้ชัด ระบบจะช่วยคิดทั้งสคริปต์และสิ่งที่ต้องถ่าย'
              : 'วางสคริปต์ที่มีอยู่แล้ว แล้วให้ระบบช่วยตัดเป็นช็อตที่ถ่ายจริงได้ง่ายขึ้น'}
          </p>
          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <span className={`h-2 w-2 shrink-0 rounded-full ${
              loading ? 'animate-pulse bg-amber-400' :
              apiStatus.kind === 'ready' ? 'bg-emerald-400' :
              apiStatus.kind === 'countdown' ? 'bg-amber-400' :
              'bg-red-400'
            }`} />
            <span className="text-sm font-semibold text-slate-200">
              {loading
                ? 'Gemini API · กำลังสร้าง...'
                : apiStatus.kind === 'ready'
                  ? 'Gemini API · พร้อมใช้งาน'
                  : apiStatus.kind === 'countdown'
                    ? `Gemini API · เกิน limit — ลองใหม่ใน ${apiStatus.seconds} วินาที`
                    : apiStatus.kind === 'daily'
                      ? 'Gemini API · โควต้าหมดวันนี้'
                      : 'Gemini API · เกิดข้อผิดพลาด'}
            </span>
            {apiStatus.kind === 'countdown' ? (
              <button type="button" onClick={cancelRetry} className="text-xs font-semibold text-amber-300 underline underline-offset-2">
                ยกเลิก
              </button>
            ) : null}
          </div>
          {(apiStatus.kind === 'daily' || apiStatus.kind === 'error') ? (
            <p className="max-w-2xl text-sm leading-6 text-red-200">{apiStatus.message}</p>
          ) : null}
        </CardHeader>
        <CardContent className="-mt-3 -mb-3 grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          <div className="rounded-[1.5rem] border border-white/12 bg-[#5c6078] p-4 shadow-lg sm:p-5">
            {mode === 'brief' ? (
              <div className="space-y-6">
                <section className="space-y-5 rounded-[1.25rem] border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#8d65e7]/24 text-sm font-black text-white">1</span>
                    <div>
                      <p className="text-base font-black text-white">คอนเทนต์หลัก</p>
                      <p className="text-sm leading-6 text-slate-200">เลือกแนวคลิปและสิ่งที่ต้องการเล่าให้ชัดก่อน</p>
                    </div>
                  </div>
                  {renderOptionRow({ label: 'ประเภทวิดีโอ', options: topicOptions, value: topic, customValue: customTopic, onSelect: setTopic, onCustomChange: setCustomTopic, customPlaceholder: 'เช่น พาชมห้อง, แต่งหน้าไปเรียน, สรุปข่าวสั้น' })}
                  {renderOptionRow({ label: 'แพลตฟอร์มปลายทาง', options: platformOptions, value: platform, customValue: '', onSelect: setPlatform, onCustomChange: () => {}, customPlaceholder: '', allowCustom: false })}
                  <div className="space-y-3">
                    <p className="text-sm mb-0.5 font-semibold text-slate-100">{topicDetailConfig.label}</p>
                    <p className="text-sm leading-5 text-slate-200">{topicDetailConfig.helper}</p>
                    <Input
                      value={topicDetail}
                      onChange={(e) => setTopicDetail(e.target.value)}
                      placeholder={topicDetailConfig.placeholder}
                      className="h-12 rounded-2xl border-white/12 bg-[#2f334b] px-4 text-white placeholder:text-slate-400 focus-visible:border-[#f0b35a] focus-visible:ring-[#f0b35a]/35"
                    />
                    
                  </div>
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-100">จุดเด่นที่อยากเน้น (USP)</p>
                      <span className="rounded-full border border-white/10 bg-white/8 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-200">Optional</span>
                    </div>
                    <Input
                      value={usp}
                      onChange={(e) => setUsp(e.target.value)}
                      placeholder="เช่น ลดสิวไว, พกพาง่าย, ประหยัดไฟ"
                      className="h-12 rounded-2xl border-white/12 bg-[#2f334b] px-4 text-white placeholder:text-slate-400 focus-visible:border-[#f0b35a] focus-visible:ring-[#f0b35a]/35"
                    />
                  </div>
                </section>

                <section className="space-y-5 rounded-[1.25rem] border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#8d65e7]/24 text-sm font-black text-white">2</span>
                    <div>
                      <p className="text-base font-black text-white">คนดูและน้ำเสียง</p>
                      <p className="text-sm leading-6 text-slate-200">ช่วยให้สคริปต์เลือกคำและจังหวะได้ตรงกลุ่ม</p>
                    </div>
                  </div>
                  {renderOptionRow({ label: 'กลุ่มคนดู', options: audienceOptions, value: audience, customValue: customAudience, onSelect: setAudience, onCustomChange: setCustomAudience, customPlaceholder: 'เช่น เจ้าของร้าน, วัยรุ่น, คนเริ่มเที่ยวเอง' })}
                  {renderOptionRow({ label: 'โทนคลิป', options: toneOptions, value: tone, customValue: customTone, onSelect: setTone, onCustomChange: setCustomTone, customPlaceholder: 'เช่น หรู, ดราม่า, ขี้เล่น, ดูโปร' })}
                </section>

                <div className="space-y-5 rounded-[1.25rem] border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#8d65e7]/24 text-sm font-black text-white">3</span>
                    <div>
                      <p className="text-base font-black text-white">เป้าหมายคลิป</p>
                      <p className="text-sm leading-6 text-slate-200">กำหนดสิ่งที่อยากให้คนดูทำและความยาวโดยรวม</p>
                    </div>
                  </div>
                  {renderOptionRow({ label: 'สิ่งที่อยากให้คนดูทำ (CTA)', options: ctaOptions, value: cta, customValue: customCta, onSelect: setCta, onCustomChange: setCustomCta, customPlaceholder: 'เช่น กด Duet ต่อ, ลองทำแล้วมาเล่าให้ฟัง', allowCustom: true })}
                  <fieldset className="space-y-3">
                    <legend className="text-sm font-semibold text-slate-100">ความยาวคลิปรวม</legend>
                    <div className="flex flex-wrap gap-2">
                      {durationOptions.map((seconds) => (
                        <Button
                          key={seconds}
                          type="button"
                          variant={durationSeconds === seconds ? 'default' : 'outline'}
                          aria-pressed={durationSeconds === seconds}
                          className={durationSeconds === seconds ? 'h-11 rounded-full bg-[#EFD5B6] px-4 text-white shadow-md shadow-cyan-950/20 focus-visible:ring-2 focus-visible:ring-[#f0b35a]/70' : 'h-11 rounded-full border-white/12 bg-[#454963] px-4 text-slate-100 hover:bg-[#50556f] focus-visible:ring-2 focus-visible:ring-[#f0b35a]/70'}
                          onClick={() => setDurationSeconds(seconds)}
                        >
                          {durationSeconds === seconds ? <CheckCircle2 className="mr-2 h-4 w-4" /> : <Clock3 className="mr-2 h-4 w-4" />}
                          {seconds} วินาที
                        </Button>
                      ))}
                    </div>
                  </fieldset>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-slate-100">สคริปต์ของคุณ</p>
                <Textarea
                  value={existingScript}
                  onChange={(e) => setExistingScript(e.target.value)}
                  placeholder="วางสคริปต์ตรงนี้ ระบบจะช่วยตัดช็อตใหม่ให้ดูทันสมัยขึ้น พร้อมบอกว่าแต่ละช็อตควรถ่ายอะไร"
                  className="min-h-56 rounded-[1.5rem] border-white/12 bg-[#2f334b] px-4 py-4 text-white placeholder:text-slate-500"
                />
              </div>
            )}

            {mode === 'script' ? (
              <fieldset className="mt-6 space-y-3">
                <legend className="text-sm font-semibold text-slate-100">ความยาวคลิปรวม</legend>
                <div className="flex flex-wrap gap-2">
                  {durationOptions.map((seconds) => (
                    <Button
                      key={seconds}
                      type="button"
                      variant={durationSeconds === seconds ? 'default' : 'outline'}
                      aria-pressed={durationSeconds === seconds}
                      className={durationSeconds === seconds ? 'h-11 rounded-full bg-[#F6D9B8] px-4 text-white shadow-md shadow-cyan-950/20 focus-visible:ring-2 focus-visible:ring-[#f0b35a]/70' : 'h-11 rounded-full border-white/12 bg-[#454963] px-4 text-slate-100 hover:bg-[#50556f] focus-visible:ring-2 focus-visible:ring-[#f0b35a]/70'}
                      onClick={() => setDurationSeconds(seconds)}
                    >
                      {durationSeconds === seconds ? <CheckCircle2 className="mr-2 h-4 w-4" /> : <Clock3 className="mr-2 h-4 w-4" />}
                      {seconds} วินาที
                    </Button>
                  ))}
                </div>
              </fieldset>
            ) : null}

            <Button
              onClick={handleGenerate}
              disabled={loading || apiStatus.kind === 'countdown' || (mode === 'script' && !existingScript.trim())}
              className="sticky bottom-3 z-20 mt-6 h-13 w-full rounded-2xl bg-[#FFAC6F] px-6 text-base font-bold text-white shadow-lg shadow-[#7b57cf]/20 hover:opacity-95 focus-visible:ring-2 focus-visible:ring-[#f0b35a]/80 sm:static"
            >
              {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Sparkles className="mr-2 h-5 w-5" />}
              {mode === 'brief' ? 'สร้างสคริปต์และช็อตลิสต์' : 'สร้างช็อตลิสต์'}
            </Button>
          </div>

          <div className="rounded-[1.5rem] bg-[#5c6078] p-5 shadow-lg lg:sticky lg:top-24">
            <p className="mb-3 text-xl font-bold tracking-wide text-white">สรุป :</p>
            <div className="flex items-start gap-3 text-base text-white"><Star className="mt-1 h-4 w-4 text-[#dcc8ff]" />{prompt}</div>
            <div className="mt-4 text-sm leading-7 text-slate-300">
              {mode === 'brief' ? (
                <div className="space-y-2">
                  <div className="flex items-start gap-3 text-white"><Captions className="mt-1 h-4 w-4 text-[#f2c7ff]" /> แพลตฟอร์มปลายทาง: {platform}</div>
                  {effectiveDetail ? (
                    <div className="flex items-start gap-3 text-white"><Package2 className="mt-1 h-4 w-4 text-[#f2c7ff]" /> ประเด็นหลักของคลิปนี้: {effectiveDetail}</div>
                  ) : (
                    <div>ยังไม่ได้ใส่รายละเอียดเพิ่ม ระบบจะคิดจากประเภทคลิปและกลุ่มคนดูเป็นหลัก</div>
                  )}
                  {usp.trim() ? <div className="flex items-start gap-3 text-white"><Sparkles className="mt-1 h-4 w-4 text-[#f2c7ff]" /> USP ที่จะเน้น: {usp.trim()}</div> : null}
                  <div className="flex items-start gap-3 text-white"><CheckCircle2 className="mt-1 h-4 w-4 text-[#f2c7ff]" /> CTA: {cta}</div>
                </div>
              ) : (
                <div className="flex items-start gap-3 text-white"><FileText className="mt-1 h-4 w-4 text-[#f2c7ff]" /> ระบบจะอ่านสคริปต์เดิม แล้วแตกเป็นช็อตที่ถ่ายจริงได้ง่ายขึ้น</div>
              )}
              <div className="mt-2 flex items-start gap-3 text-slate-200"><Camera className="mt-1 h-4 w-4 text-[#dcc8ff]" /> แต่ละช็อตจะมีทั้งสิ่งที่ต้องพูด และสิ่งที่ต้องถ่ายแยกกันชัดเจน</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
