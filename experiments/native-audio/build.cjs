const path = require('node:path');
const requireCard = require('node:module').createRequire(path.resolve(__dirname, '../../apps/dashboard-card/package.json'));
const esbuild = requireCard('node:module').createRequire(requireCard.resolve('vite/package.json'))('esbuild');
esbuild.build({ entryPoints: [path.join(__dirname, 'card.tsx')], outfile: path.join(process.argv[2], 'card.js'),
 bundle: true, format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"', '__BUTLER_SPEECH_LAB__': String(process.argv.includes('--speech')) },
 nodePaths: [path.resolve(__dirname, '../../apps/dashboard-card/node_modules')],
 plugins: [{ name: 'isolated-audio-session', setup(build) { build.onResolve({ filter: /^@livekit\/components-react$/ }, () => ({ path: path.join(__dirname, process.argv.includes('--speech') ? 'speech-session.tsx' : 'session.tsx') })); } }],
}).catch(error => { console.error(error); process.exit(1); });
