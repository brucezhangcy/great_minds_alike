'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { AnswerGroup } from '@/lib/gameLogic'

interface Props {
  groups: AnswerGroup[]
}

export default function Leaderboard({ groups }: Props) {
  if (groups.length === 0) return null

  return (
    <div className="w-full max-w-2xl mx-auto">
      <h3 className="text-sm font-semibold tracking-widest uppercase text-white/40 mb-3 px-1">
        Results
      </h3>
      <div className="rounded-2xl overflow-hidden border border-white/10 bg-white/5 backdrop-blur-md">
        {/* Header */}
        <div className="grid grid-cols-12 px-5 py-2 text-xs font-semibold tracking-widest uppercase text-white/30 border-b border-white/10">
          <span className="col-span-6">Answer</span>
          <span className="col-span-3 text-center">Count</span>
          <span className="col-span-3 text-right">Points</span>
        </div>

        <AnimatePresence initial={false}>
          {groups.map((g, i) => (
            <motion.div
              key={g.normalised}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ delay: i * 0.04, type: 'spring', stiffness: 300, damping: 25 }}
              className={`grid grid-cols-12 px-5 py-3 items-center border-b border-white/5 last:border-0 ${
                g.isWinner ? 'bg-yellow-400/10' : ''
              }`}
            >
              <div className="col-span-6 flex items-center gap-2">
                {g.isWinner && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                    className="text-base"
                  >
                    👑
                  </motion.span>
                )}
                <span
                  className={`font-semibold text-sm truncate ${
                    g.isWinner ? 'text-yellow-300' : 'text-white/80'
                  }`}
                >
                  {g.display}
                </span>
              </div>

              <div className="col-span-3 text-center">
                <motion.span
                  key={g.count}
                  initial={{ scale: 1.4, color: '#a78bfa' }}
                  animate={{ scale: 1, color: '#ffffff99' }}
                  className="text-sm font-mono font-semibold"
                >
                  {g.count}
                </motion.span>
              </div>

              <div className="col-span-3 text-right">
                {g.points > 0 ? (
                  <motion.span
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 20, delay: i * 0.06 + 0.3 }}
                    className="inline-block bg-emerald-500/20 text-emerald-300 text-xs font-bold px-2 py-0.5 rounded-full border border-emerald-500/30"
                  >
                    +{g.points}
                  </motion.span>
                ) : (
                  <span className="text-white/20 text-xs">—</span>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}
