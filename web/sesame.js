// .sesame file, version 3 (written now):
//   "SESAME" | 3 | Argon2id memory in KiB (uint32) | passes (uint32) | lanes (1 byte) | salt (16) | IV (12) | AES-256-GCM ciphertext
// Versions 1 and 2 (still read): "SESAME" | version | PBKDF2-SHA256 iterations (uint32) | salt (16) | IV (12) | ciphertext.
// The plaintext is: metadata length (uint32) | metadata JSON {name, type} | original file bytes.
// From version 2 on, the whole header is authenticated as AES-GCM additional data.
(() => {
  const MAGIC = [0x53, 0x45, 0x53, 0x41, 0x4d, 0x45];
  // Argon2id: each guess costs 64 MiB of memory, which is what makes GPU cracking slow (RFC 9106, OWASP).
  const ARGON = { memory: 65536, passes: 3, lanes: 1 };
  const HEADER = { 1: 39, 2: 39, 3: 44 };
  const encoder = new TextEncoder();
  // In the app argon2.js is loaded before this file; in Node (CLI, tests) it is required.
  const argon2id = globalThis.hashwasm?.argon2id ?? require('./argon2.js').argon2id;
  // `code` lets the app show the message in the device's language.
  const failure = (code, message) => Object.assign(new Error(message), { code });
  const invalid = () => failure('invalid', 'No es un archivo .sesame válido');

  async function pbkdf2Key(password, salt, iterations) {
    const base = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']);
  }

  async function argonKey(password, salt, { memory, passes, lanes }) {
    const secret = encoder.encode(password);
    try {
      const raw = await argon2id({
        password: secret, salt, parallelism: lanes, iterations: passes, memorySize: memory, hashLength: 32, outputType: 'binary',
      });
      try {
        return await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
      } finally {
        raw.fill(0);
      }
    } finally {
      secret.fill(0);
    }
  }

  function isSesame(bytes) {
    return bytes.length >= 39 + 16 && MAGIC.every((b, i) => bytes[i] === b);
  }

  async function encrypt(bytes, meta, password) {
    const metaBytes = encoder.encode(JSON.stringify(meta));
    const plain = new Uint8Array(4 + metaBytes.length + bytes.length);
    new DataView(plain.buffer).setUint32(0, metaBytes.length);
    plain.set(metaBytes, 4);
    plain.set(bytes, 4 + metaBytes.length);
    const size = HEADER[3];
    const header = new Uint8Array(size);
    const view = new DataView(header.buffer);
    header.set(MAGIC);
    header[6] = 3;
    view.setUint32(7, ARGON.memory);
    view.setUint32(11, ARGON.passes);
    header[15] = ARGON.lanes;
    const salt = crypto.getRandomValues(header.subarray(16, 32));
    const iv = crypto.getRandomValues(header.subarray(32, size));
    try {
      const key = await argonKey(password, salt, ARGON);
      const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: header }, key, plain));
      const out = new Uint8Array(size + cipher.length);
      out.set(header);
      out.set(cipher, size);
      return out;
    } finally {
      plain.fill(0);
    }
  }

  async function decrypt(sesame, password) {
    const version = sesame[6];
    const size = HEADER[version];
    if (!isSesame(sesame) || !size || sesame.length < size + 16) throw invalid();
    const view = new DataView(sesame.buffer, sesame.byteOffset);
    let key;
    let iv;
    if (version === 3) {
      const params = { memory: view.getUint32(7), passes: view.getUint32(11), lanes: sesame[15] };
      // A crafted file could ask for gigabytes of memory or endless passes and freeze the app.
      if (params.memory < 8192 || params.memory > 262144 || params.passes < 1 || params.passes > 10 || params.lanes < 1 || params.lanes > 4) throw invalid();
      key = await argonKey(password, sesame.subarray(16, 32), params);
      iv = sesame.subarray(32, size);
    } else {
      const iterations = view.getUint32(7);
      if (iterations < 100000 || iterations > 10000000) throw invalid();
      key = await pbkdf2Key(password, sesame.subarray(11, 27), iterations);
      iv = sesame.subarray(27, size);
    }
    const params = { name: 'AES-GCM', iv };
    if (version >= 2) params.additionalData = sesame.subarray(0, size);
    let plain;
    try {
      plain = new Uint8Array(await crypto.subtle.decrypt(params, key, sesame.subarray(size)));
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
