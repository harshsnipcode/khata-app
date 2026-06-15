import { createClient } from "@supabase/supabase-js";

// Read values from environment (Vite) for security and easier config.
// Create a `.env` file with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://nqciyviiizulkaipwwbi.supabase.co";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_25O7qf9JI7G8g_EfZ0z2Yw_-vgJtF1z";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);