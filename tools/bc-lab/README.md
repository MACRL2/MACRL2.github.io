# bc-lab — training for the behavior-cloning chapter

The division of labor for `/04-behavior-cloning/`: the **simulator, expert, and
camera are JavaScript** (`static/demos/bc-car.js` — they must run in the
reader's browser), and the **learning is PyTorch** (this directory). The page
ships the trained weights and replays the recorded loss curves; the only
network code in the browser is a forward pass (`static/demos/bc-net.js`),
pinned against PyTorch outputs by `tests/bc-net.test.mjs`.

## Regenerating `static/demos/bc-weights.json`

```bash
node tools/bc-lab/export-dataset.mjs      # datasets from the seeded JS sim -> out/
python3 -m venv .venv && .venv/bin/pip install torch numpy   # once
.venv/bin/python tools/bc-lab/train_bc.py # trains clean + dart, writes the JSON
node --test tests/bc-net.test.mjs tests/bc-closedloop.test.mjs   # must stay green
```

The closed-loop test is the contract: after any retrain, the clean clone must
still compound off the road under deployment kicks, and the noise-widened
(DART) clone and the expert must survive them. If a retrain breaks that, the
chapter's demo narrative is broken — don't ship those weights.

Torch is **not** a site dependency: CI never runs this; the committed
`bc-weights.json` is the artifact.
