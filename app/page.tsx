'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import dynamicImport from 'next/dynamic'
import { supabase, type Answer, type Session } from '@/lib/supabase'
import { groupAnswers, type AnswerGroup } from '@/lib/gameLogic'
import Leaderboard from '@/components/Leaderboard'

// Load AnswerCloud only on the client (D3 needs the DOM)
const AnswerCloud = dynamicImport(() => import('@/components/AnswerCloud'), { ssr: false })

const CLOUD_HEIGHT = 480

export default function AdminPage() {
  const [question, setQuestion] = useState('')
  const [inputQ, setInputQ] = useState('')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [status, setStatus] = useState<Session['status']>('waiting')
  const [answers, setAnswers] = useState<Answer[]>([])
  const [groups, setGroups] = useState<AnswerGroup[]>([])
  const [revealed, setRevealed] = useState(false)
  const [cloudWidth, setCloudWidth] = useState(800)
  const cloudRef = useRef<HTMLDivElement>(null)

  // Measure cloud container
  useEffect(() => {
    const measure = () => {
      if (cloudRef.current) setCloudWidth(cloudRef.current.offsetWidth)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  // Recompute groups whenever answers change
  useEffect(() => {
    setGroups(groupAnswers(answers))
  }, [answers])

  // Subscribe to realtime answer inserts
  useEffect(() => {
    if (!sessionId) return

    const channel = supabase
      .channel(`answers:${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'answers', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          setAnswers((prev) => [...prev, payload.new as Answer])
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [sessionId])

  const handleStartSession = useCallback(async () => {
    if (!inputQ.trim()) return
    const q = inputQ.trim()

    const { data, error } = await supabase
      .from('sessions')
      .insert({ question: q, status: 'active' })
      .select()
      .single()

    if (error || !data) {
      alert('Failed to create session: ' + (error?.message ?? 'unknown'))
      return
    }

    setSessionId(data.id)
    setQuestion(q)
    setStatus('active')
    setAnswers([])
    setGroups([])
    setRevealed(false)
  }, [inputQ])

  const handleReveal = useCallback(async () => {
    if (!sessionId) return
    setRevealed(true)
    setStatus('revealed')

    await supabase
      .from('sessions')
      .update({ status: 'revealed' })
      .eq('id', sessionId)
  }, [sessionId])

  const handleReset = useCallback(() => {
    setSessionId(null)
    setQuestion('')
    setInputQ('')
    setStatus('waiting')
    setAnswers([])
    setGroups([])
    setRevealed(false)
  }, [])

  const joinUrl = sessionId
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/join?s=${sessionId}`
    : null

  return (
    <main className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(135deg,#0a0a0f 0%,#0d0d1a 100%)' }}>
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-sm font-bold">G</div>
          <span className="text-white font-semibold tracking-tight text-lg">GreatMindsAlike</span>
        </div>
        {status === 'active' && (
          <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Live · {answers.length} response{answers.length !== 1 ? 's' : ''}
          </div>
        )}
      </header>

      <div className="flex-1 flex flex-col items-center px-6 py-8 gap-8">

        {/* SETUP STATE */}
        <AnimatePresence mode="wait">
          {status === 'waiting' && (
            <motion.div
              key="setup"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-xl flex flex-col gap-4 mt-12"
            >
              <h1 className="text-4xl font-bold text-center text-white tracking-tight">
                Start a new round
              </h1>
              <p className="text-center text-white/40 text-sm">
                Everyone guesses what the <em>majority</em> will answer.
              </p>
              <div className="flex gap-3 mt-4">
                <input
                  className="flex-1 border border-white/15 rounded-2xl px-5 py-4 text-white placeholder-white/25 text-base focus:outline-none focus:border-violet-500/60 focus:ring-2 focus:ring-violet-500/20 transition-all"
                  style={{ background: 'rgba(255,255,255,0.05)' }}
                  placeholder="Type a question for the room…"
                  value={inputQ}
                  onChange={(e) => setInputQ(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleStartSession()}
                />
                <button
                  onClick={handleStartSession}
                  disabled={!inputQ.trim()}
                  className="bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-6 py-4 rounded-2xl transition-all text-sm"
                >
                  Launch
                </button>
              </div>
            </motion.div>
          )}

          {(status === 'active' || status === 'revealed') && (
            <motion.div
              key="game"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="w-full max-w-5xl flex flex-col gap-6"
            >
              {/* Question banner */}
              <div className="text-center">
                <p className="text-white/30 text-xs tracking-widest uppercase font-semibold mb-1">Question</p>
                <h2 className="text-3xl font-bold text-white tracking-tight">{question}</h2>
              </div>

              {/* Join link */}
              {joinUrl && status === 'active' && (
                <div className="flex justify-center">
                  <div
                    className="flex items-center gap-3 border border-white/10 rounded-2xl px-5 py-3 cursor-pointer hover:border-white/20 transition-all"
                    style={{ background: 'rgba(255,255,255,0.04)' }}
                    onClick={() => navigator.clipboard.writeText(joinUrl)}
                    title="Click to copy"
                  >
                    <span className="text-white/50 text-sm">Join at</span>
                    <code className="text-violet-300 text-sm font-mono">{joinUrl}</code>
                    <span className="text-white/30 text-xs">📋</span>
                  </div>
                </div>
              )}

              {/* D3 Cloud */}
              <div
                ref={cloudRef}
                className="w-full rounded-3xl border border-white/10 overflow-hidden relative"
                style={{ height: CLOUD_HEIGHT, background: 'rgba(255,255,255,0.03)' }}
              >
                {groups.length === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <p className="text-white/20 text-sm font-medium">Waiting for answers…</p>
                  </div>
                )}
                {cloudWidth > 0 && (
                  <AnswerCloud
                    groups={groups}
                    revealed={revealed}
                    width={cloudWidth}
                    height={CLOUD_HEIGHT}
                  />
                )}
              </div>

              {/* Action row */}
              <div className="flex items-center justify-center gap-4">
                {status === 'active' && (
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={handleReveal}
                    disabled={answers.length === 0}
                    className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold px-10 py-4 rounded-2xl text-base shadow-xl shadow-violet-900/40 transition-all"
                  >
                    Reveal the Great Minds ✨
                  </motion.button>
                )}
                <button
                  onClick={handleReset}
                  className="border border-white/15 text-white/50 hover:text-white hover:border-white/30 font-medium px-6 py-4 rounded-2xl text-sm transition-all"
                >
                  {status === 'revealed' ? 'New Round' : 'Cancel'}
                </button>
              </div>

              {/* Leaderboard (post-reveal) */}
              <AnimatePresence>
                {revealed && (
                  <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4, type: 'spring', stiffness: 200, damping: 25 }}
                  >
                    <Leaderboard groups={groups} />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  )
}
