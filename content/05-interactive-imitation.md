---
title: The Expert in the Passenger Seat
description: Interactive imitation — fix behavior cloning by labeling the learner's own states. DAgger as no-regret online learning, with the key regret results stated plainly.
nav_order: 36
part: "Part II — Branch A · Learning from Demonstrations"
summary: Put the labels where your policy actually drives and the quadratic blow-up becomes linear — the fix is an online-learning theorem wearing a driving glove.
interactive: true
---

# The Expert in the Passenger Seat

[Last chapter](/04-behavior-cloning/) ended with a diagnosis and a patch. The
diagnosis: behavior cloning optimizes a fine loss under the wrong distribution
— trained on the expert's states $d^{\pi^\star}$, deployed on its own,
$d^{\hat{\pi}}$. The patch — wobbling the expert to widen the data — helped,
but it widened *blindly*: noise explores where noise goes, not where **your
policy** actually ends up.

The principled fix inverts the roles. Stop asking the expert to *drive*. Let
the **learner** drive, and put the expert in the passenger seat with one job:
at every state the learner reaches, answer the question *"what would you have
done here?"* Collect those answers, add them to the dataset, refit, and repeat.
Now the labels live exactly where the policy operates — the training
distribution chases the deployment distribution until they agree.

This is **interactive imitation learning**, and its canonical algorithm is
**DAgger** — *Dataset Aggregation* (Ross, Gordon & Bagnell, 2011). The whole
algorithm fits in a breath:

```text
D  ← expert demonstrations                 # round 0 is plain behavior cloning
π₀ ← fit(D)
for i = 1 … N:
    roll out π_{i−1}; the expert LABELS every state visited (it never drives)
    D  ← D ∪ {(camera image, expert's steering)}        # aggregate — keep everything
    π_i ← fit(D)                                        # refit on the whole pile
return the π_i that validates best
```

Two deliberate choices are hiding in there. *The learner drives* — that is what
moves the labels onto the right distribution. And *the dataset aggregates* —
each round refits on **everything** ever collected, not just the newest
rollout. The first choice is intuitive by now. The second looks like a detail
and is actually the theory.

## Why aggregate? Imitation is an online game

Watch what happens across rounds. You commit to a policy $\pi_i$; the world
answers with a loss measured **on the states that policy induces**:

$$
\ell_i(\pi) \;=\; \mathbb{E}_{x \sim d^{\pi_i}}\!\left[\, \big\| \pi(x) - \pi^\star(x) \big\|^2 \right].
$$

Change the policy and the next loss function changes too, because the
distribution underneath it moves. That is not a fixed dataset. That is an
**opponent** — and there is a whole field for playing against opponents:
online learning. Its scorecard is **regret**, the gap between what you suffered
and what the single best fixed policy would have suffered on the *same* loss
sequence:

$$
\operatorname{Regret}_N \;=\; \sum_{i=1}^{N} \ell_i(\pi_i) \;-\; \min_{\pi \in \Pi} \sum_{i=1}^{N} \ell_i(\pi),
$$

and an algorithm is **no-regret** if $\operatorname{Regret}_N / N \to 0$: on
average, playing against the sequence as it unfolds, you did as well as the
best hindsight choice.

Here is the punchline hiding in DAgger's most boring-looking line. *"Refit on
the aggregate"* is precisely the online-learning strategy **Follow-The-Leader**
— at each round, play the policy that is best against the sum of all past
losses:

$$
\pi_{i+1} \;=\; \arg\min_{\pi \in \Pi} \sum_{j \le i} \ell_j(\pi).
$$

For strongly convex losses like squared error, Follow-The-Leader is no-regret
(its regularized cousin, FTRL, handles the general case) — while the tempting
alternative, *fit only the newest rollout*, is not: it chases the opponent and
oscillates forever. You can feel the difference below: same game, same
adversary, two learners.

<div class="demo" data-demo="regret-game"></div>

## The guarantee — stated, not proven

The reduction pays off as a theorem. Recall the [behavior-cloning
bound](/04-behavior-cloning/): supervised error $\varepsilon$ on the expert's
distribution can cost $O(\varepsilon T^2)$ in a $T$-step episode — the
quadratic is the compounding. DAgger with a no-regret learner replaces it with
(Ross, Gordon & Bagnell, 2011, simplified):

$$
J(\hat{\pi}) \;\le\; J(\pi^\star) \;+\; u\,T \Big(
\underbrace{\varepsilon_{\Pi}}_{\substack{\text{best achievable loss} \\ \text{on your own states}}}
\;+\;
\underbrace{\tfrac{1}{N}\operatorname{Regret}_N}_{\substack{\text{vanishes: the} \\ \text{no-regret property}}}
\Big),
$$

for some $\hat\pi$ among the iterates, where $u$ bounds how much one wrong
action can cost going forward. Read it slowly: the horizon enters **linearly**.
One mistake no longer poisons the rest of the episode, because the states a
mistake produces are *already in the training set* — recovery is in-distribution
behavior now. And the proof (the weeds we are skipping) is mostly bookkeeping
around the no-regret property; the substance is the **reduction**: imitation
learning has been converted into no-regret online learning, and any no-regret
algorithm — present or future — plugs in and inherits the guarantee.

| | behavior cloning | DAgger |
| --- | --- | --- |
| trains under | $d^{\pi^\star}$ (expert's states) | $d^{\pi_i}$ (learner's states, all rounds) |
| who drives during collection | the expert | the learner |
| the expert's job | demonstrate | label on demand |
| cost of per-step error $\varepsilon$ | $O(\varepsilon T^2)$ | $O(u\varepsilon T)$ |
| update rule | one supervised fit | Follow-The-Leader on the aggregate |

One honest footnote: $\varepsilon_\Pi$ is now measured on the *harder*
distribution — the learner's states, recoveries included — and nothing says it
must be as small as BC's cozy on-manifold error. The theorem doesn't delete
difficulty; it moves all of it into a term you can *see* on a validation set,
instead of a $T^2$ you discover on the road.

## The loop, live

Below is the driving lab running actual DAgger. Round 0 is [last
chapter's](/04-behavior-cloning/) clean clone — the one that dies at about 52
seconds on the kick gauntlet. Each **run a DAgger round** rolls out the current
policy live (the rollouts replay the *exact* seeded runs that generated the
training data), with the expert labeling every frame — watch the two steering
bars disagree precisely where the policy is wrong — then refits in PyTorch
(recorded curve, real weights) and scores the new policy on the gauntlet.

<div class="demo" data-demo="dagger-run" data-wide></div>

<aside class="callout" data-kind="try">
  <span class="callout-label">run the loop</span>
  <p><strong>Round 1</strong> is the whole argument. The round-0 policy drives
  and crashes twice (the ✕ marks); the expert calmly labels every state on the
  way down. Those few hundred off-tube labels are exactly the recovery data
  behavior cloning could never contain — and the survival plot jumps from 52 s
  to the full 180. <strong>Rounds 2–3</strong> teach the quieter lesson: the
  rollouts stop crashing, the histogram stops widening — the distribution has
  stopped moving, which is what convergence looks like in this game. Note the
  held-out MSE across rounds: it <em>wobbles upward</em> (the aggregate keeps
  getting harder) while closed-loop performance stays perfect. Offline loss
  still isn't the story. Then <strong>drive the current policy</strong> and
  nudge it — compare with how the clean clone took a nudge last chapter.</p>
</aside>

The counts are worth staring at: behavior cloning used 2,000 pristine frames
and died in a minute. DAgger added 1,500 frames — collected by a policy that
crashed twice while gathering them — and fixed it in one round. The learner's
own failures wrote the curriculum. That is the mechanism in one sentence.

## What the theorem doesn't buy you

DAgger's assumptions are load-bearing, and each one costs something in the
field:

- **An expert on call, forever.** Every round queries $\pi^\star$ at thousands
  of states. A human can demonstrate for an afternoon; answering "what would
  you do *here*?" for every frame of every rollout is a different contract.
- **Labeling off-policy states is unnatural.** Ask a driver what steering angle
  they'd apply in a skid *they aren't in* and you get noisy, sometimes
  systematically wrong answers — $\varepsilon_\Pi$ quietly grows.
- **Rolling out a bad policy is the price of its data.** Round 1's crashes were
  the most valuable frames in the dataset — and on real hardware they are also
  called *crashes*. The gated variants (HG-DAgger, SafeDAgger, EnsembleDAgger,
  LazyDAgger) let the expert intervene before disaster, trading a bit of regret
  for an intervention budget: interventions are cheap *signal* but expensive
  *labels*.

Here the simulator let us ignore all three. Chapter by chapter, we won't.

<aside class="callout" data-kind="warning">
  <span class="callout-label">what breaks next</span>
  <p>DAgger clones <em>actions</em>, not <em>intent</em>. It needs the expert in
  the loop forever, it can't evaluate a plan nobody demonstrated, and it can
  never drive <em>better</em> than the passenger seat. Recovering the objective
  itself — so the robot can be scored, audited, and improved beyond its teacher
  — is inverse RL, <a href="/06-road-ahead/">chapter A.3 on the road ahead</a>.
  And the same reduction seen here returns in <a href="/05-unified-view/">Branch
  B</a>, where the world itself provides the labels.</p>
</aside>

---

*The lab's source: [`dagger-run.js`](/static/demos/dagger-run.js) (the live
loop above), [`regret-game.js`](/static/demos/regret-game.js) (the online
game), and in the repo `tools/bc-lab/` — `run_dagger.mjs` (rollouts in the same
seeded simulator this page runs) alternating with `train_round.py` (each
round's PyTorch fit), exporting [`dagger-run.json`](/static/demos/dagger-run.json).*
