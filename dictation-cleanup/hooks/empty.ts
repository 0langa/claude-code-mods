// Words and phrases that carry no information in a spoken or typed prompt:
// hedges, emphasis, sentence openers, tags at the end of a sentence,
// exclamations. Each rule names its phrases and, where a phrase can also mean
// something, the pattern around it that shows it is empty. Whatever these
// patterns cannot tell is not matched here: it is left to the model pass.

export type Around = {
  // The text before the phrase (without the comma and spaces in front of it)
  // and the text after it (without the comma and spaces behind it).
  before: string
  after: string
  // The phrase as it is written, and the sentence it stands in.
  phrase: string
  sentence: string
  hasCommaBefore: boolean
  hasCommaAfter: boolean
  // Nothing of the person's own text comes before it.
  isFirst: boolean
}

export type Group = 'hedges and emphasis' | 'openers' | 'tags at the end of a sentence' | 'thinking aloud' | 'exclamations' | 'pauses'

export type Rule = {
  group: Group
  // Lower case. A space stands for any run of spaces; an apostrophe may be missing.
  words: readonly string[]
  // True where the phrase is empty. Without it, the phrase always is.
  isEmpty?: (around: Around) => boolean
  // An exclamation or a laugh: a sentence that is nothing else goes with it.
  // Without this, such a sentence is taken for an answer ("Obviously.") and stays.
  isNoise?: true
  // The phrase closes a clause, so a comma next to it is the clause's own and
  // stays: "the logs and stuff, then restart" keeps its comma.
  closesClause?: true
  // Written in place of the phrase, instead of taking it out.
  put?: string
}

const WORD = String.raw`[\p{L}\p{N}'’]+`
const LAST_WORD = new RegExp(`(${WORD})$`, 'u')
const SECOND_LAST_WORD = new RegExp(`(${WORD})[ \\t,]+${WORD}$`, 'u')
const FIRST_WORD = new RegExp(`^(${WORD})`, 'u')

export const fold = (text: string | undefined) => (text ?? '').toLowerCase().replaceAll('’', "'").replace(/\s+/g, ' ').trim()

const wordBefore = (before: string) => fold(LAST_WORD.exec(before)?.[1])
const secondWordBefore = (before: string) => fold(SECOND_LAST_WORD.exec(before)?.[1])
const wordAfter = (after: string) => fold(FIRST_WORD.exec(after)?.[1])

// The start of the text, of a line or a list item, or right after a sentence.
export const startsSentence = (before: string) => /(?:^|\n)[ \t]*(?:(?:[-*+]|\d+[.)])[ \t]+)?$/.test(before) || /[.!?…][ \t]*$/.test(before)

const endsClause = ({ after, hasCommaAfter }: Around) => hasCommaAfter || /^(?:$|[\n.!?;:)…])/.test(after)

const set = (words: string) => new Set(words.split(' '))

// "what the hell is this" is "what is this".
const QUESTION_WORDS = set('what why how where who when whatever whoever wherever however')

// Words a clause opens with. An opener right behind one of them is still an
// opener: "and I mean, ...", "but anyway ...".
const CLAUSE_OPENERS = set('and but so or because cause cuz then also plus well okay ok alright right yes no yeah')

// What a tag at the end of a list may be followed by: "the logs and stuff, and then ...".
const AFTER_A_TAG = set('and but so because cause then which if when while since though although however')

// Only ever the subject of a clause, never an object: after one of these comes a full clause.
const SUBJECTS = set("i i'm im i'd i've i'll we we're we'd we've we'll they they're they've he he's she she's it's that's there there's you're you'd you've you'll")

// "what kind of", "this kind of": a kind, not a hedge.
const DETERMINERS = set('a an the this that these those what which whatever whichever some any every each no other another same different new all both such certain one two three my your his her its our their')
const ARTICLES = set('a an the this that what which some any no every each another one')
// Words that "kind of" hedges right after: "it is kind of slow", "I kind of want".
const BEFORE_A_HEDGE = set(
  "is was are were be been being am i'm im it's that's there's he's she's they're we're you're looks look looked seems seem seemed feels feel felt sounds sound sounded got get gets getting just really also still actually already probably maybe would could should might will can did do does don't didn't doesn't not and but so or because to i you we they he she it",
)

// "if I guess wrong": the verb, not the hedge.
const GUESS_IS_A_VERB = set("if when unless whether can could should must may might will would did do does don't didn't once until whenever wherever how cannot can't")

// "ig" is also Instagram.
const ON_INSTAGRAM = set('on in via from to for my our the your their with of at an a and or vs')
const ABOUT_SOCIAL_MEDIA = /(?<![\p{L}])(?:instagram|insta|tiktok|youtube|twitter|facebook|linkedin|reddit|threads|snapchat|pinterest|socials?|reels?|stories|followers?|hashtags?|captions?|dms?)(?![\p{L}])/iu

// Words that answer a question together with a "yeah" in front of them.
const ANSWERS = set('sure okay ok fine right exactly true correct no nah nope yes yep yup absolutely definitely totally agreed cool good great please thanks thank')

// What "Well" may open a sentence with when no comma follows it ("Well done" is not an opener).
const AFTER_WELL = set("if then i i'm i'd i've i'll the that that's it it's we you in actually okay ok no yes yeah for at as since because now maybe this there there's they what how why when not")

// "looks like", "would like", "something like", "I like": the word means something.
export const LIKE_MEANS = set(
  "look looks looked looking seem seems seemed sound sounds sounded feel feels felt feeling would wouldn't i'd id we'd you'd they'd he'd she'd don't dont doesn't didn't do does did really also still always never i you we they people users who something anything nothing everything stuff things thing more less much just exactly of not act acts behave behaves work works treat it them one ones those these",
)
// "I was like, why": it reports a thought.
const QUOTING = set("was were am i'm im he's she's they're we're you're be been being go goes went all")
// "to like see", "can like think": "like" stands where only a verb can follow.
const BEFORE_A_VERB = set('to can could should might gonna wanna gotta')
// "to like the result", "to like and subscribe": here "like" is the verb.
const LIKE_HAS_AN_OBJECT = set('the this that these those it them him her us me you my your his our their a an what how and or some any all every each both one to when if')
const BEFORE_A_CLAUSE = set('and but so or because cause cuz if when then while that which where since although though')
const FIRST_PERSON = set("i i'm im i'd i've i'll we we're we'd we've we'll")
const BE = set("is was are were be been am it's that's there's he's she's they're we're you're i'm im isn't wasn't aren't weren't")
// After "is like": words that say how much, never what something is like.
const DEGREE = set('really very super just so too pretty quite totally completely fully instantly actually literally already still not never always way more less much extremely insanely constantly currently probably definitely almost nearly barely hardly only even also')
const NOT_A_PARTICIPLE = set('speed breed hundred embed newsfeed watershed')
// "like I said", "like we did before": it means "as".
const AS_SOMEONE_DID =
  /^(?:i|we|you|they|he|she)[ \t]+(?:(?:just|already|always|also|usually|normally)[ \t]+)?(?:said|say|mentioned|told|explained|wrote|did|do|expected|thought|suspected|promised|asked|described|suggested|showed|wanted|planned|discussed|have|had|would|always|usually|normally)(?![\p{L}])/iu

// The filler sounds that mark a pause; a "like" right next to one is a pause too.
const SOUND = String.raw`(?:u+h+m*|u+m+|e+r+m+|h+m+|ä+h+m*|ö+h+m*)`
const SOUND_AFTER = new RegExp(`^${SOUND}(?![\\p{L}\\p{N}'’-])`, 'iu')
const SOUND_BEFORE = new RegExp(`(?<![\\p{L}\\p{N}'’-])${SOUND}$`, 'iu')
const UP_TO_SOUND = new RegExp(`[ \\t,]*(?<![\\p{L}\\p{N}'’-])${SOUND}$`, 'iu')

const isPauseLike = (around: Around) => {
  const previous = wordBefore(around.before)
  const following = wordAfter(around.after)

  if (LIKE_MEANS.has(previous)) {
    return false
  }
  // ", like," and "Like, ...": the comma is the pause.
  if (around.hasCommaAfter) {
    return !QUOTING.has(previous)
  }
  if (following === '') {
    return false
  }
  if (BEFORE_A_VERB.has(previous)) {
    return !LIKE_HAS_AN_OBJECT.has(following)
  }
  // "it's like really slow", "was like uploaded twice": nothing is compared.
  if (BE.has(previous)) {
    return DEGREE.has(following) || (/^\p{L}{3,}ed$/u.test(following) && !NOT_A_PARTICIPLE.has(following))
  }
  if (AS_SOMEONE_DID.test(around.after)) {
    return false
  }
  // "and like I want", "Like we could": a clause follows, so nothing is compared.
  if (startsSentence(around.before) || BEFORE_A_CLAUSE.has(previous)) {
    return SUBJECTS.has(following)
  }

  // ", like I didn't do all that myself".
  return around.hasCommaBefore && FIRST_PERSON.has(following)
}

// Run before the filler sounds are taken out: "it's like, uh, slow", "um, like wait".
export const BEFORE_SOUNDS: readonly Rule[] = [
  {
    group: 'pauses',
    words: ['like'],
    isEmpty: around => {
      if (SOUND_AFTER.test(around.after)) {
        return !LIKE_MEANS.has(wordBefore(around.before))
      }

      return SOUND_BEFORE.test(around.before) && !LIKE_MEANS.has(wordBefore(around.before.replace(UP_TO_SOUND, '')))
    },
  },
]

// In the order they are applied. A longer phrase comes before a word it contains.
const RULES: readonly Rule[] = [
  // "What the hell." on its own, or set off by a comma.
  { group: 'exclamations', isNoise: true, isEmpty: endsClause, words: ['what the fuck', 'what the actual fuck', 'what the hell', 'what the heck'] },
  { group: 'exclamations', words: ['the fuck', 'the actual fuck', 'the hell', 'the heck'], isEmpty: ({ before }) => QUESTION_WORDS.has(wordBefore(before)) },
  {
    group: 'exclamations',
    words: ['wtf'],
    put: 'what',
    isEmpty: ({ after }) => /^(?:is|are|was|were|did|does|do|happened|has|have|am|should|would|could|can)(?![\p{L}])/iu.test(after),
  },
  {
    group: 'exclamations',
    isNoise: true,
    words: [
      'wtf', 'omg', 'omfg', 'ffs', 'holy shit', 'holy fuck', 'holy crap', 'holy cow', 'holy moly',
      'oh shit', 'oh fuck', 'oh crap', 'oh damn', 'oh god', 'oh my god', 'oh my gosh', 'oh my goodness', 'oh man', 'oh boy', 'oh wow', 'oh dear',
      'ah shit', 'aw shit', 'aw man', 'well shit', 'well fuck', 'jesus christ',
      "for fuck's sake", 'for fuck sake', "for god's sake", "for christ's sake",
      'damn it', 'dammit', 'damnit', 'goddammit', 'god damn it', 'goddamn it',
    ],
  },
  { group: 'exclamations', isNoise: true, words: ['fucking', 'fuckin', 'freaking', 'frickin', 'friggin', 'goddamn', 'god damn'] },
  // Not "give a damn".
  { group: 'exclamations', isNoise: true, words: ['damn'], isEmpty: ({ before }) => wordBefore(before) !== 'a' },
  // "a shit ton" is "a ton"; "hell yes" is "yes".
  { group: 'exclamations', words: ['fuck', 'shit'], isEmpty: ({ after }) => /^(?:tons?|loads?)(?![\p{L}])/iu.test(after) },
  { group: 'exclamations', words: ['fuck', 'hell'], isEmpty: ({ after }) => /^(?:yes|yeah|yea|yep|no|nope|nah)(?![\p{L}])/iu.test(after) },
  { group: 'exclamations', isNoise: true, words: ['haha', 'hahaha', 'hahahaha', 'ahaha', 'hehe', 'hehehe', 'lol', 'lmao', 'lmfao', 'xd'] },

  // A vague closer after a list or a clause. "or something else" and "and
  // everything works" go on, so they are not closers.
  {
    group: 'tags at the end of a sentence',
    closesClause: true,
    words: ['or whatever', 'or something like that', 'or something', 'or anything like that', 'and stuff like that', 'and stuff', 'and everything', 'and all that stuff', 'and all that', 'or smth'],
    isEmpty: around => endsClause(around) || AFTER_A_TAG.has(wordAfter(around.after)),
  },

  // Said while searching for the next word, set off by commas.
  {
    group: 'thinking aloud',
    words: ["i don't know", 'idk', 'i dunno', "what's it called", 'what is it called', 'what do you call it', 'how do you call it', 'how do you say', 'you know', 'you know what i mean'],
    isEmpty: around => around.hasCommaBefore && (around.hasCommaAfter || /^(?:$|[\n.!;:)…])/.test(around.after)),
  },

  // "I mean, we could": an opener. "the parser, I mean the lexer" corrects, and "I mean it" means it.
  {
    group: 'openers',
    words: ['i mean'],
    isEmpty: around =>
      (startsSentence(around.before) || CLAUSE_OPENERS.has(wordBefore(around.before))) &&
      wordAfter(around.after) !== '' &&
      (around.hasCommaAfter || SUBJECTS.has(wordAfter(around.after))) &&
      !/^it[ \t]*(?:$|[\n.!?,;:])/iu.test(around.after),
  },

  { group: 'hedges and emphasis', words: ['basically', 'essentially', 'pretty much', 'real quick', 'real quickly', 'to be honest', 'tbh'] },
  { group: 'hedges and emphasis', words: ['obviously'], isEmpty: ({ before }) => wordBefore(before) !== 'not' },
  // "tell me honestly" asks for candour.
  {
    group: 'hedges and emphasis',
    words: ['honestly'],
    isEmpty: ({ before }) => !/(?<![\p{L}])(?:tell|answer|say|speak|talk|judge|rate|review|assess|be)(?:[ \t]+(?:me|us|it|them|this|that))?$/iu.test(before),
  },
  // "take it literally" means word for word.
  {
    group: 'hedges and emphasis',
    words: ['literally'],
    isEmpty: ({ before }) => !/(?<![\p{L}])(?:take|takes|taken|took|taking|mean|means|meant|read|interpret\w*|translate\w*|quote[ds]?|copy|copied|not|too|so|very|quite)(?![\p{L}])[^.!?\n]{0,24}$/iu.test(before),
  },
  {
    group: 'hedges and emphasis',
    words: ['kind of', 'kinda', 'sort of', 'sorta'],
    isEmpty: ({ before }) => {
      const previous = wordBefore(before)

      if (DETERMINERS.has(previous)) {
        return false
      }

      // "a special kind of bug": a kind again.
      return BEFORE_A_HEDGE.has(previous) || !ARTICLES.has(secondWordBefore(before))
    },
  },
  {
    group: 'hedges and emphasis',
    words: ['i guess'],
    isEmpty: around => !GUESS_IS_A_VERB.has(wordBefore(around.before)) && !/^(?:so|not)(?![\p{L}])/iu.test(around.after),
  },
  {
    group: 'hedges and emphasis',
    words: ['ig'],
    isEmpty: around =>
      around.phrase === 'ig' &&
      !ON_INSTAGRAM.has(wordBefore(around.before)) &&
      !ABOUT_SOCIAL_MEDIA.test(around.sentence) &&
      (endsClause(around) || around.hasCommaBefore || startsSentence(around.before) || CLAUSE_OPENERS.has(wordAfter(around.after)) || SUBJECTS.has(wordAfter(around.after))),
  },

  {
    group: 'openers',
    words: ['well'],
    isEmpty: around => startsSentence(around.before) && wordAfter(around.after) !== '' && (around.hasCommaAfter || AFTER_WELL.has(wordAfter(around.after))),
  },
  { group: 'openers', words: ['look'], isEmpty: around => startsSentence(around.before) && around.hasCommaAfter && wordAfter(around.after) !== '' },
  {
    group: 'openers',
    words: ['anyway', 'anyways', 'anyhow'],
    isEmpty: around => (startsSentence(around.before) || CLAUSE_OPENERS.has(wordBefore(around.before))) && wordAfter(around.after) !== '',
  },
  // "oh seven" is a number said aloud, and "oh no" is not "no".
  {
    group: 'openers',
    words: ['oh'],
    isEmpty: around =>
      (startsSentence(around.before) || CLAUSE_OPENERS.has(wordBefore(around.before))) &&
      wordAfter(around.after) !== '' &&
      !/^(?:no|nope|nah|\d|zero|one|two|three|four|five|six|seven|eight|nine)(?![\p{L}])/iu.test(around.after),
  },
  // A reaction at the start of a sentence, or between commas.
  {
    group: 'exclamations',
    isNoise: true,
    words: ['fuck', 'shit', 'crap', 'wow', 'whoa', 'woah', 'jesus', 'gosh', 'geez', 'jeez', 'ugh', 'argh', 'huh'],
    isEmpty: around => (startsSentence(around.before) || around.hasCommaBefore) && endsClause(around),
  },
  // The first word of a message may be the answer to a question, and so may a
  // "yeah" that ends a sentence or leads another answer word ("if not, yeah,
  // sure"). Anywhere else it only fills a pause.
  { group: 'openers', words: ['yeah', 'yea', 'yeh'], isEmpty: around => !around.isFirst && wordAfter(around.after) !== '' && !ANSWERS.has(wordAfter(around.after)) },

  { group: 'pauses', words: ['like'], isEmpty: isPauseLike },
]

const withoutKept = (rules: readonly Rule[], kept: ReadonlySet<string>) =>
  kept.size === 0 ? rules : rules.map(rule => ({ ...rule, words: rule.words.filter(word => !kept.has(word)) })).filter(rule => rule.words.length > 0)

// The rules for one person: the built-in ones without the phrases they want
// left in, then the phrases they added, which are always taken out.
export const rulesFor = (own: readonly string[] = [], kept: readonly string[] = []) => {
  const keptWords = new Set(kept.map(fold))
  const ownWords = [...new Set(own.map(fold))].filter(word => word !== '' && !keptWords.has(word))

  return {
    beforeSounds: withoutKept(BEFORE_SOUNDS, keptWords),
    rules: [...withoutKept(RULES, keptWords), ...(ownWords.length === 0 ? [] : [{ group: 'hedges and emphasis' as const, words: ownWords }])],
  }
}

// Every built-in phrase, by group, for /clean fillers.
const GROUPS: readonly Group[] = ['hedges and emphasis', 'openers', 'tags at the end of a sentence', 'thinking aloud', 'pauses', 'exclamations']

export const builtInWords = () =>
  new Map(GROUPS.map(group => [group, [...new Set([...BEFORE_SOUNDS, ...RULES].filter(rule => rule.group === group).flatMap(rule => rule.words))]] as const))

export const isBuiltIn = (phrase: string) => [...BEFORE_SOUNDS, ...RULES].some(rule => rule.words.includes(fold(phrase)))

// A phrase someone may add: one to five plain words.
export const isPhrase = (text: string) => /^\p{L}[\p{L}'’]*(?: \p{L}[\p{L}'’]*){0,4}$/u.test(fold(text)) && fold(text).length <= 40

// A phrase that is named, not used, stays: "the word basically", "I keep saying
// like", and every item of a list that follows such a cue ("words like
// basically, pretty much and kinda"). So does everything in a sentence about
// fillers. `left` and `right` are the sentence before and after the phrase.
const ITEM = String.raw`${WORD}(?:[ \t]+${WORD}){0,2}`
const NAMED = new RegExp(
  String.raw`(?<![\p{L}])(?:words?|phrases?|say|says|said|saying|spell(?:ed|ing)?)(?![\p{L}])[ \t,:]*(?:${ITEM}[ \t]*,[ \t]*)*(?:${ITEM}(?:[ \t]+(?:and|or))?)?[ \t]*$`,
  'iu',
)
const ABOUT_FILLERS = /(?<![\p{L}])fillers?(?![\p{L}])/iu

export const isNamed = (left: string, right: string) => NAMED.test(left) || ABOUT_FILLERS.test(left) || ABOUT_FILLERS.test(right)
