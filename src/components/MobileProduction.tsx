import React, { useEffect, useMemo, useRef, useState } from 'react';
import Peer, { type DataConnection } from 'peerjs';
import { GeneratedScript } from '../services/geminiService';
import { getShotTypeLabel } from '../lib/shotLabels';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Camera, CameraOff, CheckCircle2, ChevronDown, CircleStop, Loader2, Mic, PlayCircle, RotateCcw, Smartphone, Wifi, WifiOff, Zap, ZapOff } from 'lucide-react';

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

type SessionPayload = {
  itemId: string;
  title: string;
  prompt: string;
  script: GeneratedScript;
  selectedShotOrder: number | null;
};

type ZoomCapability = {
  min: number;
  max: number;
  step: number;
};

function buildClipFileName(orderIndex: number) {
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '-',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');

  return `${stamp}-shot-${String(orderIndex).padStart(2, '0')}.webm`;
}

function getCameraErrorMessage() {
  if (!window.isSecureContext) {
    return 'เบราว์เซอร์นี้ไม่รับรองการเปิดกล้องจากลิงก์นี้ ต้องเปิดผ่าน https หรือ localhost ที่ปลอดภัยก่อน';
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    return 'เบราว์เซอร์นี้ไม่รองรับการเปิดกล้องหรือเปิดจาก in-app browser ที่จำกัดสิทธิ์';
  }

  return '';
}

function getTrackCapabilities(track: MediaStreamTrack) {
  return ((track as MediaStreamTrack & { getCapabilities?: () => Record<string, any> }).getCapabilities?.() || {}) as Record<string, any>;
}

export default function MobileProduction({ sessionId }: { sessionId: string }) {
  const [connectionStatus, setConnectionStatus] = useState('กำลังเชื่อมกับคอม');
  const [sessionPayload, setSessionPayload] = useState<SessionPayload | null>(null);
  const [selectedShotOrder, setSelectedShotOrder] = useState<number | null>(null);
  const [cameraError, setCameraError] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [lastUploadMessage, setLastUploadMessage] = useState('');
  const [showShotPicker, setShowShotPicker] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [zoomCapability, setZoomCapability] = useState<ZoomCapability | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [autoScroll, setAutoScroll] = useState(false);
  const [scrollSpeed, setScrollSpeed] = useState(20);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const connectionRef = useRef<DataConnection | null>(null);
  const teleprompterRef = useRef<HTMLDivElement | null>(null);

  const stopCurrentStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const applyTrackState = async (track: MediaStreamTrack, nextZoom?: number, nextTorch?: boolean) => {
    const advanced: Record<string, any> = {};
    if (typeof nextZoom === 'number' && zoomCapability) {
      advanced.zoom = Math.min(zoomCapability.max, Math.max(zoomCapability.min, nextZoom));
    }
    if (typeof nextTorch === 'boolean' && torchSupported) {
      advanced.torch = nextTorch;
    }
    if (Object.keys(advanced).length === 0) return;
    await track.applyConstraints({ advanced: [advanced] });
  };

  const setupCamera = async (preferredFacingMode: 'user' | 'environment') => {
    const supportError = getCameraErrorMessage();
    if (supportError) {
      setCameraError(supportError);
      return;
    }

    stopCurrentStream();
    setCameraError('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: preferredFacingMode } },
        audio: true,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      const [videoTrack] = stream.getVideoTracks();
      const capabilities = videoTrack ? getTrackCapabilities(videoTrack) : {};
      if (capabilities.zoom) {
        const nextCapability = {
          min: Number(capabilities.zoom.min ?? 1),
          max: Number(capabilities.zoom.max ?? 1),
          step: Number(capabilities.zoom.step ?? 0.1),
        };
        setZoomCapability(nextCapability);
        setZoomLevel(nextCapability.min);
      } else {
        setZoomCapability(null);
        setZoomLevel(1);
      }

      setTorchSupported(Boolean(capabilities.torch));
      setTorchOn(false);
    } catch (error: any) {
      const message = error?.message || 'เปิดกล้องไม่สำเร็จ';
      if (error?.name === 'NotAllowedError') {
        setCameraError('ยังไม่ได้อนุญาตกล้องหรือไมค์ ให้กดอนุญาตสิทธิ์แล้วเปิดใหม่อีกครั้ง');
      } else if (error?.name === 'NotReadableError') {
        setCameraError('กล้องกำลังถูกใช้งานอยู่ในแอปอื่น หรือระบบล็อกกล้องไว้ชั่วคราว');
      } else {
        setCameraError(message);
      }
    }
  };

  useEffect(() => {
    void setupCamera(facingMode);
    return () => {
      stopCurrentStream();
      recorderRef.current?.stop();
    };
  }, [facingMode]);

  useEffect(() => {
    const peer = new Peer();

    peer.on('open', () => {
      const connection = peer.connect(sessionId, { reliable: true });
      connectionRef.current = connection;
      setConnectionStatus(`กำลังเชื่อมกับคอมผ่าน session ${sessionId}`);

      connection.on('open', () => {
        setConnectionStatus('เชื่อมกับคอมแล้ว');
        connection.send({ type: 'mobile-ready' } satisfies MobileToHostMessage);
      });

      connection.on('data', (payload) => {
        const message = payload as HostToMobileMessage;
        if (message.type === 'session-script') {
          setSessionPayload({
            itemId: message.itemId,
            title: message.title,
            prompt: message.prompt,
            script: message.script,
            selectedShotOrder: message.selectedShotOrder,
          });
          setSelectedShotOrder(message.selectedShotOrder ?? message.script.shots[0]?.order_index ?? null);
        }

        if (message.type === 'select-shot') {
          setSelectedShotOrder(message.orderIndex);
        }
      });

      connection.on('close', () => {
        setConnectionStatus('การเชื่อมต่อกับคอมหลุด');
      });

      connection.on('error', (error) => {
        setConnectionStatus(`เชื่อมต่อไม่สำเร็จ: ${error.message}`);
      });
    });

    peer.on('error', (error) => {
      setConnectionStatus(`เปิดการเชื่อมต่อไม่สำเร็จ: ${error.message}`);
    });

    return () => {
      connectionRef.current?.close();
      peer.destroy();
    };
  }, [sessionId]);

  useEffect(() => {
    if (!autoScroll || !teleprompterRef.current) return;
    const node = teleprompterRef.current;
    const timer = window.setInterval(() => {
      node.scrollTop += scrollSpeed / 10;
      const reachedBottom = node.scrollTop + node.clientHeight >= node.scrollHeight - 6;
      if (reachedBottom) {
        setAutoScroll(false);
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, [autoScroll, scrollSpeed, selectedShotOrder]);

  useEffect(() => {
    if (teleprompterRef.current) {
      teleprompterRef.current.scrollTop = 0;
    }
    setAutoScroll(false);
  }, [selectedShotOrder]);

  const selectedShot = useMemo(() => {
    if (!sessionPayload || selectedShotOrder == null) return null;
    return sessionPayload.script.shots.find((shot) => shot.order_index === selectedShotOrder) || null;
  }, [sessionPayload, selectedShotOrder]);

  const sendMessage = (message: MobileToHostMessage) => {
    const connection = connectionRef.current;
    if (connection?.open) {
      connection.send(message);
    }
  };

  const handleChooseShot = (orderIndex: number) => {
    setSelectedShotOrder(orderIndex);
    setShowShotPicker(false);
    sendMessage({ type: 'active-shot', orderIndex });
  };

  const handleStartRecording = () => {
    const stream = streamRef.current;
    if (!stream || !selectedShot || !sessionPayload) return;

    try {
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ? 'video/webm;codecs=vp9,opus' : 'video/webm',
      });
      recorderRef.current = recorder;
      const startedAt = Date.now();

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        if (!sessionPayload || !selectedShot) return;
        setIsSending(true);
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'video/webm' });
        const buffer = await blob.arrayBuffer();
        const durationMs = Date.now() - startedAt;
        sendMessage({
          type: 'video-upload',
          itemId: sessionPayload.itemId,
          shotOrder: selectedShot.order_index,
          shotType: selectedShot.shot_type,
          durationMs,
          mimeType: recorder.mimeType || 'video/webm',
          fileName: buildClipFileName(selectedShot.order_index),
          createdAt: Date.now(),
          buffer,
        });
        setLastUploadMessage(`ส่งคลิปช็อต ${selectedShot.order_index} กลับเข้าคอมแล้ว`);
        setIsSending(false);

        const sortedShots = sessionPayload.script.shots.slice().sort((a, b) => a.order_index - b.order_index);
        const currentIndex = sortedShots.findIndex((shot) => shot.order_index === selectedShot.order_index);
        const nextShot = sortedShots[currentIndex + 1];
        if (nextShot) {
          setSelectedShotOrder(nextShot.order_index);
          sendMessage({ type: 'active-shot', orderIndex: nextShot.order_index });
        }
      };

      recorder.start();
      setIsRecording(true);
    } catch (error: any) {
      setCameraError(error?.message || 'เริ่มอัดคลิปไม่สำเร็จ');
      sendMessage({ type: 'mobile-error', message: error?.message || 'เริ่มอัดคลิปไม่สำเร็จ' });
    }
  };

  const handleStopRecording = () => {
    recorderRef.current?.stop();
    setIsRecording(false);
  };

  const handleToggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !torchSupported) return;
    const next = !torchOn;
    try {
      await applyTrackState(track, undefined, next);
      setTorchOn(next);
    } catch (error: any) {
      setLastUploadMessage(error?.message || 'เปิดแฟลชไม่สำเร็จ');
    }
  };

  const handleZoomChange = async (direction: 'in' | 'out') => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !zoomCapability) return;
    const delta = direction === 'in' ? zoomCapability.step : -zoomCapability.step;
    const next = Number((zoomLevel + delta).toFixed(2));
    const clamped = Math.min(zoomCapability.max, Math.max(zoomCapability.min, next));
    try {
      await applyTrackState(track, clamped, torchOn);
      setZoomLevel(clamped);
    } catch (error: any) {
      setLastUploadMessage(error?.message || 'ปรับซูมไม่สำเร็จ');
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-black text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(127,90,240,0.16),transparent_30%),linear-gradient(180deg,rgba(8,9,16,0.2),rgba(8,9,16,0.7))]" />

      {cameraError ? (
        <div className="relative z-10 flex min-h-screen items-center justify-center px-5 py-8">
          <div className="w-full max-w-md rounded-[2rem] border border-white/10 bg-[#16192a]/92 p-6 shadow-2xl shadow-black/40 backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-[#bb95ff] p-2 text-[#2a2d40]">
                <CameraOff className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-bold tracking-wide text-[#e7dcff]">เปิดกล้องไม่สำเร็จ</p>
                <p className="text-xl font-black text-white">มือถือเครื่องนี้ยังใช้หน้าถ่ายไม่ได้</p>
              </div>
            </div>

            <div className="mt-5 rounded-[1.5rem] border border-white/10 bg-white/6 p-4 text-sm leading-7 text-slate-200">
              {cameraError}
            </div>

            <div className="mt-4 rounded-[1.5rem] border border-white/10 bg-[#212437] p-4 text-sm leading-7 text-slate-300">
              วิธีแก้ที่มักได้ผล:
              <div>1. เปิดผ่านลิงก์ `https` หรือ URL จาก Vercel</div>
              <div>2. ถ้าเป็น in-app browser ให้ลองเปิดใน Safari หรือ Chrome ตรง ๆ</div>
              <div>3. อนุญาตสิทธิ์กล้องและไมค์ให้เว็บนี้</div>
            </div>
          </div>
        </div>
      ) : (
        <>
          <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 h-full w-full object-cover" />
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-44 bg-gradient-to-b from-black/72 via-black/36 to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-80 bg-gradient-to-t from-black/88 via-black/54 to-transparent" />

          <div className="relative z-20 flex min-h-screen flex-col justify-between px-4 py-5">
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="rounded-[1.25rem] border border-white/10 bg-black/35 px-4 py-3 backdrop-blur-xl">
                  <div className="flex items-center gap-2 text-sm text-slate-200">
                    {connectionRef.current?.open ? <Wifi className="h-4 w-4 text-[#bb95ff]" /> : <WifiOff className="h-4 w-4 text-slate-300" />}
                    {connectionStatus}
                  </div>
                </div>
                {sessionPayload ? (
                  <button
                    type="button"
                    onClick={() => setShowShotPicker((current) => !current)}
                    className="pointer-events-auto inline-flex items-center gap-2 rounded-[1.25rem] border border-white/10 bg-black/35 px-4 py-3 text-sm font-semibold text-white backdrop-blur-xl"
                  >
                    <Smartphone className="h-4 w-4 text-[#bb95ff]" />
                    ช็อต {selectedShotOrder ?? '-'}
                    <ChevronDown className={`h-4 w-4 transition-transform ${showShotPicker ? 'rotate-180' : ''}`} />
                  </button>
                ) : null}
              </div>

              <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-[1.25rem] border border-white/10 bg-black/28 p-2 backdrop-blur-xl">
                <Button type="button" onClick={() => setFacingMode((current) => (current === 'environment' ? 'user' : 'environment'))} className="rounded-full bg-white/10 px-4 text-white hover:bg-white/16">
                  <RotateCcw className="mr-2 h-4 w-4" />
                  สลับกล้อง
                </Button>
                <Button type="button" onClick={handleToggleTorch} disabled={!torchSupported} className="rounded-full bg-white/10 px-4 text-white hover:bg-white/16 disabled:opacity-40">
                  {torchOn ? <ZapOff className="mr-2 h-4 w-4" /> : <Zap className="mr-2 h-4 w-4" />}
                  {torchOn ? 'ปิดแฟลช' : 'เปิดแฟลช'}
                </Button>
                {zoomCapability ? (
                  <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-2 text-sm font-semibold text-white">
                    <button type="button" onClick={() => { void handleZoomChange('out'); }} className="rounded-full bg-white/10 px-2 py-1">-</button>
                    {zoomLevel.toFixed(1)}x
                    <button type="button" onClick={() => { void handleZoomChange('in'); }} className="rounded-full bg-white/10 px-2 py-1">+</button>
                  </div>
                ) : null}
              </div>

              {showShotPicker && sessionPayload ? (
                <div className="pointer-events-auto max-h-72 overflow-auto rounded-[1.5rem] border border-white/10 bg-[#16192a]/88 p-3 shadow-2xl shadow-black/40 backdrop-blur-xl">
                  <div className="mb-3 text-sm font-bold tracking-wide text-[#e7dcff]">เลือกช็อตที่จะถ่าย</div>
                  <div className="space-y-2">
                    {sessionPayload.script.shots.slice().sort((a, b) => a.order_index - b.order_index).map((shot) => {
                      const isActive = selectedShotOrder === shot.order_index;
                      return (
                        <button
                          key={shot.order_index}
                          type="button"
                          onClick={() => handleChooseShot(shot.order_index)}
                          className={`w-full rounded-[1.15rem] border p-3 text-left transition-all ${isActive ? 'border-[#c29aff]/45 bg-[#8d65e7]/18' : 'border-white/10 bg-white/5'}`}
                        >
                          <div className="flex items-center gap-2">
                            <Badge className={shot.shot_type === 'A-Roll' ? 'bg-[#8d65e7] text-white' : 'bg-[#c060cc] text-white'}>
                              {getShotTypeLabel(shot.shot_type)}
                            </Badge>
                            <span className="text-sm font-bold text-white">ช็อต {shot.order_index}</span>
                          </div>
                          <p className="mt-2 text-sm leading-6 text-slate-200">{shot.script_text}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="space-y-4">
              {selectedShot ? (
                <div className="pointer-events-none rounded-[1.75rem] border border-white/10 bg-[#101322]/52 p-4 shadow-2xl shadow-black/40 backdrop-blur-xl">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={selectedShot.shot_type === 'A-Roll' ? 'bg-[#8d65e7] text-white' : 'bg-[#c060cc] text-white'}>
                      {getShotTypeLabel(selectedShot.shot_type)}
                    </Badge>
                    <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1 text-xs font-semibold text-white">
                      ช็อต {selectedShot.order_index}
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1 text-xs font-semibold text-slate-200">
                      {selectedShot.duration_seconds} วินาที
                    </span>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#d9c6ff]">Teleprompt</p>
                    <div className="pointer-events-auto flex items-center gap-2">
                      <Button type="button" onClick={() => setAutoScroll((current) => !current)} className="h-9 rounded-full bg-white/10 px-3 text-white hover:bg-white/16">
                        {autoScroll ? 'หยุดเลื่อน' : 'เลื่อนอัตโนมัติ'}
                      </Button>
                      <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-2 text-xs font-semibold text-white">
                        ช้า
                        <input
                          type="range"
                          min={8}
                          max={40}
                          step={2}
                          value={scrollSpeed}
                          onChange={(event) => setScrollSpeed(Number(event.target.value))}
                          className="pointer-events-auto w-20 accent-[#bb95ff]"
                        />
                        เร็ว
                      </div>
                    </div>
                  </div>

                  <div ref={teleprompterRef} className="mt-3 max-h-48 overflow-y-auto pr-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    <p className="text-[1.15rem] font-medium leading-8 text-white sm:text-[1.25rem]">{selectedShot.script_text}</p>
                  </div>

                  <div className="mt-4 border-t border-white/10 pt-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-300">ต้องถ่ายอะไร</p>
                    <p className="mt-2 text-sm leading-6 text-slate-200">{selectedShot.visual_description}</p>
                  </div>
                </div>
              ) : (
                <div className="rounded-[1.5rem] border border-white/10 bg-[#101322]/52 p-4 text-sm leading-7 text-slate-200 shadow-2xl shadow-black/40 backdrop-blur-xl">
                  รอคอมส่งข้อมูลช็อตเข้ามาอยู่ ถ้าหน้านี้ยังว่าง ลองกดสร้าง QR ใหม่บนคอมอีกครั้ง
                </div>
              )}

              <div className="pointer-events-auto grid grid-cols-[1fr_auto] items-center gap-3 rounded-[2rem] border border-white/10 bg-[#101322]/68 p-3 shadow-2xl shadow-black/40 backdrop-blur-xl">
                <div className="space-y-1 px-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white">
                    <Mic className="h-4 w-4 text-[#bb95ff]" />
                    อัดกล้องและไมค์พร้อมกัน
                  </div>
                  <p className="text-xs leading-6 text-slate-300">
                    {lastUploadMessage || 'กดเริ่มอัดเพื่อถ่ายช็อตนี้ แล้วระบบจะส่งคลิปกลับเข้าคอมอัตโนมัติ'}
                  </p>
                </div>

                <Button
                  type="button"
                  onClick={isRecording ? handleStopRecording : handleStartRecording}
                  disabled={!selectedShot || !!cameraError || isSending}
                  className={`h-20 w-20 rounded-full px-0 text-white shadow-xl ${isRecording ? 'bg-[#c65478] hover:bg-[#d66386]' : 'bg-gradient-to-r from-[#bf6de8] via-[#cc7bc5] to-[#e58a2a] hover:opacity-95'}`}
                >
                  {isSending ? <Loader2 className="h-7 w-7 animate-spin" /> : isRecording ? <CircleStop className="h-8 w-8" /> : <PlayCircle className="h-8 w-8" />}
                </Button>
              </div>

              {isRecording ? (
                <div className="pointer-events-none inline-flex items-center gap-2 rounded-full bg-[#c65478]/82 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-[#c65478]/30 backdrop-blur-xl">
                  <Camera className="h-4 w-4" />
                  กำลังอัดอยู่ กดปุ่มอีกครั้งเพื่อหยุดและส่งคลิป
                </div>
              ) : null}

              {sessionPayload ? (
                <div className="pointer-events-none inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-xs text-slate-200 backdrop-blur-xl">
                  <CheckCircle2 className="h-4 w-4 text-[#bb95ff]" />
                  โปรเจกต์ {sessionPayload.title}
                </div>
              ) : null}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
