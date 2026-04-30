// @ts-check
const esbuild = require('esbuild');

const watch = process.argv.includes('--watch');

const ctxOptions = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode', 'open'],
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  sourcemap: true,
  minify: false,
  logLevel: 'info'
};

(async () => {
  if (watch) {
    const ctx = await esbuild.context(ctxOptions);
    await ctx.watch();
    console.log('[esbuild] watching...');
  } else {
    await esbuild.build(ctxOptions);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
