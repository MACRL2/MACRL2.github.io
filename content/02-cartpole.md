---
title: Balancing on a Knife's Edge
description: The cart-pole, from classical control to a policy that learns to balance — with four things to try.
nav_order: 1
part: "Part I — Foundations"
summary: One small system that carries the whole arc of the book — classical control, then learning.
interactive: true
---

# Balancing on a Knife's Edge

A pole stands on a cart. Push the cart left or right; that is the only thing you
control. Gravity does the rest, and gravity is patient — left alone, the pole
falls. The job is to keep it upright.

This is the **cart-pole**, the hydrogen atom of control and reinforcement
learning. It is simple enough to hold in your head and rich enough to carry the
entire arc of this book: we will *design* a controller from a model, *watch* it
work, and then throw the model away and let an algorithm *learn* one. Every idea
that follows — adaptive control, reinforcement learning, transferring a policy
from simulation to a real robot — is, at heart, a more elaborate version of
keeping this pole from falling.

Start by getting a feel for the parts. Hover the schematic; reveal the loop.

<div class="demo" data-demo="cartpole-diagram"></div>

The state is four numbers: the cart position $x$, its velocity $\dot x$, the pole
angle $\theta$ measured from straight up, and its angular velocity $\dot\theta$.
The single input is the force $F$ on the cart. We write the state as a vector
$\mathbf{s} = [\,x,\ \dot x,\ \theta,\ \dot\theta\,]$.

## The equations, and why upright is hard

Newton's laws give the pole's angular acceleration:

$$\ddot\theta = \frac{g\sin\theta - \cos\theta\left(\dfrac{F + m\,l\,\dot\theta^{2}\sin\theta}{M+m}\right)}{l\left(\dfrac{4}{3} - \dfrac{m\cos^{2}\theta}{M+m}\right)}$$

where $M$ is the cart mass, $m$ the pole mass, $l$ the pole's half-length, and
$g$ gravity. The detail that matters is the sign: near upright, $\sin\theta
\approx \theta$, so $\ddot\theta \propto +\theta$. A tiny tilt produces
acceleration *in the same direction* as the tilt. That positive feedback is the
definition of an **unstable equilibrium** — the pole runs away from upright,
faster the further it leans. Doing nothing is not an option.

## Design: linearize, then place the poles

Close to upright the dynamics are nearly linear, $\dot{\mathbf{s}} \approx
A\mathbf{s} + BF$, and for linear systems we have a complete theory. We choose a
**state-feedback** law

$$F = -K\mathbf{s} = -\big(k_x\,x + k_{\dot x}\,\dot x + k_\theta\,\theta + k_{\dot\theta}\,\dot\theta\big),$$

and the closed-loop behavior is governed entirely by the eigenvalues of $A - BK$
— the *closed-loop poles*. If every pole has a negative real part, small
disturbances decay and the pole stays up; if any pole crosses into the right
half-plane, the system is unstable.

Tune the plant and the feedback gain below. Watch the step response of $\theta$
from a small initial tilt, and watch the poles move. A heavier or longer pole, or
a gain that is too weak, will tip the system from *stable* to *unstable*.

<div class="demo" data-demo="cartpole-linearized"></div>

Note that the gains are held fixed in physical units as you change the plant —
they are *not* re-tuned for you. A controller designed for a light, short pole can
become unstable on a heavy, long one. Re-tuning as the system changes is exactly
the problem **adaptive control** sets out to solve, later in the book.

## Watch it balance

Designing a controller is one thing; seeing it hold the pole on a knife's edge is
another. Below is the real, nonlinear cart-pole, integrated live. Press **play**.
Toggle the controller off and watch gravity win. **Nudge** the pole to throw a
disturbance at it, and watch the feedback law catch it. Drag the θ-gain down until
the controller is too timid to recover.

<div class="demo" data-demo="cartpole-sim"></div>

Everything here rests on knowing $A$, $B$, and good gains $K$ — that is, on having
an accurate *model*. The rest of the book is, in large part, about what to do when
you don't.

## Learn: when the model runs out

Suppose we don't know the cart's mass, the pole's length, or the friction in the
track. We can still improve a controller by *trying*: run the policy, measure how
long the pole stayed up, keep changes that helped. The simplest version is
**random search** over the gains —

$$
\mathbf{K}' = \mathbf{K} + \sigma\,\boldsymbol{\varepsilon},\qquad
\boldsymbol{\varepsilon}\sim\text{Uniform}(-1,1)^4,\qquad
\text{keep }\mathbf{K}'\text{ if its return is higher,}
$$

where the *return* is simply the number of seconds the pole stayed within bounds.
It is the crudest possible learner — no gradients, no model — yet starting from a
policy that does nothing ($\mathbf{K}=\mathbf{0}$), it reliably teaches itself to
balance. Step one episode at a time, or run a batch, and watch the best-so-far
return climb.

<div class="demo" data-demo="cartpole-learn"></div>

This is reinforcement learning in miniature: a policy, a reward, and a loop that
improves one from the other. Replace random search with a gradient estimate and
you have policy-gradient methods; let the gains depend on the state and you have
adaptive control; train in a simulator and deploy on hardware and you have
sim-to-real transfer. The pole is the same; only the cleverness of the loop
changes.

## Where this goes

You have now done, in one sitting, the three things this book keeps returning to:
built a controller from a model, watched it act on the true nonlinear system, and
replaced the model with experience. Keep these four demos in mind — the diagram,
the poles, the live balance, the learning curve. The chapters ahead swap the
cart-pole for harder systems and the random search for sharper algorithms, but the
shape of the problem never changes: something is about to fall, and your job is to
learn how to catch it.
