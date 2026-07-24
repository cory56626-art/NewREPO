// Bundles the ES modules under src/ into one double-clickable HTML file at
// dist/pacing-hams.html. No dependencies — it walks the import graph from
// src/main.js, rewrites the module syntax into a tiny registry, and inlines the
// result into index.html.
//
//   node build.js
//
// The rewriting only handles the module syntax this project actually uses:
// static `import { a, b } from './x.js'`, `import * as ns from`, and top-level
// `export` declarations plus `export { a as b }`. There are no default exports,
// no dynamic imports and no import cycles here; the build fails loudly if it
// meets something it does not understand.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const ENTRY = 'src/main.js';
const OUT_DIR = path.join(ROOT, 'dist');
const OUT_FILE = path.join(OUT_DIR, 'pacing-hams.html');

const IMPORT_RE = /^[ \t]*import\s+(?:([\w$]+)\s*,\s*)?(?:\{([\s\S]*?)\}|\*\s+as\s+([\w$]+))\s+from\s+['"]([^'"]+)['"];?[ \t]*$/gm;
const BARE_IMPORT_RE = /^[ \t]*import\s+['"]([^'"]+)['"];?[ \t]*$/gm;
const EXPORT_LIST_RE = /^[ \t]*export\s*\{([\s\S]*?)\};?[ \t]*$/gm;
const EXPORT_DECL_RE = /^[ \t]*export\s+(async\s+function|function|const|let|var|class)\s+([\w$]+)/gm;

const modules = new Map(); // id -> { code, deps, exports }
const order = [];

function idFor(file) {
  return path.relative(ROOT, file).split(path.sep).join('/');
}

function parseBindings(clause) {
  return clause
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = /^([\w$]+)(?:\s+as\s+([\w$]+))?$/.exec(s);
      if (!m) throw new Error(`cannot parse binding "${s}"`);
      return { name: m[1], alias: m[2] || m[1] };
    });
}

function load(file) {
  const id = idFor(file);
  if (modules.has(id)) return id;
  if (!fs.existsSync(file)) throw new Error(`missing module: ${file}`);

  const src = fs.readFileSync(file, 'utf8');
  if (/\bimport\s*\(/.test(src)) throw new Error(`${id}: dynamic import() is not supported by this build`);
  if (/\bexport\s+default\b/.test(src)) throw new Error(`${id}: default exports are not supported by this build`);

  const deps = [];
  const exported = new Map(); // exported name -> local name

  let code = src.replace(IMPORT_RE, (_m, defaultBinding, named, namespace, spec) => {
    if (defaultBinding) throw new Error(`${id}: default import from "${spec}" is not supported`);
    const depFile = path.resolve(path.dirname(file), spec);
    const depId = load(depFile);
    deps.push(depId);
    if (namespace) return `const ${namespace} = __req(${JSON.stringify(depId)});`;
    const bindings = parseBindings(named)
      .map((b) => (b.name === b.alias ? b.name : `${b.name}: ${b.alias}`))
      .join(', ');
    return `const { ${bindings} } = __req(${JSON.stringify(depId)});`;
  });

  code = code.replace(BARE_IMPORT_RE, (_m, spec) => {
    const depFile = path.resolve(path.dirname(file), spec);
    const depId = load(depFile);
    deps.push(depId);
    return `__req(${JSON.stringify(depId)});`;
  });

  code = code.replace(EXPORT_LIST_RE, (_m, clause) => {
    for (const b of parseBindings(clause)) exported.set(b.alias, b.name);
    return '';
  });

  code = code.replace(EXPORT_DECL_RE, (_m, kind, name) => {
    exported.set(name, name);
    return `${kind} ${name}`;
  });

  if (/^[ \t]*export\b/m.test(code)) {
    const stray = /^[ \t]*export\b.*$/m.exec(code)[0].trim();
    throw new Error(`${id}: unhandled export syntax — ${stray}`);
  }

  const assigns = [...exported.entries()]
    .map(([name, local]) => `  __exp[${JSON.stringify(name)}] = ${local};`)
    .join('\n');

  modules.set(id, { code, deps, exports: [...exported.keys()] });
  order.push(id);
  modules.get(id).body = `${code}\n${assigns}\n`;
  return id;
}

function build() {
  load(path.join(ROOT, ENTRY));

  const parts = [];
  parts.push('(() => {');
  parts.push('"use strict";');
  parts.push('const __defs = Object.create(null);');
  parts.push('const __cache = Object.create(null);');
  parts.push('function __req(id) {');
  parts.push('  if (__cache[id]) return __cache[id];');
  parts.push('  const __exp = __cache[id] = Object.create(null);');
  parts.push('  __defs[id](__exp);');
  parts.push('  return __exp;');
  parts.push('}');

  for (const id of order) {
    const mod = modules.get(id);
    parts.push(`// ---- ${id} ${'-'.repeat(Math.max(0, 66 - id.length))}`);
    parts.push(`__defs[${JSON.stringify(id)}] = (__exp) => {`);
    parts.push(mod.body);
    parts.push('};');
  }

  parts.push(`__req(${JSON.stringify(idFor(path.join(ROOT, ENTRY)))});`);
  parts.push('})();');

  const bundle = parts.join('\n');

  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const scriptTag = /<script\s+type="module"\s+src="[^"]*"><\/script>/;
  if (!scriptTag.test(html)) throw new Error('could not find the module script tag in index.html');
  const out = html.replace(scriptTag, `<script>\n${bundle}\n</script>`);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, out);

  const kb = (Buffer.byteLength(out) / 1024).toFixed(0);
  console.log(`built ${path.relative(ROOT, OUT_FILE)} — ${order.length} modules, ${kb} KB`);
  console.log('open it directly in a browser; no server needed.');
}

build();
