'use strict';
const $ = (id) => document.getElementById(id);
const platform = window.OpenSesameAndroid ? 'android' : 'desktop';
document.documentElement.dataset.platform = platform;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Vault: item info in "files", encrypted bytes in "blobs" so listing never loads file contents.
const dbReady = new Promise((resolve, reject) => {
  const request = indexedDB.open('opensesame', 1);
  request.onupgradeneeded = () => {
    request.result.createObjectStore('files', { keyPath: 'id', autoIncrement: true });
    request.result.createObjectStore('blobs');
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

function run(mode, fn) {
  return dbReady.then((db) => new Promise((resolve, reject) => {
    // Strict durability: a write is on disk before we report it, since the original may be deleted next.
    const tx = db.transaction(['files', 'blobs'], mode, mode === 'readwrite' ? { durability: 'strict' } : undefined);
    const request = fn(tx.objectStore('files'), tx.objectStore('blobs'));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = tx.onabort = () => reject(tx.error);
  }));
}

const vault = {
  list: () => run('readonly', (files) => files.getAll()),
  data: (id) => run('readonly', (files, blobs) => blobs.get(id)),
  add: (label, bytes) => run('readwrite', (files, blobs) => {
    const request = files.add({ label, size: bytes.length, added: Date.now() });
    request.onsuccess = () => blobs.put(bytes, request.result);
    return request;
  }),
  rename: (item, label) => run('readwrite', (files) => files.put({ ...item, label })),
  remove: (id) => run('readwrite', (files, blobs) => { blobs.delete(id); return files.delete(id); }),
};

// Ask the browser not to evict the vault when the device is low on space.
navigator.storage?.persist?.();

// View preferences that only matter on this device.
const prefs = {
  get(key, fallback) { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* private mode: not remembered */ } },
};

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function typeLabel(name) {
  const match = /\.([a-z0-9]{1,4})$/i.exec(name);
  return match ? match[1].toUpperCase() : '';
}

const sorters = {
  recent: (a, b) => b.added - a.added,
  name: (a, b) => a.label.localeCompare(b.label, lang, { numeric: true, sensitivity: 'base' }),
  size: (a, b) => b.size - a.size,
};

let items = [];
const justAdded = new Set();
const rowItem = new WeakMap();

async function reload() {
  items = await vault.list();
  draw();
}

function draw() {
  const query = $('search').value.trim();
  const needle = query.toLocaleLowerCase(lang);
  const visible = items
    .filter((item) => item.label.toLocaleLowerCase(lang).includes(needle))
    .sort(sorters[$('sort').value] || sorters.recent);
  const total = items.reduce((sum, item) => sum + item.size, 0);
  $('summary').textContent = items.length ? t(items.length === 1 ? 'summaryOne' : 'summaryMany', { n: items.length, size: formatSize(total) }) : '';
  $('tools').hidden = items.length === 0;
  $('empty').hidden = items.length > 0;
  $('noMatch').hidden = !(items.length && !visible.length);
  $('noMatch').textContent = t('noMatch', { q: query });
  $('list').replaceChildren(...visible.map(buildRow));
  justAdded.clear();
}

function buildRow(item) {
  const row = $('rowTemplate').content.firstElementChild.cloneNode(true);
  const badge = row.querySelector('.type');
  const type = typeLabel(item.label);
  if (type) badge.textContent = type;
  else badge.innerHTML = '<svg width="18" height="18"><use href="#i-lock"/></svg>';
  row.querySelector('.name').textContent = item.label;
  row.querySelector('.meta').textContent = `${formatSize(item.size)} · ${new Date(item.added).toLocaleDateString(lang)}`;
  if (justAdded.has(item.id)) row.classList.add('added');
  rowItem.set(row, item);
  const more = row.querySelector('.more');
  more.setAttribute('aria-label', t('options'));
  onPress(row.querySelector('.item'), () => actions.decrypt(item), (point) => showActions(item, point));
  more.addEventListener('click', () => showActions(item, platform === 'desktop' ? anchorOf(more) : null));
  return row;
}

function anchorOf(element) {
  const rect = element.getBoundingClientRect();
  return { x: rect.right - 232, y: rect.bottom + 4 };
}

// Tap opens; long-press (touch) or right-click (mouse) shows the actions.
function onPress(element, tap, hold) {
  let timer;
  let held = false;
  const fireHold = (point) => {
    clearTimeout(timer);
    if (held) return;
    held = true;
    navigator.vibrate?.(15);
    hold(point);
  };
  element.addEventListener('pointerdown', (event) => {
    held = false;
    if (event.pointerType !== 'mouse') timer = setTimeout(() => fireHold(null), 500);
  });
  for (const type of ['pointerup', 'pointerleave', 'pointercancel']) element.addEventListener(type, () => clearTimeout(timer));
  element.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    if (platform === 'android') return fireHold(null);
    fireHold(event.clientX || event.clientY ? { x: event.clientX, y: event.clientY } : anchorOf(element));
  });
  element.addEventListener('click', () => {
    if (!held) tap();
    held = false;
  });
}

// Press feedback: a button sinks while held and springs back when released on it.
// A cancelled gesture (scroll, dragging off) returns without the bounce.
let pressedButton = null;
function spring(button) {
  if (reducedMotion.matches) return;
  button.classList.remove('spring');
  void button.offsetWidth;
  button.classList.add('spring');
}
function release(bounce) {
  if (!pressedButton) return;
  pressedButton.classList.remove('pressed');
  if (bounce) spring(pressedButton);
  pressedButton = null;
}
document.addEventListener('pointerdown', (event) => {
  pressedButton = event.target.closest('button:not(:disabled)');
  pressedButton?.classList.add('pressed');
});
document.addEventListener('pointerup', (event) => release(event.target.closest('button') === pressedButton));
document.addEventListener('pointercancel', () => release(false));
document.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (button && event.detail === 0) spring(button);
});
document.addEventListener('animationend', (event) => {
  if (event.animationName === 'spring') event.target.classList.remove('spring');
});

let toastTimer;
function toast(text) {
  $('toast').textContent = text;
  $('toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('show'), 4000);
}

function errorText(error) {
  if (error?.code === 'password') return t('errPassword');
  if (error?.code === 'invalid') return t('errInvalid');
  return error?.message || t('errGeneric');
}

// Called by Android and Electron once the platform knows how a save ended.
window.notifySave = (state, name) => {
  if (state === 'completed') toast(name ? t('saved', { name }) : t('savedPlain'));
  else toast(t(state === 'cancelled' ? 'saveCancelled' : 'saveFailed'));
};

function openDialog(dialog) {
  dialog.classList.remove('closing');
  if (!dialog.open) dialog.showModal();
}

function closeDialog(dialog) {
  if (!dialog.open || dialog.classList.contains('closing')) return;
  if (reducedMotion.matches) return dialog.close();
  dialog.classList.add('closing');
  setTimeout(() => {
    dialog.classList.remove('closing');
    dialog.close();
  }, 140);
}

for (const dialog of document.querySelectorAll('dialog')) {
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    if (!dialog.dataset.busy) closeDialog(dialog);
  });
  // Clicking the backdrop (the dialog itself, outside its panel) closes it.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog && !dialog.dataset.busy) closeDialog(dialog);
  });
}

// Called by the Android back gesture: closes the top dialog first. Returns whether it handled the gesture.
window.handleBack = () => {
  const open = [...document.querySelectorAll('dialog[open]')].pop();
  if (!open) return false;
  if (!open.dataset.busy) closeDialog(open);
  return true;
};

function buildField({ label, type = 'text', value = '', checked = false }) {
  const wrapper = document.createElement('label');
  const caption = document.createElement('span');
  const box = document.createElement('span');
  const input = document.createElement('input');
  caption.textContent = label;
  if (type === 'checkbox') {
    input.type = 'checkbox';
    input.checked = checked;
    wrapper.className = 'check';
    wrapper.append(input, caption);
    return input;
  }
  box.className = 'field';
  input.type = type;
  input.value = value;
  input.required = true;
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.setAttribute('autocapitalize', 'off');
  input.setAttribute('autocorrect', 'off');
  box.append(input);
  if (type === 'password') {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'icon-btn reveal';
    toggle.innerHTML = '<svg aria-hidden="true"><use href="#i-eye"/></svg>';
    const sync = (shown) => {
      input.type = shown ? 'text' : 'password';
      input.classList.toggle('secret', shown);
      toggle.setAttribute('aria-pressed', String(shown));
      toggle.setAttribute('aria-label', t(shown ? 'hidePassword' : 'showPassword'));
      toggle.querySelector('use').setAttribute('href', shown ? '#i-eye-off' : '#i-eye');
    };
    sync(false);
    toggle.addEventListener('click', () => sync(input.type === 'password'));
    box.append(toggle);
  }
  wrapper.append(caption, box);
  return input;
}

// Resolves with the field values (or what `work` returns), or null when cancelled.
// With `work`, the dialog stays open while it runs and shows its error under the fields.
function ask({ title, text = '', fields = [], ok = t('save'), danger = false, lock = false, validate, work }) {
  const dialog = $('ask');
  const icon = $('askIcon');
  $('askTitle').textContent = title;
  $('askText').textContent = text;
  $('askText').hidden = !text;
  icon.toggleAttribute('hidden', !lock); // an SVG element has no `hidden` property
  icon.classList.remove('open', 'shake');
  showError('');
  $('askOk').textContent = ok;
  $('askOk').className = `btn ${danger ? 'danger' : 'primary'}`;
  const inputs = fields.map(buildField);
  $('askFields').replaceChildren(...inputs.map((input) => input.closest('label')));
  setWorking(false);
  openDialog(dialog);
  inputs[0]?.select();

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const fail = (message) => {
      showError(message);
      const target = lock ? icon : $('askError');
      target.classList.remove('shake');
      void target.offsetWidth;
      target.classList.add('shake');
      inputs[0]?.focus();
      inputs[0]?.select();
    };
    $('askForm').onsubmit = async (event) => {
      event.preventDefault();
      if (dialog.dataset.busy) return;
      const values = inputs.map((input) => (input.type === 'checkbox' ? input.checked : input.value));
      const problem = validate?.(values);
      if (problem) return fail(problem);
      if (!work) {
        finish(values);
        return closeDialog(dialog);
      }
      showError('');
      setWorking(true);
      try {
        const result = await work(values);
        if (lock) {
          icon.classList.add('open');
          await wait(reducedMotion.matches ? 0 : 450);
        }
        setWorking(false);
        finish(result);
        closeDialog(dialog);
      } catch (error) {
        setWorking(false);
        fail(errorText(error));
      }
    };
    $('askCancel').onclick = () => closeDialog(dialog);
    dialog.onclose = () => {
      finish(null);
      for (const input of inputs) input.value = ''; // don't leave passwords in the page
    };
  });
}

function showError(message) {
  $('askError').textContent = message;
  $('askError').hidden = !message;
}

function setWorking(on) {
  const dialog = $('ask');
  if (on) dialog.dataset.busy = '1';
  else delete dialog.dataset.busy;
  for (const control of dialog.querySelectorAll('input, button')) control.disabled = on;
  $('askProgress').hidden = !on;
}

function toBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

// The platform confirms the save (or its cancellation) by calling toast() back.
function saveFile(name, bytes, type) {
  type = type || 'application/octet-stream';
  // shortcut: Android passes the whole file as base64 in memory, fine up to ~100 MB; stream it if bigger files matter.
  if (window.OpenSesameAndroid) return window.OpenSesameAndroid.save(name, type, toBase64(bytes));
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([bytes], { type }));
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 60000);
}

const sha256 = async (bytes) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
  .map((byte) => byte.toString(16).padStart(2, '0')).join('');

// Deletes exactly the picked file behind `origin` (a token from the platform), and only if its content
// still has the hash that was verified. Resolves true only if it is gone.
async function deleteOriginal(origin, hash) {
  if (window.OpenSesameAndroid) return window.OpenSesameAndroid.deleteOriginal(origin, hash);
  if (window.OpenSesameDesktop) return window.OpenSesameDesktop.deleteOriginal(origin, hash);
  return false;
}

// `origin` is a platform token for the picked file when it can be deleted afterwards, otherwise null.
async function addFile(file, origin) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    if (Sesame.isSesame(bytes)) {
      const label = file.name.replace(/\.sesame$/i, '') || t('importedFallback');
      justAdded.add(await vault.add(label, bytes));
      toast(t('imported', { name: label }));
      return;
    }
    const fields = [{ label: t('password'), type: 'password' }, { label: t('repeatPassword'), type: 'password' }];
    if (origin) fields.push({ label: t('deleteOriginal'), type: 'checkbox', checked: true });
    const result = await ask({
      title: t('encryptTitle', { name: file.name }),
      text: t('encryptText'),
      fields,
      ok: t('encrypt'),
      validate: ([first, second]) => {
        if (first.length < 8) return t('tooShort');
        return first === second ? '' : t('mismatch');
      },
      work: async ([password, , removeOriginal]) => {
        const id = await vault.add(file.name, await Sesame.encrypt(bytes, { name: file.name, type: file.type }, password));
        // Read the stored copy back and decrypt it before the original is ever touched.
        try {
          const check = await Sesame.decrypt(await vault.data(id), password);
          const same = check.meta.name === file.name && check.bytes.length === bytes.length
            && check.bytes.every((byte, i) => byte === bytes[i]);
          check.bytes.fill(0);
          if (!same) throw new Error(t('verifyFailed'));
        } catch (error) {
          await vault.remove(id);
          throw error.code ? new Error(t('verifyFailed')) : error;
        }
        return { id, removed: removeOriginal ? await deleteOriginal(origin, await sha256(bytes)) : null };
      },
    });
    if (!result) return;
    justAdded.add(result.id);
    const message = result.removed === true ? 'encryptedRemoved' : result.removed === false ? 'encryptedKept' : 'encrypted';
    toast(t(message, { name: file.name }));
  } finally {
    bytes.fill(0);
  }
}

const actions = {
  async decrypt(item) {
    const result = await ask({
      title: item.label,
      text: t('decryptText'),
      fields: [{ label: t('password'), type: 'password' }],
      ok: t('decrypt'),
      lock: true,
      work: async ([password]) => Sesame.decrypt(await vault.data(item.id), password),
    });
    if (!result) return;
    saveFile(result.meta.name, result.bytes, result.meta.type);
    result.bytes.fill(0);
  },

  async rename(item) {
    const answer = await ask({
      title: t('renameTitle'),
      text: t('renameText'),
      fields: [{ label: t('name'), value: item.label }],
      ok: t('save'),
      validate: ([label]) => (label.trim() ? '' : t('nameRequired')),
    });
    if (!answer) return;
    await vault.rename(item, answer[0].trim());
    await reload();
  },

  async export(item) {
    saveFile(`${item.label}.sesame`, await vault.data(item.id), 'application/octet-stream');
  },

  async delete(item) {
    const answer = await ask({
      title: t('deleteTitle', { name: item.label }),
      text: t('deleteText'),
      ok: t('delete'),
      danger: true,
    });
    if (!answer) return;
    await vault.remove(item.id);
    const row = [...$('list').children].find((li) => rowItem.get(li)?.id === item.id);
    // Animations pause in hidden windows, so never wait on them longer than they last.
    const settle = (animation, ms) => Promise.race([animation.finished, wait(ms)]);
    if (row && !reducedMotion.matches) {
      await settle(row.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: 'forwards' }), 160);
      await settle(row.animate([{ height: `${row.offsetHeight}px` }, { height: '0px' }],
        { duration: 180, easing: 'cubic-bezier(.4, 0, .2, 1)', fill: 'forwards' }), 220);
    }
    await reload();
    toast(t('deleted', { name: item.label }));
  },
};

// Every action reports its error in a toast instead of failing silently.
const guard = (fn) => (...args) => fn(...args).catch((error) => {
  console.error(error);
  toast(errorText(error));
});
for (const name of Object.keys(actions)) actions[name] = guard(actions[name]);

let sheetItem;
function showActions(item, point) {
  const sheet = $('sheet');
  sheetItem = item;
  $('sheetTitle').textContent = item.label;
  sheet.classList.toggle('at-point', Boolean(point));
  sheet.style.left = sheet.style.top = '';
  openDialog(sheet);
  if (point) {
    const { offsetWidth: width, offsetHeight: height } = sheet;
    sheet.style.left = `${Math.max(8, Math.min(point.x, innerWidth - width - 8))}px`;
    sheet.style.top = `${Math.max(8, Math.min(point.y, innerHeight - height - 8))}px`;
  }
  sheet.querySelector('.actions button').focus();
}
$('sheet').querySelector('.actions').addEventListener('click', (event) => {
  const name = event.target.closest('button')?.dataset.act;
  if (!name) return;
  closeDialog($('sheet'));
  actions[name](sheetItem);
});

// Each entry loads its File lazily and says how to delete the original afterwards.
const addFiles = guard(async (entries) => {
  try {
    for (const entry of entries) await addFile(await entry.file(), await entry.origin());
  } finally {
    await reload();
  }
});
const fromFiles = (files) => files.map((file) => ({
  file: async () => file,
  origin: async () => (window.OpenSesameDesktop ? window.OpenSesameDesktop.claimOriginal(file) : null),
}));
// Android picks natively so it can later delete the exact document; the bytes stream in from the app.
window.onPicked = (picked) => addFiles(picked.map(({ token, name, type }) => ({
  file: async () => {
    const response = await fetch(`/picked/${encodeURIComponent(token)}`);
    if (!response.ok) throw new Error(t('errGeneric'));
    return new File([await response.blob()], name, { type });
  },
  origin: async () => token,
})));
const openPicker = () => (window.OpenSesameAndroid ? window.OpenSesameAndroid.pick() : $('picker').click());
for (const id of ['add', 'addTop']) $(id).addEventListener('click', openPicker);
$('picker').addEventListener('change', () => {
  const files = [...$('picker').files];
  $('picker').value = '';
  addFiles(fromFiles(files));
});

$('help').addEventListener('click', () => openDialog($('helpDialog')));
$('helpClose').addEventListener('click', () => closeDialog($('helpDialog')));

$('sort').value = sorters[prefs.get('sort', 'recent')] ? prefs.get('sort', 'recent') : 'recent';
$('sort').addEventListener('change', () => {
  prefs.set('sort', $('sort').value);
  draw();
});
$('search').addEventListener('input', draw);

document.addEventListener('keydown', (event) => {
  const dialogOpen = document.querySelector('dialog[open]');
  const typing = event.target.matches('input, select, textarea');
  const key = event.key.toLowerCase();
  if (dialogOpen) return;
  if ((event.ctrlKey || event.metaKey) && key === 'o') {
    event.preventDefault();
    openPicker();
  } else if ((event.ctrlKey || event.metaKey) && key === 'f' && items.length) {
    event.preventDefault();
    $('search').focus();
    $('search').select();
  } else if (!typing && (event.key === 'F2' || event.key === 'Delete')) {
    const item = rowItem.get(document.activeElement?.closest('#list li'));
    if (!item) return;
    event.preventDefault();
    (event.key === 'F2' ? actions.rename : actions.delete)(item);
  }
});

if (platform === 'desktop') {
  let depth = 0;
  const hasFiles = (event) => event.dataTransfer?.types.includes('Files');
  addEventListener('dragenter', (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    depth += 1;
    document.body.classList.add('dragging');
  });
  addEventListener('dragleave', () => {
    depth = Math.max(0, depth - 1);
    if (!depth) document.body.classList.remove('dragging');
  });
  addEventListener('dragover', (event) => event.preventDefault());
  addEventListener('drop', (event) => {
    event.preventDefault();
    depth = 0;
    document.body.classList.remove('dragging');
    if (event.dataTransfer.files.length && !document.querySelector('dialog[open]')) addFiles(fromFiles([...event.dataTransfer.files]));
  });
}

reload().catch((error) => toast(t('errVault', { msg: error.message })));
