import React, { useEffect, useMemo, useState } from 'react';
import { breakScriptIntoShots, fetchQuotaStatus, generateScript, GeneratedScript, QuotaSnapshot } from '../services/geminiService';
import { getShotTypeLabel } from '../lib/shotLabels';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { Download, FileText, Loader2, Clock3, Package2, WandSparkles, Scissors, Sparkles, Camera, TimerReset, TriangleAlert, Captions, Star, ArrowLeft, CheckCircle2, Library, FolderOpen } from 'lucide-react';
import { getProgressSummary, getShotProgress, setShotProgress, SHOT_PROGRESS_EVENT } from '../lib/shotProgress';

const topicOptions = ['รีวิวสินค้า', 'สอนทำ', 'เล่าเรื่อง', 'ทริคการเรียน', 'เที่ยว', 'รีวิวอาหาร'];
const audienceOptions = ['มือใหม่', 'นักเรียน นักศึกษา', 'ครีเอเตอร์', 'คนทำงาน'];
const toneOptions = ['เป็นกันเอง', 'คึกคัก', 'น่าเชื่อถือ', 'สนุก'];
const durationOptions = [15, 30, 45, 60];
const LIBRARY_STORAGE_KEY = 'tudtor-script-library';

type Mode = 'brief' | 'script';
type PageView = 'editor' | 'shot-list' | 'library';

type QuotaStatus = {
  title: string;
  statusType: 'ok' | 'temporary' | 'daily';
  remainingText: string;
  resetText: string;
};

type OptionFieldProps = {
  label: string;
  options: string[];
  value: string;
  customValue: string;
  onSelect: (next: string) => void;
  onCustomChange: (next: string) => void;
  customPlaceholder: string;
};

type LibraryItem = {
  id: string;
  title: string;
  prompt: string;
  mode: Mode;
  createdAt: string;
  script: GeneratedScript;
};

function quotaToDisplay(quota: QuotaSnapshot): QuotaStatus {
  if (quota.statusType === 'daily') {
    return {
      title: 'ติดโควต้ารายวัน',
      statusType: 'daily',
      remainingText: `สถานะการใช้งานของอุปกรณ์นี้: ใช้ไป ${quota.used} ครั้ง เหลือ ${quota.remaining} ครั้งในรอบของวันนี้`,
      resetText: quota.note || `โควต้าจะรีเซ็ตอีกประมาณ ${quota.resetHours || 1} ชั่วโมง`,
    };
  }

  if (quota.statusType === 'temporary') {
    return {
      title: 'ติดลิมิตชั่วคราว',
      statusType: 'temporary',
      remainingText: `สถานะการใช้งานของอุปกรณ์นี้: ใช้ไป ${quota.used} ครั้ง เหลือ ${quota.remaining} ครั้งในรอบของวันนี้`,
      resetText: quota.note || (quota.retryMinutes ? `ลองใหม่อีกครั้งในประมาณ ${quota.retryMinutes} นาที` : 'ลองใหม่อีกครั้งในอีกสักครู่'),
    };
  }

  return {
    title: 'พร้อมใช้งาน',
    statusType: 'ok',
    remainingText: `สถานะการใช้งานของอุปกรณ์นี้: ใช้ไป ${quota.used} ครั้ง เหลือ ${quota.remaining} ครั้งในรอบของวันนี้`,
    resetText: quota.note || 'งานที่สร้างจะถูกเก็บไว้ในคลังงานของเครื่องนี้',
  };
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

export default function PreProduction() {
  const [pageView, setPageView] = useState<PageView>('editor');
  const [mode, setMode] = useState<Mode>('brief');
  const [topic, setTopic] = useState(topicOptions[0]);
  const [topicDetail, setTopicDetail] = useState('');
  const [audience, setAudience] = useState(audienceOptions[0]);
  const [tone, setTone] = useState(toneOptions[0]);
  const [customTopic, setCustomTopic] = useState('');
  const [customAudience, setCustomAudience] = useState('');
  const [customTone, setCustomTone] = useState('');
  const [durationSeconds, setDurationSeconds] = useState(durationOptions[1]);
  const [existingScript, setExistingScript] = useState('');
  const [loading, setLoading] = useState(false);
  const [script, setScript] = useState<GeneratedScript | null>(null);
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);
  const [activeLibraryItemId, setActiveLibraryItemId] = useState<string | null>(null);
  const [completedShots, setCompletedShots] = useState<Record<number, boolean>>({});
  const [quotaStatus, setQuotaStatus] = useState<QuotaStatus>({
    title: 'กำลังเช็กโควต้า',
    statusType: 'ok',
    remainingText: 'กำลังดึงจำนวนคงเหลือของผู้ใช้คนนี้จาก server',
    resetText: 'ถ้าเพิ่งเปิดหน้าใหม่ รอสักครู่แล้วระบบจะอัปเดตให้เอง',
  });

  useEffect(() => {
    setLibraryItems(loadLibrary());
  }, []);

  useEffect(() => {
    let active = true;
    fetchQuotaStatus()
      .then((quota) => {
        if (!active) return;
        setQuotaStatus(quotaToDisplay(quota));
      })
      .catch(() => {
        if (!active) return;
        setQuotaStatus({
          title: 'เช็กโควต้าไม่สำเร็จ',
          statusType: 'temporary',
          remainingText: 'ยังดึงจำนวนคงเหลือของผู้ใช้คนนี้จาก server ไม่สำเร็จ',
          resetText: 'ตรวจว่า deploy API route และตั้งค่า Supabase env ครบหรือยัง',
        });
      });
    return () => {
      active = false;
    };
  }, []);

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
    if (!script || !activeLibraryItemId || typeof window === 'undefined') return;
    setShotProgress(activeLibraryItemId, completedShots);
  }, [completedShots, script, activeLibraryItemId]);

  const prompt = useMemo(() => {
    if (mode === 'script') {
      return `แตกช็อตจากสคริปต์เดิม ความยาวรวม ${durationSeconds} วินาที`;
    }

    const parts = [effectiveTopic];
    if (effectiveDetail) parts.push(effectiveDetail);
    parts.push(`สำหรับ ${audience}`);
    parts.push(`โทน${tone}`);
    parts.push(`ความยาวรวม ${durationSeconds} วินาที`);
    return parts.join(' · ');
  }, [mode, effectiveTopic, effectiveDetail, audience, tone, durationSeconds]);

  const currentLibraryItem = useMemo(
    () => libraryItems.find((item) => item.id === activeLibraryItemId) || null,
    [libraryItems, activeLibraryItemId],
  );

  const libraryProgress = useMemo(() => {
    return Object.fromEntries(
      libraryItems.map((item) => [item.id, getProgressSummary(item.id, item.script.shots.length)]),
    );
  }, [libraryItems, completedShots]);


  useEffect(() => {
    if (typeof window === 'undefined') return;
    const refreshLibrary = () => setLibraryItems(loadLibrary());
    const refreshProgress = () => setCompletedShots((current) => ({ ...current }));
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

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const response = mode === 'brief'
        ? await generateScript({
            topic: effectiveTopic,
            product: effectiveDetail || undefined,
            audience,
            tone,
            durationSeconds,
          })
        : await breakScriptIntoShots(existingScript, durationSeconds);

      const nextScript = response.result;
      const libraryItem: LibraryItem = {
        id: typeof window !== 'undefined' && window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}`,
        title: nextScript.title,
        prompt,
        mode,
        createdAt: new Date().toISOString(),
        script: nextScript,
      };

      setScript(nextScript);
      persistLibraryItem(libraryItem);
      setPageView('shot-list');
      setQuotaStatus(quotaToDisplay(response.quota));
    } catch (error: any) {
      const details = error?.message || String(error);
      if (error?.quota) {
        setQuotaStatus(quotaToDisplay(error.quota));
      }
      console.error('AI Error:', error);
      alert(mode === 'brief' ? `สร้างสคริปต์ไม่สำเร็จ: ${details}` : `แตกช็อตจากสคริปต์ไม่สำเร็จ: ${details}`);
    } finally {
      setLoading(false);
    }
  };

  const openLibraryItem = (item: LibraryItem) => {
    setScript(item.script);
    setActiveLibraryItemId(item.id);
    setPageView('shot-list');
  };

  const toggleShotCompleted = (orderIndex: number) => {
    setCompletedShots((current) => ({
      ...current,
      [orderIndex]: !current[orderIndex],
    }));
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

  const handleDownloadTxt = () => {
    if (!script) return;

    const lines = [
      `ชื่อคลิป: ${script.title}`,
      `สรุป: ${currentLibraryItem?.prompt || prompt}`,
      '',
      ...script.shots
        .sort((a, b) => a.order_index - b.order_index)
        .flatMap((shot) => [
          `ช็อต ${shot.order_index}`,
          `ประเภท: ${getShotTypeLabel(shot.shot_type)}`,
          `ระยะเวลา: ${shot.duration_seconds} วินาที`,
          `พูด / ใจความ: ${shot.script_text}`,
          `ต้องถ่ายอะไร: ${shot.visual_description}`,
          '',
        ]),
    ];

    downloadFile(lines.join('\n'), `${buildExportFileBase()}.txt`, 'text/plain;charset=utf-8');
  };  

  const formatSrtTimestamp = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const milliseconds = Math.round((totalSeconds - Math.floor(totalSeconds)) * 1000);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`;
  };

  const handleDownloadSrt = () => {
    if (!script) return;

    let currentTime = 0;
    const srt = script.shots
      .sort((a, b) => a.order_index - b.order_index)
      .map((shot, index) => {
        const start = currentTime;
        const end = currentTime + shot.duration_seconds;
        currentTime = end;
        return [
          String(index + 1),
          `${formatSrtTimestamp(start)} --> ${formatSrtTimestamp(end)}`,
          shot.script_text,
          '',
        ].join('\n');
      })
      .join('\n');

    downloadFile(srt, `${buildExportFileBase()}.srt`, 'application/x-subrip;charset=utf-8');
  };

  const renderOptionRow = ({ label, options, value, customValue, onSelect, onCustomChange, customPlaceholder }: OptionFieldProps) => {
    const usingCustom = !options.includes(value);

    return (
      <div className="space-y-3">
        <p className="text-sm font-semibold text-slate-100">{label}</p>
        <div className="flex flex-wrap gap-2">
          {options.map((option) => (
            <Button
              key={option}
              type="button"
              variant={value === option ? 'default' : 'outline'}
              className={
                value === option
                  ? 'h-11 rounded-full bg-gradient-to-r from-[#A661D6] to-[#6D66DA] px-4 text-white shadow-md shadow-cyan-950/20'
                  : 'h-11 rounded-full border-white/12 bg-[#454963] px-4 text-slate-100 hover:bg-[#50556f]'
              }
              onClick={() => onSelect(option)}
            >
              {option}
            </Button>
          ))}
          <Button
            type="button"
            variant={usingCustom ? 'default' : 'outline'}
            className={
              usingCustom
                ? 'h-11 rounded-full border-violet-300/35 bg-gradient-to-r from-[#A661D6] to-[#6D66DA] px-4 text-white shadow-md shadow-cyan-950/20'
                : 'h-11 rounded-full border-white/12 bg-[#454963] px-4 text-slate-100 hover:bg-[#50556f]'
            }
            onClick={() => onSelect(customValue.trim() || 'อื่น ๆ')}
          >
            อื่น ๆ
          </Button>
        </div>
        {usingCustom ? (
          <Input
            value={customValue}
            onChange={(e) => {
              const next = e.target.value;
              onCustomChange(next);
              onSelect(next.trim() || 'อื่น ๆ');
            }}
            placeholder={customPlaceholder}
            className="h-12 rounded-2xl border-fuchsia-300/35 bg-fuchsia-400/10 px-4 text-white placeholder:text-violet-100/55 focus-visible:border-fuchsia-200 focus-visible:ring-fuchsia-200/30"
          />
        ) : null}
      </div>
    );
  };

  if (pageView === 'library') {
    return (
      <div className="mx-auto mt-10 max-w-5xl space-y-6 animate-in fade-in duration-500">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => setPageView('editor')}
            className="rounded-2xl border-white/12 bg-[#454963] px-4 text-slate-100 hover:bg-[#50556f]"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            กลับไปสร้างงาน
          </Button>
          <div className="rounded-full bg-[#8d65e6] px-4 py-2 text-sm font-semibold text-[#efe7ff]">
            มีทั้งหมด {libraryItems.length} งานในคลังของเครื่องนี้
          </div>
        </div>

        <Card className="overflow-hidden border-white/8 bg-[#6d7189] shadow-2xl shadow-slate-950/20 backdrop-blur-xl">
          <CardHeader className="border-b border-white/8 bg-[#6d7189] px-6 pb-6 pt-6 sm:px-8">
            <p className="text-sm font-bold tracking-wide text-[#e7dcff]">คลังงาน</p>
            <CardTitle className="text-3xl font-black tracking-tight text-white sm:text-4xl">สคริปต์และช็อตลิสต์ที่สร้างไว้</CardTitle>
            <p className="max-w-3xl text-base leading-7 text-slate-200">ทุกงานที่สร้างจากหน้านี้จะถูกเก็บไว้ในเครื่องของคุณ และสามารถเปิดกลับมาดูช็อตลิสต์ต่อได้จากหน้านี้</p>
          </CardHeader>
          <CardContent className="-mt-6 -mb-6 space-y-4 p-5 sm:p-8">
            {libraryItems.length === 0 ? (
              <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-6 text-slate-200">
                ยังไม่มีงานในคลัง ลองสร้างสคริปต์หรือช็อตลิสต์ก่อน แล้วงานจะมาอยู่ตรงนี้อัตโนมัติ
              </div>
            ) : (
              libraryItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openLibraryItem(item)}
                  className="w-full rounded-[1.5rem] border border-white/10 bg-white/5 p-5 text-left transition-all duration-300 hover:bg-white/10"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className="bg-[#8d65e7] text-white">{item.mode === 'brief' ? 'วางแผนทั้งหมด' : 'สร้างจากสคริปต์'}</Badge>
                        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-100">
                          {new Date(item.createdAt).toLocaleString('th-TH')}
                        </span>
                      </div>
                      <p className="text-2xl font-bold text-white">{item.title}</p>
                      <p className="text-sm leading-6 text-slate-200">{item.prompt}</p>
                      <div className="space-y-2 pt-2">
                        <div className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-200">
                          <span>ถ่ายแล้ว {libraryProgress[item.id]?.completed || 0}/{item.script.shots.length} ช็อต</span>
                          <span>{libraryProgress[item.id]?.percent || 0}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-black/20">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-[#a661d6] via-[#8d65e7] to-[#6d66da] transition-all duration-500"
                            style={{ width: `${libraryProgress[item.id]?.percent || 0}%` }}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-full bg-[#8d65e7]/16 px-4 py-2 text-sm font-semibold text-[#efe7ff]">
                      <FolderOpen className="h-4 w-4" />
                      เปิดดู {item.script.shots.length} ช็อต
                    </div>
                  </div>
                </button>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (pageView === 'shot-list' && script) {
    const sortedShots = [...script.shots].sort((a, b) => a.order_index - b.order_index);
    const completedCount = sortedShots.filter((shot) => completedShots[shot.order_index]).length;

    return (
      <div className="mx-auto mt-10 max-w-5xl space-y-6 animate-in fade-in duration-500">
        <Card className="overflow-hidden border-white/8 bg-[#6d7189] shadow-2xl shadow-slate-950/20 backdrop-blur-xl">
          <CardHeader className="space-y-4 border-b border-white/10 bg-[#62677f] px-6 pb-6 pt-6 sm:px-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPageView('editor')}
                  className="rounded-2xl border-white/12 bg-[#454963] px-4 text-slate-100 hover:bg-[#50556f]"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  กลับไปแก้ข้อมูล
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPageView('library')}
                  className="rounded-2xl border-[#a98eff]/20 bg-[#8d65e7]/16 px-4 text-[#efe7ff] hover:bg-[#8d65e7]/24"
                >
                  <Library className="mr-2 h-4 w-4" />
                  ไปดูในคลัง
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleDownloadTxt}
                  className="rounded-2xl border-white/10 bg-white/5 px-4 text-slate-100 hover:bg-white/10"
                >
                  <Download className="mr-2 h-4 w-4" />
                  ดาวน์โหลด TXT
                </Button>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full bg-[#8d65e7]/16 px-4 py-2 text-sm font-semibold text-[#efe7ff]">
                <CheckCircle2 className="h-4 w-4" />
                ถ่ายเสร็จแล้ว {completedCount}/{sortedShots.length} ช็อต
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-bold tracking-wide text-[#e7dcff]">หน้าช็อตลิสต์</p>
              <CardTitle className="text-3xl font-black tracking-tight text-white sm:text-4xl">{script.title}</CardTitle>
              <p className="max-w-3xl text-base leading-7 text-slate-200">{currentLibraryItem?.prompt || prompt}</p>
            </div>
          </CardHeader>

          <CardContent className="space-y-4 p-6 sm:p-8">
            {sortedShots.map((shot) => {
              const isCompleted = Boolean(completedShots[shot.order_index]);
              return (
                <div
                  key={shot.order_index}
                  className={`rounded-[1.75rem] border p-5 transition-all duration-300 ${
                    isCompleted
                      ? 'border-white/10 bg-[#565b72] opacity-70'
                      : 'border-white/10 bg-white/5 shadow-lg shadow-black/10'
                  }`}
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center gap-2">
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

                      <div className="space-y-3">
                        <div className={`rounded-xl p-4 transition-colors duration-300 ${isCompleted ? 'bg-[#474c63]' : 'bg-[#2f334b]'}`}>
                          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">รายละเอียดช็อต</p>
                          <p className="text-base leading-7 text-white">{shot.visual_description}</p>
                        </div>
                        <div className={`border-1 rounded-xl p-4 transition-colors duration-300 ${isCompleted ? 'bg-[#4f536b]' : 'bg-[#8d65e7]/14'}`}>
                          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#e7dcff]">สคริปต์</p>
                          <p className="text-base leading-7 text-slate-100">{shot.script_text}</p>
                        </div>
                      </div>
                    </div>

                    <label className={`inline-flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold transition-all duration-300 ${
                      isCompleted
                        ? 'border-white/10 bg-[#474c63] text-white'
                        : 'border-[#a98eff]/20 bg-[#8d65e7]/14 text-[#efe7ff]'
                    }`}>
                      <input
                        type="checkbox"
                        checked={isCompleted}
                        onChange={() => toggleShotCompleted(shot.order_index)}
                        className="h-4 w-4 rounded border-white/20 bg-transparent accent-[#6d5bd0]"
                      />
                      ถ่ายเสร็จแล้ว
                    </label>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto mt-10 max-w-5xl space-y-6 animate-in fade-in duration-700">
      <div className={`rounded-[1.5rem] p-5 ${quotaStatus.statusType === 'ok' ? 'border border-cyan-300/35 bg-[#2a2d40] text-white shadow-lg shadow-slate-950/30' : 'border border-violet-300/35 bg-slate-900/85 text-white shadow-lg shadow-violet-950/30'}`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className={`rounded-2xl p-2 ${quotaStatus.statusType === 'ok' ? 'bg-[#8d65e7]/18 text-[#efe7ff]' : 'bg-violet-300/20 text-violet-50'}`}>
              <TriangleAlert className="h-5 w-5" />
            </div>
            <div className="space-y-2">
              <p className={`text-sm font-bold tracking-wide ${quotaStatus.statusType === 'ok' ? 'text-[#e7dcff]' : 'text-violet-100'}`}>สถานะโควต้า</p>
              <p className="text-2xl font-bold text-white">{quotaStatus.title}</p>
              <p className={`text-base leading-7 ${quotaStatus.statusType === 'ok' ? 'text-[#efe7ff]' : 'text-violet-50'}`}>{quotaStatus.remainingText}</p>
              {quotaStatus.resetText ? (
                <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm ${quotaStatus.statusType === 'ok' ? 'bg-cyan-400/15 text-[#efe7ff]' : 'bg-violet-400/15 text-violet-50'}`}>
                  <TimerReset className="h-4 w-4" />
                  {quotaStatus.resetText}
                </div>
              ) : null}
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setPageView('library')}
            className="rounded-2xl border-[#a98eff]/20 bg-[#8d65e7]/16 px-4 text-[#efe7ff] hover:bg-[#8d65e7]/24"
          >
            <Library className="mr-2 h-4 w-4" />
            ไปดูในคลัง
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-[2.5rem] bg-[#41455f]/45 p-2 sm:mx-auto sm:w-[92%] sm:flex-row sm:flex-nowrap sm:items-end sm:justify-center sm:gap-0 sm:bg-transparent sm:p-0 sm:-mb-[4px]">
        <button
          type="button"
          onClick={() => setMode('brief')}
          className={`relative flex w-full items-center gap-4 px-6 transition-all duration-300 sm:min-w-0 sm:flex-none sm:px-8 rounded-[2rem] sm:rounded-b-none sm:rounded-t-[2rem] sm:-mb-[1px] ${mode === 'brief'
            ? 'z-20 h-20 bg-[#6d7189] text-white shadow-lg sm:h-25 sm:w-[49%] sm:shadow-none sm:border-none'
            : 'z-10 h-12 bg-transparent text-white/50 sm:h-20 sm:w-[45%] sm:bg-[#454963] sm:border sm:border-white/8 sm:border-b-transparent'} ${mode === 'brief' ? 'sm:-mr-4' : ''}`}
        >
          <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full sm:h-12 sm:w-12 ${mode === 'brief' ? 'bg-black/20' : 'bg-white/5 sm:bg-white/8'}`}>
            <WandSparkles className="h-5 w-5 sm:h-6 sm:w-6" />
          </span>
          <span className="block text-[1rem] font-bold leading-none sm:text-[1.25rem]">วางแผนทั้งหมด</span>
        </button>

        <button
          type="button"
          onClick={() => setMode('script')}
          className={`relative flex w-full items-center gap-4 px-6 transition-all duration-300 sm:min-w-0 sm:flex-none sm:px-8 rounded-[2rem] sm:rounded-b-none sm:rounded-t-[2rem] sm:-mb-[1px] ${mode === 'script'
            ? 'z-20 h-20 bg-[#6d7189] text-white shadow-lg sm:h-25 sm:w-[55%] sm:-ml-4 sm:shadow-none sm:border-none'
            : 'z-10 h-12 bg-transparent text-white/50 sm:h-20 sm:w-[51%] sm:bg-[#454963] sm:border sm:border-white/8 sm:border-b-transparent'}`}
        >
          <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full sm:h-12 sm:w-12 ${mode === 'script' ? 'bg-black/10' : 'bg-white/5 sm:bg-white/8'}`}>
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
        </CardHeader>
        <CardContent className="-mt-3 -mb-3 space-y-6 p-4 sm:p-5">
          <div className="rounded-[1.5rem] border border-white/12 bg-[#5c6078] p-5 shadow-lg">
            {mode === 'brief' ? (
              <div className="space-y-6">
                {renderOptionRow({ label: 'ประเภทวิดีโอ', options: topicOptions, value: topic, customValue: customTopic, onSelect: setTopic, onCustomChange: setCustomTopic, customPlaceholder: 'เช่น พาชมห้อง, แต่งหน้าไปเรียน, สรุปข่าวสั้น' })}
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-slate-100">{topicDetailConfig.label}</p>
                  <Input
                    value={topicDetail}
                    onChange={(e) => setTopicDetail(e.target.value)}
                    placeholder={topicDetailConfig.placeholder}
                    className="h-12 rounded-2xl border-white/12 bg-[#2f334b] px-4 text-white placeholder:text-slate-500"
                  />
                  <p className="text-sm leading-6 text-slate-400">{topicDetailConfig.helper}</p>
                </div>
                {renderOptionRow({ label: 'กลุ่มคนดู', options: audienceOptions, value: audience, customValue: customAudience, onSelect: setAudience, onCustomChange: setCustomAudience, customPlaceholder: 'เช่น เจ้าของร้าน, วัยรุ่น, คนเริ่มเที่ยวเอง' })}
                {renderOptionRow({ label: 'โทนคลิป', options: toneOptions, value: tone, customValue: customTone, onSelect: setTone, onCustomChange: setCustomTone, customPlaceholder: 'เช่น หรู, ดราม่า, ขี้เล่น, ดูโปร' })}
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

            <div className="mt-6 space-y-3">
              <p className="text-sm font-semibold text-slate-100">ความยาวคลิปรวม</p>
              <div className="flex flex-wrap gap-2">
                {durationOptions.map((seconds) => (
                  <Button
                    key={seconds}
                    type="button"
                    variant={durationSeconds === seconds ? 'default' : 'outline'}
                    className={durationSeconds === seconds ? 'h-11 rounded-full bg-gradient-to-r from-[#A661D6] to-[#6D66DA] px-4 text-white shadow-md shadow-cyan-950/20' : 'h-11 rounded-full border-white/12 bg-[#454963] px-4 text-slate-100 hover:bg-[#50556f]'}
                    onClick={() => setDurationSeconds(seconds)}
                  >
                    <Clock3 className="mr-2 h-4 w-4" />
                    {seconds} วินาที
                  </Button>
                ))}
              </div>
            </div>

            <Button
              onClick={handleGenerate}
              disabled={loading || (mode === 'script' && !existingScript.trim())}
              className="mt-6 h-13 w-full rounded-2xl bg-gradient-to-r from-[#bf6de8] via-[#cc7bc5] to-[#e58a2a] px-6 text-base font-bold text-white shadow-lg shadow-[#7b57cf]/20 hover:opacity-95"
            >
              {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Sparkles className="mr-2 h-5 w-5" />}
              {mode === 'brief' ? 'สร้างสคริปต์และช็อตลิสต์' : 'สร้างช็อตลิสต์'}
            </Button>
          </div>

          <div className="rounded-[1.5rem] bg-[#5c6078] p-5 shadow-lg">
            <p className="mb-3 text-xl font-bold tracking-wide text-white">สรุป :</p>
            <div className="flex items-start gap-3 text-base text-white"><Star className="mt-1 h-4 w-4 text-[#dcc8ff]" />{prompt}</div>
            <div className="mt-4 text-sm leading-7 text-slate-300">
              {mode === 'brief' ? (
                effectiveDetail ? (
                  <div className="flex items-start gap-3 text-white"><Package2 className="mt-1 h-4 w-4 text-[#f2c7ff]" /> ประเด็นหลักของคลิปนี้: {effectiveDetail}</div>
                ) : (
                  <div>ยังไม่ได้ใส่รายละเอียดเพิ่ม ระบบจะคิดจากประเภทคลิปและกลุ่มคนดูเป็นหลัก</div>
                )
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
