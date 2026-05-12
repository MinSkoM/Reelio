import { useEffect, useMemo, useRef, useState } from 'react';
import Peer, { type DataConnection } from 'peerjs';
import type { GeneratedScript } from '../services/geminiService';
import { RotateCcw, CameraOff, Loader2, ChevronDown, Square, Zap, ZapOff } from 'lucide-react';

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

const RECORDER_MIME_TYPES = [
  'video/mp4;codecs=h264,aac',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4',
];

const MOCK_SESSION_PAYLOAD: SessionPayload = {
  itemId: 'mock-mobile-preview',
  title: 'Mock Mobile Preview',
  prompt: 'ใช้ดู UI กล้องแบบ mock โดยไม่ต้องเชื่อม session จริง',
  selectedShotOrder: 1,
  script: {
    title: 'Mock Mobile Preview',
    caption: 'Mock caption สำหรับดูตำแหน่งปุ่มและ teleprompter บนหน้ามือถือ',
    shots: [
      {
        order_index: 1,
        shot_type: 'A-Roll',
        script_text: 'ลองอ่านข้อความนี้เพื่อเช็กว่าตัว teleprompt ใหญ่พอ อ่านง่ายพอ และอยู่ตรงกลางจอเหมาะกับเวลาถือมือถือถ่ายจริงหรือยัง',
        visual_description: 'กล้องเต็มจอ พื้นหลังดำ เน้นดูความชัดของตัวหนังสือและตำแหน่งปุ่มอัดด้านล่าง',
        duration_seconds: 6,
      },
      {
        order_index: 2,
        shot_type: 'B-Roll',
        script_text: 'ช็อตนี้ใช้ดูแถบซูม ปุ่มสลับกล้อง และปุ่มแฟลช ว่าจัดวางแล้วไม่บังมือเวลาจะกดอัดจริง',
        visual_description: 'เช็กตำแหน่งคอนโทรลด้านล่าง และลองเปิดแผงเลือกช็อตว่าดูง่ายบนมือถือหรือไม่',
        duration_seconds: 6,
      },
    ],
  },
};

function buildClipFileName(orderIndex: number, mimeType: string) {
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
  const extension = mimeType.includes('mp4') ? 'mp4' : 'webm';
  return `${stamp}-shot-${String(orderIndex).padStart(2, '0')}.${extension}`;
}

function getCameraErrorMessage() {
  if (!window.isSecureContext) {
    return 'เบราว์เซอร์นี้ไม่รับรองการเปิดกล้องจากลิงก์นี้ ต้องเปิดผ่าน https หรือ localhost ที่ปลอดภัยก่อน';
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    return 'เบราว์เซอร์นี้ไม่รองรับการเปิดกล้อง หรือกำลังเปิดจาก in-app browser ที่จำกัดสิทธิ์';
  }

  return '';
}

function getTrackCapabilities(track: MediaStreamTrack) {
  return ((track as MediaStreamTrack & { getCapabilities?: () => Record<string, unknown> }).getCapabilities?.() || {}) as Record<string, unknown>;
}

function getSupportedRecorderMimeType() {
  for (const mimeType of RECORDER_MIME_TYPES) {
    if ((window as typeof window & { MediaRecorder?: typeof MediaRecorder }).MediaRecorder?.isTypeSupported?.(mimeType)) {
      return mimeType;
    }
  }
  return '';
}

function isMp4MimeType(mimeType: string) {
  return mimeType.toLowerCase().includes('mp4');
}

export default function MobileProduction({ sessionId, mock = false }: { sessionId: string; mock?: boolean }) {
  const [connectionStatus, setConnectionStatus] = useState(mock ? 'Mock mode พร้อมดู UI โดยไม่เชื่อมคอม' : 'กำลังเชื่อมกับคอม');
  const [sessionPayload, setSessionPayload] = useState<SessionPayload | null>(mock ? MOCK_SESSION_PAYLOAD : null);
  const [selectedShotOrder, setSelectedShotOrder] = useState<number | null>(mock ? 1 : null);
  const [cameraError, setCameraError] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [lastUploadMessage, setLastUploadMessage] = useState(mock ? 'เปิดดูหน้า MobileProduction แบบ mock ได้เลย' : '');
  const [showShotPicker, setShowShotPicker] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [zoomCapability, setZoomCapability] = useState<ZoomCapability | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [autoScroll, setAutoScroll] = useState(false);
  const [scrollSpeed, setScrollSpeed] = useState(20);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [countdownEnabled, setCountdownEnabled] = useState(true);
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
    const advanced: Record<string, unknown> = {};
    if (typeof nextZoom === 'number' && zoomCapability) {
      advanced.zoom = Math.min(zoomCapability.max, Math.max(zoomCapability.min, nextZoom));
    }
    if (typeof nextTorch === 'boolean' && torchSupported) {
      advanced.torch = nextTorch;
    }
    if (Object.keys(advanced).length === 0) return;
    await track.applyConstraints({ advanced: [advanced] as MediaTrackConstraintSet[] });
  };

  const setupCamera = async (preferredFacingMode: 'user' | 'environment') => {
    if (mock) {
      stopCurrentStream();
      setCameraError('');
      setTorchSupported(false);
      setTorchOn(false);
      setZoomCapability(null);
      setZoomLevel(1);
      return;
    }

    const supportError = getCameraErrorMessage();
    if (supportError) {
      setCameraError(supportError);
      return;
    }

    stopCurrentStream();
    setCameraError('');
    setTorchOn(false);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: preferredFacingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          aspectRatio: { ideal: 16 / 9 },
          frameRate: { ideal: 25, max: 30 },
        },
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
          min: Number((capabilities.zoom as { min?: number }).min ?? 1),
          max: Number((capabilities.zoom as { max?: number }).max ?? 1),
          step: Number((capabilities.zoom as { step?: number }).step ?? 0.1),
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
      if (error?.name === 'NotAllowedError') {
        setCameraError('ยังไม่ได้อนุญาตกล้องหรือไมค์ ให้กดอนุญาตสิทธิ์แล้วเปิดใหม่อีกครั้ง');
      } else if (error?.name === 'NotReadableError') {
        setCameraError('กล้องกำลังถูกใช้งานอยู่ในแอปอื่น หรือระบบล็อกกล้องไว้ชั่วคราว');
      } else {
        setCameraError(error?.message || 'เปิดกล้องไม่สำเร็จ');
      }
    }
  };

  useEffect(() => {
    void setupCamera(facingMode);
    return () => {
      stopCurrentStream();
      recorderRef.current?.stop();
    };
  }, [facingMode, mock]);

  useEffect(() => {
    if (mock) {
      setConnectionStatus('Mock mode พร้อมดู UI โดยไม่เชื่อมคอม');
      return;
    }

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
  }, [mock, sessionId]);

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

  useEffect(() => {
    if (countdown == null) return;
    if (countdown <= 0) {
      setCountdown(null);
      void startActualRecording();
      return;
    }

    const timer = window.setTimeout(() => {
      setCountdown((current) => (current == null ? null : current - 1));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [countdown]);

  const selectedShot = useMemo(() => {
    if (!sessionPayload || selectedShotOrder == null) return null;
    return sessionPayload.script.shots.find((shot) => shot.order_index === selectedShotOrder) || null;
  }, [sessionPayload, selectedShotOrder]);

  const sendMessage = (message: MobileToHostMessage) => {
    if (mock) return;
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

  const startActualRecording = async () => {
    if (mock) {
      setIsRecording(true);
      setLastUploadMessage('Mock mode: จำลองเริ่มอัดคลิปแล้ว');
      window.setTimeout(() => {
        setIsRecording(false);
        setLastUploadMessage(`Mock mode: จำลองถ่ายช็อต ${selectedShot?.order_index ?? '-'} เสร็จแล้ว`);
      }, 1200);
      return;
    }

    const stream = streamRef.current;
    if (!stream || !selectedShot || !sessionPayload) return;

    try {
      chunksRef.current = [];
      const supportedMimeType = getSupportedRecorderMimeType();
      const recorder = supportedMimeType ? new MediaRecorder(stream, { mimeType: supportedMimeType }) : new MediaRecorder(stream);
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
        const mimeType = recorder.mimeType || supportedMimeType || 'video/webm';
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const buffer = await blob.arrayBuffer();
        const durationMs = Date.now() - startedAt;

        sendMessage({
          type: 'video-upload',
          itemId: sessionPayload.itemId,
          shotOrder: selectedShot.order_index,
          shotType: selectedShot.shot_type,
          durationMs,
          mimeType,
          fileName: buildClipFileName(selectedShot.order_index, mimeType),
          createdAt: Date.now(),
          buffer,
        });

        setLastUploadMessage(isMp4MimeType(mimeType) ? `ส่งคลิปช็อต ${selectedShot.order_index} กลับเข้าคอมแล้ว (MP4)` : `ส่งคลิปช็อต ${selectedShot.order_index} กลับเข้าคอมแล้ว แต่เครื่องนี้อัดได้เป็น ${mimeType}`);
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
      setLastUploadMessage(isMp4MimeType(recorder.mimeType || supportedMimeType || '') ? 'กำลังอัดคลิปอยู่ (MP4)' : `กำลังอัดคลิปอยู่ (${recorder.mimeType || supportedMimeType || 'video/webm'})`);
    } catch (error: any) {
      setCameraError(error?.message || 'เริ่มอัดคลิปไม่สำเร็จ');
      sendMessage({ type: 'mobile-error', message: error?.message || 'เริ่มอัดคลิปไม่สำเร็จ' });
    }
  };

  const handleStartRecording = () => {
    if ((!streamRef.current && !mock) || !selectedShot || !sessionPayload || isSending || isRecording) return;
    if (countdownEnabled) {
      setLastUploadMessage('เตรียมเริ่มอัดใน 3 วินาที');
      setCountdown(3);
      return;
    }

    void startActualRecording();
  };

  const handleStopRecording = () => {
    if (mock) {
      setIsRecording(false);
      setLastUploadMessage('Mock mode: หยุดการจำลองอัดคลิปแล้ว');
      return;
    }
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

  const handleZoomRangeChange = async (value: number) => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !zoomCapability) return;
    try {
      await applyTrackState(track, value, torchOn);
      setZoomLevel(value);
    } catch (error: any) {
      setLastUploadMessage(error?.message || 'ปรับซูมไม่สำเร็จ');
    }
  };

  return (
    <div className="relative min-h-[100svh] overflow-hidden bg-black text-white">
      {cameraError ? (
        <div className="relative z-50 flex min-h-[100svh] items-center justify-center px-5">
          <div className="w-full max-w-md rounded-[2.5rem] border border-white/20 bg-black/80 p-8 backdrop-blur-2xl">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="rounded-full bg-red-500/20 p-4 text-red-400">
                <CameraOff className="h-8 w-8" />
              </div>
              <h2 className="text-2xl font-bold">ไม่สามารถเข้าถึงกล้องได้</h2>
              <p className="text-sm text-slate-400">{cameraError}</p>
              <div className="mt-4 w-full space-y-2 rounded-2xl bg-white/5 p-4 text-left text-xs text-slate-300">
                <p>• ตรวจสอบการเชื่อมต่อ https</p>
                <p>• ลองเปิดใน Safari หรือ Chrome</p>
                <p>• ตรวจสอบการอนุญาตสิทธิ์กล้อง</p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          {!mock ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              pointer-events-none
              className={`absolute inset-0 h-full w-full object-cover ${facingMode === 'user' ? '-scale-x-100' : ''}`}
            />
          ) : (
            <div className="absolute inset-0 bg-black" />
          )}

          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-black/70" />

          <div className="relative z-20 flex min-h-[100svh] flex-col justify-between px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))]">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1.5 backdrop-blur-md">
                <div className={`h-2 w-2 rounded-full ${mock || connectionRef.current?.open ? 'animate-pulse bg-green-400' : 'bg-red-400'}`} />
                <span className="text-[10px] font-medium uppercase tracking-wider text-white/80">{connectionStatus}</span>
              </div>

              {sessionPayload ? (
                <button
                  type="button"
                  onClick={() => setShowShotPicker((current) => !current)}
                  className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-4 py-1.5 backdrop-blur-md transition active:scale-95"
                >
                  <span className="text-xs font-bold text-[#bb95ff]">SHOT {selectedShotOrder ?? '-'}</span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${showShotPicker ? 'rotate-180' : ''}`} />
                </button>
              ) : null}
            </div>

            {showShotPicker && sessionPayload ? (
              <div className="absolute left-4 right-4 top-16 z-30 max-h-[40vh] overflow-auto rounded-2xl border border-white/10 bg-black/50 p-2 backdrop-blur-xl shadow-2xl">
                <div className="space-y-1">
                  {sessionPayload.script.shots
                    .slice()
                    .sort((a, b) => a.order_index - b.order_index)
                    .map((shot) => (
                      <button
                        key={shot.order_index}
                        type="button"
                        onClick={() => handleChooseShot(shot.order_index)}
                        className={`w-full rounded-2xl p-3 text-left transition-all ${selectedShotOrder === shot.order_index ? 'border border-white/20 bg-[#8d65e7]/35' : 'hover:bg-white/5'}`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black opacity-50">#{shot.order_index}</span>
                          <span className="line-clamp-1 text-xs font-bold">{shot.script_text}</span>
                        </div>
                      </button>
                    ))}
                </div>
              </div>
            ) : null}

            <div className="pointer-events-none flex flex-1 flex-col justify-top px-2 mt-4">
              {selectedShot ? (
                <div className="space-y-5">
                  <div ref={teleprompterRef} className="max-h-[35vh] overflow-y-auto pr-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    <p className="text-center text-[1.5rem] font-bold leading-tight text-white/40 drop-shadow-[0_2px_10px_rgba(0,0,0,0.95)] sm:text-[2.7rem]">
                      {selectedShot.script_text}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="animate-pulse text-center text-sm text-white/40">Waiting for data...</div>
              )}
            </div>

            

            <div className="space-y-4">
              <div className="px-4 flex items-center justify-center gap-4">
                <button
                    type="button"
                    onClick={() => setCountdownEnabled((current) => !current)}
                    className={`rounded-full px-4 py-2 text-xs font-bold transition ${countdownEnabled ? 'bg-[#8d65e7] text-white' : 'bg-white/10 text-white/70'}`}
                  >
                    {countdownEnabled ? 'เปิด countdown 3 วิ' : 'ปิด countdown 3 วิ'}
                  </button>
              </div>
              {zoomCapability ? (
                <div className="px-4">
                  <div className="pointer-events-auto rounded-half border border-white/10 bg-black/20 px-4 py-3 backdrop-blur-md">
                    <div className="mb-2 flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-white/50">
                      <span>Zoom</span>
                      <span>{zoomLevel.toFixed(1)}x</span>
                    </div>
                    <input
                      type="range"
                      min={zoomCapability.min}
                      max={zoomCapability.max}
                      step={zoomCapability.step}
                      value={zoomLevel}
                      onChange={(event) => void handleZoomRangeChange(Number(event.target.value))}
                      className="h-1.5 w-full appearance-none rounded-full bg-white/20 accent-white"
                    />
                  </div>
                </div>
              ) : null}

              <div className="grid grid-cols-3 items-center gap-4 px-2">
                <button
                  type="button"
                  onClick={() => setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))}
                  className="pointer-events-auto flex flex-col items-center gap-1 text-white/70 active:text-white"
                >
                  <div className="rounded-full border border-white/5 bg-black/20 p-3 backdrop-blur-md">
                    <RotateCcw className="h-5 w-5" />
                  </div>
                  <span className="text-[9px] font-bold uppercase">สลับกล้อง</span>
                </button>

                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={isRecording ? handleStopRecording : handleStartRecording}
                    disabled={!selectedShot || !!cameraError || isSending || countdown != null}
                    className={`pointer-events-auto relative flex h-20 w-20 items-center justify-center rounded-full border-4 border-white/20 p-1 transition-all active:scale-90 disabled:opacity-60 ${isRecording ? 'border-red-500/55' : ''}`}
                  >
                    <div className={`flex h-full w-full items-center justify-center rounded-full transition-all ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-white'}`}>
                      {isSending ? (
                        <Loader2 className="h-8 w-8 animate-spin text-black" />
                      ) : isRecording ? (
                        <Square className="h-8 w-8 fill-white text-white" />
                      ) : (
                        <div className="h-6 w-6 rounded-full bg-red-600" />
                      )}
                    </div>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleToggleTorch}
                  disabled={!torchSupported}
                  className={`pointer-events-auto flex flex-col items-center gap-1 transition-opacity ${torchOn ? 'text-yellow-400' : 'text-white/70'} disabled:opacity-25`}
                >
                  <div className="rounded-full border border-white/5 bg-black/20 p-3 backdrop-blur-md">
                    {torchOn ? <Zap className="h-5 w-5 fill-current" /> : <ZapOff className="h-5 w-5" />}
                  </div>
                  <span className="text-[9px] font-bold uppercase">{torchOn ? 'ปิดแฟลช' : 'เปิดแฟลช'}</span>
                </button>
              </div>

              <div className="space-y-1 text-center">
                <p className="text-xs text-white/75">{countdown != null ? `เริ่มอัดใน ${countdown}...` : lastUploadMessage || (countdownEnabled ? 'พร้อมถ่ายช็อตนี้แล้ว' : 'พร้อมอัดทันทีโดยไม่ต้องนับถอยหลัง')}</p>
                {sessionPayload ? <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">Project: {sessionPayload.title}</p> : null}
              </div>
            </div>
          </div>

          {countdown != null ? (
            <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-black/25">
              <div className="rounded-[2rem] border border-white/10 bg-black/30 px-10 py-8 text-center backdrop-blur-xl">
                <div className="text-7xl font-black tracking-tight text-white">{countdown}</div>
                <p className="mt-2 text-sm font-semibold uppercase tracking-[0.2em] text-white/70">เตรียมอัด</p>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
