import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = url && key
  ? createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // OAuth（Google）から戻った際のトークンは App 側で明示的に処理する
        detectSessionInUrl: false,
      },
    })
  : null;
