import { useMemo, useState } from 'react';
import { Clapperboard, Library, MonitorSmartphone, Smartphone, Sparkles } from 'lucide-react';
import PreProduction from './components/PreProduction';
import ProductionStudio from './components/ProductionStudio';
import MobileProduction from './components/MobileProduction';
import { Button } from './components/ui/button';

type DesktopPage = 'prepro' | 'library' | 'production' | 'one-device';

export default function App() {
  const [desktopPage, setDesktopPage] = useState<DesktopPage>('prepro');

  const mobileRoute = useMemo(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode');
    const sessionId = params.get('session');
    const mock = params.get('mock') === '1';

    if (mode === 'one-device') {
      return {
        sessionId: 'one-device',
        mock: false,
        standalone: true,
      };
    }

    if (mode === 'mobile' && (sessionId || mock)) {
      return {
        sessionId: sessionId ?? 'mock-session',
        mock,
        standalone: false,
      };
    }

    return null;
  }, []);

  if (mobileRoute) {
    return <MobileProduction sessionId={mobileRoute.sessionId} mock={mobileRoute.mock} standalone={mobileRoute.standalone} />;
  }

  if (desktopPage === 'one-device') {
    return <MobileProduction sessionId="one-device" standalone onExit={() => setDesktopPage('prepro')} />;
  }

  return (
    <div className="min-h-screen text-foreground">
      <nav className="sticky top-0 z-50 border-b border-white/8 bg-[#212437]/95 backdrop-blur-2xl">
        <div className="container mx-auto flex min-h-16 flex-col gap-3 px-4 py-3 sm:h-16 sm:flex-row sm:items-center sm:justify-between sm:py-0">
          <div className="flex items-center gap-3 text-lg font-semibold tracking-tight text-white sm:text-xl">
            <div className="rounded-2xl bg-[#bb95ff] p-2 text-[#2a2d40] shadow-md shadow-[#bb95ff]/10">
              <Clapperboard className="h-5 w-5" />
            </div>
            Reelio
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDesktopPage('prepro')}
              className={`min-h-11 flex-1 rounded-2xl border px-4 text-sm sm:flex-none ${desktopPage === 'prepro' ? 'border-[#b48cff]/30 bg-[#8d65e7]/16 text-white' : 'border-white/10 bg-white/6 text-slate-300 hover:bg-white/10'}`}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Pre-Production
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDesktopPage('production')}
              className={`min-h-11 flex-1 rounded-2xl border px-4 text-sm sm:flex-none ${desktopPage === 'production' ? 'border-[#b48cff]/30 bg-[#8d65e7]/16 text-white' : 'border-white/10 bg-white/6 text-slate-300 hover:bg-white/10'}`}
            >
              <MonitorSmartphone className="mr-2 h-4 w-4" />
              Control Center
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDesktopPage('one-device')}
              className={`min-h-11 flex-1 rounded-2xl border px-4 text-sm sm:flex-none ${desktopPage === 'one-device' ? 'border-[#b48cff]/30 bg-[#8d65e7]/16 text-white' : 'border-white/10 bg-white/6 text-slate-300 hover:bg-white/10'}`}
            >
              <Smartphone className="mr-2 h-4 w-4" />
              Camera
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDesktopPage('library')}
              className={`min-h-11 flex-1 rounded-2xl border px-4 text-sm sm:flex-none ${desktopPage === 'library' ? 'border-[#b48cff]/30 bg-[#8d65e7]/16 text-white' : 'border-white/10 bg-white/6 text-slate-300 hover:bg-white/10'}`}
            >
              <Library className="mr-2 h-4 w-4" />
              My Project
            </Button>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-3 py-6 sm:px-4 sm:py-10 md:py-12">
        <section className="mx-auto mb-8 max-w-5xl rounded-[2rem] border border-white/8 bg-[#6d7189] px-6 py-8 shadow-2xl shadow-slate-950/20 backdrop-blur-xl sm:px-8 sm:py-8">
          <div className="max-w-3xl space-y-4">
            <p className="inline-flex rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs font-semibold tracking-[0.18em] text-[#f0eaff] uppercase">
              Reelio : your all-in-one content creation companion
            </p>
            <h1 className="text-4xl font-black tracking-tight text-white sm:text-6xl">
              {desktopPage === 'prepro' ? 'Pre-Production' : desktopPage === 'library' ? 'My Project' : 'Control Center'}
            </h1>
            <p className="max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
              {desktopPage === 'prepro'
                ? 'เลือก brief แบบง่าย ๆ หรือวางสคริปต์ที่มีอยู่แล้ว ระบบจะช่วยแยกช็อต, บอกใจความที่ต้องพูด, และระบุภาพที่ควรถ่ายให้เห็นชัดขึ้น'
                : desktopPage === 'library'
                  ? 'รวมงานที่เคยสร้างไว้ในเบราว์เซอร์นี้ พร้อมเช็กความคืบหน้าของแต่ละงานและกลับเข้าไปจัดการช็อตต่อได้ทันที'
                  : 'เลือกสคริปต์จากคลัง เลือกช็อตที่จะถ่าย แล้วรับคลิปกลับเข้าคอมเพื่อเรียงและ export ออกได้ทันที'}
            </p>
          </div>
        </section>

        {desktopPage === 'production' ? <ProductionStudio /> : <PreProduction initialPageView={desktopPage === 'library' ? 'library' : 'editor'} />}
      </main>
    </div>
  );
}
