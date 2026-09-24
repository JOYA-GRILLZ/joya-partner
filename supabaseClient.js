import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Exposé pour que main.jsx puisse afficher un écran d'erreur clair AVANT
// de monter l'app, plutôt que de laisser un plantage silencieux produire
// une page blanche sans aucun message.
export const isSupabaseConfigured = Boolean(url && anonKey);

// Client unique, partagé par toute l'app. Toujours la clé "anon" publique —
// jamais "service_role" (qui contournerait la RLS et n'a rien à faire dans
// un frontend). Si la config manque, on crée quand même un client (avec des
// valeurs inertes) pour ne jamais planter à l'import du module : c'est
// main.jsx qui décide alors d'afficher un message clair plutôt que l'app.
export const supabase = createClient(
  url || "https://placeholder.supabase.co",
  anonKey || "placeholder-anon-key"
);
