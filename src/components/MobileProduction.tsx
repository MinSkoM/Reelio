import React, { useState, useEffect, useRef } from 'react';
import Peer from 'peerjs';
import { supabase } from '../lib/supabase';
import { getShotTypeLabel } from '../lib/shotLabels';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { ChevronRight, ChevronLeft, Loader2, Zap, StopCircle, TriangleAlert } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Shot {
  id: string;
  script_text: string;
  shot_type: string;
  order_index: number;
  project_id?: string;
}

export default function MobileProduction({ sessionId }: { sessionId: string }) {
  const [peer, setPeer] = useState<Peer | null>(null);
  const [conn, setConn] = useState<any>(null);
  const [connected, setConnected] = useState(false);
  const [shots, setShots] = useState<Shot[]>([]);
  const [currentShotIndex, setCurrentShotIndex] = useState(0);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunks = useRef<Blob[]>([]);

  useEffect(() => {
    const newPeer = new Peer();
    newPeer.on('open', () => {
      const connection = newPeer.connect(sessionId);
      connection.on('open', () => {
        setConnected(true);
        setConn(connection);
      });
      setPeer(newPeer);
    });

    const fetchLatestShots = async () => {
      if (!supabase) return;

      const { data: projects } = await supabase.from('projects').select('id').order('created_at', { ascending: false }).limit(1);
      if (projects && projects[0]) {
        const { data: shotList } = await supabase
          .from('shot_lists')
          .select('*')
          .eq('project_id', projects[0].id)
          .order('order_index', { ascending: true });
        if (shotList) setShots(shotList as Shot[]);
      }
    };
    fetchLatestShots();

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: true })
      .then((stream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play?.();
        }
        setCameraReady(true);
        setCameraError(null);
      })
      .catch((error) => {
        console.error('Camera access error:', error);
        const secureHint = window.isSecureContext
          ? 'กรุณาอนุญาตสิทธิ์กล้องและไมค์ในเบราว์เซอร์'
          : 'ลิงก์นี้ไม่ใช่ secure context สำหรับมือถือ ให้เปิดผ่าน HTTPS หรือ localhost เท่านั้น';
        setCameraError(`${error?.name || 'CameraError'}: ${secureHint}`);
      });

    return () => {
      newPeer.destroy();
    };
  }, [sessionId]);

  const startRecording = () => {
    if (!videoRef.current?.srcObject) return;
    const stream = videoRef.current.srcObject as MediaStream;
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) recordedChunks.current.push(event.data);
    };

    recorder.onstop = async () => {
      const blob = new Blob(recordedChunks.current, { type: 'video/webm' });
      recordedChunks.current = [];

      if (conn && connected) {
        const buffer = await blob.arrayBuffer();
        conn.send({
          type: 'video-blob',
          blob: new Uint8Array(buffer),
          shotId: shots[currentShotIndex]?.id,
          projectId: shots[currentShotIndex]?.project_id,
        });
      }
    };

    recorder.start();
    mediaRecorderRef.current = recorder;
    setIsRecording(true);
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  if (!connected) {
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center p-6 text-center space-y-4">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
        <h2 className="text-xl font-bold">กำลังเชื่อมต่อกับหน้าคุมบนคอม...</h2>
        <p className="text-muted-foreground text-sm font-mono opacity-50 uppercase">{sessionId}</p>
      </div>
    );
  }

  const currentShot = shots[currentShotIndex];

  return (
    <div className="fixed inset-0 bg-black overflow-hidden flex flex-col">
      <div className="relative flex-1 bg-neutral-900 overflow-hidden">
        <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover scale-x-[-1]" />

        {!cameraReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-6">
            <div className="max-w-md rounded-3xl border border-amber-400/30 bg-amber-500/10 p-5 text-center text-amber-50">
              <TriangleAlert className="mx-auto mb-3 h-8 w-8 text-amber-300" />
              <p className="text-lg font-semibold">กล้องยังไม่พร้อม</p>
              <p className="mt-2 text-sm text-amber-100/90">
                {cameraError || 'กำลังขอสิทธิ์กล้องและไมค์จากเบราว์เซอร์'}
              </p>
            </div>
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex flex-col justify-end p-6 pb-32">
          <AnimatePresence mode="wait">
            {currentShot && (
              <motion.div
                key={currentShot.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-4"
              >
                <div className="flex items-center gap-2">
                  <Badge variant="default" className="bg-primary hover:bg-primary text-[10px] tracking-widest">
                    {getShotTypeLabel(currentShot.shot_type)}
                  </Badge>
                  <span className="text-[10px] text-white/50 font-mono">ช็อต {currentShotIndex + 1}/{shots.length}</span>
                </div>
                <div className="bg-black/40 backdrop-blur-md p-4 rounded-xl border border-white/10">
                  <p className="text-xl font-medium leading-relaxed text-yellow-400 drop-shadow-md">{currentShot.script_text}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {isRecording && (
          <div className="absolute top-6 right-6 flex items-center gap-2 bg-red-600/20 px-3 py-1.5 rounded-full border border-red-600 animate-pulse">
            <div className="w-2.5 h-2.5 bg-red-600 rounded-full" />
            <span className="text-[10px] font-bold tracking-widest">REC</span>
          </div>
        )}
      </div>

      <div className="h-28 bg-neutral-950 border-t border-white/5 px-6 flex items-center justify-between">
        <Button variant="outline" size="icon" className="rounded-full w-12 h-12" disabled={currentShotIndex === 0} onClick={() => setCurrentShotIndex((prev) => prev - 1)}>
          <ChevronLeft className="w-6 h-6" />
        </Button>

        <div className="relative">
          <Button disabled={!cameraReady} className={`w-20 h-20 rounded-full border-4 shadow-xl transition-all ${isRecording ? 'bg-red-600 border-white scale-95' : 'bg-white text-black border-transparent'}`} onClick={isRecording ? stopRecording : startRecording}>
            {isRecording ? <StopCircle className="w-10 h-10" /> : <Zap className="w-10 h-10 fill-current" />}
          </Button>
        </div>

        <Button variant="outline" size="icon" className="rounded-full w-12 h-12" disabled={shots.length === 0 || currentShotIndex === shots.length - 1} onClick={() => setCurrentShotIndex((prev) => prev + 1)}>
          <ChevronRight className="w-6 h-6" />
        </Button>
      </div>
    </div>
  );
}
