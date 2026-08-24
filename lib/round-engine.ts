export type RoundContestant = {
  id: string;
  name: string;
  score: number;
  pick: number | null;
  submitted: boolean;
};

export type RoundOutcome = {
  id: string;
  pick: number | null;
  won: boolean;
  invalid: boolean;
  delta: number;
  score: number;
  alive: boolean;
  distance: number | null;
};

export type RoundCalculation = {
  submitted: RoundContestant[];
  sum: number;
  average: number;
  target: number;
  winnerIds: string[];
  winnerName: string;
  exact: boolean;
  outcomes: RoundOutcome[];
  invalidIds: Set<string>;
  gameWinnerId: string | null;
  notice: string;
};

export function calculateRound(
  contestants: RoundContestant[],
  options: { eliminatedBefore: number; previousWasTie: boolean },
): RoundCalculation {
  const submitted = contestants.filter(
    (player) => player.submitted && player.pick !== null && Number.isInteger(player.pick),
  );
  const sum = submitted.reduce((total, player) => total + Number(player.pick), 0);
  const average = submitted.length ? sum / submitted.length : 50;
  const target = average * 0.8;

  const pickCounts = new Map<number, number>();
  for (const player of submitted) {
    const pick = Number(player.pick);
    pickCounts.set(pick, (pickCounts.get(pick) ?? 0) + 1);
  }

  const invalidIds = new Set<string>();
  if (options.eliminatedBefore >= 1) {
    for (const player of submitted) {
      if ((pickCounts.get(Number(player.pick)) ?? 0) > 1) invalidIds.add(player.id);
    }
  }

  let winners: RoundContestant[] = [];
  const submittedPicks = submitted.map((player) => Number(player.pick));
  const hundredZeroVictory =
    options.eliminatedBefore >= 3 &&
    submitted.length === 2 &&
    submittedPicks.includes(0) &&
    submittedPicks.includes(100);
  if (hundredZeroVictory) {
    winners = [submitted[submittedPicks.indexOf(100)]];
  } else {
    const eligible = submitted.filter((player) => !invalidIds.has(player.id));
    if (eligible.length) {
      const closest = Math.min(
        ...eligible.map((player) => Math.abs(Number(player.pick) - target)),
      );
      winners = eligible.filter(
        (player) => Math.abs(Math.abs(Number(player.pick) - target) - closest) < 0.000001,
      );
    }
  }

  const exact = winners.length === 1 && Number(winners[0].pick) === Math.round(target);
  const loss = options.eliminatedBefore >= 2 && exact ? -2 : -1;
  const consecutiveTiePenalty = options.previousWasTie && winners.length > 1;
  const winnerIds = winners.map((player) => player.id);

  const outcomes = contestants.map((player): RoundOutcome => {
    const won = winnerIds.includes(player.id);
    const delta = won ? (consecutiveTiePenalty ? loss : 1) : loss;
    const score = player.score + delta;
    return {
      id: player.id,
      pick: player.submitted ? player.pick : null,
      won,
      invalid: invalidIds.has(player.id),
      delta,
      score,
      // The final 0-versus-100 amendment awards the match itself. The losing
      // seat is closed without fabricating a −10 acid elimination score.
      alive: score > -10 && (!hundredZeroVictory || won),
      distance: player.submitted && player.pick !== null
        ? Math.abs(Number(player.pick) - target)
        : null,
    };
  });

  const winnerName = winners.length === 1
    ? winners[0].name
    : winners.length > 1
      ? "TIE"
      : "NO WINNER";
  const unsubmittedCount = contestants.length - submitted.length;
  const notices = [
    invalidIds.size
      ? `${invalidIds.size} duplicate choice${invalidIds.size === 1 ? " was" : "s were"} invalidated.`
      : "",
    unsubmittedCount
      ? `${unsubmittedCount} player${unsubmittedCount === 1 ? "" : "s"} did not submit and were excluded from the average.`
      : "",
    winners.length > 1
      ? `Deadlock detected — ${[...new Set(winners.map((player) => Number(player.pick)))].join(" and ")} are sealed next round.${consecutiveTiePenalty ? " Consecutive tie: every tied player loses 1 point." : ""}`
      : "",
    hundredZeroVictory
      ? "Final rule invoked — 100 defeats 0. The match is over."
      : "",
  ].filter(Boolean);

  return {
    submitted,
    sum,
    average,
    target,
    winnerIds,
    winnerName,
    exact,
    outcomes,
    invalidIds,
    gameWinnerId: hundredZeroVictory ? winners[0].id : null,
    notice: notices.join(" "),
  };
}
