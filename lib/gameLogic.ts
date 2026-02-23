export type AnswerGroup = {
  normalised: string    // lowercase key used for grouping
  display: string       // first submitted casing, shown to users
  count: number
  participants: string[]
  isWinner: boolean
  points: number
}

/** Group raw answer strings (case-insensitive) and find the winner(s). */
export function groupAnswers(
  answers: { answer: string; participant_name: string }[]
): AnswerGroup[] {
  const map = new Map<string, AnswerGroup>()

  for (const { answer, participant_name } of answers) {
    const key = answer.trim().toLowerCase()
    if (!key) continue
    if (map.has(key)) {
      const g = map.get(key)!
      g.count++
      g.participants.push(participant_name)
    } else {
      map.set(key, {
        normalised: key,
        display: answer.trim(),
        count: 1,
        participants: [participant_name],
        isWinner: false,
        points: 0,
      })
    }
  }

  const groups = Array.from(map.values())
  const maxCount = Math.max(0, ...groups.map((g) => g.count))

  for (const g of groups) {
    g.isWinner = g.count === maxCount && maxCount > 0
    g.points = g.isWinner ? 4 : 0
  }

  // Sort: winners first, then by count desc
  return groups.sort((a, b) => {
    if (a.isWinner !== b.isWinner) return a.isWinner ? -1 : 1
    return b.count - a.count
  })
}
