import { useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, Clapperboard, Library, MonitorSmartphone, Sparkles } from 'lucide-react';
import PreProduction from './components/PreProduction';
import ProductionStudio from './components/ProductionStudio';
import MobileProduction from './components/MobileProduction';
import { Button } from './components/ui/button';

type DesktopPage = 'prepro' | 'library' | 'production' | 'one-device';

export default function App() {
  const [hasStarted, setHasStarted] = useState(false);
  const [desktopPage, setDesktopPage] = useState<DesktopPage>('prepro');
  const navItems = [
    { step: 1, key: 'create' as const, page: 'prepro' as const, label: 'Create', fullLabel: 'สร้างสคริปต์', icon: Sparkles },
    { step: 2, key: 'shoot' as const, page: 'production' as const, label: 'Shoot', fullLabel: 'ถ่ายคลิป', icon: MonitorSmartphone },
    { step: 3, key: 'projects' as const, page: 'library' as const, label: 'Projects', fullLabel: 'โปรเจกต์', icon: Library },
  ];

  const activeNavKey = desktopPage === 'library' ? 'projects' : desktopPage === 'production' || desktopPage === 'one-device' ? 'shoot' : 'create';

  const navigateByKey = (key: (typeof navItems)[number]['key']) => {
    if (key === 'shoot') {
      const shouldUseCamera = typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches;
      setDesktopPage(shouldUseCamera ? 'one-device' : 'production');
      return;
    }

    const item = navItems.find((entry) => entry.key === key);
    if (item) setDesktopPage(item.page);
  };

  const startAt = (key: (typeof navItems)[number]['key']) => {
    setHasStarted(true);
    navigateByKey(key);
  };

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

  if (!hasStarted) {
    return (
      <div className="cream-app min-h-screen text-foreground">
        <main className="container mx-auto flex min-h-screen items-center px-4 py-8">
          <section className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center">
            <div className="space-y-6 rounded-[2.25rem] border border-[#eadfce] bg-[#fffaf1]/90 p-6 shadow-2xl shadow-[#7b4a1e]/10 backdrop-blur-xl sm:p-10">
              <div className="flex items-center gap-3 text-lg font-black tracking-tight text-[#2f241d] sm:text-xl">
                <div className="rounded-2xl bg-[#2f241d] p-2 text-[#fff7e8] shadow-md shadow-[#9c5a24]/10">
                  <Clapperboard className="h-5 w-5" />
                </div>
                Reelio
              </div>
              <div className="space-y-4">
                <p className="inline-flex rounded-full border border-[#eadfce] bg-white/70 px-3 py-1 text-xs font-bold tracking-[0.18em] text-[#9a4d22] uppercase">
                  AI video workflow for short-form creators
                </p>
                <h1 className="max-w-3xl text-5xl font-black leading-[0.95] tracking-tight text-[#2f241d] sm:text-7xl">
                  Reelio 
                </h1>
                <p className="max-w-2xl text-base leading-8 text-[#6a5c51] sm:text-lg">
                  ช่วยคิดสคริปต์ แยกช็อต บอกข้อความบนวิดีโอ แล้วพาไปถ่ายตามลำดับโดยไม่ต้องเดาว่าต้องทำอะไรต่อ
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  ['1', 'สร้าง', 'กรอก brief หรือวางสคริปต์เดิม'],
                  ['2', 'ถ่าย', 'มือถือเปิดกล้อง คอมเปิด Control Center'],
                  ['3', 'Export', 'รวมคลิปซ้ำทุก take พร้อมไฟล์ประกอบ'],
                ].map(([step, title, detail]) => (
                  <div key={step} className="rounded-[1.5rem] border border-[#eadfce] bg-white/70 p-4">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#fff0dc] text-sm font-black text-[#8b3d18]">{step}</span>
                      <p className="text-lg font-black text-[#2f241d]">{title}</p>
                    </div>
                    <p className="mt-1 text-sm leading-6 text-[#6a5c51]">{detail}</p>
                  </div>
                ))}
              </div>
              <div className="grid gap-3 sm:flex sm:flex-wrap">
                <Button
                  type="button"
                  onClick={() => startAt('create')}
                  className="min-h-14 rounded-2xl bg-[#FFAC6F] px-6 text-base font-black text-[#2f241d] shadow-lg shadow-[#7b4a1e]/10"
                >
                  เริ่มสร้างคอนเทนต์
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => startAt('projects')}
                  className="min-h-14 rounded-2xl border-[#eadfce] bg-white/70 px-6 text-base font-black text-[#5f5148] hover:bg-[#fff3df]"
                >
                  เปิดโปรเจกต์เดิม
                </Button>
              </div>
            </div>

            <aside className="space-y-4 rounded-[2rem] border border-[#eadfce] bg-white/75 p-5 shadow-2xl shadow-[#7b4a1e]/8 backdrop-blur-xl">
              <p className="ml-2 text-md font-black uppercase text-[#9a4d22]">วิธีใช้ครั้งแรก</p>
              {[
                'เลือกประเภทคลิป แพลตฟอร์ม กลุ่มคนดู และ CTA',
                'อ่านสคริปต์และช็อตลิสต์ที่ AI ทำให้ แล้วแก้ได้ทันที',
                'กดถ่ายคลิปตามช็อต มือถือจะเข้า Camera ส่วนคอมจะเข้า Control Center',
                'Export ZIP เพื่อรับคลิป MP4 ทุก take พร้อม SRT/CSV/TXT',
              ].map((item) => (
                <div key={item} className="flex gap-3 rounded-2xl border border-[#eadfce] bg-[#fffaf1] p-4">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#d56f2c]" />
                  <p className="text-sm font-semibold leading-6 text-[#5f5148]">{item}</p>
                </div>
              ))}
            </aside>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="cream-app min-h-screen pb-24 text-foreground sm:pb-0">
      <nav className="sticky top-0 z-50 border-b border-[#eadfce] bg-[#fffaf1]/90 backdrop-blur-2xl">
        <div className="container mx-auto flex min-h-16 items-center justify-between gap-3 px-4 py-3 sm:h-16 sm:py-0">
          <div className="flex items-center gap-3 text-lg font-black tracking-tight text-[#2f241d] sm:text-xl">
            <div className="rounded-2xl bg-[#2f241d] p-2 text-[#fff7e8] shadow-md shadow-[#9c5a24]/10">
              <Clapperboard className="h-5 w-5" />
            </div>
            Reelio
          </div>
          <div className="hidden items-center gap-2 sm:flex">
            {navItems.map(({ step, key, fullLabel, icon: Icon }) => {
              const active = activeNavKey === key;
              return (
              <Button
                key={key}
                type="button"
                variant="outline"
                onClick={() => navigateByKey(key)}
                aria-label={`${step}. ${fullLabel}`}
                className={`h-13 rounded-full border transition-all duration-300 ${active ? 'border-[#f0c7a8] bg-[#fff0dc] px-4 text-[#8b3d18] shadow-sm' : 'w-13 border-[#eadfce] bg-white/80 px-0 text-[#5f5148] hover:bg-[#fff7e8]'}`}
              >
                {active ? (
                  <>
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/85 text-base font-black leading-none">{step}</span>
                    <span className="ml-3 whitespace-nowrap text-base font-black leading-none">{fullLabel}</span>
                    <Icon className="ml-2 h-5 w-5 shrink-0" />
                  </>
                ) : (
                  <span className="inline-flex h-full w-full items-center justify-center text-base font-black leading-none">{step}</span>
                )}
              </Button>
            );
            })}
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-3 py-4 sm:px-4 sm:py-8 md:py-10">
        <section className="mx-auto mb-5 max-w-6xl overflow-hidden rounded-[2rem] border border-[#eadfce] bg-[#fffaf1]/88 shadow-2xl shadow-[#7b4a1e]/8 backdrop-blur-xl sm:mb-8">
          <div className="p-5 sm:p-8">
          <div className="max-w-3xl space-y-4">
            <p className="inline-flex rounded-full border border-[#eadfce] bg-white/70 px-3 py-1 text-xs font-bold tracking-[0.18em] text-[#9a4d22] uppercase">
              Reelio : content creation, but make it easy
            </p>
            <h1 className="text-4xl font-black tracking-tight text-[#2f241d] sm:text-6xl">
              {desktopPage === 'prepro' ? 'Pre-Production' : desktopPage === 'library' ? 'My Project' : desktopPage === 'one-device' ? 'Camera' : 'Control Center'}
            </h1>
            <p className="text-base leading-7 text-[#6a5c51] sm:text-lg">
              {desktopPage === 'prepro'
                ? 'เลือก brief แบบง่าย ๆ หรือวางสคริปต์ที่มีอยู่แล้ว ระบบจะช่วยแยกช็อต, บอกใจความที่ต้องพูด, และระบุภาพที่ควรถ่ายให้เห็นชัดขึ้น'
                : desktopPage === 'library'
                  ? 'รวมงานที่เคยสร้างไว้ในเบราว์เซอร์นี้ พร้อมเช็กความคืบหน้าของแต่ละงานและกลับเข้าไปจัดการช็อตต่อได้ทันที'
                  : desktopPage === 'one-device'
                    ? 'เปิดกล้องบนเครื่องเดียว เลือกโปรเจกต์และช็อต แล้วถ่ายตามสคริปต์ได้เลยโดยไม่ต้องสแกน QR'
                  : 'เลือกสคริปต์จากคลัง เลือกช็อตที่จะถ่าย แล้วรับคลิปกลับเข้าคอมเพื่อเรียงและ export ออกได้ทันที'}
            </p>
          </div>
          </div>
        </section>

        {desktopPage === 'production' ? (
          <ProductionStudio />
        ) : (
          <PreProduction
            initialPageView={desktopPage === 'library' ? 'library' : 'editor'}
            onStartProduction={() => navigateByKey('shoot')}
            onBackToEditor={() => setDesktopPage('prepro')}
            onBackToLibrary={() => setDesktopPage('library')}
          />
        )}
      </main>

      <div className="fixed inset-x-3 bottom-3 z-50 rounded-[1.5rem] border border-[#eadfce] bg-[#fffaf1]/95 p-2 shadow-2xl shadow-[#7b4a1e]/15 backdrop-blur-2xl sm:hidden">
        <div className="grid grid-cols-3 gap-1">
          {navItems.map(({ step, key, label, fullLabel, icon: Icon }) => {
            const active = activeNavKey === key;
            return (
            <button
              key={key}
              type="button"
              onClick={() => navigateByKey(key)}
              className={`flex h-14 items-center justify-center rounded-full font-black transition-all duration-300 ${active ? 'gap-2 bg-[#fff0dc] px-3 text-[#8b3d18]' : 'gap-0 px-1 text-[#6a5c51]'}`}
              aria-label={`${step}. ${fullLabel}`}
            >
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/80 text-sm font-black">{step}</span>
              <span className={`overflow-hidden whitespace-nowrap text-xs transition-all ${active ? 'max-w-20 opacity-100' : 'max-w-0 opacity-0'}`}>{label}</span>
              {active ? <Icon className="h-4 w-4 shrink-0" /> : null}
            </button>
          );
          })}
        </div>
      </div>
    </div>
  );
}
