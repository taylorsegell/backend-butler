/** GHSA-fc5q-39xc-vjpf: bounded attack regressions and build/test glob compatibility. */
'use strict';
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');
const path = require('node:path');
const { performance } = require('node:perf_hooks');

const attacks = [
  ['wildcard plus alternate', '+(*a|b)', 'a'.repeat(40) + '!'],
  ['nested wildcard plus alternate', '+(@(*a)|b)', 'a'.repeat(40) + '!'],
  ['raw quantifier plus alternate', '+(a+a|b)', 'a'.repeat(40) + '!'],
  ['raw plus quantifier', '+(a+a)', 'a'.repeat(40) + '!'],
  ['unescaped star quantifier', '+(a\\*a)', 'a'.repeat(40) + '!'],
  ['unescaped plus quantifier', '+(a\\+a)', 'a'.repeat(40) + '!'],
  ['literal bracket inside class', '+([[a]*a)', 'a'.repeat(40) + '!'],
  ['star plus', '+(*)', 'a'.repeat(40) + '/'],
  ['star repeat', '*(*)', 'a'.repeat(40) + '/'],
  ['star followed by literal', '+(*a)', 'a'.repeat(40) + '!'],
  ['star followed by literal, zero or more', '*(*a)', 'a'.repeat(40) + '!'],
  ['mixed wildcards', '+(*?a)', 'a'.repeat(40) + '!'],
  ['literal followed by star', '*(a*)', 'a'.repeat(40) + '/'],
  ['character class and star', '+([ab]*a)', 'a'.repeat(40) + '!'],
  ['nested at-group', '+(@(*a))', 'a'.repeat(40) + '!'],
  ['quote inside a bracket class', '+(["a]*a)', 'a'.repeat(40) + '!'],
  ['quote after literal inside a bracket class', '+([a"]*a)', 'a'.repeat(40) + '!'],
  ['existing safe rewrite', '*(*(f)*(o))', 'fo'.repeat(200) + '!'],
  ['suffix anchored bare star', 'p+(*)c', 'p' + 'a'.repeat(40) + '!'],
  ['embedded zero-or-more', 'pre*(a*)post', 'pre' + 'a'.repeat(40) + '!'],
];
const entrypoints = ['matcher', 'makeRe', 'parse', 'raw-parse'];
const optionVariants = [
  {}, { capture: true, fastpaths: false }, { bash: true }, { windows: true },
  { dot: true }, { nocase: true }, { regex: true }, { unescape: true },
];


function matcher(picomatch, modulePath, entrypoint, pattern, options) {
  if (entrypoint === 'matcher') return picomatch(pattern, options);
  if (entrypoint === 'makeRe') return input => picomatch.makeRe(pattern, options).test(input);
  if (entrypoint === 'parse') return input => picomatch.compileRe(picomatch.parse(pattern, options), options).test(input);
  const parse = require(path.join(path.dirname(modulePath), 'lib/parse.js'));
  return input => picomatch.compileRe(parse(pattern, options), options).test(input);
}

function compatibility(picomatch) {
  const include = '**/*.{test,spec}.?(c|m)[jt]s?(x)'; // Vitest 5's actual default include.
  const cases = [
    ['**/*.{js,ts,jsx,tsx}', 'src/App.tsx', true],
    ['**/*.{js,ts,jsx,tsx}', 'src/App.css', false],
    [include, 'test/unit/router.test.ts', true],
    [include, 'test/unit/router.spec.mjs', true],
    [include, 'test/unit/router.test.cts', true],
    [include, 'test/unit/router.test.tsx', true],
    [include, 'test/unit/router.ts', false],
    [include, 'test/unit/router.test.json', false],
    ['**/*.@(js|jsx|ts|tsx)', 'web/Chat.tsx', true],
    ['**/*.@(js|jsx|ts|tsx)', 'web/Chat.css', false],
    ['+(foo|bar).js', 'foobarfoo.js', true],
    ['+(foo|bar).js', 'foobaz.js', false],
    ['*(foo).js', 'foofoo.js', true],
    ['+(foo).js', 'foofoo.js', true],
    ['+(foo).js', '.js', false],
    ['src/!(*.d).ts', 'src/main.ts', true],
    ['src/!(*.d).ts', 'src/main.d.ts', false],
    ['*(*(f)*(o))', 'fofo', true],
    ['file\\*.js', 'file*.js', true],
    ['+(*)c', 'abc', true],
    ['+(*)c', 'abx', false],
    ['p+(*)c', 'pabc', true],
    ['pre*(a*)post', 'prepost', true],
    ['pre*(a*)post', 'preapost', true],
    ['pre+(a*)post', 'prepost', false],
    ['pre+(a*)post', 'preapost', true],
    ['+(a\\*b)', 'a*ba*b', true],
    ['+(a\\*b)', 'aXb', false],
    ['+("*")', '***', true],
    ['+("*")', 'abc', false],
    ['pre*("*")post', 'prepost', true],
    ['+("*"*)', '*a', true],
    ['+("*"*)', '*a*b', true],
    ['*("*"*)c', 'c', true],
    ['p+("*"*)c', 'p*abc', true],
    ['file[0-9].ts', 'file4.ts', true],
    ['file[0-9].ts', 'filex.ts', false],
    ['file[*].ts', 'file*.ts', true],
    ['file[*].ts', 'filex.ts', false],
  ];
  for (const [pattern, input, expected] of cases) {
    assert.equal(picomatch(pattern)(input), expected, `${JSON.stringify(pattern)} against ${JSON.stringify(input)}`);
  }
  assert.equal(picomatch('**/*.ts', { dot: true })('.hidden/test.ts'), true);
  assert.equal(picomatch('*.ts', { ignore: 'skip.ts' })('skip.ts'), false);
  return cases.length + 2;
}

// Deliberately short inputs bound the unpatched reference's work. This is a
// language-equivalence check for flat globs, not a claim about all extglob syntax.
function differential(picomatch, reference) {
  const alphabet = ['a', 'b', 'c', '*', '.', 'p'];
  const inputs = [''];
  let layer = [''];
  for (let length = 1; length <= 3; length++) {
    layer = layer.flatMap(prefix => alphabet.map(char => prefix + char));
    inputs.push(...layer);
  }
  inputs.push('A', 'B', 'ABC', '.a', 'a/b', 'a\\b');
  const bodies = ['*', 'a*', '*a', 'a*b', '*a*', 'a?*', '?a*', '*?a', '[ab]*a',
    'a*[ab]', '[a-z]*', '*[-ab]', '\\**', '*\\*', 'a\\*b', '"*"*', '*"*"'];
  const contexts = [['', ''], ['', 'c'], ['p', 'c'], ['pre', 'post']];
  let compared = 0;
  for (const options of [{}, { dot: true }, { nocase: true }, { windows: true }, { capture: true }]) {
    for (const body of bodies) for (const repeat of ['+', '*']) {
      for (const [prefix, suffix] of contexts) {
        const pattern = `${prefix}${repeat}(${body})${suffix}`;
        const expected = reference(pattern, options);
        const actual = picomatch(pattern, options);
        const candidates = [...inputs, ...['', 'a', 'ab', 'a*b', 'a*ba*b'].map(input => prefix + input + suffix)];
        for (const input of candidates) {
          assert.equal(actual(input), expected(input), `language change: ${JSON.stringify({ pattern, input, options })}`);
          compared++;
        }
      }
    }
  }
  return compared;
}

if (process.argv[2] === '--worker') {
  const { modulePath, entrypoint, referenceModulePath } = JSON.parse(process.argv[3]);
  const picomatch = require(modulePath);
  if (entrypoint === 'differential') {
    console.log(JSON.stringify({ compared: differential(picomatch, require(referenceModulePath)) }));
  } else if (entrypoint === 'compatibility') {
    console.log(JSON.stringify({ passed: compatibility(picomatch) }));
  } else {
    for (const [label, pattern, input] of attacks) {
      for (const options of optionVariants) {
        // Bash's star consumes '/', so use an internal newline followed by a
        // sentinel; a final newline alone can be skipped by JavaScript's '$'.
        const adversarial = options.bash && ['star plus', 'star repeat', 'literal followed by star'].includes(label)
          ? input.slice(0, -1) + '\n!' : input;
        // The parent retains this marker if the child is killed while matching.
        console.log(JSON.stringify({ checking: label, pattern, options }));
        const start = performance.now();
        try {
          const matches = matcher(picomatch, modulePath, entrypoint, pattern, options);
          assert.equal(matches(adversarial), false, 'crafted nonmatch must not match');
        } catch (error) {
          // Explicitly rejecting an unsafe glob is also a valid defensive contract.
          if (!(error instanceof SyntaxError && /pattern|glob/i.test(error.message))) throw error;
        }
        assert.ok(performance.now() - start < 500, `${entrypoint}: ${label} exceeded 500ms CPU budget`);
      }
    }
    console.log(JSON.stringify({ passed: attacks.length * optionVariants.length }));
  }
} else {
  const root = path.resolve(__dirname, '..');
  const requested = process.argv.slice(2);
  let referenceModulePath;
  const referenceFlag = requested.indexOf('--reference');
  if (referenceFlag >= 0) {
    assert.ok(requested[referenceFlag + 1], '--reference requires a pristine picomatch package directory');
    referenceModulePath = require.resolve(path.resolve(requested[referenceFlag + 1]));
    requested.splice(referenceFlag, 2);
  }
  let apps = ['dashboard-card', 'configuration-app'];
  const appFlag = requested.indexOf('--app');
  if (appFlag >= 0) {
    const app = requested[appFlag + 1];
    assert.ok(apps.includes(app), '--app requires dashboard-card or configuration-app');
    requested.splice(appFlag, 2);
    assert.equal(requested.length, 0, '--app cannot be combined with explicit package paths');
    apps = [app];
  }
  const installations = requested.length ? requested.map(directory => ({
    label: directory, modulePath: require.resolve(path.resolve(directory)),
  })) : apps.map(name => {
    const appRequire = createRequire(path.join(root, 'apps', name, 'package.json'));
    const viteRequire = createRequire(appRequire.resolve('vite/package.json'));
    return { label: name, modulePath: viteRequire.resolve('picomatch') };
  });
  let failures = 0;
  for (const installation of installations) {
    for (const entrypoint of ['compatibility', ...entrypoints, ...(referenceModulePath ? ['differential'] : [])]) {
      const result = spawnSync(process.execPath, [__filename, '--worker', JSON.stringify({ ...installation, entrypoint, referenceModulePath })], {
        encoding: 'utf8', timeout: entrypoint === 'differential' ? 8000 : 2000, killSignal: 'SIGKILL', maxBuffer: 64 * 1024,
      });
      if (result.status !== 0 || result.error) {
        failures++;
        const last = result.stdout?.trim().split('\n').at(-1) || '';
        console.error(`FAIL ${installation.label}/${entrypoint}: ${result.error?.code || result.signal || `exit ${result.status}`} ${last}`);
        if (result.stderr) console.error(result.stderr.trim());
      } else {
        console.log(`PASS ${installation.label}/${entrypoint}: ${result.stdout.trim().split('\n').at(-1)}`);
      }
    }
  }
  if (failures) process.exitCode = 1;
}
