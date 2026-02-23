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
        <div className="grid grid-cols-12 px-5 py-2 text-xs font-semibold tracking-widest uppercase text-white/30 border-b border-white/10">
          <span className="col-span-2 text-center">Rank</span>
          <span className="col-span-7">Answer</span>
          <span className="col-span-3 text-right">Count</span>
        </div>

        <AnimatePresence initial={false}>
          {groups.map((g, i) => (
            <motion.div
              key={g.normalised}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ delay: i * 0.04, type: 'spring', stiffness: 300, damping: 25 }}
              className="grid grid-cols-12 px-5 py-3 items-center border-b border-white/5 last:border-0"
            >
              <div className="col-span-2 text-center">
                <span className="text-white/30 text-sm font-mono">#{i + 1}</span>
              </div>
              <div className="col-span-7">
                <span className="font-semibold text-sm text-white/80 truncate block">
                  {g.display}
                </span>
              </div>
              <div className="col-span-3 text-right">
                <motion.span
                  key={g.count}
                  initial={{ scale: 1.4, color: '#a78bfa' }}
                  animate={{ scale: 1, color: '#ffffff99' }}
                  className="text-sm font-mono font-semibold"
                >
                  {g.count}
                </motion.span>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}
