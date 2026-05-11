import PreProduction from './components/PreProduction';
import { Clapperboard } from 'lucide-react';

export default function App() {
  return (
    <div className="min-h-screen text-foreground">
      <nav className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/75 backdrop-blur-2xl">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-3 text-lg font-semibold tracking-tight text-white sm:text-xl">
            <div className="rounded-2xl bg-gradient-to-r from-[#D598FF] to-[#B09DFF] p-2 text-slate-800 shadow-md shadow-[#B09DFF]/0">
              <Clapperboard className="h-5 w-5" />
            </div>
            Lazy Pre-Production
          </div>
          <div className="hidden rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 md:block">
            วางแผนคลิปให้เห็นภาพก่อนถ่ายจริง
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-10 sm:py-14">
        <section className="mx-auto mb-8 max-w-5xl rounded-[2rem] border border-white/10 bg-[#62677f] px-6 py-8 shadow-2xl shadow-slate-950/20 backdrop-blur-xl sm:px-8 sm:py-8">
          <div className="max-w-3xl space-y-4">
            <p className="inline-flex rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-xs font-semibold tracking-[0.18em] text-amber-100 uppercase">
              AI Pre-Production
            </p>
            <h1 className="text-4xl font-black tracking-tight text-white sm:text-6xl">
              Lazy PrePro
            </h1>
            <p className="max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
              เลือก brief แบบง่าย ๆ หรือวางสคริปต์ที่มีอยู่แล้ว ระบบจะช่วยแยกช็อต, บอกใจความที่ต้องพูด, และระบุภาพที่ควรถ่ายให้เห็นชัดขึ้น
            </p>
          </div>
        </section>

        <PreProduction />
      </main>
    </div>
  );
}
