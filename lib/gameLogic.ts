export type AnswerGroup = {
  normalised: string    // lowercase key used for grouping
  display: string       // first submitted casing, shown to users
  count: number
  participants: string[]
}

/** Group raw answer strings (case-insensitive) and sort by count descending. */
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
      })
    }
  }

  return Array.from(map.values()).sort((a, b) => b.count - a.count)
}
