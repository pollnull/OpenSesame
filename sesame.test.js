const test = require('node:test');
const assert = require('node:assert');
require('./web/sesame.js');
const { isSesame, encrypt, decrypt } = globalThis.Sesame;

test('cifra y descifra el archivo original con su nombre', async () => {
  const data = crypto.getRandomValues(new Uint8Array(60000));
  const sesame = await encrypt(data, { name: 'foto ñ.jpg', type: 'image/jpeg' }, 'ábrete');
  assert.ok(isSesame(sesame));
  assert.ok(!isSesame(data));
  assert.strictEqual(sesame[6], 2);
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

test('el encabezado v2 está autenticado: rebajarlo a v1 no funciona', async () => {
  const sesame = await encrypt(new TextEncoder().encode('secreto'), { name: 'a.txt', type: '' }, 'clave1234');
  const downgraded = sesame.slice();
  downgraded[6] = 1;
  await assert.rejects(decrypt(downgraded, 'clave1234'), /Contraseña incorrecta/);
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
