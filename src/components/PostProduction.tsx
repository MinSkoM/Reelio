import React, { useState, useEffect } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { getVideosByProject } from '../lib/db';
import { supabase } from '../lib/supabase';
import { getShotTypeLabel } from '../lib/shotLabels';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { FileVideo, FileText, Loader2, Archive } from 'lucide-react';

export default function PostProduction() {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from('projects')
      .select('*, shot_lists(*)')
      .order('created_at', { ascending: false });

    if (data) setProjects(data);
    setLoading(false);
  };

  const handleExport = async (project: any) => {
    setExporting(project.id);
    try {
      const zip = new JSZip();
      const folder = zip.folder(project.title.replace(/[^a-z0-9]/gi, '_'));

      const scripts = project.shot_lists
        .sort((a: any, b: any) => a.order_index - b.order_index)
        .map((s: any) => `[${getShotTypeLabel(s.shot_type)}] ช็อต ${s.order_index}:\n${s.script_text}\n`)
        .join('\n---\n\n');

      folder?.file('scripts.txt', scripts);

      const videos = await getVideosByProject(project.id);
      const videoFolder = folder?.folder('raw_footage');

      for (const video of videos) {
        videoFolder?.file(video.fileName, video.blob);
      }

      const content = await zip.generateAsync({ type: 'blob' });
      saveAs(content, `${project.title.replace(/[^a-z0-9]/gi, '_')}_CapCut_Assets.zip`);
    } catch (error) {
      console.error('Export error:', error);
      alert('ส่งออกไฟล์ไม่สำเร็จ');
    } finally {
      setExporting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 grayscale opacity-50">
        <Loader2 className="w-8 h-8 animate-spin mb-4" />
        <p>กำลังโหลดโปรเจกต์...</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-8">
      <div className="space-y-4">
        <h2 className="text-3xl font-bold tracking-tight">รวมไฟล์หลังถ่าย</h2>
        <p className="text-muted-foreground">ดาวน์โหลดสคริปต์และคลิปที่ถ่ายไว้เป็นไฟล์ ZIP เพื่อนำไปตัดต่อได้เลย</p>
      </div>

      <div className="grid gap-6">
        {projects.map((project) => (
          <Card key={project.id} className="bg-secondary/10 border-white/5 hover:bg-secondary/20 transition-colors">
            <CardContent className="p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <h3 className="text-xl font-semibold">{project.title}</h3>
                  <Badge variant="outline" className="text-[10px] font-mono">
                    {project.shot_lists.length} ช็อต
                  </Badge>
                </div>
                <div className="flex items-center gap-4 text-sm text-neutral-500">
                  <span className="flex items-center gap-1">
                    <FileText className="w-3 h-3" />
                    สคริปต์พร้อมใช้
                  </span>
                  <span className="flex items-center gap-1">
                    <FileVideo className="w-3 h-3" />
                    มีไฟล์คลิป
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 w-full md:w-auto">
                <Button onClick={() => handleExport(project)} disabled={!!exporting} className="flex-1 md:flex-none rounded-full px-6">
                  {exporting === project.id ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Archive className="w-4 h-4 mr-2" />}
                  ส่งออก ZIP
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        {projects.length === 0 && (
          <div className="text-center py-20 bg-white/5 rounded-3xl border border-dashed border-white/10">
            <div className="bg-white/5 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <Archive className="w-8 h-8 text-neutral-600" />
            </div>
            <p className="text-neutral-500">ยังไม่มีโปรเจกต์ เริ่มจากหน้าสร้างสคริปต์ได้เลย</p>
          </div>
        )}
      </div>
    </div>
  );
}
