# bc-lab — training for the driving-lab chapters (BC + DAgger)

The division of labor for `/04-behavior-cloning/` and
`/05-interactive-imitation/`: the **simulator, expert, and camera are
JavaScript** (`static/demos/bc-car.js` — they must run in the reader's
browser), and the **learning is PyTorch** (this directory; shared model in
`bc_model.py`). The pages ship trained weights and replay the recorded loss
curves; the only network code in the browser is a forward pass
(`static/demos/bc-net.js`), pinned against PyTorch outputs by tests.

## Regenerating `static/demos/bc-weights.json` (chapter 4)

```bash
node tools/bc-lab/export-dataset.mjs      # datasets from the seeded JS sim -> out/
python3 -m venv .venv && .venv/bin/pip install torch numpy   # once
.venv/bin/python tools/bc-lab/train_bc.py # trains clean + dart, writes the JSON
node --test tests/bc-net.test.mjs tests/bc-closedloop.test.mjs   # must stay green
```

## Regenerating `static/demos/dagger-run.json` (chapter 5)

```bash
node tools/bc-lab/run_dagger.mjs          # rollouts in the JS sim (Node), one
                                          # PyTorch fit per round (train_round.py)
node --test tests/dagger.test.mjs         # must stay green
```

Round 0 is chapter 4's clean clone, so regenerate `bc-weights.json` first if
the simulator or camera changed. Rollouts are seeded: the browser demo replays
them *exactly*, which `tests/dagger.test.mjs` also pins (same crash count).

The closed-loop tests are the contract: after any retrain, the clean clone must
still compound off the road under deployment kicks (and the round-0 DAgger
baseline with it), while the DART clone, the final DAgger round, and the expert
must survive. If a retrain breaks that, the chapters' demo narratives are
broken — don't ship those weights.

Torch is **not** a site dependency: CI never runs this; the committed JSON
files are the artifacts.
