// Terminal mode: `opensesame lock FILE` and `opensesame unlock FILE.sesame`.
// Uses the same web/sesame.js as the app, so the files are interchangeable.
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
require('./web/sesame.js');

const es = /^es/i.test(process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || '');
const say = (spanish, english) => (es ? spanish : english);

function ask(question) {
  process.stdout.write(question);
  return new Promise((resolve) => {
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', (line) => { process.stdin.pause(); resolve(line.replace(/\r?\n$/, '')); });
    process.stdin.resume();
  });
}

// Reads a password without showing it on screen.
function askHidden(question) {
  process.stdout.write(question);
  return new Promise((resolve, reject) => {
    let typed = '';
    process.stdin.setRawMode(true);
    process.stdin.setEncoding('utf8');
    const onData = (chunk) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') return done(() => resolve(typed));
        if (char === '\u0003') return done(() => reject(new Error(say('Cancelado', 'Cancelled'))));
        if (char === '\u007f' || char === '\b') typed = typed.slice(0, -1);
        else if (char >= ' ') typed += char;
      }
    };
    const done = (finish) => {
      process.stdin.off('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
      finish();
    };
    process.stdin.on('data', onData);
    process.stdin.resume();
  });
}

const expandHome = (p) => (p === '~' || p.startsWith('~/') ? path.join(os.homedir(), p.slice(1)) : p);
// Windows paths typed in WSL: "C:/x", "C:\x" or "C:x" (bash already ate the \) → "/mnt/c/x".
const fromWindows = (p) => (process.platform === 'linux' && /^[a-z]:/i.test(p)
  ? `/mnt/${p[0].toLowerCase()}/${p.slice(2).replace(/\\/g, '/').replace(/^\/+/, '')}` : p);
const toPath = (p) => fromWindows(expandHome(p));

async function askFolder(fallback) {
  const answer = toPath((await ask(say(`¿En qué carpeta lo guardo? [${fallback}]: `, `Save it in which folder? [${fallback}]: `))).trim());
  const folder = path.resolve(answer || fallback);
  if (!(await fs.stat(folder).catch(() => null))?.isDirectory()) throw new Error(say(`No existe la carpeta ${folder}`, `No such folder: ${folder}`));
  return folder;
}

// "wx" refuses to overwrite: never destroy a file the person already has.
async function writeNew(file, bytes) {
  try {
    await fs.writeFile(file, bytes, { flag: 'wx' });
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error(say(`Ya existe ${file}; no lo sobrescribo`, `${file} already exists; not overwriting it`));
    throw error;
  }
  console.log(say(`Listo: ${file}`, `Done: ${file}`));
}

async function readFile(file) {
  if (!(await fs.stat(file).catch(() => null))?.isFile()) {
    // Windows hides extensions, so "foto" is often "foto.jpg": suggest the matches.
    const base = path.basename(file);
    const similar = (await fs.readdir(path.dirname(file)).catch(() => [])).filter((entry) => entry.startsWith(`${base}.`));
    const hint = similar.length ? say(`. ¿Quisiste decir ${similar.join(', ')}?`, `. Did you mean ${similar.join(', ')}?`) : '';
    throw new Error(say(`No encuentro el archivo ${file}`, `File not found: ${file}`) + hint);
  }
  return new Uint8Array(await fs.readFile(file));
}

async function lock(file) {
  const bytes = await readFile(file);
  const password = await askHidden(say('Contraseña: ', 'Password: '));
  if (password.length < 8) throw new Error(say('La contraseña debe tener al menos 8 caracteres', 'The password must be at least 8 characters'));
  if (password !== await askHidden(say('Repite la contraseña: ', 'Repeat the password: '))) throw new Error(say('Las contraseñas no coinciden', 'The passwords do not match'));
  const folder = await askFolder(path.dirname(path.resolve(file)));
  const name = path.basename(file);
  await writeNew(path.join(folder, `${name}.sesame`), await Sesame.encrypt(bytes, { name, type: '' }, password));
}

async function unlock(file) {
  const sesame = await readFile(file);
  if (!Sesame.isSesame(sesame)) throw new Error(say('No es un archivo .sesame válido', 'Not a valid .sesame file'));
  const result = await Sesame.decrypt(sesame, await askHidden(say('Contraseña: ', 'Password: ')))
    .catch((error) => { throw new Error(error.code === 'password' ? say('Contraseña incorrecta o archivo dañado', 'Wrong password or damaged file') : say('No es un archivo .sesame válido', 'Not a valid .sesame file')); });
  const folder = await askFolder(path.dirname(path.resolve(file)));
  // The name comes from inside the file: keep only its last part so it cannot write anywhere else.
  let name = path.basename(result.meta.name.replace(/\\/g, '/'));
  if (!name || name === '.' || name === '..') name = 'archivo';
  await writeNew(path.join(folder, name), result.bytes);
}

module.exports = async function run([command, file]) {
  try {
    if (!file) throw new Error(say(`Uso: opensesame ${command} ARCHIVO`, `Usage: opensesame ${command} FILE`));
    if (!process.stdin.isTTY) throw new Error(say('Este comando necesita una terminal', 'This command needs a terminal'));
    await (command === 'lock' ? lock(toPath(file)) : unlock(toPath(file)));
    return 0;
  } catch (error) {
    console.error(`Error: ${error.message}`);
    return 1;
  }
};
