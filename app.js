const $ = (selector) => document.querySelector(selector);
const categories = ['生活', '学习', '情感'];
const stageNames = { sprout: '嫩芽', bud: '花苞', bloom: '已开花' };
const sheetNames = { sprout: 'sprouts', bud: 'buds', bloom: 'blooms' };
const spots = [13, 32, 50, 68, 87].flatMap(x => [16, 38, 61, 84].map(y => ({ x, y })));
let ideas = [], view = 'garden', filter = '全部', selectedId = null, freshId = null;
let category = '生活', photo = null, audio = null, recorder = null, stream = null, recordTimer = null;
let detailURLs = [];

function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('inspiration-garden-local', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('ideas', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function storeRequest(mode, action) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('ideas', mode);
    const request = action(transaction.objectStore('ideas'));
    let result;
    request.onsuccess = () => { result = request.result; };
    transaction.oncomplete = () => { db.close(); resolve(result); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
    transaction.onabort = () => { db.close(); reject(transaction.error); };
  });
}
const readAll = () => storeRequest('readonly', store => store.getAll());
const writeIdea = idea => storeRequest('readwrite', store => store.put(idea));
const isWilted = idea => idea.stage !== 'bloom' && Date.now() - Date.parse(idea.lastTendedAt) >= 10 * 86400000;
const dateLabel = iso => new Date(iso).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });

function sprite(idea, extraClass = '') {
  const art = document.createElement('span');
  const positions = [['0%', '0%'], ['100%', '0%'], ['0%', '100%'], ['100%', '100%']];
  const [x, y] = positions[idea.flower % 4];
  art.className = `plant-art ${isWilted(idea) ? 'wilted' : ''} ${extraClass}`;
  art.style.backgroundImage = `url('./assets/flowers/${sheetNames[idea.stage]}.png')`;
  art.style.backgroundPosition = `${x} ${y}`;
  art.setAttribute('aria-hidden', 'true');
  return art;
}

function hash(value) {
  let result = 2166136261;
  for (let i = 0; i < value.length; i++) result = Math.imul(result ^ value.charCodeAt(i), 16777619);
  return (result >>> 0) / 4294967295;
}
function arrange(items) {
  const available = [...spots], placed = [], positions = new Map();
  for (const item of [...items].reverse()) {
    let best = 0, score = -Infinity;
    available.forEach((spot, index) => {
      const distance = placed.length ? Math.min(...placed.map(p => Math.hypot(spot.x - p.x, (spot.y - p.y) * .8))) : 0;
      const candidate = distance + hash(item.id + ':' + index) * .15;
      if (candidate > score) { score = candidate; best = index; }
    });
    const spot = available.splice(best, 1)[0];
    if (!spot) break;
    placed.push(spot); positions.set(item.id, spot);
  }
  return positions;
}

async function refresh() {
  ideas = (await readAll()).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  render();
}
function render() {
  $('#count-label').textContent = ideas.length ? `${ideas.length} 株灵感` : '一方小花园';
  $('#garden-screen').hidden = view !== 'garden';
  $('#list-screen').hidden = view !== 'list';
  $('#nav-garden').classList.toggle('active', view === 'garden');
  $('#nav-list').classList.toggle('active', view === 'list');
  $('#nav-garden').setAttribute('aria-current', view === 'garden' ? 'page' : 'false');
  $('#nav-list').setAttribute('aria-current', view === 'list' ? 'page' : 'false');
  renderGarden(); renderList();
}
function renderGarden() {
  const field = $('#flower-field'); field.replaceChildren();
  $('#garden-empty').hidden = ideas.length > 0;
  $('#garden-hint').textContent = ideas.length > 20 ? '草地展示最近 20 株，更多在灵感手记。' : '跟进会长成花苞，行动会让它开花。';
  const visible = ideas.slice(0, 20), layout = arrange(visible);
  visible.forEach((idea, index) => {
    const spot = layout.get(idea.id);
    const plant = document.createElement('button');
    plant.type = 'button'; plant.className = `garden-plant ${idea.stage} ${freshId === idea.id ? 'plant-grow' : ''}`;
    plant.style.left = spot.x + '%'; plant.style.top = spot.y + '%'; plant.style.zIndex = spot.y;
    plant.setAttribute('aria-label', `查看${idea.category}${stageNames[idea.stage]}：${idea.text || '语音或照片'}`);
    const sway = document.createElement('span'); sway.className = 'plant-sway'; sway.style.animationDelay = `${(index % 7) * -.42}s`;
    sway.append(sprite(idea)); plant.append(sway);
    plant.addEventListener('click', () => openDetail(idea.id)); field.append(plant);
  });
}
function renderList() {
  const filters = $('#filters'); filters.replaceChildren();
  for (const label of ['全部', ...categories]) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
    button.classList.toggle('active', filter === label);
    button.addEventListener('click', () => { filter = label; renderList(); }); filters.append(button);
  }
  const list = $('#list-scroll'); list.replaceChildren();
  const filtered = ideas.filter(idea => filter === '全部' || idea.category === filter);
  if (!filtered.length) {
    const empty = document.createElement('div'); empty.className = 'list-empty';
    empty.textContent = '这里还没有灵感，去种下一颗嫩芽吧。'; list.append(empty); return;
  }
  for (const idea of filtered) {
    const card = document.createElement('button'); card.type = 'button'; card.className = 'entry-card';
    const content = document.createElement('span'); content.className = 'entry-copy';
    const meta = document.createElement('span'); meta.className = 'entry-meta';
    meta.textContent = `${idea.category} · ${stageNames[idea.stage]}${isWilted(idea) ? ' · 待唤醒' : ''} · ${dateLabel(idea.createdAt)}`;
    const title = document.createElement('strong'); title.textContent = idea.text || (idea.audio ? '一段声音的灵感' : '一张照片的灵感');
    const attachment = document.createElement('small'); attachment.textContent = [idea.audio && '♫ 语音', idea.photo && '▧ 照片'].filter(Boolean).join(' · ');
    content.append(meta, title, attachment); card.append(sprite(idea), content);
    card.addEventListener('click', () => openDetail(idea.id)); list.append(card);
  }
}

function renderCategories() {
  const row = $('#category-row'); row.replaceChildren();
  categories.forEach(label => {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
    button.classList.toggle('chosen', category === label);
    button.addEventListener('click', () => { category = label; renderCategories(); }); row.append(button);
  });
}
function resetComposer() {
  category = '生活'; photo = null; audio = null; $('#idea-text').value = ''; $('#composer-error').textContent = '';
  $('#photo-input').value = ''; $('#camera-input').value = ''; updateAttachments(); renderCategories();
}
function openComposer() { resetComposer(); $('#composer').showModal(); }
function closeComposer() { stopRecording(true); $('#composer').close(); }
function updateAttachments() {
  const status = $('#attachment-status'); status.replaceChildren();
  for (const [kind, blob, label] of [['photo', photo, '▧ 照片已选择'], ['audio', audio, '♫ 语音已录好']]) {
    if (!blob) continue;
    const chip = document.createElement('span'); chip.textContent = label + ' ';
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.setAttribute('aria-label', `移除${kind === 'photo' ? '照片' : '语音'}`);
    remove.addEventListener('click', () => { if (kind === 'photo') photo = null; else audio = null; updateAttachments(); });
    chip.append(remove); status.append(chip);
  }
}
function choosePhoto(file) {
  if (!file) return;
  if (!file.type.startsWith('image/') || file.size > 10000000) { $('#composer-error').textContent = '请选择不超过 10 MB 的图片。'; return; }
  photo = file; $('#composer-error').textContent = ''; updateAttachments();
}
async function startRecording() {
  try {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error('unsupported');
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const chunks = [];
    const currentRecorder = new MediaRecorder(stream);
    recorder = currentRecorder;
    currentRecorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    currentRecorder.onstop = () => {
      if (!$('#composer').open) return;
      audio = new Blob(chunks, { type: currentRecorder.mimeType || 'audio/mp4' });
      stream?.getTracks().forEach(track => track.stop()); stream = null; updateAttachments();
      $('#record-audio').classList.remove('recording'); $('#record-audio span').textContent = '录语音';
    };
    recorder.start(); recordTimer = setTimeout(stopRecording, 60000);
    $('#record-audio').classList.add('recording'); $('#record-audio span').textContent = '结束录音';
    $('#composer-error').textContent = '';
  } catch {
    stream?.getTracks().forEach(track => track.stop()); stream = null;
    $('#composer-error').textContent = '无法使用麦克风，请允许权限或改用文字。';
  }
}
function stopRecording(discard = false) {
  clearTimeout(recordTimer); recordTimer = null;
  if (discard && recorder) recorder.onstop = null;
  if (recorder?.state === 'recording') recorder.stop();
  else stream?.getTracks().forEach(track => track.stop());
  if (discard) { stream?.getTracks().forEach(track => track.stop()); stream = null; recorder = null; }
}
async function saveIdea() {
  const text = $('#idea-text').value.trim();
  if (!text && !photo && !audio) { $('#composer-error').textContent = '写一句话、录一段声音或添加照片吧。'; return; }
  const saveButton = $('#save-idea'); saveButton.disabled = true;
  try {
    const now = new Date().toISOString();
    const idea = { id: crypto.randomUUID(), text, category, stage: 'sprout', flower: Math.floor(Math.random() * 4), createdAt: now, lastTendedAt: now, notes: [], photo, audio };
    await writeIdea(idea); freshId = idea.id; await refresh(); view = 'garden'; render(); closeComposer(); resetComposer();
    setTimeout(() => { freshId = null; renderGarden(); }, 1800);
  } catch { $('#composer-error').textContent = '保存失败，请检查浏览器存储空间或隐私模式。'; }
  finally { saveButton.disabled = false; }
}

function releaseMediaURLs() { detailURLs.forEach(URL.revokeObjectURL); detailURLs = []; }
async function openDetail(id) {
  selectedId = id;
  const idea = ideas.find(item => item.id === id); if (!idea) return;
  $('#detail-error').textContent = '';
  if (isWilted(idea)) {
    try { idea.lastTendedAt = new Date().toISOString(); await writeIdea(idea); render(); }
    catch { $('#detail-error').textContent = '唤醒失败，请检查存储空间。'; }
  }
  $('#progress-text').value = '';
  renderDetail(idea); $('#detail').showModal();
}
function renderDetail(idea) {
  releaseMediaURLs();
  $('#detail-art').replaceChildren(sprite(idea));
  $('#detail-meta').textContent = `${idea.category} · ${stageNames[idea.stage]} · ${dateLabel(idea.createdAt)}`;
  $('#detail-text').textContent = idea.text;
  const media = $('#detail-media'); media.replaceChildren();
  if (idea.photo) {
    const image = document.createElement('img'); image.className = 'detail-photo'; image.alt = '灵感照片';
    const url = URL.createObjectURL(idea.photo); detailURLs.push(url); image.src = url; media.append(image);
  }
  if (idea.audio) {
    const player = document.createElement('audio'); player.className = 'detail-audio'; player.controls = true;
    const url = URL.createObjectURL(idea.audio); detailURLs.push(url); player.src = url; media.append(player);
  }
  const history = $('#detail-history'); history.replaceChildren();
  for (const note of idea.notes) {
    const entry = document.createElement('div'); entry.className = 'progress-entry';
    const meta = document.createElement('small'); meta.textContent = `${note.kind === 'outcome' ? '执行与成果' : '跟进'} · ${dateLabel(note.createdAt)}`;
    const content = document.createElement('p'); content.textContent = note.text;
    entry.append(meta, content); history.append(entry);
  }
  $('#progress-form').hidden = idea.stage === 'bloom';
  $('#progress-prompt').textContent = idea.stage === 'sprout' ? '有新想法或进展了吗？' : '付诸行动了吗？记下执行或成果。';
  $('#save-progress').textContent = idea.stage === 'sprout' ? '记录跟进 · 长成花苞' : '记录执行 / 成果 · 开花';
  $('#extra-followup').hidden = idea.stage !== 'bud';
  $('#progress-hint').textContent = idea.stage === 'bloom' ? '这份灵感已经开花了 ✿' : '10 天没有互动会稍微枯萎；点开就能唤醒。';
}
async function saveProgress(kind) {
  const idea = ideas.find(item => item.id === selectedId), text = $('#progress-text').value.trim();
  if (!idea || !text) { $('#detail-error').textContent = '请先写下这次进展。'; return; }
  if (idea.stage === 'sprout' && kind !== 'followup') return;
  if (idea.stage === 'bloom') return;
  const now = new Date().toISOString();
  idea.notes.push({ id: crypto.randomUUID(), kind, text, createdAt: now });
  idea.stage = kind === 'outcome' ? 'bloom' : 'bud'; idea.lastTendedAt = now;
  try {
    await writeIdea(idea); freshId = idea.id; $('#detail').close(); await refresh();
    setTimeout(() => { freshId = null; renderGarden(); }, 1800);
  } catch { $('#detail-error').textContent = '保存失败，请稍后重试。'; }
}

function readDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob);
  });
}
async function exportBackup() {
  try {
    const records = await Promise.all(ideas.map(async idea => ({ ...idea, photo: idea.photo ? await readDataURL(idea.photo) : null, audio: idea.audio ? await readDataURL(idea.audio) : null })));
    const blob = new Blob([JSON.stringify({ format: 'inspiration-garden-v1', exportedAt: new Date().toISOString(), records })], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = `灵感花园备份-${new Date().toISOString().slice(0, 10)}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  } catch { alert('导出失败，请稍后再试。'); }
}
async function restoreBackup(file) {
  if (!file) return;
  try {
    const backup = JSON.parse(await file.text());
    if (backup.format !== 'inspiration-garden-v1' || !Array.isArray(backup.records)) throw new Error('format');
    for (const entry of backup.records) {
      if (typeof entry.id !== 'string' || typeof entry.text !== 'string' || !categories.includes(entry.category) || !stageNames[entry.stage] || !Array.isArray(entry.notes)) throw new Error('record');
      const photoBlob = entry.photo ? await (await fetch(entry.photo)).blob() : null;
      const audioBlob = entry.audio ? await (await fetch(entry.audio)).blob() : null;
      await writeIdea({ ...entry, photo: photoBlob, audio: audioBlob });
    }
    await refresh(); alert('备份已导入。相同灵感会更新，不会重复添加。');
  } catch { alert('无法导入。请选择由灵感花园导出的 JSON 备份。'); }
}
function installBackupControls() {
  const row = document.createElement('div'); row.className = 'backup-row';
  const exportButton = document.createElement('button'); exportButton.type = 'button'; exportButton.textContent = '导出备份'; exportButton.addEventListener('click', exportBackup);
  const importButton = document.createElement('button'); importButton.type = 'button'; importButton.textContent = '导入备份';
  const input = document.createElement('input'); input.type = 'file'; input.accept = 'application/json,.json'; input.hidden = true;
  importButton.addEventListener('click', () => input.click()); input.addEventListener('change', () => { restoreBackup(input.files?.[0]); input.value = ''; });
  row.append(exportButton, importButton, input); $('#list-screen').insertBefore(row, $('#list-scroll'));
}

async function init() {
  $('#year').textContent = new Date().getFullYear(); installBackupControls(); renderCategories();
  $('#nav-garden').addEventListener('click', () => { view = 'garden'; render(); });
  $('#nav-list').addEventListener('click', () => { view = 'list'; render(); });
  document.querySelectorAll('.open-composer').forEach(button => button.addEventListener('click', openComposer));
  document.querySelectorAll('.close-composer').forEach(button => button.addEventListener('click', closeComposer));
  document.querySelectorAll('.close-detail').forEach(button => button.addEventListener('click', () => $('#detail').close()));
  $('#composer').addEventListener('close', () => stopRecording(true));
  $('#detail').addEventListener('close', () => { selectedId = null; releaseMediaURLs(); });
  $('#pick-photo').addEventListener('click', () => $('#photo-input').click());
  $('#take-photo').addEventListener('click', () => $('#camera-input').click());
  $('#photo-input').addEventListener('change', event => choosePhoto(event.target.files?.[0]));
  $('#camera-input').addEventListener('change', event => choosePhoto(event.target.files?.[0]));
  $('#record-audio').addEventListener('click', () => recorder?.state === 'recording' ? stopRecording() : startRecording());
  $('#save-idea').addEventListener('click', saveIdea);
  $('#save-progress').addEventListener('click', () => saveProgress(ideas.find(item => item.id === selectedId)?.stage === 'sprout' ? 'followup' : 'outcome'));
  $('#extra-followup').addEventListener('click', () => saveProgress('followup'));
  try { await refresh(); } catch { $('#garden-empty').lastElementChild.textContent = '浏览器存储不可用，请关闭无痕模式后重试。'; }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
}
init();
