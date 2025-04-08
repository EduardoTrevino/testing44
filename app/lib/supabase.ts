import { createClient, SupabaseClient } from '@supabase/supabase-js';
// Declare the instance variable, initially nullas niull this should hopefully let us bypass it
// Adam if this doesnt work we can Use 'any' or a more specific type if needed before initialization,
// but SupabaseClient | null is best and should be fine

// Function to get or create the Supabase client instance
export function getSupabaseClient(): SupabaseClient {
  // If the instance already exists, return it (Singleton pattern from here Adam let me know if this causes issues on your end it shouldnt )
  let supabaseInstance: SupabaseClient | null = null;
  if (supabaseInstance) {
    return supabaseInstance;
  }
  // Read environment variables *at runtime* when this function is first called that way it doesnt get called during the build or at least it shouldnt lol
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  console.log('supabase URL ',supabaseUrl);
  console.log('supabase URL ',supabaseUrl);
  // Validate that the variables are actually set *at runtime* so this shouldnt get called during th ebuild
  // This prevents errors if they are missing in the deployment environment
  if (!supabaseUrl) {
    throw new Error("Supabase URL is not defined. Missing NEXT_PUBLIC_SUPABASE_URL environment variable.");
  }
  if (!supabaseAnonKey) {
    throw new Error("Supabase anonymous key is not defined. Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable.");
  }
  // Create the Supabase client instance *only now* to prevent it and then
  supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
  // Return the newly created instance :)
  return supabaseInstance;
}
// i will still export the type for convenience elsewhere or if we grow the webapp but for now this is fine
export type { SupabaseClient };
// we don’t export a pre-created client anymore: basically I removed this line
// export const supabase = createClient(supabaseUrl, supabaseAnonKey);