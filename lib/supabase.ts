import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

/** Lazily initialise the client — safe to import in both server and client bundles. */
export function getSupabase(): SupabaseClient {
  if (_client) return _client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Copy .env.local.example to .env.local and fill in your Supabase credentials.'
    )
  }
  _client = createClient(url, key)
  return _client
}

/** Convenience proxy so existing call-sites can use `supabase.from(...)` etc. */
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (getSupabase() as unknown as Record<string | symbol, unknown>)[prop]
  },
})

export type Session = {
  id: string
  question: string                          // legacy compat
  questions: string[]                       // all pre-set questions
  current_question_index: number
  status: 'waiting' | 'active' | 'revealed' | 'finished'
  created_at: string
}

export type Answer = {
  id: string
  session_id: string
  participant_name: string
  answer: string
  question_index: number
  submitted_at: string
}

export type Score = {
  id: string
  session_id: string
  participant_name: string
  total_points: number
}
