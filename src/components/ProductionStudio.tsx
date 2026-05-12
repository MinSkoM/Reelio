import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Peer, { type DataConnection } from 'peerjs';
import QRCode from 'react-qr-code';
import JSZip from 'jszip';
import { GeneratedScript } from '../services/geminiService';
import { getShotTypeLabel } from '../lib/shotLabels';
import { deleteVideo, getVideosByProject, saveVideo, type VideoRecord } from '../lib/db';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { ArrowRight, Download, FolderOpen, Library, QrCode, RefreshCw, Share2, Smartphone, Trash2, Wifi, WifiOff } from 'lucide-react';
import { getProgressSummary, markShotCompleted, SHOT_PROGRESS_EVENT } from '../lib/shotProgress';

type LibraryItem = {
  id: string;
  title: string;
  prompt: string;
  mode: 'brief' | 'script';
  createdAt: string;
  script: GeneratedScript;
};

type HostToMobileMessage =
  | { type: 'session-script'; itemId: string; title: string; prompt: string; script: GeneratedScript; selectedShotOrder: number | null }
  | { type: 'select-shot'; orderIndex: number | null };

type MobileToHostMessage =
  | { type: 'mobile-ready' }
  | { type: 'active-shot'; orderIndex: number | null }
  | {
      type: 'video-upload';
      itemId: string;
      shotOrder: number;
      shotType: 'A-Roll' | 'B-Roll';
      durationMs: number;
      mimeType: string;
      fileName: string;
      createdAt: number;
      buffer: ArrayBuffer;
    }
  | { type: 'mobile-error'; message: string };

const LIBRARY_STORAGE_KEY = 'tudtor-script-library';

function createSessionId() {
  return `pc-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
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

function downloadBlob(content: Blob, fileName: string) {
  const url = URL.createObjectURL(content);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

async function shareBlob(content: Blob, fileName: string, title: string) {
  const file = new File([content], fileName, { type: content.type || 'application/octet-stream' });
  const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean };

  if (typeof nav.share === 'function') {
    try {
      if (!nav.canShare || nav.canShare({ files: [file] })) {
        await nav.share({ title, files: [file] });
        return true;
      }
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        return true;
      }
    }
  }

  return false;
}

export default function ProductionStudio() {
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedShotOrder, setSelectedShotOrder] = useState<number | null>(null);
  const [sessionId, setSessionId] = useState(() => createSessionId());
  const [mobileOrigin, setMobileOrigin] = useState('');
  const [hostStatus, setHostStatus] = useState('กำลังเตรียม QR session');
  const [mobileStatus, setMobileStatus] = useState('ยังไม่มีมือถือเชื่อม');
  const [receivedVideos, setReceivedVideos] = useState<VideoRecord[]>([]);
  const [lastMessage, setLastMessage] = useState('');
  const [progressVersion, setProgressVersion] = useState(0);
  const connectionRef = useRef<DataConnection | null>(null);
  const selectedItemRef = useRef<LibraryItem | null>(null);
  const selectedShotRef = useRef<number | null>(null);

  useEffect(() => {
    setLibraryItems(loadLibrary());
    if (typeof window !== 'undefined') {
      setMobileOrigin(window.location.origin);
    }

    const handleStorage = () => {
      setLibraryItems(loadLibrary());
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  useEffect(() => {
    const refreshProgress = () => setProgressVersion((current) => current + 1);
    window.addEventListener(SHOT_PROGRESS_EVENT, refreshProgress as EventListener);
    window.addEventListener('storage', refreshProgress);
    return () => {
      window.removeEventListener(SHOT_PROGRESS_EVENT, refreshProgress as EventListener);
      window.removeEventListener('storage', refreshProgress);
    };
  }, []);

  const selectedItem = useMemo(
    () => libraryItems.find((item) => item.id === selectedItemId) || libraryItems[0] || null,
    [libraryItems, selectedItemId],
  );

  useEffect(() => {
    if (selectedItem && selectedItemId == null) {
      setSelectedItemId(selectedItem.id);
    }
  }, [selectedItem, selectedItemId]);

  useEffect(() => {
    selectedItemRef.current = selectedItem;
  }, [selectedItem]);

  useEffect(() => {
    selectedShotRef.current = selectedShotOrder;
  }, [selectedShotOrder]);

  const refreshVideosForProject = useCallback(async (projectId: string) => {
    const items = await getVideosByProject(projectId);
    items.sort((a, b) => {
      const shotCompare = Number(a.shotId) - Number(b.shotId);
      if (shotCompare !== 0) return shotCompare;
      return a.createdAt - b.createdAt;
    });
    setReceivedVideos(items);
  }, []);

  useEffect(() => {
    if (!selectedItem) {
      setReceivedVideos([]);
      return;
    }
    void refreshVideosForProject(selectedItem.id);
  }, [refreshVideosForProject, selectedItem]);

  const sendToMobile = useCallback((payload: HostToMobileMessage) => {
    const connection = connectionRef.current;
    if (connection?.open) {
      connection.send(payload);
    }
  }, []);

  const syncScriptToMobile = useCallback(() => {
    const currentItem = selectedItemRef.current;
    if (!currentItem) return;
    sendToMobile({
      type: 'session-script',
      itemId: currentItem.id,
      title: currentItem.title,
      prompt: currentItem.prompt,
      script: currentItem.script,
      selectedShotOrder: selectedShotRef.current,
    });
  }, [sendToMobile]);

  useEffect(() => {
    syncScriptToMobile();
  }, [selectedItem, selectedShotOrder, syncScriptToMobile]);

  useEffect(() => {
    const peer = new Peer(sessionId);
    setHostStatus('กำลังเปิด session บนคอม');
    setMobileStatus('ยังไม่มีมือถือเชื่อม');

    peer.on('open', () => {
      setHostStatus('คอมพร้อมแล้ว สแกน QR จากมือถือได้เลย');
    });

    peer.on('connection', (connection) => {
      if (connectionRef.current && connectionRef.current !== connection) {
        connectionRef.current.close();
      }
      connectionRef.current = connection;
      setMobileStatus('มือถือกำลังเชื่อม');

      connection.on('open', () => {
        setMobileStatus('มือถือเชื่อมแล้ว พร้อมรับช็อต');
        syncScriptToMobile();
      });

      connection.on('data', (payload) => {
        const message = payload as MobileToHostMessage;

        if (message.type === 'mobile-ready') {
          setMobileStatus('มือถือเชื่อมแล้ว พร้อมรับช็อต');
          setLastMessage('มือถือพร้อมทำงานแล้ว');
          syncScriptToMobile();
          return;
        }

        if (message.type === 'active-shot') {
          setSelectedShotOrder(message.orderIndex);
          setLastMessage(message.orderIndex ? `มือถือเลือกช็อต ${message.orderIndex}` : 'มือถือยกเลิกการเลือกช็อต');
          return;
        }

        if (message.type === 'mobile-error') {
          setLastMessage(message.message);
          return;
        }

        if (message.type === 'video-upload') {
          const blob = new Blob([message.buffer], { type: message.mimeType || 'video/webm' });
          void (async () => {
            await saveVideo({
              id: typeof window !== 'undefined' && window.crypto?.randomUUID ? window.crypto.randomUUID() : `video-${Date.now()}`,
              projectId: message.itemId,
              shotId: String(message.shotOrder),
              blob,
              fileName: message.fileName,
              createdAt: message.createdAt,
              durationMs: message.durationMs,
              mimeType: message.mimeType,
              shotType: message.shotType,
            });
            markShotCompleted(message.itemId, message.shotOrder, true);
            await refreshVideosForProject(message.itemId);
            setProgressVersion((current) => current + 1);
            setLastMessage(`รับคลิปช็อต ${message.shotOrder} เข้าคอมแล้ว`);
          })();
        }
      });

      connection.on('close', () => {
        if (connectionRef.current === connection) {
          connectionRef.current = null;
        }
        setMobileStatus('มือถือหลุดการเชื่อมต่อ');
      });

      connection.on('error', (error) => {
        setMobileStatus('การเชื่อมต่อมือถือมีปัญหา');
        setLastMessage(error.message);
      });
    });

    peer.on('error', (error) => {
      setHostStatus('เปิด session ไม่สำเร็จ');
      setLastMessage(error.message);
    });

    return () => {
      connectionRef.current?.close();
      connectionRef.current = null;
      peer.destroy();
    };
  }, [refreshVideosForProject, sessionId, syncScriptToMobile]);

  const sessionUrl = useMemo(() => {
    if (!mobileOrigin) return '';
    const normalizedOrigin = mobileOrigin.trim().replace(/\/$/, '');
    return `${normalizedOrigin}/?mode=mobile&session=${encodeURIComponent(sessionId)}`;
  }, [mobileOrigin, sessionId]);

  const shotCounts = useMemo(() => {
    return receivedVideos.reduce<Record<string, number>>((accumulator, video) => {
      accumulator[video.shotId] = (accumulator[video.shotId] || 0) + 1;
      return accumulator;
    }, {});
  }, [receivedVideos]);

  const selectedProgress = useMemo(() => {
    if (!selectedItem) return { completed: 0, total: 0, percent: 0 };
    return getProgressSummary(selectedItem.id, selectedItem.script.shots.length);
  }, [selectedItem, progressVersion, receivedVideos.length]);

  const handleSelectShot = (orderIndex: number) => {
    const next = selectedShotOrder === orderIndex ? null : orderIndex;
    setSelectedShotOrder(next);
    sendToMobile({ type: 'select-shot', orderIndex: next });
  };

  const handleResetSession = () => {
    setSessionId(createSessionId());
    setLastMessage('สร้าง session ใหม่แล้ว');
  };

  const handleDeleteVideo = async (id: string) => {
    await deleteVideo(id);
    if (selectedItem) {
      await refreshVideosForProject(selectedItem.id);
    }
  };

  const buildZipBlob = async () => {
    if (!selectedItem || receivedVideos.length === 0) return null;

    const zip = new JSZip();
    const manifest = [
      `โปรเจกต์: ${selectedItem.title}`,
      `สร้างเมื่อ: ${new Date().toLocaleString('th-TH')}`,
      '',
    ];

    receivedVideos.forEach((video, index) => {
      const extension = video.mimeType?.includes('mp4') ? 'mp4' : 'webm';
      const shotNumber = String(video.shotId).padStart(2, '0');
      const fileName = `shot-${shotNumber}.${extension}`;
      zip.file(fileName, video.blob);
      manifest.push(`${fileName} | shot ${video.shotId} | ${video.shotType ? getShotTypeLabel(video.shotType) : 'คลิป'}`);
    });

    zip.file('manifest.txt', manifest.join('\n'));
    const blob = await zip.generateAsync({ type: 'blob' });
    return { blob, fileName: `${buildExportFileBase()}-production-clips.zip` };
  };

  const handleExportZip = async () => {
    const result = await buildZipBlob();
    if (!result) return;
    downloadBlob(result.blob, result.fileName);
  };

  const handleShareZip = async () => {
    const result = await buildZipBlob();
    if (!result) return;
    const shared = await shareBlob(result.blob, result.fileName, 'Production clips');
    if (!shared) {
      downloadBlob(result.blob, result.fileName);
    }
  };

  const handleShareVideo = async (video: VideoRecord) => {
    const shared = await shareBlob(video.blob, video.fileName, `Shot ${video.shotId}`);
    if (!shared) {
      downloadBlob(video.blob, video.fileName);
    }
  };


  return (
    <div className="mx-auto mt-6 max-w-6xl space-y-5 animate-in fade-in duration-500 sm:mt-8">
      <Card className="overflow-hidden border-white/8 bg-[#6d7189] shadow-2xl shadow-slate-950/20 backdrop-blur-xl">
        <CardHeader className="space-y-4 border-b border-white/8 bg-[#6d7189] px-6 pb-6 pt-6 sm:px-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold tracking-wide text-[#e7dcff]">PC Control Center</p>
              <CardTitle className="mt-4 text-3xl font-black tracking-tight text-white sm:text-4xl">เชื่อมมือถือเพื่อถ่ายช็อตแล้วส่งกลับเข้าคอม</CardTitle>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={handleResetSession}
              className="rounded-2xl border-[#a98eff]/20 bg-[#8d65e7]/16 px-4 text-[#efe7ff] hover:bg-[#8d65e7]/24"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              สร้าง QR ใหม่
            </Button>
          </div>
          <p className="max-w-3xl text-base leading-7 text-slate-200">
            เลือกงานจากคลัง แล้วให้คอมสร้าง QR สำหรับเปิดหน้าถ่ายบนมือถือ เมื่อถ่ายเสร็จ คลิปจะถูกส่งกลับมาที่คอมและเรียงตามเลขช็อตให้ทันที
          </p>
        </CardHeader>

        <CardContent className="grid gap-4 p-4 sm:gap-6 sm:p-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4 rounded-[1.5rem] border border-white/10 bg-[#5c6078] p-5 shadow-lg">
            <div className="flex items-center gap-2 text-white">
              <Library className="h-5 w-5 text-[#dcc8ff]" />
              <h3 className="text-xl font-bold">1. เลือกงานจากคลัง</h3>
            </div>

            {libraryItems.length === 0 ? (
              <div className="rounded-[1.25rem] border border-white/10 bg-white/5 p-4 text-slate-200">
                ยังไม่มีงานในคลัง ให้กลับไปสร้างสคริปต์หรือช็อตลิสต์ก่อน แล้วงานจะมาอยู่ตรงนี้อัตโนมัติ
              </div>
            ) : (
              <div className="space-y-3">
                {libraryItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedItemId(item.id)}
                    className={`w-full rounded-[1.25rem] border p-4 text-left transition-all duration-300 ${selectedItem?.id === item.id ? 'border-[#b48cff]/40 bg-[#8d65e7]/16 text-white' : 'border-white/10 bg-white/5 text-slate-100 hover:bg-white/10'}`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="bg-[#8d65e7] text-white">{item.mode === 'brief' ? 'สคริปต์พร้อมช็อต' : 'แตกจากสคริปต์'}</Badge>
                      <span className="text-xs text-slate-300">{new Date(item.createdAt).toLocaleString('th-TH')}</span>
                    </div>
                    <p className="mt-2 text-lg font-bold">{item.title}</p>
                    <p className="mt-1 text-sm leading-6 text-slate-300">{item.prompt}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-4 rounded-[1.5rem] border border-white/10 bg-[#5c6078] p-5 shadow-lg">
            <div className="flex items-center gap-2 text-white">
              <QrCode className="h-5 w-5 text-[#dcc8ff]" />
              <h3 className="text-xl font-bold">2. สแกน QR จากมือถือ</h3>
            </div>
            <div className="grid gap-4 md:grid-cols-[220px_1fr] md:items-center">
              <div className="mx-auto w-fit rounded-[1.5rem] bg-white p-4">
                {sessionUrl ? <QRCode value={sessionUrl} size={188} className="h-auto w-full" /> : null}
              </div>
              <div className="space-y-3 text-slate-200">
                <div className="inline-flex items-center gap-2 rounded-full bg-[#2f334b] px-4 py-2 text-sm font-semibold text-white">
                  <Wifi className="h-4 w-4 text-[#b995ff]" />
                  {hostStatus}
                </div>
                <div className="inline-flex items-center gap-2 rounded-full bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200">
                  {connectionRef.current?.open ? <Smartphone className="h-4 w-4 text-[#b995ff]" /> : <WifiOff className="h-4 w-4 text-slate-300" />}
                  {mobileStatus}
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-white">ลิงก์สำหรับมือถือ</p>
                  <Input
                    value={mobileOrigin}
                    onChange={(event) => setMobileOrigin(event.target.value)}
                    placeholder="เช่น https://your-app.vercel.app หรือ http://192.168.x.x:3000"
                    className="h-12 rounded-2xl border-white/12 bg-[#2f334b] px-4 text-white placeholder:text-slate-500"
                  />
                  <p className="text-xs leading-6 text-slate-300">
                    ถ้าเปิดจาก <code>localhost</code> บนคอม มือถือจะสแกนแล้วเข้าไม่ได้ ให้ใส่ URL ที่มือถือเปิดถึงจริง เช่นโดเมนบน Vercel หรือ IP ในวง LAN
                  </p>
                  <p className="break-all rounded-2xl bg-[#2f334b] px-4 py-3 text-xs leading-6 text-slate-300">{sessionUrl || 'ยังไม่มีลิงก์ session'}</p>
                </div>
                {lastMessage ? <p className="text-sm text-[#efe7ff]">สถานะล่าสุด: {lastMessage}</p> : null}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {selectedItem ? (
        <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          <Card className="overflow-hidden border-white/8 bg-[#6d7189] shadow-2xl shadow-slate-950/20 backdrop-blur-xl">
            <CardHeader className="border-b border-white/8 bg-[#6d7189] px-6 pb-6 pt-6 sm:px-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold tracking-wide text-[#e7dcff]">3. เลือกช็อตที่จะถ่าย</p>
                  <CardTitle className="text-2xl font-black tracking-tight text-white">{selectedItem.title}</CardTitle>
                </div>
                
              </div>
              <p className="max-w-3xl text-base leading-7 text-slate-200">{selectedItem.prompt}</p>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-200">
                  <span>ถ่ายแล้ว {selectedProgress.completed}/{selectedProgress.total} ช็อต</span>
                  <span>{selectedProgress.percent}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-black/20">
                  <div className="h-full rounded-full bg-gradient-to-r from-[#a661d6] via-[#8d65e7] to-[#6d66da] transition-all duration-500" style={{ width: `${selectedProgress.percent}%` }} />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 p-6 sm:p-8">
              {selectedItem.script.shots
                .slice()
                .sort((a, b) => a.order_index - b.order_index)
                .map((shot) => {
                  const isActive = selectedShotOrder === shot.order_index;
                  const count = shotCounts[String(shot.order_index)] || 0;
                  const isCompleted = count > 0;
                  return (
                    <button
                      key={shot.order_index}
                      type="button"
                      onClick={() => handleSelectShot(shot.order_index)}
                      className={`w-full rounded-[1.5rem] border p-4 text-left transition-all duration-300 ${isCompleted ? 'border-white/10 bg-[#565b72] opacity-75' : isActive ? 'border-[#c29aff]/40 bg-[#8d65e7]/16' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge className={shot.shot_type === 'A-Roll' ? 'bg-[#8d65e7] text-white' : 'bg-[#c060cc] text-white'}>
                              {getShotTypeLabel(shot.shot_type)}
                            </Badge>
                            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-100">
                              ช็อต {shot.order_index}
                            </span>
                            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${isCompleted ? 'border-white/10 bg-black/20 text-white' : 'border-white/10 bg-white/5 text-slate-200'}`}>
                              {isCompleted ? 'ถ่ายแล้ว' : `รับคลิปแล้ว ${count} ไฟล์`}
                            </span>
                          </div>
                          <p className="text-base leading-7 text-white">{shot.script_text}</p>
                          <p className="text-sm leading-6 text-slate-300">{shot.visual_description}</p>
                        </div>
                        <div className="inline-flex items-center gap-2 rounded-full bg-[#2f334b] px-4 py-2 text-sm font-semibold text-white">
                          <ArrowRight className="h-4 w-4 text-[#b995ff]" />
                          {isActive ? 'กำลังเลือกช็อตนี้' : 'กดเพื่อเลือกช็อตนี้'}
                        </div>
                      </div>
                    </button>
                  );
                })}
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-white/8 bg-[#6d7189] shadow-2xl shadow-slate-950/20 backdrop-blur-xl">
            <CardHeader className="border-b border-white/8 bg-[#6d7189] px-6 pb-6 pt-6 sm:px-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold tracking-wide text-[#e7dcff]">4. คลิปที่รับกลับมาบนคอม</p>
                  <CardTitle className="text-2xl font-black tracking-tight text-white">เรียงตามเลขช็อตและพร้อม export</CardTitle>
                </div>
                <Button
                  type="button"
                  onClick={handleExportZip}
                  disabled={receivedVideos.length === 0}
                  className="rounded-2xl bg-gradient-to-r from-[#bf6de8] via-[#cc7bc5] to-[#e58a2a] px-4 text-white hover:opacity-95"
                >
                  <Download className="mr-2 h-4 w-4" />
                  Export ZIP
                </Button>
                <Button
                  type="button"
                  onClick={() => { void handleShareZip(); }}
                  disabled={receivedVideos.length === 0}
                  className="rounded-2xl border border-white/10 bg-[#2f334b] px-4 text-white hover:bg-[#3b4057]"
                >
                  <Share2 className="mr-2 h-4 w-4" />
                  Share file
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 p-6 sm:p-8">
              {receivedVideos.length === 0 ? (
                <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4 text-slate-200">
                  ยังไม่มีคลิปถูกส่งเข้ามา ลองสแกน QR บนมือถือ เลือกช็อต แล้วอัดคลิปจากหน้านั้น
                </div>
              ) : (
                receivedVideos.map((video, index) => (
                  <div key={video.id} className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4 text-slate-100">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className="bg-[#8d65e7] text-white">ช็อต {video.shotId}</Badge>
                          {video.shotType ? <Badge className="bg-[#c060cc] text-white">{getShotTypeLabel(video.shotType)}</Badge> : null}
                          <span className="rounded-full border border-white/10 bg-[#2f334b] px-3 py-1 text-xs text-slate-200">ลำดับไฟล์ {index + 1}</span>
                        </div>
                        <p className="text-base font-semibold text-white">{video.fileName}</p>
                        <p className="text-sm text-slate-300">
                          {new Date(video.createdAt).toLocaleString('th-TH')}
                          {video.durationMs ? ` · ${Math.round(video.durationMs / 100) / 10} วินาที` : ''}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          onClick={() => downloadBlob(video.blob, video.fileName)}
                          className="rounded-2xl border border-white/10 bg-[#2f334b] px-4 text-white hover:bg-[#3b4057]"
                        >
                          <Download className="mr-2 h-4 w-4" />
                          ดาวน์โหลดไฟล์นี้
                        </Button>
                        <Button
                          type="button"
                          onClick={() => { void handleShareVideo(video); }}
                          className="rounded-2xl border border-white/10 bg-[#8d65e7]/18 px-4 text-white hover:bg-[#8d65e7]/26"
                        >
                          <Share2 className="mr-2 h-4 w-4" />
                          Share file
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => { void handleDeleteVideo(video.id); }}
                          className="rounded-2xl border-white/10 bg-white/5 px-4 text-slate-100 hover:bg-white/10"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          ลบ
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
