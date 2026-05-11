import { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import { Button } from './components/ui/button';
import PreProduction from './components/PreProduction';
import PCDashboard from './components/PCDashboard';
import MobileProduction from './components/MobileProduction';
import PostProduction from './components/PostProduction';
import { Video, LogIn, LogOut, Layout, Tv, Smartphone, Archive } from 'lucide-react';

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [view, setView] = useState<'pre' | 'pc' | 'mobile' | 'post'>('pre');
  const [mobileSessionId, setMobileSessionId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode');
    const sessionId = params.get('session');

    if (mode === 'mobile' && sessionId) {
      setView('mobile');
      setMobileSessionId(sessionId);
    }

    if (!supabase) return;

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = () => {
    if (!supabase) {
      alert('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local before logging in.');
      return;
    }
    supabase.auth.signInWithOAuth({ provider: 'google' });
  };

  const handleLogout = () => {
    supabase?.auth.signOut();
  };

  if (view === 'mobile' && mobileSessionId) {
    return <MobileProduction sessionId={mobileSessionId} />;
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-50 font-sans">
      <nav className="border-b border-white/5 bg-black/20 backdrop-blur-xl sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-xl tracking-tighter cursor-pointer" onClick={() => setView('pre')}>
            <div className="bg-primary p-1.5 rounded-lg">
              <Video className="w-5 h-5 text-primary-foreground" />
            </div>
            CapCut Companion
          </div>

          <div className="flex items-center gap-4">
            {session && (
              <div className="flex items-center bg-white/5 rounded-full p-1 border border-white/10 mr-4">
                <Button
                  variant={view === 'pre' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="rounded-full px-4 h-8 text-xs"
                  onClick={() => setView('pre')}
                >
                  <Layout className="w-3 h-3 mr-2" />
                  Pre-Prod
                </Button>
                <Button
                  variant={view === 'pc' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="rounded-full px-4 h-8 text-xs"
                  onClick={() => setView('pc')}
                >
                  <Tv className="w-3 h-3 mr-2" />
                  Production
                </Button>
                <Button
                  variant={view === 'post' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="rounded-full px-4 h-8 text-xs"
                  onClick={() => setView('post')}
                >
                  <Archive className="w-3 h-3 mr-2" />
                  Post-Prod
                </Button>
              </div>
            )}

            {session ? (
              <Button variant="ghost" className="text-sm" onClick={handleLogout}>
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </Button>
            ) : (
              <Button size="sm" onClick={handleLogin}>
                <LogIn className="w-4 h-4 mr-2" />
                Login
              </Button>
            )}
          </div>
        </div>
      </nav>

      <main className="container mx-auto py-12 px-4">
        {!session ? (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-6">
            <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center border border-white/10">
              <Smartphone className="w-8 h-8 text-muted-foreground" />
            </div>
            <div className="space-y-2">
              <h1 className="text-5xl font-black tracking-tighter sm:text-7xl bg-gradient-to-b from-white to-white/40 bg-clip-text text-transparent">
                Create Better,<br />Faster.
              </h1>
              <p className="text-muted-foreground max-w-lg mx-auto text-lg pt-4">
                The ultimate companion for content creators. Sync your phone as a teleprompter, record wirelessly to PC, and export ready-to-edit clips for CapCut.
              </p>
            </div>
            {!isSupabaseConfigured && (
              <div className="max-w-2xl rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                Add <code className="font-mono">VITE_SUPABASE_URL</code> and <code className="font-mono">VITE_SUPABASE_ANON_KEY</code> to <code className="font-mono">.env.local</code> to enable login and project sync.
              </div>
            )}
            <Button size="lg" onClick={handleLogin} className="px-10 py-8 text-xl rounded-full mt-8 active:scale-95 transition-transform">
              Join the Workshop
            </Button>
          </div>
        ) : (
          <>
            {view === 'pre' && <PreProduction />}
            {view === 'pc' && <PCDashboard />}
            {view === 'post' && <PostProduction />}
          </>
        )}
      </main>

      <footer className="border-t border-white/5 py-12 mt-20">
        <div className="container mx-auto px-4 text-center">
          <div className="flex justify-center gap-8 mb-6 opacity-30 grayscale hover:grayscale-0 transition-all">
            <Video className="w-6 h-6" />
            <Smartphone className="w-6 h-6" />
            <Tv className="w-6 h-6" />
          </div>
          <p className="text-sm text-neutral-500">&copy; 2026 CapCut Companion Workshop. No cloud processing required.</p>
        </div>
      </footer>
    </div>
  );
}
