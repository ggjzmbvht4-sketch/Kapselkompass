import { createClient } from "@supabase/supabase-js";
const url = import.meta.env.VITE_SUPABASE_URL,
  key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const configured = Boolean(url && key);
export const supabase = configured
  ? createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
export const redirectUrl = () => location.origin + import.meta.env.BASE_URL;

// A sync pass keeps the initiating identity even if another account signs in while it is in flight.
export async function sessionClient(user: string) {
  if (!supabase) throw Error("Supabase ist nicht eingerichtet.");
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session || data.session.user.id !== user)
    throw Error("Anmeldung geändert. Bitte erneut synchronisieren.");
  const accessToken = data.session.access_token;
  return createClient(url, key, {
    accessToken: async () => accessToken,
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
