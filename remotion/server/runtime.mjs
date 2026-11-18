import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// A test must never silently inherit the live database, including child workers.
export function storageRuntime(root, env = process.env) {
  const production = path.resolve(root, 'data');
  const testing = env.FRAMEBOARD_ENV === 'test' || !!env.NODE_TEST_CONTEXT;
  const requested = env.FRAMEBOARD_DATA && path.resolve(env.FRAMEBOARD_DATA);
  const inside = (candidate, parent) => {
    const relative = path.relative(parent, candidate);
    return !relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
  };
  // Resolve existing parents so a junction cannot bypass the production guard.
  const physical = value => {
    if (fs.existsSync(value)) return fs.realpathSync(value);
    const parent = path.dirname(value);
    return parent === value ? value : path.join(physical(parent), path.basename(value));
  };
  if (testing && requested && inside(physical(requested), physical(production)))
    throw Error('测试环境禁止使用正式 data 目录；请指定独立 FRAMEBOARD_DATA。');
  const data = requested || (testing ? fs.mkdtempSync(path.join(os.tmpdir(), 'frameboard-test-')) : production);
  if (testing) { env.FRAMEBOARD_ENV = 'test'; env.FRAMEBOARD_DATA = data; }
  return Object.freeze({data, environment: testing ? 'test' : data === production ? 'production' : 'isolated'});
}
