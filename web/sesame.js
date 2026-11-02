// .sesame file: "SESAME" | version (1 byte) | PBKDF2 iterations (uint32) | salt (16) | IV (12) | AES-256-GCM ciphertext.
// The plaintext is: metadata length (uint32) | metadata JSON {name, type} | original file bytes.
// Version 2 authenticates the 39-byte header as AES-GCM additional data; version 1 files are still read.
(() => {
  const MAGIC = [0x53, 0x45, 0x53, 0x41, 0x4d, 0x45];
  const VERSION = 2;
  const ITERATIONS = 600000;
  const HEADER = 39;
  const encoder = new TextEncoder();
  // `code` lets the app show the message in the device's language.
  const failure = (code, message) => Object.assign(new Error(message), { code });
  const invalid = () => failure('invalid', 'No es un archivo .sesame válido');

  async function deriveKey(password, salt, iterations) {
    const base = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']);
  }

  function isSesame(bytes) {
    return bytes.length >= HEADER + 16 && MAGIC.every((b, i) => bytes[i] === b);
  }

  async function encrypt(bytes, meta, password) {
    const metaBytes = encoder.encode(JSON.stringify(meta));
    const plain = new Uint8Array(4 + metaBytes.length + bytes.length);
    new DataView(plain.buffer).setUint32(0, metaBytes.length);
    plain.set(metaBytes, 4);
    plain.set(bytes, 4 + metaBytes.length);
    const header = new Uint8Array(HEADER);
    header.set(MAGIC);
    header[6] = VERSION;
    new DataView(header.buffer).setUint32(7, ITERATIONS);
    const salt = crypto.getRandomValues(header.subarray(11, 27));
    const iv = crypto.getRandomValues(header.subarray(27, HEADER));
    try {
      const key = await deriveKey(password, salt, ITERATIONS);
      const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: header }, key, plain));
      const out = new Uint8Array(HEADER + cipher.length);
      out.set(header);
      out.set(cipher, HEADER);
      return out;
    } finally {
      plain.fill(0);
    }
  }

  async function decrypt(sesame, password) {
    const version = sesame[6];
    if (!isSesame(sesame) || (version !== 1 && version !== 2)) throw invalid();
    const iterations = new DataView(sesame.buffer, sesame.byteOffset).getUint32(7);
    // A crafted file could ask for billions of iterations and freeze the app.
    if (iterations < 100000 || iterations > 10000000) throw invalid();
    const key = await deriveKey(password, sesame.subarray(11, 27), iterations);
    const params = { name: 'AES-GCM', iv: sesame.subarray(27, HEADER) };
    if (version === 2) params.additionalData = sesame.subarray(0, HEADER);
    let plain;
    try {
      plain = new Uint8Array(await crypto.subtle.decrypt(params, key, sesame.subarray(HEADER)));
    } catch {
      throw failure('password', 'Contraseña incorrecta o archivo dañado');
    }
    try {
      const length = plain.length >= 4 ? new DataView(plain.buffer).getUint32(0) : -1;
      if (length < 0 || 4 + length > plain.length) throw invalid();
      let meta;
      try {
        meta = JSON.parse(new TextDecoder().decode(plain.subarray(4, 4 + length)));
      } catch {
        throw invalid();
      }
      if (typeof meta?.name !== 'string') throw invalid();
      return { meta: { name: meta.name, type: typeof meta.type === 'string' ? meta.type : '' }, bytes: plain.subarray(4 + length) };
    } catch (error) {
      plain.fill(0); // never leave decrypted bytes behind on a malformed file
      throw error;
    }
  }

  globalThis.Sesame = { isSesame, encrypt, decrypt };
})();
