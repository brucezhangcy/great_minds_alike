'use client'

import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase, type Session } from '@/lib/supabase'

type Stage = 'loading' | 'answer' | 'waiting' | 'revealed' | 'finished' | 'error'

function JoinGame() {
  const searchParams = useSearchParams()
  const sessionId    = searchParams.get('s')

  const [stage, setStage]               = useState<Stage>('loading')
  const [session, setSession]           = useState<Session | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [totalQ, setTotalQ]             = useState(1)
  const [answer, setAnswer]             = useState('')
  const [submitting, setSubmitting]     = useState(false)
  const [errorMsg, setErrorMsg]         = useState('')

  // Ref so the realtime callback always reads the latest currentIndex
  const currentIndexRef = useRef(0)
  currentIndexRef.current = currentIndex

  // ── Load session ────────────────────────────────────────────────────
  useEffect(() => {
    if (!sessionId) {
      setErrorMsg('No session ID in URL. Ask the host to share the correct link.')
      setStage('error')
      return
    }

    supabase
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          setErrorMsg('Session not found. Double-check the link.')
          setStage('error')
          return
        }
        const s = data as Session
        setSession(s)
        setTotalQ(s.questions?.length ?? 1)
        setCurrentIndex(s.current_question_index ?? 0)
        if (s.status === 'finished') { setStage('finished'); return }
        if (s.status === 'revealed') { setStage('revealed'); return }
        setStage('answer')
      })
  }, [sessionId])

  // ── Realtime: session status & question index changes ───────────────
  useEffect(() => {
    if (!sessionId) return
    const channel = supabase
      .channel(`session-status:${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId}` },
        (payload) => {
          const updated = payload.new as Session
          setSession(updated)
          setTotalQ(updated.questions?.length ?? 1)

          if (updated.status === 'finished') {
            setStage('finished')
            return
          }

          // Host advanced to next question
          if (
            updated.status === 'active' &&
            (updated.current_question_index ?? 0) > currentIndexRef.current
          ) {
            setCurrentIndex(updated.current_question_index ?? 0)
            setAnswer('')
            setStage('answer')
            return
          }

          if (updated.status === 'revealed') {
            setStage('revealed')
          }
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [sessionId])

  // ── Submit answer ────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (!answer.trim() || !sessionId || submitting) return
    setSubmitting(true)
    const { error } = await supabase.from('answers').insert({
      session_id: sessionId,
      participant_name: 'Anonymous',
      answer: answer.trim(),
      question_index: currentIndex,
    })
    setSubmitting(false)
    if (error) { setErrorMsg('Could not submit: ' + error.message); setStage('error'); return }
    setStage('waiting')
  }, [answer, sessionId, submitting, currentIndex])

  // ── Derived ──────────────────────────────────────────────────────────
  const question = session?.questions?.[currentIndex] ?? session?.question ?? ''

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{ background: 'linear-gradient(160deg,#0a0a0f 0%,#0f0a1a 100%)' }}
    >
      <AnimatePresence mode="wait">

        {/* LOADING */}
        {stage === 'loading' && (
          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="flex gap-2">
              {[0, 1, 2].map((i) => (
                <motion.div key={i} className="w-3 h-3 rounded-full bg-violet-400"
                  animate={{ scale: [0.8, 1.3, 0.8], opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1.4, delay: i * 0.2, repeat: Infinity }}
                />
              ))}
            </div>
          </motion.div>
        )}

        {/* ERROR */}
        {stage === 'error' && (
          <motion.div key="error" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="text-center flex flex-col items-center gap-4 max-w-sm"
          >
            <div className="text-5xl">😕</div>
            <h2 className="text-xl font-bold text-white">Something went wrong</h2>
            <p className="text-white/50 text-sm">{errorMsg}</p>
          </motion.div>
        )}

        {/* ANSWER */}
        {stage === 'answer' && session && (
          <motion.div
            key={`answer-${currentIndex}`}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
            className="w-full max-w-sm flex flex-col gap-6"
          >
            <div className="text-center">
              <div className="w-12 h-12 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-xl font-bold">G</div>
              <p className="text-white/30 text-xs tracking-widest uppercase font-semibold mb-2">
                Question {currentIndex + 1} / {totalQ}
              </p>
              <h2 className="text-xl font-bold text-white leading-snug">{question}</h2>
            </div>
            <p className="text-center text-white/40 text-sm">
              What do you think <em>most people</em> will say?
            </p>
            <input
              autoFocus
              className="w-full border border-white/15 rounded-2xl px-5 py-4 text-white placeholder-white/25 text-base focus:outline-none focus:border-violet-500/60 focus:ring-2 focus:ring-violet-500/20 transition-all text-center"
              style={{ background: 'rgba(255,255,255,0.05)' }}
              placeholder="Type your answer…"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            />
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleSubmit}
              disabled={!answer.trim() || submitting}
              className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-4 rounded-2xl transition-all shadow-xl shadow-violet-900/40"
            >
              {submitting ? 'Submitting…' : 'Lock In My Answer'}
            </motion.button>
          </motion.div>
        )}

        {/* WAITING */}
        {stage === 'waiting' && (
          <motion.div
            key={`waiting-${currentIndex}`}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="text-center flex flex-col items-center gap-6 max-w-xs"
          >
            <div className="relative w-24 h-24">
              {[0, 1, 2].map((i) => (
                <motion.div key={i} className="absolute inset-0 rounded-full border-2 border-violet-500/50"
                  animate={{ scale: [1, 1.6 + i * 0.3], opacity: [0.6, 0] }}
                  transition={{ duration: 2, delay: i * 0.6, repeat: Infinity, ease: 'easeOut' }}
                />
              ))}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-2xl">🧠</div>
              </div>
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Answer locked!</h2>
              <p className="text-white/40 text-sm mt-1">Waiting for the host to reveal…</p>
            </div>
            <p className="text-white/20 text-xs">Question {currentIndex + 1} / {totalQ}</p>
          </motion.div>
        )}

        {/* REVEALED — waiting for host to advance */}
        {stage === 'revealed' && (
          <motion.div
            key={`revealed-${currentIndex}`}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center flex flex-col items-center gap-4"
          >
            <motion.div
              initial={{ scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 15 }}
              className="text-6xl"
            >✨</motion.div>
            <h2 className="text-2xl font-bold text-white">Results are in!</h2>
            <p className="text-white/40 text-sm">
              {currentIndex + 1 < totalQ
                ? 'Next question coming up…'
                : 'Check the main screen for the results.'}
            </p>
            <p className="text-white/20 text-xs mt-2">Question {currentIndex + 1} / {totalQ}</p>
          </motion.div>
        )}

        {/* FINISHED */}
        {stage === 'finished' && (
          <motion.div key="finished" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            className="text-center flex flex-col items-center gap-4"
          >
            <div className="text-6xl">🎉</div>
            <h2 className="text-2xl font-bold text-white">That&apos;s a wrap!</h2>
            <p className="text-white/40 text-sm">
              All {totalQ} question{totalQ !== 1 ? 's' : ''} answered. Thanks for playing!
            </p>
          </motion.div>
        )}

      </AnimatePresence>
    </main>
  )
}

export default function JoinPage() {
  return (
    <Suspense>
      <JoinGame />
    </Suspense>
  )
}
