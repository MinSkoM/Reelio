-- 1. Create Tables
-- Users table (profile extension)
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Projects table
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    ai_prompt TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Shot Lists table
CREATE TABLE IF NOT EXISTS public.shot_lists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    shot_type TEXT CHECK (shot_type IN ('A-Roll', 'B-Roll')) NOT NULL,
    script_text TEXT NOT NULL,
    status TEXT DEFAULT 'pending', -- 'pending', 'recorded'
    order_index INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shot_lists ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies

-- Users: Users can see and update only their own profile
CREATE POLICY "Users can view own profile" ON public.users
    FOR SELECT USING (auth.uid() = id);

-- Projects: Users can only access their own projects
CREATE POLICY "Users can create their own projects" ON public.projects
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own projects" ON public.projects
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own projects" ON public.projects
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own projects" ON public.projects
    FOR DELETE USING (auth.uid() = user_id);

-- Shot Lists: Derived from project ownership
CREATE POLICY "Users can view shot lists of their projects" ON public.shot_lists
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.projects
            WHERE projects.id = shot_lists.project_id
            AND projects.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert shot lists for their projects" ON public.shot_lists
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.projects
            WHERE projects.id = shot_lists.project_id
            AND projects.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update shot lists for their projects" ON public.shot_lists
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.projects
            WHERE projects.id = shot_lists.project_id
            AND projects.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete shot lists for their projects" ON public.shot_lists
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.projects
            WHERE projects.id = shot_lists.project_id
            AND projects.user_id = auth.uid()
        )
    );

-- 4. Triggers for User Creation (Optional but recommended)
-- This automatically creates a profile when someone signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email)
  VALUES (new.id, new.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
