/** npm run serve — start the local endpoint on 127.0.0.1 (PORT, default 8650). */
import { loadDecoys } from "./decoys.js";
import { roster } from "./population.js";
import { createEndpoint } from "./server.js";
import { buildMatchers } from "./matchers/registry.js";
import { SYNTHETIC_BANNER } from "./index.js";

const set = loadDecoys();
const port = Number(process.env.PORT ?? 8650);
createEndpoint({
  matchers: buildMatchers(),
  roster: roster(set),
  consent: { asOf: set.asOf, canSegmentSensitive: set.targetPayer.canSegmentSensitive },
  log: (e) => console.log(JSON.stringify(e)),
}).listen(port, "127.0.0.1", () => {
  console.log(
    `${SYNTHETIC_BANNER}\n$member-match on http://127.0.0.1:${port}/<matcher>/Patient/$member-match — loopback only, no auth\nmatchers: ${buildMatchers()
      .map((m) => m.name)
      .join(", ")}`,
  );
});
