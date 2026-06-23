// cartpole-dynamics.js — pure cart-pole physics + a stabilizing controller.
// state = [x, xdot, theta, thetadot]; theta from upright (0 = up). u = force on cart.
export const DEFAULTS = { M: 1.0, m: 0.1, l: 0.5, g: 9.81 };

export function deriv(state, u, p = DEFAULTS) {
  const [, xd, th, thd] = state;
  const { M, m, l, g } = p;
  const s = Math.sin(th), c = Math.cos(th);
  const temp = (u + m * l * thd * thd * s) / (M + m);
  const thdd = (g * s - c * temp) / (l * (4/3 - (m * c * c) / (M + m)));
  const xdd = temp - (m * l * thdd * c) / (M + m);
  return [xd, xdd, thd, thdd];
}

export function energy(state, p = DEFAULTS) {
  const [, xd, th, thd] = state; const { M, m, l, g } = p;
  const ke = 0.5*(M+m)*xd*xd + 0.5*m*l*l*thd*thd + m*l*xd*thd*Math.cos(th);
  const pe = m*g*l*Math.cos(th);
  return ke + pe;
}

// Stabilizing linear state feedback u = -K·s for the DEFAULT plant.
export const K_DEFAULT = [-1.0, -2.0, -28.0, -6.0];
export function feedback(state, K = K_DEFAULT) {
  return -(K[0]*state[0] + K[1]*state[1] + K[2]*state[2] + K[3]*state[3]);
}
