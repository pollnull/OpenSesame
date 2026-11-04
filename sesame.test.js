const test = require('node:test');
const assert = require('node:assert');
require('./web/sesame.js');
const { isSesame, encrypt, decrypt } = globalThis.Sesame;

test('cifra y descifra el archivo original con su nombre', async () => {
  const data = crypto.getRandomValues(new Uint8Array(60000));
  const sesame = await encrypt(data, { name: 'foto ñ.jpg', type: 'image/jpeg' }, 'ábrete');
  assert.ok(isSesame(sesame));
  assert.ok(!isSesame(data));
  assert.strictEqual(sesame[6], 3);
  const { meta, bytes } = await decrypt(sesame, 'ábrete');
  assert.deepStrictEqual(meta, { name: 'foto ñ.jpg', type: 'image/jpeg' });
  assert.deepStrictEqual(Buffer.from(bytes), Buffer.from(data));
});

test('rechaza contraseña incorrecta y archivos alterados', async () => {
  const sesame = await encrypt(new Uint8Array(0), { name: 'vacío.txt', type: '' }, 'clave1');
  assert.strictEqual((await decrypt(sesame, 'clave1')).bytes.length, 0);
  await assert.rejects(decrypt(sesame, 'clave2'), /Contraseña incorrecta/);
  const tampered = sesame.slice();
  tampered[tampered.length - 1] ^= 1;
  await assert.rejects(decrypt(tampered, 'clave1'), /Contraseña incorrecta/);
  await assert.rejects(decrypt(new Uint8Array(100), 'clave1'), /No es un archivo/);
});

test('el encabezado está autenticado: rebajarlo de versión no funciona', async () => {
  const sesame = await encrypt(new TextEncoder().encode('secreto'), { name: 'a.txt', type: '' }, 'clave1234');
  const downgraded = sesame.slice();
  downgraded[6] = 1;
  await assert.rejects(decrypt(downgraded, 'clave1234'), /Contraseña incorrecta|No es un archivo/);
});

test('sigue abriendo archivos de la versión 1', async () => {
  const password = 'clave1234';
  const header = new Uint8Array(39);
  header.set([0x53, 0x45, 0x53, 0x41, 0x4d, 0x45]);
  header[6] = 1;
  new DataView(header.buffer).setUint32(7, 600000);
  crypto.getRandomValues(header.subarray(11, 39));
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: header.subarray(11, 27), iterations: 600000 },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const meta = new TextEncoder().encode(JSON.stringify({ name: 'viejo.txt', type: 'text/plain' }));
  const plain = new Uint8Array([0, 0, 0, meta.length, ...meta, ...new TextEncoder().encode('hola')]);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: header.subarray(27, 39) }, key, plain));
  const { meta: out, bytes } = await decrypt(new Uint8Array([...header, ...cipher]), password);
  assert.strictEqual(out.name, 'viejo.txt');
  assert.strictEqual(new TextDecoder().decode(bytes), 'hola');
});

// Builds a PBKDF2 file like versions 1 and 2 wrote them.
async function legacy(version, password, name, text) {
  const header = new Uint8Array(39);
  header.set([0x53, 0x45, 0x53, 0x41, 0x4d, 0x45]);
  header[6] = version;
  new DataView(header.buffer).setUint32(7, 600000);
  crypto.getRandomValues(header.subarray(11, 39));
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: header.subarray(11, 27), iterations: 600000 },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const meta = new TextEncoder().encode(JSON.stringify({ name, type: 'text/plain' }));
  const plain = new Uint8Array([0, 0, 0, meta.length, ...meta, ...new TextEncoder().encode(text)]);
  const params = { name: 'AES-GCM', iv: header.subarray(27, 39) };
  if (version === 2) params.additionalData = header;
  return new Uint8Array([...header, ...new Uint8Array(await crypto.subtle.encrypt(params, key, plain))]);
}

test('sigue abriendo archivos de la versión 2 (PBKDF2)', async () => {
  const { meta, bytes } = await decrypt(await legacy(2, 'clave1234', 'v2.txt', 'hola v2'), 'clave1234');
  assert.strictEqual(meta.name, 'v2.txt');
  assert.strictEqual(new TextDecoder().decode(bytes), 'hola v2');
});

test('la versión 3 usa Argon2id con 64 MiB y rechaza parámetros abusivos', async () => {
  const sesame = await encrypt(new TextEncoder().encode('x'), { name: 'a.txt', type: '' }, '1234');
  const view = new DataView(sesame.buffer);
  assert.deepStrictEqual([view.getUint32(7), view.getUint32(11), sesame[15]], [65536, 3, 1]);
  const huge = sesame.slice();
  new DataView(huge.buffer).setUint32(7, 4 * 1048576); // 4 GiB
  await assert.rejects(decrypt(huge, '1234'), /No es un archivo/);
  const cheaper = sesame.slice();
  new DataView(cheaper.buffer).setUint32(11, 1); // weakening the cost breaks the authenticated header
  await assert.rejects(decrypt(cheaper, '1234'), /Contraseña incorrecta/);
});
