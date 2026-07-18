/**
 * Pure judgment layer. Zero I/O, zero clock dependencies beyond `now` (injectable
 * only through the facts themselves — see `daysSincePush`).
 *
 * Turns raw GitHub facts into the call the demo actually shows: is this repo alive,
 * is it safe to BORROW, and should it be surfaced at all.
 *
 * Design bias that matters: stars are a WEAK positive signal, never a ranking axis.
 * This product exists to surface the 300-star exact fit that GitHub search buries
 * under the 50k-star wrong-shaped project. Stars contribute logarithmically and cap
 * at 20 of 100 points, so a 50k-star repo out-earns a 300-star repo by ~9 points —
 * enough to break a tie, never enough to win on popularity alone.
 */
const MS_PER_DAY = 86_400_000;
/** Health band cutoffs, in days since the last real commit. */
const HEALTHY_DAYS = 90;
const AGING_DAYS = 365;
const STALE_2Y_DAYS = 730;
/** Recency score floors out here (5 years). */
const DEAD_DAYS = 1825;
/** A repo below this star count that is also stale is noise, not a find. */
const LOW_SIGNAL_STARS = 25;
/** Star ceiling for the logarithmic curve. Beyond this, stars stop earning anything. */
const STAR_SATURATION = 50_000;
/** Point budget. Sums to 100 for a fresh, licensed, non-fork, wildly popular repo. */
const W_RECENCY = 60;
const W_STARS = 20;
const W_LICENSE = 15;
const W_NOT_FORK = 5;
/** Flat penalty for an archived repo, applied after the blend. */
const P_ARCHIVED = 30;
/** Extra sting for unlicensed on top of forfeiting W_LICENSE. */
const P_NO_LICENSE = 5;
const PERMISSIVE = new Set(['MIT', 'APACHE-2.0', 'ISC', '0BSD', 'UNLICENSE']);
function clamp(n, lo, hi) {
    return Math.min(hi, Math.max(lo, n));
}
/** Linear interpolation of `days` inside [d0, d1] onto [s0, s1]. */
function lerp(days, d0, d1, s0, s1) {
    if (d1 === d0)
        return s1;
    const t = clamp((days - d0) / (d1 - d0), 0, 1);
    return s0 + (s1 - s0) * t;
}
/**
 * Whole days between `pushed_at` and now. Null when GitHub gave us nothing usable —
 * that is a real state (empty repos have no pushed_at) and must not read as "fresh".
 */
export function daysSincePush(f, now = Date.now()) {
    if (!f.pushed_at)
        return null;
    const t = Date.parse(f.pushed_at);
    if (Number.isNaN(t))
        return null;
    return Math.max(0, Math.floor((now - t) / MS_PER_DAY));
}
function bandOf(days, archived) {
    if (archived)
        return 'archived';
    if (days === null)
        return 'unknown';
    if (days <= HEALTHY_DAYS)
        return 'healthy';
    if (days <= AGING_DAYS)
        return 'aging';
    return 'stale';
}
/** Recency is the dominant term: 0..W_RECENCY, decaying in bands that mirror `Health`. */
function recencyPoints(days) {
    // No pushed_at is genuinely unknown, not fresh and not dead. Sit it below "aging".
    if (days === null)
        return W_RECENCY * 0.33;
    if (days <= 30)
        return W_RECENCY;
    if (days <= HEALTHY_DAYS)
        return lerp(days, 30, HEALTHY_DAYS, W_RECENCY, W_RECENCY * 0.83);
    if (days <= AGING_DAYS)
        return lerp(days, HEALTHY_DAYS, AGING_DAYS, W_RECENCY * 0.83, W_RECENCY * 0.5);
    if (days <= STALE_2Y_DAYS)
        return lerp(days, AGING_DAYS, STALE_2Y_DAYS, W_RECENCY * 0.5, W_RECENCY * 0.25);
    return lerp(days, STALE_2Y_DAYS, DEAD_DAYS, W_RECENCY * 0.25, 0);
}
/** Logarithmic and capped. See the note at the top of this file — this is deliberate. */
function starPoints(stars) {
    const s = Math.max(0, stars ?? 0);
    const ratio = Math.log10(1 + s) / Math.log10(1 + STAR_SATURATION);
    return W_STARS * clamp(ratio, 0, 1);
}
function isUnlicensed(license) {
    // "NOASSERTION" means GitHub found a LICENSE file it could not classify. For our
    // purposes that is the same risk as no license: the consumer cannot rely on it.
    return license == null || license.toUpperCase() === 'NOASSERTION';
}
function isCopyleft(license) {
    const l = license.toUpperCase();
    return l.startsWith('GPL') || l.startsWith('AGPL') || l.startsWith('LGPL');
}
function isPermissive(license) {
    const l = license.toUpperCase();
    return PERMISSIVE.has(l) || l.startsWith('BSD-');
}
/**
 * Copyleft-into-permissive is a SIGNAL, not legal adjudication. One flag, one short
 * note, no compatibility matrix. Deliberately does not fire when the target is itself
 * copyleft — that combination is fine and warning about it would be noise.
 */
function licenseMismatch(license, target) {
    if (license == null)
        return false;
    if (isUnlicensed(license))
        return false; // NO_LICENSE already covers this
    return isCopyleft(license) && isPermissive(target);
}
/**
 * Apply judgment to one repo's facts.
 *
 * `verdict` is the agent's call for the component this repo was proposed under. It
 * only affects `verdict_fit` / `fit_note` — the health numbers are verdict-independent
 * so the same repo scores identically wherever it appears.
 */
export function assess(f, verdict, targetLicense, now = Date.now()) {
    const target = targetLicense && targetLicense.trim() ? targetLicense.trim() : 'MIT';
    // A repo that does not exist has no health to report. Bail before the flag pass —
    // otherwise a 404 picks up NO_LICENSE (its license field is absent, not permissive)
    // and a fit_note lecturing about dependency rights on a repo that isn't there.
    // `disqualify` drops these anyway, but nothing downstream should be able to render
    // a hallucinated repo as though it had been evaluated.
    if (!f.exists) {
        return {
            ...f,
            health: 'unknown',
            health_score: 0,
            days_since_push: null,
            flags: [],
            verdict_fit: 'ok',
        };
    }
    const days = daysSincePush(f, now);
    const archived = f.archived === true;
    const disabled = f.disabled === true;
    const unlicensed = isUnlicensed(f.license);
    const fork = f.is_fork === true;
    // Staleness for flags/warnings is measured from commits, independent of the archived
    // override on `health` — an archived repo that also has not been touched in 3 years
    // should still say so.
    const stale = days !== null && days > AGING_DAYS;
    const stale2y = days !== null && days > STALE_2Y_DAYS;
    const health = bandOf(days, archived);
    const flags = [];
    if (archived)
        flags.push('ARCHIVED');
    if (unlicensed)
        flags.push('NO_LICENSE');
    if (fork)
        flags.push('FORK');
    if (stale2y)
        flags.push('STALE_2Y');
    if (f.full_name && f.req.toLowerCase() !== f.full_name.toLowerCase())
        flags.push('RENAMED');
    if (licenseMismatch(f.license, target))
        flags.push('LICENSE_MISMATCH');
    if ((f.stars ?? 0) < LOW_SIGNAL_STARS && stale)
        flags.push('LOW_SIGNAL');
    let score = recencyPoints(days) + starPoints(f.stars);
    if (!unlicensed)
        score += W_LICENSE;
    else
        score -= P_NO_LICENSE;
    if (!fork)
        score += W_NOT_FORK;
    if (archived || disabled)
        score -= P_ARCHIVED;
    const health_score = Math.round(clamp(score, 0, 100));
    // The one failure that discredits the entire tool is recommending BORROW on a repo
    // that is abandoned, unlicensed, or dead. Make that loud rather than quietly ranking
    // it third.
    let verdict_fit = 'ok';
    let fit_note;
    if (verdict === 'BORROW') {
        const reasons = [];
        if (archived)
            reasons.push('it is archived (read-only, no fixes will land)');
        if (disabled)
            reasons.push('it has been disabled by GitHub');
        if (unlicensed) {
            reasons.push(f.license == null
                ? 'it has no license, so you have no right to depend on it'
                : 'its license is unclassifiable (NOASSERTION), so dependency rights are unclear');
        }
        if (stale) {
            reasons.push(`its last commit was ${days} days ago${stale2y ? ' (over two years)' : ''}`);
        }
        if (reasons.length > 0) {
            verdict_fit = 'warn';
            fit_note = `BORROW is risky here: ${reasons.join('; ')}. Prefer KITBASH — read it and adapt the approach rather than taking the dependency.`;
        }
    }
    if (verdict_fit === 'ok' && flags.includes('LICENSE_MISMATCH')) {
        // Not a fit failure, but the demo should say it out loud.
        fit_note = `License signal: ${f.license} is copyleft and your target is ${target}. Taking this as a dependency may impose obligations on your own code. Not legal advice — check before shipping.`;
    }
    return {
        ...f,
        health,
        health_score,
        days_since_push: days,
        flags,
        verdict_fit,
        ...(fit_note ? { fit_note } : {}),
    };
}
/**
 * How far below a rival a repo must score before health is allowed to override the
 * agent's ordering. Below this gap the two repos are "comparably alive" and the
 * agent's judgment stands untouched.
 */
const DEMOTE_GAP = 25;
/**
 * Best first. Non-mutating.
 *
 * THE AGENT'S RANKING IS THE PRODUCT. This function is where "the 400-star exact fit
 * beats the 50k-star general one" actually lives — everything else in this codebase is
 * plumbing around this ordering decision.
 *
 * The host model was told, in rubric.ts, to surface the under-starred repo that does
 * precisely this one thing and to rank it FIRST, putting the obvious popular library
 * second as the safe alternate. It complies. If we then re-sorted purely by
 * health_score we would undo that in the same breath: health_score carries
 * log(stars) worth up to 20 points, so a 2.6k-star generic library out-scores a
 * 412-star exact fit by roughly 6 points on popularity alone and takes the lead
 * slot. The tool would be instructing the model to dig the buried repo up and then
 * burying it again itself — contradicting the README on stage.
 *
 * So: PROPOSAL ORDER IS THE PRIMARY KEY. `i` is the index the agent handed us.
 * Health is a VETO, never a promotion. It can only push a repo DOWN, and only when
 * the repo is materially worse than a rival — a gap of more than DEMOTE_GAP points,
 * which in practice means archived, unlicensed, or years dead, not merely less
 * popular. A repo can never climb over an earlier one by being more popular.
 *
 * The 'warn' tier still sinks below every 'ok' repo unconditionally. If we have
 * flagged BORROW-on-a-dead-repo, it must not be the thing we lead with no matter
 * where the agent put it.
 *
 * The ordering is a genuine total order — see rankTier for why that took care to
 * get right, and why a pairwise gap threshold would not have been one.
 */
export function rank(list) {
    const indexed = list.map((r, i) => ({ r, i }));
    // The fit veto is a hard partition rather than a comparator branch. Splitting
    // first means each tier's demotion threshold is measured against its OWN best
    // repo, so a healthy-but-warned repo can never drag the 'ok' tier's threshold
    // around and demote a repo it isn't even competing with.
    const ok = indexed.filter((x) => x.r.verdict_fit === 'ok');
    const warned = indexed.filter((x) => x.r.verdict_fit !== 'ok');
    return [...rankTier(ok), ...rankTier(warned)].map(({ r }) => r);
}
/**
 * Order one fit tier: materially-deficient repos sink, everything else keeps the
 * agent's order.
 *
 * Bucketing is measured against the TIER'S BEST score, not pairwise between the
 * two repos being compared. That distinction is the whole point. A pairwise
 * `gap > DEMOTE_GAP` test is not transitive — scores 70/90/100 at indices 0/1/2
 * give A<B and B<C but A>C — so the comparator would not be a strict weak
 * ordering and the output would depend on V8's sort internals rather than on the
 * data. Since the demo re-runs live in front of people, "deterministic" has to be
 * a property we can actually prove, not one we observed holding for three inputs.
 *
 * Comparing every repo to a single fixed reference makes the bucket an intrinsic
 * property of each element, so the ordering is a genuine total order.
 */
function rankTier(tier) {
    if (tier.length < 2)
        return tier;
    const best = Math.max(...tier.map((x) => x.r.health_score));
    const bucketOf = (x) => (x.r.health_score >= best - DEMOTE_GAP ? 0 : 1);
    return [...tier].sort((a, b) => {
        // Only a MATERIAL deficit moves a repo, and only downward. In practice this
        // means archived, unlicensed, or years dead — never merely less popular.
        const ab = bucketOf(a);
        const bb = bucketOf(b);
        if (ab !== bb)
            return ab - bb;
        // Otherwise the agent's order stands. This is the load-bearing line.
        return a.i - b.i;
    });
}
/**
 * Should this repo be dropped instead of shown? Null means keep it.
 *
 * ARCHIVED is intentionally verdict-sensitive: an archived repo is still a perfectly
 * good thing to KITBASH from — frozen code you read and adapt does not need a
 * maintainer — but it is not something you take a dependency on. `assess` encodes
 * that verdict context: an archived repo only carries verdict_fit 'warn' when the
 * verdict was BORROW, so the conjunction below is exactly "archived AND BORROW".
 */
export function disqualify(a) {
    if (!a.exists) {
        return {
            req: a.req,
            reason: a.status === 404 ? 'NOT_FOUND' : 'ERROR',
            status: a.status,
        };
    }
    // Never surface a private repo. The gh token carries 'repo' scope and CAN read the
    // user's private repos — echoing one back would leak its existence into a report
    // that gets pasted into chat.
    // The name is redacted here, at the only point it could enter the report structure.
    // Everything downstream — the markdown AND the JSON block the host agent receives —
    // is rendered from RejectedRepo, and both end up in a chat transcript. Leaving the
    // real owner/name in and relying on the renderer to hide it would put the guarantee
    // one refactor away from being lost.
    if (a.private === true) {
        return { req: '(private repo — name withheld)', reason: 'PRIVATE', status: a.status };
    }
    if (a.flags.includes('ARCHIVED') && a.verdict_fit === 'warn') {
        return { req: a.req, reason: 'ARCHIVED', status: a.status };
    }
    return null;
}
//# sourceMappingURL=score.js.map