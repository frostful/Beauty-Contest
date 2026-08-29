export type RuleAmendmentId = "tie_seal" | "consecutive_tie" | "duplicates_void" | "exact_double" | "hundred_zero";

export type RuleAmendmentDefinition = {
  number: string;
  title: string;
  short: string;
  narration: string;
  audioSrc: string;
  duration: number;
};

export const RULE_AMENDMENTS: Record<RuleAmendmentId, RuleAmendmentDefinition> = {
  tie_seal: {
    number: "01",
    title: "NUMBER SEALED",
    short: "The tied number is forbidden for one round.",
    narration: "The number shared by the closest players is now sealed. It cannot be selected in the next round.",
    audioSrc: "/audio/01-tie-number-sealed.mp3",
    duration: 9_000,
  },
  consecutive_tie: {
    number: "02",
    title: "DEADLOCK PENALTY",
    short: "Every tied player loses one point.",
    narration: "A consecutive tie has been recorded. Every tied player loses one point.",
    audioSrc: "/audio/02-consecutive-tie-penalty.mp3",
    duration: 10_300,
  },
  duplicates_void: {
    number: "03",
    title: "DUPLICATES VOID",
    short: "Matching choices leave the calculation.",
    narration: "Duplicate choices are now void. Identical selections will be removed from the calculation.",
    audioSrc: "/audio/03-duplicate-choices-void.mp3",
    duration: 9_500,
  },
  exact_double: {
    number: "04",
    title: "EXACT MATCH · DOUBLE LOSS",
    short: "An exact target doubles every losing penalty.",
    narration: "An exact match now activates double loss. Every losing player will lose two points.",
    audioSrc: "/audio/04-exact-match-double-loss.mp3",
    duration: 10_500,
  },
  hundred_zero: {
    number: "05",
    title: "100 DEFEATS 0",
    short: "When the extremes meet, one hundred survives.",
    narration: "If zero and one hundred are selected, one hundred defeats zero.",
    audioSrc: "/audio/05-one-hundred-defeats-zero.mp3",
    duration: 9_300,
  },
};

export const RULE_BRIEFING_PREROLL_MS = 2_500;

const RULE_AMENDMENT_IDS = new Set<RuleAmendmentId>(Object.keys(RULE_AMENDMENTS) as RuleAmendmentId[]);

export function parseBriefingIds(message: string | null): RuleAmendmentId[] {
  if (!message?.startsWith("briefing:")) return [];
  return message
    .slice("briefing:".length)
    .split(",")
    .filter((id): id is RuleAmendmentId => RULE_AMENDMENT_IDS.has(id as RuleAmendmentId));
}

export const briefingPlaybackDuration = (ids: RuleAmendmentId[]) =>
  ids.reduce((total, id) => total + RULE_AMENDMENTS[id].duration, 0);

export const briefingWindowDuration = (ids: RuleAmendmentId[]) =>
  RULE_BRIEFING_PREROLL_MS + briefingPlaybackDuration(ids);

export function tieBriefingIds({
  currentWasTie,
  previousWasTie,
  deadlockPreviouslyAnnounced,
}: {
  currentWasTie: boolean;
  previousWasTie: boolean;
  deadlockPreviouslyAnnounced: boolean;
}): RuleAmendmentId[] {
  if (!currentWasTie) return [];

  return [
    "tie_seal",
    ...(previousWasTie && !deadlockPreviouslyAnnounced
      ? (["consecutive_tie"] as RuleAmendmentId[])
      : []),
  ];
}
