// ============================================
// SUPABASE CONNECTION
// ============================================
// Fill these in with YOUR project's values.
// Find them in Supabase: Project Settings → API
//   - Project URL           → SUPABASE_URL
//   - anon / publishable key → SUPABASE_ANON_KEY
// This key is safe to expose in frontend code — it's designed for
// that. Your RLS policies are what actually keep data private, not
// hiding this key.
// ============================================

const SUPABASE_URL = "https://hzihvnrygtyjwocqfxjq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6aWh2bnJ5Z3R5andvY3FmeGpxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc1MDAxNjMsImV4cCI6MjEwMzA3NjE2M30.miorferFiOJP4cBqgk4qOq2sljlLJVUhJTf0qv__R8E";

// FIX: wrap this in a try/catch and log loudly. Previously, if
// window.supabase (the CDN library) hadn't loaded yet, or the URL/key
// were malformed, createClient() would throw and `supabase` would
// simply never be assigned — every other file would then fail with a
// cryptic "supabase is not defined" or "cannot read properties of
// undefined" with zero clue as to *why*. Now the real reason gets
// printed straight to the console.
var supabase;
try {
  if (typeof window.supabase === "undefined" || !window.supabase.createClient) {
    throw new Error(
      "The Supabase library itself never loaded. This means the CDN <script> tag " +
      "(https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2) in your HTML <head> " +
      "either failed to load, or this script ran before that one finished loading. " +
      "Check your <script> tag order — supabase-client.js must load AFTER the CDN script."
    );
  }
  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  if (!supabase || !supabase.auth) {
    throw new Error("createClient() ran but returned something without an .auth property — double check SUPABASE_URL and SUPABASE_ANON_KEY are correct and not swapped.");
  }
  console.log("✅ Supabase client created successfully.");
} catch (err) {
  console.error("❌ Supabase client failed to initialize:", err.message, err);
}
