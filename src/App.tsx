import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Clapperboard, LogOut, MonitorSmartphone, Sparkles } from 'lucide-react';
import PreProduction from './components/PreProduction';
import ProductionStudio from './components/ProductionStudio';
import MobileProduction from './components/MobileProduction';
import { Button } from './components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { isSupabaseConfigured, supabase } from './lib/supabase';

type DesktopPage = 'prepro' | 'production';

function AuthScreen({ onLogin, loginPending }: { onLogin: () => void; loginPending: boolean }) {
  return (
    <main className="container mx-auto px-4 py-10 sm:py-14">
      <div className="mx-auto max-w-3xl space-y-6">
        <section className="rounded-[2rem] border border-white/8 bg-[#6d7189] px-6 py-8 shadow-2xl shadow-slate-950/20 backdrop-blur-xl sm:px-8 sm:py-8">
          <div className="max-w-2xl space-y-4">
            <p className="inline-flex rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs font-semibold tracking-[0.18em] text-[#f0eaff] uppercase">
              Login Required
            </p>
            <h1 className="text-4xl font-black tracking-tight text-white sm:text-6xl">Lazy PrePro</h1>
            <p className="max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
              เข้าสู่ระบบด้วย Google ก่อน เพื่อใช้งานหน้า pre-production บนคอม, สร้าง QR ให้มือถือสแกน, เลือกช็อต และรับคลิปกลับเข้าเครื่องคอมได้ใน workflow เดียว
            </p>
          </div>
        </section>

        <Card className="overflow-hidden border-white/8 bg-[#6d7189] shadow-2xl shadow-slate-950/20 backdrop-blur-xl">
          <CardHeader className="border-b border-white/8 bg-[#6d7189] px-6 pb-6 pt-6 sm:px-8">
            <CardTitle className="text-3xl font-black tracking-tight text-white">เข้าสู่ระบบก่อนเริ่มใช้งาน</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 p-6 sm:p-8">
            <div className="rounded-[1.5rem] border border-white/10 bg-white/6 p-5 text-slate-200">
              หลังล็อกอินแล้ว คุณจะได้ทั้งหน้าสร้างสคริปต์, คลังงาน, และ PC Control Center สำหรับให้มือถือสแกน QR แล้วส่งคลิปกลับเข้าคอมได้เลย
            </div>
            <Button
              type="button"
              onClick={onLogin}
              disabled={loginPending}
              className="h-12 rounded-2xl bg-gradient-to-r from-[#bf6de8] via-[#cc7bc5] to-[#e58a2a] px-6 text-base font-bold text-white hover:opacity-95"
            >
              <Sparkles className="mr-2 h-5 w-5" />
              {loginPending ? 'กำลังพาไปหน้า Google...' : 'เข้าสู่ระบบด้วย Google'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

export default function App() {
  const [desktopPage, setDesktopPage] = useState<DesktopPage>('prepro');
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginPending, setLoginPending] = useState(false);

  const mobileSessionId = useMemo(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode');
    const sessionId = params.get('session');
    if (mode === 'mobile' && sessionId) return sessionId;
    return null;
  }, []);

  useEffect(() => {
    if (!supabase || !isSupabaseConfigured) {
      setAuthLoading(false);
      return;
    }

    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session ?? null);
      setAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthLoading(false);
      setLoginPending(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleLogin = async () => {
    if (!supabase) return;
    setLoginPending(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (error) {
      setLoginPending(false);
      alert(`เข้าสู่ระบบไม่สำเร็จ: ${error.message}`);
    }
  };

  const handleLogout = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setDesktopPage('prepro');
  };

  if (mobileSessionId) {
    return <MobileProduction sessionId={mobileSessionId} />;
  }

  const requireAuth = Boolean(isSupabaseConfigured && supabase);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="rounded-[1.5rem] border border-white/10 bg-[#212437] px-6 py-4 text-white shadow-2xl shadow-slate-950/20">
          กำลังเตรียมระบบล็อกอิน...
        </div>
      </div>
    );
  }

  if (requireAuth && !session) {
    return (
      <div className="min-h-screen text-foreground">
        <nav className="sticky top-0 z-50 border-b border-white/8 bg-[#212437]/95 backdrop-blur-2xl">
          <div className="container mx-auto flex h-16 items-center justify-between px-4">
            <div className="flex items-center gap-3 text-lg font-semibold tracking-tight text-white sm:text-xl">
              <div className="rounded-2xl bg-[#bb95ff] p-2 text-[#2a2d40] shadow-md shadow-[#bb95ff]/10">
                <Clapperboard className="h-5 w-5" />
              </div>
              Lazy Pre-Production
            </div>
            <div className="hidden rounded-full border border-white/10 bg-white/6 px-5 py-2 text-sm text-slate-300 md:block">
              วางแผนคลิปให้เห็นภาพก่อนถ่ายจริง
            </div>
          </div>
        </nav>
        <AuthScreen onLogin={handleLogin} loginPending={loginPending} />
      </div>
    );
  }

  return (
    <div className="min-h-screen text-foreground">
      <nav className="sticky top-0 z-50 border-b border-white/8 bg-[#212437]/95 backdrop-blur-2xl">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-3 text-lg font-semibold tracking-tight text-white sm:text-xl">
            <div className="rounded-2xl bg-[#bb95ff] p-2 text-[#2a2d40] shadow-md shadow-[#bb95ff]/10">
              <Clapperboard className="h-5 w-5" />
            </div>
            Lazy Pre-Production
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDesktopPage('prepro')}
              className={`rounded-2xl border px-4 text-sm ${desktopPage === 'prepro' ? 'border-[#b48cff]/30 bg-[#8d65e7]/16 text-white' : 'border-white/10 bg-white/6 text-slate-300 hover:bg-white/10'}`}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Pre-Production
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDesktopPage('production')}
              className={`rounded-2xl border px-4 text-sm ${desktopPage === 'production' ? 'border-[#b48cff]/30 bg-[#8d65e7]/16 text-white' : 'border-white/10 bg-white/6 text-slate-300 hover:bg-white/10'}`}
            >
              <MonitorSmartphone className="mr-2 h-4 w-4" />
              PC Control Center
            </Button>
            {session?.user?.email ? (
              <div className="hidden rounded-full border border-white/10 bg-white/6 px-4 py-2 text-sm text-slate-300 md:block">
                {session.user.email}
              </div>
            ) : null}
            {requireAuth ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => { void handleLogout(); }}
                className="rounded-2xl border-white/10 bg-white/6 px-4 text-slate-300 hover:bg-white/10"
              >
                <LogOut className="mr-2 h-4 w-4" />
                ออกจากระบบ
              </Button>
            ) : null}
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-10 sm:py-14">
        <section className="mx-auto mb-8 max-w-5xl rounded-[2rem] border border-white/8 bg-[#6d7189] px-6 py-8 shadow-2xl shadow-slate-950/20 backdrop-blur-xl sm:px-8 sm:py-8">
          <div className="max-w-3xl space-y-4">
            <p className="inline-flex rounded-full border border-white/10 bg-white/6 px-3 py-1 text-xs font-semibold tracking-[0.18em] text-[#f0eaff] uppercase">
              AI Pre-Production
            </p>
            <h1 className="text-4xl font-black tracking-tight text-white sm:text-6xl">
              {desktopPage === 'prepro' ? 'Lazy PrePro' : 'PC Control Center'}
            </h1>
            <p className="max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
              {desktopPage === 'prepro'
                ? 'เลือก brief แบบง่าย ๆ หรือวางสคริปต์ที่มีอยู่แล้ว ระบบจะช่วยแยกช็อต, บอกใจความที่ต้องพูด, และระบุภาพที่ควรถ่ายให้เห็นชัดขึ้น'
                : 'เลือกสคริปต์จากคลัง สร้าง QR ให้มือถือสแกน เลือกช็อตที่จะถ่าย แล้วรับคลิปกลับเข้าคอมเพื่อเรียงและ export ออกได้ทันที'}
            </p>
            {!requireAuth ? (
              <div className="rounded-[1.25rem] border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm leading-6 text-amber-50">
                Supabase ยังไม่ถูกตั้งค่าในเครื่องนี้ ตอนนี้หน้า pre-production ใช้งานได้ แต่ Google login จะยังไม่ทำงานจนกว่าจะใส่ `VITE_SUPABASE_URL` และ `VITE_SUPABASE_ANON_KEY`
              </div>
            ) : null}
          </div>
        </section>

        {desktopPage === 'prepro' ? <PreProduction /> : <ProductionStudio />}
      </main>
    </div>
  );
}
