import { useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import { Button } from './components/ui/button';
import PreProduction from './components/PreProduction';
import { Video, LogIn, LogOut, Sparkles } from 'lucide-react';

export default function App() {
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
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

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-50 font-sans">
      <nav className="sticky top-0 z-50 border-b border-white/5 bg-black/20 backdrop-blur-xl">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2 text-xl font-bold tracking-tighter">
            <div className="rounded-lg bg-primary p-1.5">
              <Video className="h-5 w-5 text-primary-foreground" />
            </div>
            Tudtor Pre-Production
          </div>

          {session ? (
            <Button variant="ghost" className="text-sm" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          ) : (
            <Button size="sm" onClick={handleLogin}>
              <LogIn className="mr-2 h-4 w-4" />
              Login
            </Button>
          )}
        </div>
      </nav>

      <main className="container mx-auto px-4 py-12">
        {!session ? (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/5">
              <Sparkles className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="space-y-2">
              <h1 className="bg-gradient-to-b from-white to-white/40 bg-clip-text text-5xl font-black tracking-tighter text-transparent sm:text-7xl">
                Plan Better,<br />Shoot Smarter.
              </h1>
              <p className="mx-auto max-w-2xl pt-4 text-lg text-muted-foreground">
                Build your video brief, generate a ready-to-shoot script, and save the project in one focused pre-production workspace.
              </p>
            </div>
            {!isSupabaseConfigured && (
              <div className="max-w-2xl rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                Add <code className="font-mono">VITE_SUPABASE_URL</code> and <code className="font-mono">VITE_SUPABASE_ANON_KEY</code> to <code className="font-mono">.env.local</code> to enable login and project sync.
              </div>
            )}
            <Button size="lg" onClick={handleLogin} className="mt-8 rounded-full px-10 py-8 text-xl transition-transform active:scale-95">
              Open Pre-Production
            </Button>
          </div>
        ) : (
          <PreProduction />
        )}
      </main>
    </div>
  );
}
