const { build } = require("esbuild");

build({
  entryPoints: ["runtime-worker/index.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  packages: "external",
  sourcemap: true,
  outfile: "dist/runtime-worker.cjs",
}).catch(() => process.exit(1));
