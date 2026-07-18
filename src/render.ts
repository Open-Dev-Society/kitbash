/**
 * Renders the verified slate into the demo artifact.
 *
 * Pure. No I/O, no mutation of the input. `now` is injectable so output is
 * deterministic under test; it is only used to age cache snapshots honestly.
 */

import type {
  RejectedRepo,
  RepoAssessment,
  RepoFlag,
  ResolvedComponent,
  VerifyResult,
  Verdict,
} from './types.js';

type Report = Omit<VerifyResult, 'markdown'>;

const FLAG_LABEL: Record<RepoFlag, string> = {
  ARCHIVED: 'archived by its owner',
  NO_LICENSE: 'no license file',
  FORK: 'a fork, not the upstream',
  STALE_2Y: 'no commits in over 2 years',
  RENAMED: 'redirects — the repo was renamed',
  LICENSE_MISMATCH: 'license conflicts with your target',
  LOW_SIGNAL: 'very little activity to judge by',
};

const VERDICT_BLURB: Record<Verdict, string> = {
  BORROW: 'take the dependency',
  KITBASH: 'read it, adapt it, do not depend on it',
  WRITE: 'no repo needed',
};

/* ------------------------------------------------------------------ */
/* formatting primitives                                               */
/* ------------------------------------------------------------------ */

function stars(n: number | undefined): string {
  if (n === undefined || n === null) return 'stars unknown';
  if (n < 1000) return `${n} star${n === 1 ? '' : 's'}`;
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k stars`;
  return `${Math.round(n / 1000)}k stars`;
}

/** Human-relative, from a day count. Never an ISO timestamp. */
function agoFromDays(days: number | null | undefined): string {
  if (days === null || days === undefined) return 'last commit unknown';
  if (days <= 0) return 'last commit today';
  if (days === 1) return 'last commit yesterday';
  if (days < 7) return `last commit ${days} days ago`;
  if (days < 14) return 'last commit last week';
  if (days < 60) return `last commit ${Math.round(days / 7)} weeks ago`;
  if (days < 365) return `last commit ${Math.max(2, Math.round(days / 30))} months ago`;
  const years = days / 365;
  if (years < 2) return 'last commit over a year ago';
  return `last commit ${Math.floor(years)} years ago`;
}

/** Coarse human duration for cache snapshot age. */
function snapshotAge(fetchedAt: string | undefined, now: number): string {
  if (!fetchedAt) return 'age unknown';
  const t = Date.parse(fetchedAt);
  if (Number.isNaN(t)) return 'age unknown';
  const mins = Math.max(0, Math.round((now - t) / 60_000));
  if (mins < 1) return 'taken just now';
  if (mins < 60) return `${plural(mins, 'minute', 'minutes')} old`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${plural(hours, 'hour', 'hours')} old`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${plural(days, 'day', 'days')} old`;
  return `${plural(Math.round(days / 30), 'month', 'months')} old`;
}

function license(l: string | null | undefined): string {
  if (l === null || l === undefined) return 'no license';
  if (l === 'NOASSERTION') return 'license unrecognized';
  return l;
}

function repoLink(r: RepoAssessment): string {
  const label = r.full_name ?? r.req;
  const url = r.html_url ?? `https://github.com/${r.req}`;
  return `[${label}](${url})`;
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/* ------------------------------------------------------------------ */
/* repo block                                                          */
/* ------------------------------------------------------------------ */

function statLine(r: RepoAssessment, now: number): string {
  const bits = [stars(r.stars), agoFromDays(r.days_since_push), license(r.license)];
  if (r.language) bits.push(r.language);
  if (r.source === 'cache') bits.push(`CACHED SNAPSHOT, ${snapshotAge(r.fetched_at, now)}`);
  return bits.join('  ·  ');
}

function pickedBlock(r: RepoAssessment, now: number): string[] {
  const out: string[] = [];
  out.push(`**${repoLink(r)}**`);
  out.push(`${statLine(r, now)}`);

  if (r.flags.length) {
    out.push('');
    out.push(`Flags — ${r.flags.map((f) => FLAG_LABEL[f] ?? f).join(' · ')}`);
  }
  if (r.verdict_fit === 'warn' && r.fit_note) {
    out.push('');
    out.push(`**Check this:** ${r.fit_note}`);
  }
  if (r.source === 'cache') {
    out.push('');
    out.push(
      `_Not live. These numbers are from a snapshot ${snapshotAge(r.fetched_at, now)} — re-verify before you commit to it._`,
    );
  }
  return out;
}

/**
 * Why a repo the agent ranked first got demoted, in the reader's language.
 *
 * Falls back to the raw score gap only when no flag explains it — better a dry
 * number than a confident-sounding reason we did not actually establish.
 */
function demotionReason(demoted: RepoAssessment, picked: RepoAssessment): string {
  const bits: string[] = [];
  if (demoted.archived) bits.push('archived');
  if (demoted.disabled) bits.push('disabled by GitHub');
  if (demoted.flags.includes('NO_LICENSE')) bits.push('no license');
  const days = demoted.days_since_push;
  if (days !== null && days > 365) {
    const years = Math.floor(days / 365);
    bits.push(years >= 2 ? `no commits in ${years} years` : 'no commits in over a year');
  }
  if (bits.length === 0) {
    bits.push(`health ${demoted.health_score} against ${picked.health_score}`);
  }
  return bits.join(' / ');
}

/**
 * The agent writes `rationale` ABOUT ITS OWN #1 CANDIDATE. When rank() demotes that
 * candidate, the rationale ends up printed under a DIFFERENT repo — prose about repo
 * A sitting beneath repo B, which is a fabricated claim from the one tool whose whole
 * pitch is that it does not fabricate.
 *
 * We do not silently reattribute. We say out loud that a swap happened and why, so
 * the rationale reads as what it is: the case for the repo that got demoted.
 */
function demotionNote(demoted: RepoAssessment, picked: RepoAssessment): string {
  const label = demoted.full_name ?? demoted.req;
  return (
    `_Promoted over the first-ranked candidate: ${repoLink(demoted)} scored materially ` +
    `lower on health (${demotionReason(demoted, picked)}). The rationale above was ` +
    `written for ${label} — weigh it accordingly._`
  );
}

function alternateLine(r: RepoAssessment, now: number): string {
  const extra = r.flags.length ? ` · ${r.flags.map((f) => FLAG_LABEL[f] ?? f).join(' · ')}` : '';
  return `- ${repoLink(r)} — ${stars(r.stars)}, ${agoFromDays(r.days_since_push)}, ${license(r.license)}${extra}`;
}

/**
 * How a dropped repo is named in the report.
 *
 * PRIVATE is the one reason whose subject must never be spelled out. The gh token
 * carries 'repo' scope, so a private repo returns 200 and lands here by name — and
 * this markdown is pasted into chat. Printing "acme/secret-thing (private)" leaks
 * the existence of a private repository to whoever reads the report. Say that one
 * was dropped, never which one.
 */
function rejectedLabel(r: RejectedRepo): string {
  if (r.reason === 'PRIVATE') return 'a private repo (withheld)';
  return `${r.req} (${r.reason.toLowerCase().replace('_', ' ')})`;
}

/** Same rule, backtick-quoted, for the ACTION REQUIRED block. */
function rejectedLabelCode(r: RejectedRepo): string {
  if (r.reason === 'PRIVATE') return 'a private repo (withheld)';
  return `\`${r.req}\` ${r.reason.toLowerCase().replace('_', ' ')}`;
}

/* ------------------------------------------------------------------ */
/* component block                                                     */
/* ------------------------------------------------------------------ */

function renderComponent(
  c: ResolvedComponent,
  now: number,
  firstWrite: boolean,
  demoted: RepoAssessment | undefined,
): string {
  const out: string[] = [];

  out.push(`## ${c.verdict}  ·  ${c.name}`);
  out.push('');
  out.push(`_${c.role}_`);
  out.push('');

  if (c.verdict === 'WRITE') {
    out.push('**No repo needed. Write this one.**');
    out.push('');
    out.push(c.rationale);
    if (firstWrite) {
      out.push('');
      out.push(
        '_A component you never take on is a component you never maintain. This is a result, not a gap._',
      );
    }
    return out.join('\n');
  }

  if (c.picked) {
    out.push(...pickedBlock(c.picked, now));
    out.push('');
    out.push(c.rationale);

    if (demoted) {
      out.push('');
      out.push(demotionNote(demoted, c.picked));
    }

    if (c.alternates.length) {
      out.push('');
      out.push('Also survived verification:');
      out.push(...c.alternates.map((a) => alternateLine(a, now)));
    }
  } else {
    out.push(c.rationale);
  }

  if (c.needs_recall) {
    out.push('');
    out.push('> **ACTION REQUIRED — nothing here is usable yet.**');
    out.push('>');
    out.push(
      `> Every repo proposed for this component failed verification${
        c.rejected.length ? ` (${c.rejected.map(rejectedLabelCode).join(', ')})` : ''
      }.`,
    );
    out.push('>');
    out.push('> Propose replacement repos for this component and call `kitbash_verify` again.');
  } else if (c.rejected.length) {
    out.push('');
    out.push(
      `_Dropped before you saw it: ${c.rejected.map(rejectedLabel).join(', ')}._`,
    );
  }

  return out.join('\n');
}

/* ------------------------------------------------------------------ */
/* main                                                                */
/* ------------------------------------------------------------------ */

/**
 * @param demotions component id -> the agent's first-ranked surviving candidate, when
 *   rank() demoted it below something else. Passed at render time rather than stored on
 *   ResolvedComponent because types.ts is the frozen contract; this is presentation
 *   state, and it exists only so the report can be honest about whose rationale it is
 *   printing. Empty map = no swaps happened, which is the common case.
 */
export function renderReport(
  r: Report,
  now: number = Date.now(),
  demotions: ReadonlyMap<string, RepoAssessment> = new Map(),
): string {
  const out: string[] = [];
  const comps = r.components;

  const counts = {
    BORROW: comps.filter((c) => c.verdict === 'BORROW').length,
    KITBASH: comps.filter((c) => c.verdict === 'KITBASH').length,
    WRITE: comps.filter((c) => c.verdict === 'WRITE').length,
  };

  /* ---- header ----
   *
   * This is a projector header. A judge sees it cold, from across a room, and never
   * scrolls. Everything load-bearing has to survive above the fold:
   *   1. the idea, so the output is anchored to a question
   *   2. the split framed as "N to write, M already solved" — the actual claim
   *   3. what is YOURS, by name, because that is the line people remember
   *   4. the legend, because "KITBASH" means nothing to someone seeing it for the
   *      first time and an unexplained verdict column is just noise
   * The bottom summary repeats 3. Repetition is correct here — the top serves the
   * room, the bottom serves the person who actually reads it afterwards.
   */
  out.push(`# Kitbash`);
  out.push('');
  out.push(`**${r.idea.trim()}**`);
  out.push('');

  const solved = counts.BORROW + counts.KITBASH;
  if (comps.length > 0) {
    const headline = [
      counts.WRITE ? `**${counts.WRITE} to write**` : null,
      solved ? `**${solved} already solved**` : null,
    ].filter((x): x is string => x !== null);
    out.push(
      `${plural(comps.length, 'component', 'components')} — ${headline.join(', ')}.`,
    );
    out.push('');

    if (counts.WRITE > 0) {
      const mine = comps.filter((c) => c.verdict === 'WRITE').map((c) => c.name);
      out.push(`The part that is actually yours: **${mine.join('**, **')}**.`);
      out.push('');
    }

    /*
     * The scope line. This is the counterfactual made visible, and it is the whole
     * argument for the product: the value was never a faster workflow, it was a
     * smaller project.
     *
     * It states a COUNT and a PERCENTAGE and stops there. It is deliberately silent
     * on hours or days saved, and that restraint is the point — any time estimate
     * would be invented, and this is a tool whose entire credibility rests on every
     * figure it prints being checkable. Fabricating the one number that flatters us
     * is exactly how you lose an audience that has been told nothing here is made up.
     * The presenter can say "call it two days" out loud; that is a human's estimate,
     * not the tool asserting one.
     */
    if (solved > 0 && comps.length > 0) {
      const pct = Math.round((solved / comps.length) * 100);
      out.push(
        `**You are not building ${plural(solved, 'component', 'components')} of ${comps.length} — ` +
          `${pct}% of this project already exists.**`,
      );
      out.push('');
    }
  }

  /* The legend. Without it the verdict headings below are three unexplained words. */
  const legendVerdicts: Verdict[] = ['BORROW', 'KITBASH', 'WRITE'];
  const legend = legendVerdicts
    .filter((v) => counts[v] > 0)
    .map((v) => `**${v}** ${VERDICT_BLURB[v]}`);
  if (legend.length) {
    out.push(legend.join('  ·  '));
    out.push('');
  }

  // Only claim live verification when there is actually something below that was
  // verified. A WRITE-only slate reaches the GitHub API zero times, and telling the
  // reader "every repo below returned 200" under a report with no repos in it is a
  // claim about an empty set dressed up as a guarantee.
  const repoCount = comps.reduce(
    (n, c) => n + (c.picked ? 1 : 0) + c.alternates.length,
    0,
  );

  // Repos were proposed and NOT ONE could be confirmed. This is the outage shape:
  // GitHub refused or never answered (rate limit, auth, captive portal, 5xx) and the
  // snapshot had nothing to fill in with. It must be caught before every branch below,
  // because each of those would state something false about it — `repoCount === 0`
  // would call an outage a self-written slate, and the live branch would announce that
  // repos "returned 200" when none of them answered at all.
  if (r.stats.proposed > 0 && r.stats.verified === 0) {
    out.push(
      `_GitHub could not be reached — **nothing below was confirmed**. Re-run when the network is back._`,
    );
  } else if (repoCount === 0) {
    out.push(
      `_No repos to check — this slate is all code you write yourself._`,
    );
  } else if (r.github.source === 'cache') {
    out.push(
      `_Served from a cached snapshot — **not live**. Snapshot ages are labelled on each repo below._`,
    );
  } else if (r.github.source === 'mixed') {
    out.push(
      `_Checked against the GitHub API. Some records came from cache and are labelled inline; treat those as unconfirmed._`,
    );
  } else {
    const rate = r.github.remaining === null ? '' : ` (${r.github.remaining} API calls left this hour)`;
    out.push(
      `_Every one of the ${plural(repoCount, 'repo', 'repos')} below returned 200 from the GitHub API just now${rate}._`,
    );
  }
  out.push('');

  /* ---- the demo moment ---- */
  if (r.stats.hallucinated > 0) {
    const dropped = comps.flatMap((c) => c.rejected.filter((x) => x.reason === 'NOT_FOUND').map((x) => x.req));
    out.push('---');
    out.push('');
    out.push(
      `> ## ${r.stats.hallucinated} of ${r.stats.proposed} proposed repos did not exist and were dropped before you saw them.`,
    );
    out.push('>');
    out.push(
      `> Hallucination rate: **${pct(r.stats.hallucination_rate)}**. ` +
        `Those names were produced with total confidence and would have read as real in any chat window.`,
    );
    if (dropped.length) {
      out.push('>');
      out.push(`> Dropped: ${dropped.map((d) => `\`${d}\``).join('  ·  ')}`);
    }
    out.push('>');
    out.push(`> ${r.stats.verified} survived. Everything below this line was confirmed to exist.`);
    out.push('');
  }

  /* ---- components ---- */
  let seenWrite = false;
  for (const c of comps) {
    const firstWrite = c.verdict === 'WRITE' && !seenWrite;
    if (firstWrite) seenWrite = true;
    out.push('---');
    out.push('');
    out.push(renderComponent(c, now, firstWrite, demotions.get(c.id)));
    out.push('');
  }

  /* ---- assembled stack ---- */
  if (comps.length === 0) {
    out.push('---');
    out.push('');
    out.push('_No components were returned. Nothing to assemble._');
    out.push('');
    return out.join('\n');
  }

  out.push('---');
  out.push('');
  out.push('## How these connect');
  out.push('');

  const nameWidth = Math.max(0, ...comps.map((c) => c.name.length));
  const rows = comps.map((c, idx) => {
    const tag = c.verdict.padEnd(7);
    const src =
      c.verdict === 'WRITE'
        ? 'yours'
        : c.picked
          ? (c.picked.full_name ?? c.picked.req)
          : 'UNRESOLVED — needs a repo';
    return `${String(idx + 1).padStart(2)}.  ${c.name.padEnd(nameWidth)}   ${tag}  ${src}`;
  });
  out.push('```');
  out.push(...rows);
  out.push('```');
  out.push('');

  /* Counts reflect what actually resolved, not what was hoped for. */
  const installs = comps.filter((c) => c.verdict === 'BORROW' && c.picked).length;
  const adapts = comps.filter((c) => c.verdict === 'KITBASH' && c.picked).length;
  const unresolved = comps.filter((c) => c.verdict !== 'WRITE' && !c.picked).length;

  const tally = [
    installs ? `${plural(installs, 'dependency', 'dependencies')} to install` : null,
    adapts ? `${plural(adapts, 'reference', 'references')} to read and adapt` : null,
    counts.WRITE ? `${plural(counts.WRITE, 'component', 'components')} to write` : null,
    unresolved ? `${unresolved} still unresolved` : null,
  ].filter((x): x is string => x !== null);
  if (tally.length) out.push(`${tally.join(', ')}.`);

  if (counts.WRITE > 0) {
    const mine = comps.filter((c) => c.verdict === 'WRITE').map((c) => c.name);
    // Same rule as the header: only claim the rest was checked when there IS a rest.
    // On an all-WRITE slate "everything else already exists" describes an empty set.
    const rest = repoCount > 0 ? ' Everything else already exists and has been checked.' : '';
    out.push('');
    out.push(`The part that is actually yours: **${mine.join('**, **')}**.${rest}`);
  }

  /* ---- next step ---- */
  if (r.next_action === 'RECALL_REPLACEMENTS') {
    const stuck = comps.filter((c) => c.needs_recall).map((c) => c.name);
    out.push('');
    out.push('---');
    out.push('');
    out.push('> ## This slate is not finished.');
    out.push('>');
    out.push(
      `> ${stuck.length === 1 ? 'One component has' : `${stuck.length} components have`} no verified repo: **${stuck.join('**, **')}**.`,
    );
    out.push('>');
    out.push('> Propose replacements and call `kitbash_verify` again before building on this.');
  }

  out.push('');
  return out.join('\n');
}
