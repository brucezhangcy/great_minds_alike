'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import dynamicImport from 'next/dynamic'
import { supabase, type Answer, type Session } from '@/lib/supabase'
import { groupAnswers, type AnswerGroup } from '@/lib/gameLogic'
import Leaderboard from '@/components/Leaderboard'

const AnswerCloud = dynamicImport(() => import('@/components/AnswerCloud'), { ssr: false })

const CLOUD_HEIGHT = 480

export default function AdminPage() {
  // ── Pre-game state ──────────────────────────────────────────────────
  const [questionList, setQuestionList] = useState<string[]>([])
  const [inputQ, setInputQ] = useState('')

  // ── Session state ───────────────────────────────────────────────────
  const [sessionId, setSessionId]         = useState<string | null>(null)
  const [questions, setQuestions]         = useState<string[]>([])
  const [currentIndex, setCurrentIndex]   = useState(0)
  const [status, setStatus]               = useState<Session['status']>('waiting')
  const [answers, setAnswers]             = useState<Answer[]>([])
  const [groups, setGroups]               = useState<AnswerGroup[]>([])
  const [revealed, setRevealed]           = useState(false)

  // ── Layout ──────────────────────────────────────────────────────────
  const [cloudWidth, setCloudWidth] = useState(800)
  const cloudRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const measure = () => {
      if (cloudRef.current) setCloudWidth(cloudRef.current.offsetWidth)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  // ── Derived ─────────────────────────────────────────────────────────
  const question    = questions[currentIndex] ?? ''
  const isLastQ     = currentIndex >= questions.length - 1
  const totalQ      = questions.length

  useEffect(() => {
    setGroups(groupAnswers(answers))
  }, [answers])

  // ── Realtime: subscribe to answers for current session ──────────────
  useEffect(() => {
    if (!sessionId) return
    const channel = supabase
      .channel(`answers:${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'answers', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          const a = payload.new as Answer
          // Only show answers for the current question
          if (a.question_index === currentIndex) {
            setAnswers(prev => [...prev, a])
          }
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [sessionId, currentIndex])

  // ── Handlers ────────────────────────────────────────────────────────

  const addQuestion = useCallback(() => {
    const q = inputQ.trim()
    if (!q) return
    setQuestionList(prev => [...prev, q])
    setInputQ('')
  }, [inputQ])

  const removeQuestion = useCallback((i: number) => {
    setQuestionList(prev => prev.filter((_, idx) => idx !== i))
  }, [])

  const handleLaunch = useCallback(async () => {
    if (questionList.length === 0) return
    const { data, error } = await supabase
      .from('sessions')
      .insert({
        question: questionList[0],   // legacy compat
        questions: questionList,
        current_question_index: 0,
        status: 'active',
      })
      .select()
      .single()

    if (error || !data) {
      alert('Failed to create session: ' + (error?.message ?? 'unknown'))
      return
    }
    setSessionId(data.id)
    setQuestions(questionList)
    setCurrentIndex(0)
    setStatus('active')
    setAnswers([])
    setGroups([])
    setRevealed(false)
  }, [questionList])

  const handleReveal = useCallback(async () => {
    if (!sessionId) return
    setRevealed(true)
    setStatus('revealed')
    await supabase.from('sessions').update({ status: 'revealed' }).eq('id', sessionId)
  }, [sessionId])

  const handleNextQuestion = useCallback(async () => {
    if (!sessionId) return
    const nextIndex = currentIndex + 1
    await supabase.from('sessions').update({
      current_question_index: nextIndex,
      status: 'active',
    }).eq('id', sessionId)
    setCurrentIndex(nextIndex)
    setAnswers([])
    setGroups([])
    setRevealed(false)
    setStatus('active')
  }, [sessionId, currentIndex])

  const handleEndSession = useCallback(async () => {
    if (!sessionId) return
    await supabase.from('sessions').update({ status: 'finished' }).eq('id', sessionId)
    setStatus('finished')
  }, [sessionId])

  const handleReset = useCallback(() => {
    setSessionId(null)
    setQuestions([])
    setQuestionList([])
    setInputQ('')
    setCurrentIndex(0)
    setStatus('waiting')
    setAnswers([])
    setGroups([])
    setRevealed(false)
  }, [])

  const joinUrl = sessionId
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/join?s=${sessionId}`
    : null

  // ── Render ───────────────────────────────────────────────────────────
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
        <AnimatePresence mode="wait">

          {/* ── SETUP ─────────────────────────────────────────────── */}
          {status === 'waiting' && (
            <motion.div
              key="setup"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-xl flex flex-col gap-4 mt-12"
            >
              <h1 className="text-4xl font-bold text-center text-white tracking-tight">Start a new session</h1>
              <p className="text-center text-white/40 text-sm">
                Add all your questions first, then launch.
              </p>

              {/* Question input */}
              <div className="flex gap-3 mt-2">
                <input
                  className="flex-1 border border-white/15 rounded-2xl px-5 py-4 text-white placeholder-white/25 text-base focus:outline-none focus:border-violet-500/60 focus:ring-2 focus:ring-violet-500/20 transition-all"
                  style={{ background: 'rgba(255,255,255,0.05)' }}
                  placeholder="Type a question…"
                  value={inputQ}
                  onChange={e => setInputQ(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addQuestion()}
                />
                <button
                  onClick={addQuestion}
                  disabled={!inputQ.trim()}
                  className="bg-white/10 hover:bg-white/15 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-5 py-4 rounded-2xl transition-all text-sm"
                >
                  Add
                </button>
              </div>

              {/* Question list */}
              <AnimatePresence>
                {questionList.map((q, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 12 }}
                    className="flex items-center gap-3 border border-white/10 rounded-2xl px-5 py-3"
                    style={{ background: 'rgba(255,255,255,0.04)' }}
                  >
                    <span className="text-white/30 text-xs font-mono w-5 shrink-0">{i + 1}</span>
                    <span className="text-white/80 text-sm flex-1">{q}</span>
                    <button
                      onClick={() => removeQuestion(i)}
                      className="text-white/25 hover:text-red-400 transition-colors text-lg leading-none"
                    >×</button>
                  </motion.div>
                ))}
              </AnimatePresence>

              {/* Launch */}
              <button
                onClick={handleLaunch}
                disabled={questionList.length === 0}
                className="mt-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold px-6 py-4 rounded-2xl transition-all text-sm"
              >
                Launch Session ({questionList.length} question{questionList.length !== 1 ? 's' : ''})
              </button>
            </motion.div>
          )}

          {/* ── IN GAME ───────────────────────────────────────────── */}
          {(status === 'active' || status === 'revealed') && (
            <motion.div
              key="game"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="w-full max-w-5xl flex flex-col gap-6"
            >
              {/* Question header */}
              <div className="text-center">
                <p className="text-white/30 text-xs tracking-widest uppercase font-semibold mb-1">
                  Question {currentIndex + 1} / {totalQ}
                </p>
                <h2 className="text-3xl font-bold text-white tracking-tight">{question}</h2>
              </div>

              {/* Join link (only while accepting answers) */}
              {joinUrl && status === 'active' && currentIndex === 0 && (
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
                {status === 'revealed' && !isLastQ && (
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={handleNextQuestion}
                    className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold px-10 py-4 rounded-2xl text-base shadow-xl shadow-emerald-900/40 transition-all"
                  >
                    Next Question →
                  </motion.button>
                )}
                {status === 'revealed' && isLastQ && (
                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={handleEndSession}
                    className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold px-10 py-4 rounded-2xl text-base shadow-xl shadow-violet-900/40 transition-all"
                  >
                    End Session 🎉
                  </motion.button>
                )}
                <button
                  onClick={handleReset}
                  className="border border-white/15 text-white/50 hover:text-white hover:border-white/30 font-medium px-6 py-4 rounded-2xl text-sm transition-all"
                >
                  Cancel
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

          {/* ── FINISHED ──────────────────────────────────────────── */}
          {status === 'finished' && (
            <motion.div
              key="finished"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center gap-6 mt-20"
            >
              <div className="text-6xl">🎉</div>
              <h2 className="text-3xl font-bold text-white tracking-tight">Session complete!</h2>
              <p className="text-white/40 text-sm">All {totalQ} questions answered.</p>
              <button
                onClick={handleReset}
                className="mt-4 bg-violet-600 hover:bg-violet-500 text-white font-bold px-8 py-4 rounded-2xl text-sm transition-all"
              >
                Start a new session
              </button>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </main>
  )
}
