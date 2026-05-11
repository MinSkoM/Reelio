import React, { useEffect, useMemo, useState } from 'react';
import { breakScriptIntoShots, fetchQuotaStatus, generateScript, GeneratedScript, QuotaSnapshot } from '../services/geminiService';
import { getShotTypeLabel } from '../lib/shotLabels';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { Download, FileText, Loader2, Clock3, Package2, WandSparkles, Scissors, Sparkles, Camera, TimerReset, TriangleAlert } from 'lucide-react';

const topicOptions = ['รีวิวสินค้า', 'สอนทำ', 'เล่าเรื่อง 1 วัน', 'ทริคการเรียน', 'เที่ยว', 'รีวิวอาหาร'];
const audienceOptions = ['มือใหม่', 'นักเรียน นักศึกษา', 'ครีเอเตอร์', 'คนทำงาน'];
const toneOptions = ['เป็นกันเอง', 'คึกคัก', 'น่าเชื่อถือ', 'สนุก'];
const durationOptions = [15, 30, 45, 60];

type Mode = 'brief' | 'script';

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
    resetText: quota.note || 'นับแยกต่อผู้ใช้จากฝั่ง server แล้ว',
  };
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
    case 'เล่าเรื่อง 1 วัน':
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

export default function PreProduction() {
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
  const [quotaStatus, setQuotaStatus] = useState<QuotaStatus>({
    title: 'กำลังเช็กโควต้า',
    statusType: 'ok',
    remainingText: 'กำลังดึงจำนวนคงเหลือของผู้ใช้คนนี้จาก server',
    resetText: 'ถ้าเพิ่งเปิดหน้าใหม่ รอสักครู่แล้วระบบจะอัปเดตให้เอง',
  });

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
      setScript(response.result);
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

  const handleDownload = () => {
    if (!script) return;
    const exportData = { brief: prompt, result: script };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${script.title.replace(/[^a-z0-9ก-ฮ]/gi, '_') || 'preproduction_script'}.json`;
    link.click();
    URL.revokeObjectURL(url);
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
                  ? 'h-11 rounded-full border-amber-300 bg-gradient-to-r from-orange-400 to-amber-300 px-4 text-slate-950 shadow-lg shadow-orange-500/20'
                  : 'h-11 rounded-full border-white/10 bg-white/6 px-4 text-slate-200 hover:bg-white/12'
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
                ? 'h-11 rounded-full border-emerald-300 bg-emerald-300 px-4 text-slate-950 shadow-lg shadow-emerald-500/20'
                : 'h-11 rounded-full border-white/10 bg-white/6 px-4 text-slate-200 hover:bg-white/12'
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
            className="h-12 rounded-2xl border-emerald-300/50 bg-emerald-300/10 px-4 text-white placeholder:text-emerald-100/50 focus-visible:border-emerald-200 focus-visible:ring-emerald-200/30"
          />
        ) : null}
      </div>
    );
  };

  return (
    <div className="mx-auto mt-10 max-w-5xl space-y-6 animate-in fade-in duration-700">
      <Card className="overflow-hidden border-white/10 bg-slate-950/70 shadow-2xl shadow-slate-950/20 backdrop-blur-xl">
        <CardHeader className="border-b border-white/8 bg-gradient-to-br from-white/6 to-transparent pb-6">
          <div className="mb-4 flex flex-wrap gap-3">
            <Button
              type="button"
              variant={mode === 'brief' ? 'default' : 'outline'}
              className={mode === 'brief' ? 'rounded-full border-amber-300 bg-gradient-to-r from-orange-400 to-amber-300 px-5 text-slate-950' : 'rounded-full border-white/10 bg-white/6 px-5 text-slate-200'}
              onClick={() => setMode('brief')}
            >
              <WandSparkles className="mr-2 h-4 w-4" />
              ให้ระบบช่วยคิดสคริปต์
            </Button>
            <Button
              type="button"
              variant={mode === 'script' ? 'default' : 'outline'}
              className={mode === 'script' ? 'rounded-full border-amber-300 bg-gradient-to-r from-orange-400 to-amber-300 px-5 text-slate-950' : 'rounded-full border-white/10 bg-white/6 px-5 text-slate-200'}
              onClick={() => setMode('script')}
            >
              <Scissors className="mr-2 h-4 w-4" />
              มีสคริปต์อยู่แล้ว ให้แตกช็อต
            </Button>
          </div>
          <CardTitle className="text-3xl font-black tracking-tight text-white sm:text-4xl">
            {mode === 'brief' ? 'กรอกข้อมูลเพื่อสร้างสคริปต์' : 'วางสคริปต์เพื่อแตกเป็น shot list'}
          </CardTitle>
          <p className="max-w-2xl text-base leading-7 text-slate-300">
            {mode === 'brief'
              ? 'เลือกประเภทคลิป แล้วเติมเรื่องที่อยากพูดให้ชัด ระบบจะช่วยคิดทั้งสคริปต์และสิ่งที่ต้องถ่าย'
              : 'วางสคริปต์ที่มีอยู่แล้ว แล้วให้ระบบช่วยตัดเป็นช็อตที่ถ่ายจริงได้ง่ายขึ้น'}
          </p>
        </CardHeader>

        <CardContent className="space-y-6 p-6 sm:p-8">
          <div className={`rounded-[1.5rem] p-5 ${quotaStatus.statusType === 'ok' ? 'border border-emerald-300/20 bg-emerald-300/10' : 'border border-amber-300/20 bg-amber-300/10'}`}>
            <div className="flex items-start gap-3">
              <div className={`rounded-2xl p-2 ${quotaStatus.statusType === 'ok' ? 'bg-emerald-300/20 text-emerald-100' : 'bg-amber-300/20 text-amber-100'}`}>
                <TriangleAlert className="h-5 w-5" />
              </div>
              <div className="space-y-2">
                <p className={`text-sm font-bold tracking-wide ${quotaStatus.statusType === 'ok' ? 'text-emerald-50' : 'text-amber-50'}`}>สถานะโควต้า</p>
                <p className="text-base font-semibold text-white">{quotaStatus.title}</p>
                <p className={`text-sm leading-6 ${quotaStatus.statusType === 'ok' ? 'text-emerald-50/90' : 'text-amber-50/90'}`}>{quotaStatus.remainingText}</p>
                <div className="flex flex-wrap gap-3 pt-1">
                  <div className={`inline-flex items-center gap-2 rounded-full border bg-white/8 px-3 py-1.5 text-sm text-white ${quotaStatus.statusType === 'ok' ? 'border-emerald-200/20' : 'border-amber-200/20'}`}>
                    <TimerReset className={`h-4 w-4 ${quotaStatus.statusType === 'ok' ? 'text-emerald-100' : 'text-amber-100'}`} />
                    {quotaStatus.resetText}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5">
            <p className="mb-4 text-sm font-bold tracking-wide text-white">กรอก</p>

            {mode === 'brief' ? (
              <div className="space-y-6">
                {renderOptionRow({ label: 'ประเภทวิดีโอ', options: topicOptions, value: topic, customValue: customTopic, onSelect: setTopic, onCustomChange: setCustomTopic, customPlaceholder: 'เช่น พาชมห้อง, แต่งหน้าไปเรียน, สรุปข่าวสั้น' })}
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-slate-100">{topicDetailConfig.label}</p>
                  <Input
                    value={topicDetail}
                    onChange={(e) => setTopicDetail(e.target.value)}
                    placeholder={topicDetailConfig.placeholder}
                    className="h-12 rounded-2xl border-white/10 bg-slate-900/50 px-4 text-white placeholder:text-slate-500"
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
                  className="min-h-56 rounded-[1.5rem] border-white/10 bg-slate-900/60 px-4 py-4 text-white placeholder:text-slate-500"
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
                    className={durationSeconds === seconds ? 'h-11 rounded-full border-sky-300 bg-sky-300 px-4 text-slate-950 shadow-lg shadow-sky-500/20' : 'h-11 rounded-full border-white/10 bg-white/6 px-4 text-slate-200 hover:bg-white/12'}
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
              className="mt-6 h-13 w-full rounded-2xl bg-gradient-to-r from-orange-400 via-amber-300 to-yellow-200 px-6 text-base font-bold text-slate-950 shadow-xl shadow-orange-500/20 hover:opacity-95"
            >
              {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Sparkles className="mr-2 h-5 w-5" />}
              {mode === 'brief' ? 'สร้างสคริปต์และ shot list' : 'แตกเป็น shot list'}
            </Button>
          </div>

          <div className="rounded-[1.5rem] border border-primary/20 bg-primary/5 p-5">
            <p className="mb-3 text-sm font-bold tracking-wide text-white">สรุป</p>
            <p className="text-base leading-7 text-white">{prompt}</p>
            <div className="mt-4 text-sm leading-7 text-slate-300">
              {mode === 'brief' ? (
                effectiveDetail ? (
                  <div className="flex items-start gap-3 text-white"><Package2 className="mt-1 h-4 w-4 text-amber-200" /> ประเด็นหลักของคลิปนี้: {effectiveDetail}</div>
                ) : (
                  <div>ยังไม่ได้ใส่รายละเอียดเพิ่ม ระบบจะคิดจากประเภทคลิปและกลุ่มคนดูเป็นหลัก</div>
                )
              ) : (
                <div className="flex items-start gap-3 text-white"><FileText className="mt-1 h-4 w-4 text-amber-200" /> ระบบจะอ่านสคริปต์เดิม แล้วแตกเป็นช็อตที่ถ่ายจริงได้ง่ายขึ้น</div>
              )}
              <div className="mt-2 flex items-start gap-3 text-slate-200"><Camera className="mt-1 h-4 w-4 text-sky-200" /> แต่ละช็อตจะมีทั้งสิ่งที่ต้องพูด และสิ่งที่ต้องถ่ายแยกกันชัดเจน</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {script && (
        <Card className="border-white/10 bg-slate-950/75 shadow-2xl shadow-slate-950/20 backdrop-blur-xl">
          <CardHeader className="flex flex-col gap-4 border-b border-white/8 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="mb-2 text-sm font-bold tracking-wide text-white">ผลลัพธ์</p>
              <CardTitle className="text-2xl font-black tracking-tight text-white">{script.title}</CardTitle>
              <p className="mt-2 text-sm leading-6 text-slate-300">ความยาวรวม {durationSeconds} วินาที พร้อมแผนการพูดและภาพที่ควรถ่ายในแต่ละช็อต</p>
            </div>
            <Button variant="outline" onClick={handleDownload} className="rounded-2xl border-white/10 bg-white/6 px-5 text-slate-100 hover:bg-white/12">
              <Download className="mr-2 h-4 w-4" />
              ดาวน์โหลด JSON
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[760px] px-4 py-4 sm:px-6">
              <div className="space-y-4 pb-4">
                {script.shots.sort((a, b) => a.order_index - b.order_index).map((shot, i) => (
                  <div key={i} className="rounded-[1.75rem] border border-white/10 bg-gradient-to-br from-white/8 to-white/3 p-5 shadow-lg shadow-black/10">
                    <div className="mb-4 flex flex-wrap items-center gap-2">
                      <Badge variant={shot.shot_type === 'A-Roll' ? 'default' : 'secondary'} className={shot.shot_type === 'A-Roll' ? 'bg-orange-300 text-slate-950' : 'bg-sky-300 text-slate-950'}>
                        {getShotTypeLabel(shot.shot_type)}
                      </Badge>
                      <span className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs font-semibold text-slate-200">ช็อต #{shot.order_index}</span>
                      <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-xs font-semibold text-amber-100">ประมาณ {shot.duration_seconds} วินาที</span>
                    </div>
                    <div className="space-y-4">
                      <div className="rounded-2xl border border-white/8 bg-slate-950/50 p-4">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">พูด / ใจความ</p>
                        <p className="text-base leading-7 text-white">{shot.script_text}</p>
                      </div>
                      <div className="rounded-2xl border border-sky-300/15 bg-sky-300/8 p-4">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-sky-100">ต้องถ่ายอะไร</p>
                        <p className="text-base leading-7 text-slate-100">{shot.visual_description}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
