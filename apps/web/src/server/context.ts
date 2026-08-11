import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function createContext() {
  const supabase = await createSupabaseServerClient()
  const { data } = await supabase.auth.getUser()

  return {
    supabase,
    user: data.user,
  }
}

export type Context = Awaited<ReturnType<typeof createContext>>
