// A check on what the AI pass sends back: a correction changes a few words and
// keeps the rest in order. A reply that rewrites the message is not used.

const wordsOf = (text: string) => (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).slice(0, 2000)

// The share of the reply's words that are the message's own words, in order
// (the longest common run of words, over the reply's length). Typos and removed
// fillers keep it high; a rewrite, or an answer, drops it.
export const wordsKept = (input: string, output: string) => {
  const before = wordsOf(input)
  const after = wordsOf(output)

  if (after.length === 0) {
    return 0
  }
  let previous: number[] = new Array<number>(after.length + 1).fill(0)

  for (const word of before) {
    const row: number[] = [0]

    for (let at = 1; at <= after.length; at += 1) {
      row[at] = word === after[at - 1] ? (previous[at - 1] ?? 0) + 1 : Math.max(previous[at] ?? 0, row[at - 1] ?? 0)
    }
    previous = row
  }

  return (previous[after.length] ?? 0) / after.length
}

// Below this the reply is treated as a rewrite.
export const MIN_WORDS_KEPT = 0.6
