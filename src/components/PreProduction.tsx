import React, { useMemo, useState } from 'react';
import { generateScript, GeneratedScript } from '../services/geminiService';
import { supabase } from '../lib/supabase';
import { getShotTypeLabel } from '../lib/shotLabels';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { Loader2, Save, Send, Clock3, Package2 } from 'lucide-react';

const topicOptions = ['รีวิวสินค้า', 'สอนทำ', 'เล่าเรื่อง 1 วัน', 'ทริคการเรียน', 'เที่ยว', 'รีวิวอาหาร'];
const productOptions = ['สกินแคร์', 'มือถือ', 'เสื้อผ้า', 'กาแฟ', 'อาหารเสริม', 'คอร์สเรียน'];
const audienceOptions = ['มือใหม่', 'นักเรียน นักศึกษา', 'ครีเอเตอร์', 'คนทำงาน'];
const toneOptions = ['เป็นกันเอง', 'คึกคัก', 'น่าเชื่อถือ', 'สนุก'];
const durationOptions = [15, 30, 45, 60];
const productTopics = new Set(['รีวิวสินค้า', 'รีวิวอาหาร']);

type OptionFieldProps = {
  label: string;
  options: string[];
  value: string;
  customValue: string;
  onSelect: (next: string) => void;
  onCustomChange: (next: string) => void;
  customPlaceholder: string;
};

export default function PreProduction() {
  const [topic, setTopic] = useState(topicOptions[0]);
  const [product, setProduct] = useState(productOptions[0]);
  const [audience, setAudience] = useState(audienceOptions[0]);
  const [tone, setTone] = useState(toneOptions[0]);
  const [customTopic, setCustomTopic] = useState('');
  const [customProduct, setCustomProduct] = useState('');
  const [customAudience, setCustomAudience] = useState('');
  const [customTone, setCustomTone] = useState('');
  const [durationSeconds, setDurationSeconds] = useState(durationOptions[1]);
  const [loading, setLoading] = useState(false);
  const [script, setScript] = useState<GeneratedScript | null>(null);
  const [saving, setSaving] = useState(false);

  const shouldShowProduct = useMemo(() => {
    if (productTopics.has(topic)) return true;
    if (customTopic.trim()) {
      const value = customTopic.trim().toLowerCase();
      return value.includes('รีวิว') || value.includes('สินค้า') || value.includes('อาหาร')
    }
    return false;
  }, [topic, customTopic]);

  const effectiveProduct = shouldShowProduct ? product.trim() : '';

  const prompt = useMemo(() => {
    const parts = [topic];
    if (effectiveProduct) parts.push(`โฟกัสที่ ${effectiveProduct}`);
    parts.push(`สำหรับ ${audience}`);
    parts.push(`โทน${tone}`);
    parts.push(`ความยาวรวม ${durationSeconds} วินาที`);
    return parts.join(' · ');
  }, [topic, effectiveProduct, audience, tone, durationSeconds]);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const result = await generateScript({
        topic,
        product: effectiveProduct || undefined,
        audience,
        tone,
        durationSeconds,
      });
      setScript(result);
    } catch (error) {
      console.error('AI Error:', error);
      alert('สร้างสคริปต์ไม่สำเร็จ ลองใหม่อีกครั้งได้เลย');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!script) return;
    if (!supabase) {
      alert('กรุณาตั้งค่า Supabase ใน .env.local ก่อนบันทึกโปรเจกต์');
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert('กรุณาเข้าสู่ระบบก่อนบันทึกโปรเจกต์');
        return;
      }

      const { data: project, error: pError } = await supabase
        .from('projects')
        .insert({ title: script.title, user_id: user.id, ai_prompt: prompt })
        .select()
        .single();

      if (pError) throw pError;

      const shotsToInsert = script.shots.map((s) => ({
        project_id: project.id,
        shot_type: s.shot_type,
        script_text: s.script_text,
        order_index: s.order_index,
      }));

      const { error: sError } = await supabase.from('shot_lists').insert(shotsToInsert);
      if (sError) throw sError;

      alert('บันทึกโปรเจกต์เรียบร้อยแล้ว');
      setScript(null);
    } catch (error: any) {
      const details = error?.message || error?.details || error?.hint || JSON.stringify(error);
      console.error('Save Error:', error);
      alert(`บันทึกโปรเจกต์ไม่สำเร็จ: ${details}`);
    } finally {
      setSaving(false);
    }
  };

  const renderOptionRow = ({ label, options, value, customValue, onSelect, onCustomChange, customPlaceholder }: OptionFieldProps) => {
    const usingCustom = !options.includes(value);

    return (
      <div className="space-y-3">
        <p className="text-sm font-medium text-neutral-300">{label}</p>
        <div className="flex flex-wrap gap-2">
          {options.map((option) => (
            <Button
              key={option}
              type="button"
              variant={value === option ? 'default' : 'outline'}
              className={
                value === option
                  ? 'h-10 rounded-full border-primary bg-primary px-4 text-primary-foreground'
                  : 'h-10 rounded-full border-white/10 bg-white/5 px-4 text-neutral-300 hover:bg-white/10'
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
                ? 'h-10 rounded-full border-emerald-400 bg-emerald-500 px-4 text-black'
                : 'h-10 rounded-full border-white/10 bg-white/5 px-4 text-neutral-300 hover:bg-white/10'
            }
            onClick={() => onSelect(customValue.trim() || 'อื่น ๆ')}
          >
            อื่น ๆ
          </Button>
        </div>
        <Input
          value={customValue}
          onChange={(e) => {
            const next = e.target.value;
            onCustomChange(next);
            if (next.trim()) onSelect(next.trim());
          }}
          placeholder={customPlaceholder}
          className={
            usingCustom
              ? 'h-11 rounded-2xl border-emerald-400/60 bg-emerald-500/10 text-white placeholder:text-emerald-100/50 focus-visible:border-emerald-300 focus-visible:ring-emerald-300/30'
              : 'h-11 rounded-2xl border-white/10 bg-white/5 text-white placeholder:text-neutral-500'
          }
        />
        {usingCustom && <p className="text-xs text-emerald-300">ค่าที่พิมพ์เอง: {value}</p>}
      </div>
    );
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-8 animate-in fade-in duration-700">
      <Card className="border-white/10 bg-white/5">
        <CardHeader>
          <CardTitle className="text-3xl tracking-tight">สร้างสคริปต์วิดีโอ</CardTitle>
          <p className="text-muted-foreground">เลือกหัวข้อ, กลุ่มคนดู และโทนคลิป แล้วให้ระบบช่วยเรียบเรียงสคริปต์พร้อมเวลาแต่ละช็อตให้อัตโนมัติ</p>
        </CardHeader>
        <CardContent className="space-y-6">
          {renderOptionRow({ label: 'ประเภทวิดีโอ', options: topicOptions, value: topic, customValue: customTopic, onSelect: setTopic, onCustomChange: setCustomTopic, customPlaceholder: 'เช่น พาชมห้อง, สกินแคร์, สรุปข่าว' })}
          {shouldShowProduct && renderOptionRow({ label: 'สินค้า / สิ่งที่พูดถึง', options: productOptions, value: product, customValue: customProduct, onSelect: setProduct, onCustomChange: setCustomProduct, customPlaceholder: 'เช่น เซรั่ม, หูฟัง, ร้านกาแฟ, คอร์สภาษาอังกฤษ' })}
          {renderOptionRow({ label: 'กลุ่มคนดู', options: audienceOptions, value: audience, customValue: customAudience, onSelect: setAudience, onCustomChange: setCustomAudience, customPlaceholder: 'เช่น เจ้าของร้าน, วัยรุ่น, คนเริ่มเที่ยวเอง' })}
          {renderOptionRow({ label: 'โทนคลิป', options: toneOptions, value: tone, customValue: customTone, onSelect: setTone, onCustomChange: setCustomTone, customPlaceholder: 'เช่น หรู, ดราม่า, ขี้เล่น, ดูโปร' })}

          <div className="space-y-3">
            <p className="text-sm font-medium text-neutral-300">ความยาวคลิปรวม</p>
            <div className="flex flex-wrap gap-2">
              {durationOptions.map((seconds) => (
                <Button
                  key={seconds}
                  type="button"
                  variant={durationSeconds === seconds ? 'default' : 'outline'}
                  className={durationSeconds === seconds ? 'h-10 rounded-full border-sky-400 bg-sky-500 px-4 text-black' : 'h-10 rounded-full border-white/10 bg-white/5 px-4 text-neutral-300 hover:bg-white/10'}
                  onClick={() => setDurationSeconds(seconds)}
                >
                  <Clock3 className="mr-2 h-4 w-4" />
                  {seconds} วินาที
                </Button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-primary/80">สิ่งที่เลือก</p>
              <p className="mt-2 text-lg text-white">{prompt}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-neutral-300">
              {effectiveProduct ? (
                <div className="flex items-center gap-2 text-white"><Package2 className="h-4 w-4" /> โฟกัสที่: {effectiveProduct}</div>
              ) : (
                <div className="text-neutral-300">คลิปแบบนี้ไม่จำเป็นต้องระบุสินค้า ระบบจะโฟกัสที่เนื้อหาโดยรวมแทน</div>
              )}
              <div className="mt-2 text-neutral-300">เวลาต่อช็อตจะถูกจัดให้อัตโนมัติในสคริปต์</div>
            </div>
          </div>

          <Button onClick={handleGenerate} disabled={loading} className="h-12 rounded-full px-6">
            {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Send className="mr-2 h-5 w-5" />}
            สร้างสคริปต์
          </Button>
        </CardContent>
      </Card>

      {script && (
        <Card className="border-2 border-primary/20 bg-card/50 backdrop-blur">
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle className="text-2xl">{script.title}</CardTitle>
              <p className="mt-2 text-sm text-muted-foreground">ความยาวรวม {durationSeconds} วินาที พร้อมเวลาแต่ละช็อตในสคริปต์</p>
            </div>
            <Button variant="outline" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              บันทึกโปรเจกต์
            </Button>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[500px] pr-4">
              <div className="space-y-4">
                {script.shots.sort((a, b) => a.order_index - b.order_index).map((shot, i) => (
                  <div key={i} className="rounded-lg border border-secondary bg-secondary/30 p-4 transition-all hover:border-primary/50">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge variant={shot.shot_type === 'A-Roll' ? 'default' : 'secondary'}>{getShotTypeLabel(shot.shot_type)}</Badge>
                      <span className="font-mono text-xs text-muted-foreground">ช็อต #{shot.order_index}</span>
                      <span className="rounded-full border border-amber-300/30 bg-amber-400/10 px-2 py-1 text-xs text-amber-200">ประมาณ {shot.duration_seconds} วินาที</span>
                    </div>
                    <p className="text-sm leading-relaxed">{shot.script_text}</p>
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
