---
title: Cloning the Driver
description: Behavior cloning for a self-driving car — train a small CNN on expert demonstrations, deploy it, and watch its errors compound.
nav_order: 35
part: "Part II — Branch A · Learning from Demonstrations"
summary: The natural first idea — treat driving as supervised learning — looks perfect offline and drifts off the road in deployment. Watch both happen.
interactive: true
---

# Cloning the Driver

Driving is the canonical [Branch A](/03-two-branches/) system, and the reason is
worth saying precisely: **there is no embodiment gap**. The demonstrator and the
robot share a body. A human drives the actual car, through the actual steering
wheel, while the actual camera watches — so every mile anyone drives is a
perfectly-formatted training pair, (what the sensor saw, what the expert did).
No retargeting from a human hand to a robot gripper, no correspondence problem,
no simulator. The data is not merely cheap; it is *already in the right
coordinates*.

So the natural first idea writes itself: collect those pairs and fit the map
from pixels to steering with supervised learning. This is **behavior cloning**,
and it is a genuinely good first move — stable to train, off-policy, and able to
reuse the entire supervised-learning toolbox. It is also one of the oldest ideas
in the field.

<aside class="callout" data-kind="note">
  <span class="callout-label">history</span>
  <p>ALVINN drove a van at CMU in 1989 on a 3-layer network eating 30×32 images.
  NVIDIA's PilotNet did the modern version in 2016: a CNN mapping camera frames
  to human steering angles. Both worked. Both also ran into — and had to
  engineer around — exactly the failure this chapter is about.</p>
</aside>

## Behavior cloning is supervised learning

Run the expert policy $\pi^\star$; it visits states with distribution
$d^{\pi^\star}$ and labels each one with its action. Collect the pairs and
minimize an action-matching loss:

$$
\hat{\pi} \;=\; \arg\min_{\pi_\theta}\;
\mathbb{E}_{x \sim d^{\pi^\star}}\!\left[\,\big\|\pi_\theta(x) - \pi^\star(x)\big\|^2\right].
$$

Read the formula the way [chapter 2](/02-notation-setup/) taught: every method
is a **(loss, distribution)** pair. The loss here is unobjectionable. The
subscript is the trap. Nothing in this objective knows that driving is a
closed loop — that the action you output *determines the next state you must
act from*. Train, and the offline metrics will be excellent. They are measuring
performance on $d^{\pi^\star}$, the expert's states. But the moment the clone
takes the wheel, it is evaluated on $d^{\hat{\pi}}$ — the states *its own*
driving produces. Those are different distributions, and the difference is not
a technicality: it grows with every imperfect action.

## The catch: errors compound

Suppose the clone errs with some small probability $\varepsilon$ per step on
expert states. If errors were independent — the i.i.d. picture a held-out test
set implicitly assumes — you'd expect $\varepsilon T$ mistakes over a $T$-step
drive. But one mistake moves the car somewhere the expert never went; there the
clone is off-distribution, so its next action is unreliable *regardless of how
small $\varepsilon$ was*, and the drift feeds itself. A mistake at step $t$ can
poison all $T - t$ remaining steps. Sum that up:

$$
\underbrace{\;\varepsilon T\;}_{\text{i.i.d. intuition}}
\qquad\text{vs.}\qquad
\underbrace{\;O(\varepsilon T^2)\;}_{\text{closed loop (Ross \& Bagnell, 2010)}}
$$

and the quadratic is *tight* — there are problems that achieve it. The walker
below lives on a tightrope: each step it slips with probability $\varepsilon$,
and once off the rope every subsequent step is wrong. Drag $\varepsilon$ down
and notice what does — and does not — become safe.

<div class="demo" data-demo="bc-compounding"></div>

This is the whole pathology in one sentence: **behavior cloning buys a small
$\varepsilon$ on a distribution you will not be tested on.**

## The lab: a car, a road, a camera

Claims about deployment should be run, not asserted — so here is a driving lab
small enough to live in this page. The division of labor is the honest one: the
**simulator, the expert, and the camera run live in your browser** (they have
to — deployment happens here), while the **learning is ordinary PyTorch**, run
offline by a short script in the repo. The page ships the trained weights,
replays the recorded training curves, and runs the trained network's forward
pass live — which is pinned, by test, to agree with PyTorch to a few parts in
10⁸.

The world is a closed road. The car is a kinematic unicycle at constant speed;
its one control $u \in [-1, 1]$ is a curvature (steering) command. The expert is
**pure pursuit** — aim at the centerline point one lookahead distance ahead, and
steer along the circle that reaches it:

```js
// the expert: pure pursuit on the centerline. Simple — and it can recover
// from anywhere, not just the centerline. Remember that for later.
export function expertSteer(c, track, p = CAR) {
  const near = track.nearest(c.x, c.y);
  const [gx, gy] = track.pointAt(near.s + p.lookahead);   // aim point
  const dx = gx - c.x, dy = gy - c.y;
  const cos = Math.cos(c.psi), sin = Math.sin(c.psi);
  const fwd = cos * dx + sin * dy, lat = -sin * dx + cos * dy;
  const kappa = (2 * lat) / (fwd * fwd + lat * lat);      // curvature to aim point
  return clamp(kappa / p.kappaMax, -1, 1);
}
```

The policy will not see states. It sees what a camera sees: a 24×24 top-down
patch around the car — road bright, off-road dark, car pinned at bottom-center,
always heading up. That image is the network's *entire* world.

```js
// the camera: 24×24 egocentric pixels, sampled from a precomputed
// distance-to-centerline field. This is the policy's whole sensorium.
const obs = observe(car, field, track.halfWidth);   // Float32Array, 576 values in [0,1]
```

Press play. You are watching the data-collection vehicle: the expert drives,
and the panel on the right is the image the network will be trained on. Try the
nudge — the expert absorbs it without drama. Then notice the thing that will
matter: driving well, it *never gets nudged on its own*. Its data shows no
recoveries because it never needs any.

<div class="demo" data-demo="bc-drive" data-wide></div>

## The clone: a CNN from pixels to steering

The policy is a PilotNet in miniature — about 5,500 parameters, defined and
trained in PyTorch (`tools/bc-lab/train_bc.py` in the repo):

```python
# image 24×24×1 → conv 5×5 s2 ×6 → conv 3×3 s2 ×12 → dense 192→24 → dense 24→1
class PilotNetMini(nn.Module):
    def __init__(self):
        super().__init__()
        self.c1 = nn.Conv2d(1, 6, 5, stride=2)
        self.c2 = nn.Conv2d(6, 12, 3, stride=2)
        self.f1 = nn.Linear(192, 24)
        self.f2 = nn.Linear(24, 1)

    def forward(self, x):                       # x: [N, 1, 24, 24]
        h = F.relu(self.c1(x))
        h = F.relu(self.c2(h))
        h = h.permute(0, 2, 3, 1).flatten(1)    # HWC order — matches the JS runtime
        h = F.relu(self.f1(h))
        return self.f2(h).squeeze(-1)
```

Collection is the expert driving three laps while we record what it saw and
what it did — the exporter runs the *same seeded simulator* this page runs, so
the frames you watch being collected below are exactly the frames the network
was trained on:

```js
// collect demonstrations: 2,000 (image, steering) pairs from the expert
for (let i = 0; i < 2000; i++) {
  const u = expertSteer(car, track);            // the label
  X.push(observe(car, field, track.halfWidth)); // the input
  y.push(u);
  car = stepCar(car, u);                        // the expert drives on
}
```

Training is untouched supervised learning — minibatch Adam on mean-squared
steering error, and nothing else:

```python
model = PilotNetMini()
opt = torch.optim.Adam(model.parameters(), lr=2e-3)
for epoch in range(20):
    for batch in torch.randperm(len(y_train)).split(32):
        opt.zero_grad()
        loss = F.mse_loss(model(X_train[batch]), y_train[batch])
        loss.backward()
        opt.step()
```

The trained weights are exported to the page, where a sixty-line forward pass
drives the car live. Deployment is then a one-line change — and that line is
the entire subject of this chapter:

```js
// deployment: the only thing that moved is who computes u
const u = predict(net, observe(car, field, track.halfWidth));
//        was: expertSteer(car, track)
car = stepCar(car, u);
```

## Deploy it

The pipeline below is live: collect, fit (step 2 loads the PyTorch-trained
weights and replays the *recorded* loss curve — 1,140 real gradient steps,
four decades down), then hand the network the wheel. Deployment is honest
rather than pristine, identically for every driver: the car starts a sliver
off-center, the steering carries a whisper of noise, and every ten seconds the
world administers a small alternating kick — wind, potholes, grip. The expert
is always available to drive the same gauntlet, so you can see who copes.

<div class="demo" data-demo="bc-clone" data-wide></div>

<aside class="callout" data-kind="try">
  <span class="callout-label">run the experiment</span>
  <p>Do it in order. <strong>(1) Collect</strong> — watch the histogram: the
  expert's cross-track error is one thin spike at zero. The dataset contains no
  mistakes, so it contains no recoveries. <strong>(2) Fit</strong> — held-out
  MSE lands near 3×10⁻⁶: as supervised learning, this is a <em>solved
  problem</em>. <strong>(3) Drive the clone</strong> — it shrugs off the first
  few kicks like a natural… but watch the error spikes: the expert's decay,
  the clone's ratchet upward, and somewhere around the fifth kick the ratchet
  becomes a hockey stick. When it leaves the road, look right: the accent line
  (where the car is) has walked clean off the histogram (everything it was
  ever taught). Drive the expert for contrast — same start, same noise, same
  kicks, flat heartbeat forever. Nudge each of them.</p>
  <p>Then the toggle: <strong>wobble the expert</strong> during collection and
  redo the pipeline. Offline MSE comes out roughly <em>thirty times worse</em>
  — and the car stops dying: 180 seconds, every kick absorbed. The loss got
  worse; the distribution got right; the closed loop got fixed. That inversion
  is the chapter.</p>
</aside>

The wobble trick — inject noise while the expert demonstrates, label with the
expert's clean action — is a real algorithm (DART), and its lesson generalizes:
**the design variable was never the network; it was the distribution the data
was collected under.** Widening that distribution by hand is a patch, though.
PilotNet did the same thing in 2016 with side-mounted cameras synthesizing
off-center views; ALVINN did it in 1989 by geometrically shifting road images.
Practitioners keep reinventing recovery data, because the base algorithm cannot
supply it.

## The other three ways it breaks

Compounding error is the headline failure of behavior cloning, but the chapter
map lists [four](/06-road-ahead/), and honesty requires naming the rest:
**multimodality** (at a fork both left and right are expert; least squares
splits the difference and drives into the divider), **causal confusion** (give
the network its own past actions and it learns the lazy predictor $u_t \approx
u_{t-1}$ — loss falls, competence doesn't), and the **long tail** (the states
that matter most are the rarest in any passively-collected dataset). Each gets
its treatment later in Branch A; none of them is fixed by the fix we just
teased.

<aside class="callout" data-kind="warning">
  <span class="callout-label">what breaks next</span>
  <p>The wobble widened the training distribution <em>blindly</em> — noise
  explores near the expert's tube, not near where <em>your clone</em> actually
  ends up. The principled version of this chapter's fix is to collect labels on
  the states the learner itself visits, and iterate: that is DAgger,
  <a href="/06-road-ahead/">chapter A.2 on the road ahead</a> — and it is the
  same move that rescues Branch B when
  <a href="/02-cartpole/">its supervised step</a> hits
  <a href="/05-unified-view/">the same wall</a>.</p>
</aside>

---

*The lab's source, unminified: [`bc-car.js`](/static/demos/bc-car.js) (road,
car, expert, camera — the simulator your browser is running),
[`bc-net.js`](/static/demos/bc-net.js) (the forward pass that drives the car),
[`bc-clone.js`](/static/demos/bc-clone.js) (the pipeline demo above), and
`tools/bc-lab/` in the repo (the dataset exporter, the PyTorch training script,
and the exported [`bc-weights.json`](/static/demos/bc-weights.json)).*
