const state = { type: 'name', results: [] };
let activeSearchController = null;
let searchSequence = 0;
let autoSearchTimer = null;
const form = document.querySelector('#search-form');
const queryInput = document.querySelector('#search-query');
const datasetInput = document.querySelector('#dataset-id');
const searchButton = document.querySelector('#search-button');
const clearButton = document.querySelector('#clear-button');
const resultsSection = document.querySelector('#results-section');
const resultsContainer = document.querySelector('#results');
const resultsHeading = document.querySelector('#results-heading');
const resultsTitle = document.querySelector('#results-title');
const resultCount = document.querySelector('#result-count');
const hintText = document.querySelector('#hint-text');
const voteKeyInput = document.querySelector('#vote-key');
const accessKeyInput = document.querySelector('#access-key');
const rememberAccessKeyInput = document.querySelector('#remember-access-key');
const feedback = document.querySelector('#feedback');
const DEVICE_ID_STORAGE_KEY = 'voter-search.device-id';
const ACCESS_KEY_STORAGE_KEY = 'voter-search.access-key';
let deviceStorageAvailable = true;

function createDeviceId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (window.crypto?.getRandomValues) window.crypto.getRandomValues(bytes);
  else bytes.forEach((_, index) => { bytes[index] = Math.floor(Math.random() * 256); });
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function getBrowserDeviceId() {
  try {
    const savedId = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (savedId && /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(savedId)) return savedId;
    const newId = createDeviceId();
    window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, newId);
    return newId;
  } catch {
    deviceStorageAvailable = false;
    return createDeviceId();
  }
}

const browserDeviceId = getBrowserDeviceId();
try {
  const rememberedAccessKey = window.localStorage.getItem(ACCESS_KEY_STORAGE_KEY);
  if (rememberedAccessKey) {
    accessKeyInput.value = rememberedAccessKey;
    rememberAccessKeyInput.checked = true;
  }
} catch {
  deviceStorageAvailable = false;
}

const modeCopy = {
  name: { placeholder: 'Enter a voter name', hint: 'Name search tolerates a typo; Latin-script names are transliterated to Hindi.', title: 'Voter matches' },
  house: { placeholder: 'Enter a house number', hint: 'Searches the selected dataset for all records at this house number.', title: 'Household members' },
  epic: { placeholder: 'Enter an EPIC number', hint: 'EPIC search tolerates a one-character typo and ignores separators.', title: 'EPIC matches' },
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null && text !== '') node.textContent = String(text);
  return node;
}

function valueOrDash(value) {
  return value === undefined || value === null || value === '' ? '—' : value;
}

function showFeedback(message, type = 'info') {
  feedback.textContent = message;
  feedback.className = `feedback${type === 'error' ? ' error' : type === 'success' ? ' success' : ''}`;
  feedback.setAttribute('role', type === 'error' ? 'alert' : 'status');
  feedback.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
  feedback.hidden = false;
}

function clearFeedback() {
  feedback.textContent = '';
  feedback.hidden = true;
  feedback.className = 'feedback';
  feedback.setAttribute('role', 'status');
  feedback.setAttribute('aria-live', 'polite');
}

function detectSearchType(value) {
  const query = value.trim();
  if (/^\d+$/u.test(query)) return query.length <= 3 ? 'house' : 'epic';
  if (/[/-]/u.test(query) || (/[\p{L}]/u.test(query) && /\d/u.test(query))) return 'epic';
  const compactLatin = query.replace(/\s/gu, '');
  if (/^[A-Za-z]{1,3}$/u.test(compactLatin)) return 'epic';
  return 'name';
}

function queueAutomaticSearch() {
  window.clearTimeout(autoSearchTimer);
  const query = queryInput.value.trim();
  if (!query) {
    updateMode(state.type, { preserveQuery: true });
    return;
  }
  const validLength = state.type === 'name' ? query.length >= 2 : state.type === 'epic' ? query.length >= 3 : true;
  if (!validLength) return;
  clearFeedback();
  autoSearchTimer = window.setTimeout(() => form.requestSubmit(), 450);
}

async function requestJson(url, options = {}, { timeoutMs = 15000, signal } = {}) {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', abortFromCaller, { once: true });
  const timeout = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    let payload = null;
    try { payload = text ? JSON.parse(text) : null; } catch { /* handled below */ }

    if (!response.ok) {
      let message = payload?.error || payload?.message;
      if (!message && response.status === 401) message = 'Access was denied. Check the key in Operator setting.';
      if (!message && response.status === 429) message = 'Too many requests. Wait a minute and try again.';
      if (!message && response.status >= 500) message = 'The server is temporarily unavailable. Try again shortly.';
      const error = new Error(message || `Request failed (${response.status}).`);
      error.status = response.status;
      throw error;
    }
    if (!payload || typeof payload !== 'object') throw new Error('The server returned an invalid response. Please retry.');
    return payload;
  } catch (error) {
    if (timedOut) throw new Error('The request timed out. Check your connection and try again.');
    if (error.name === 'AbortError') throw error;
    if (error instanceof TypeError) throw new Error('Could not reach the server. Check your connection and try again.');
    throw error;
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener('abort', abortFromCaller);
  }
}

function fact(label, value, className = '') {
  const wrapper = el('div', `fact${className ? ` ${className}` : ''}`);
  wrapper.append(el('span', 'fact-label', label), el('span', 'fact-value', valueOrDash(value)));
  return wrapper;
}

function statusPill(voter) {
  return el('span', `status-pill${voter.already_voted ? ' voted' : ''}`, voter.already_voted ? 'Already voted' : 'Not marked');
}

function addDetails(card, voter) {
  const details = el('details', 'card-details');
  details.append(el('summary', '', 'View full record details'));
  const grid = el('div', 'detail-grid');
  const master = voter.ward || voter.master || {};
  [
    ['Gender', voter.gender], ['Part no.', voter.part_no], ['Serial no.', voter.serial_no],
    ['Row text', voter.row_text],
    ['Ward', master.ward_no], ['Booth no.', master.booth_no], ['Village', master.village_name],
    ['Ward name', master.name], ['Contact person', master.contact_person],
    ['Ward notes', master.notes], ['Record status', voter.record_status],
    ['Review status', voter.review_status], ['Source page', voter.source_page],
  ].forEach(([label, value]) => grid.append(fact(label, value, 'detail-item')));
  if (voter.raw_ocr_text) grid.append(el('div', 'ocr-text', voter.raw_ocr_text));
  details.append(grid);
  card.append(details);
}

function addVoteAction(container, voter) {
  if (voter.already_voted) return;
  const button = el('button', container.classList.contains('card-actions') ? 'vote-button' : 'table-vote', 'Mark as voted');
  button.type = 'button';
  button.addEventListener('click', async () => {
    const voteKey = voteKeyInput.value.trim();
    if (!voteKey) {
      document.querySelector('.operator-settings').open = true;
      voteKeyInput.focus();
      showFeedback('Enter the vote-marking key under Operator setting before continuing.', 'error');
      return;
    }
    button.disabled = true;
    button.textContent = 'Saving…';
    try {
      const payload = await requestJson(`/api/voters/${encodeURIComponent(voter.key)}/voted`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Vote-Key': voteKey },
        body: JSON.stringify({ datasetId: voter.dataset_id || Number(datasetInput.value) }),
      });
      voter.already_voted = true;
      renderResults();
      showFeedback(payload.message || 'Voter marked as already voted.', 'success');
    } catch (error) {
      if (error.status === 409) {
        voter.already_voted = true;
        renderResults();
        showFeedback('This voter was already marked as voted.', 'success');
        return;
      }
      button.disabled = false;
      button.textContent = 'Mark as voted';
      showFeedback(error.message || 'Unable to update this record. Please retry.', 'error');
    }
  });
  container.append(button);
}

function renderCard(voter) {
  const card = el('article', 'voter-card');
  const main = el('div', 'card-main');
  const head = el('div', 'card-head');
  const title = el('div');
  title.append(el('h3', 'voter-name', valueOrDash(voter.name)), el('div', 'epic-label', `EPIC · ${valueOrDash(voter.epic_no)}`));
  head.append(title, statusPill(voter));
  const facts = el('div', 'card-facts');
  facts.append(fact('House no.', voter.house_no), fact('Age', voter.age), fact('Relation', voter.relation_name));
  main.append(head, facts);
  card.append(main);
  addDetails(card, voter);
  const actions = el('div', 'card-actions');
  addVoteAction(actions, voter);
  if (actions.childElementCount) card.append(actions);
  return card;
}

function renderHousehold(voters) {
  const wrapper = el('div', 'house-table-wrap');
  const mastersByWard = new Map(voters
    .filter((voter) => voter.ward || voter.master)
    .map((voter) => [String(voter.ward_id), voter.ward || voter.master]));
  const summary = el('div', 'household-summary');
  if (mastersByWard.size > 1) {
    summary.append(el('span', '', `${mastersByWard.size} wards matched; ward and booth are shown for each voter.`));
  } else {
    const master = mastersByWard.values().next().value || {};
    [['Village', master.village_name], ['Ward', master.ward_no], ['Booth', master.booth_no], ['Ward name', master.name], ['Contact', master.contact_person], ['Notes', master.notes]]
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .forEach(([label, value]) => {
        const item = el('span');
        item.append(el('strong', '', `${label}: `), document.createTextNode(String(value)));
        summary.append(item);
      });
  }
  if (summary.childElementCount) wrapper.append(summary);
  const table = el('table', 'house-table');
  const thead = document.createElement('thead');
  const header = document.createElement('tr');
  const columns = ['Serial', 'Voter / relation', 'Age', 'Gender', 'Ward / booth', 'Ward name', 'Village', 'EPIC number', 'Status', 'Action'];
  columns.forEach((label) => header.append(el('th', '', label)));
  thead.append(header);
  const tbody = document.createElement('tbody');
  voters.forEach((voter) => {
    const row = document.createElement('tr');
    const serial = el('td', '', valueOrDash(voter.serial_no));
    serial.dataset.label = columns[0];
    row.append(serial);
    const person = document.createElement('td');
    person.dataset.label = columns[1];
    person.append(el('span', 'person-cell', valueOrDash(voter.name)), el('span', 'sub-cell', `${valueOrDash(voter.relation_type)}: ${valueOrDash(voter.relation_name)}`));
    row.append(person);
    [['Age', voter.age], ['Gender', voter.gender], ['EPIC number', voter.epic_no]].forEach(([label, value]) => {
      const cell = el('td', '', valueOrDash(value));
      cell.dataset.label = label;
      if (label === 'EPIC number') {
        const master = voter.ward || voter.master || {};
        const wardBooth = el('td', '', `${valueOrDash(master.ward_no)} / ${valueOrDash(master.booth_no)}`);
        wardBooth.dataset.label = 'Ward / booth';
        const wardName = el('td', '', valueOrDash(master.name));
        wardName.dataset.label = 'Ward name';
        const village = el('td', '', valueOrDash(master.village_name));
        village.dataset.label = 'Village';
        row.append(wardBooth, wardName, village);
      }
      row.append(cell);
    });
    const statusCell = document.createElement('td');
    statusCell.dataset.label = 'Status';
    statusCell.append(el('span', `table-status${voter.already_voted ? ' voted' : ''}`, voter.already_voted ? 'Already voted' : 'Not marked'));
    row.append(statusCell);
    const action = document.createElement('td');
    action.dataset.label = 'Action';
    addVoteAction(action, voter);
    row.append(action);
    tbody.append(row);
  });
  table.append(thead, tbody);
  wrapper.append(table);
  return wrapper;
}

function renderResults() {
  resultsContainer.replaceChildren();
  if (!state.results.length) return;
  if (state.type === 'house') resultsContainer.append(renderHousehold(state.results));
  else state.results.forEach((voter) => resultsContainer.append(renderCard(voter)));
}

function updateMode(type, { preserveQuery = false } = {}) {
  const currentQuery = queryInput.value;
  window.clearTimeout(autoSearchTimer);
  searchSequence += 1;
  activeSearchController?.abort();
  activeSearchController = null;
  searchButton.disabled = false;
  resultsSection.setAttribute('aria-busy', 'false');
  state.results = [];
  resultsContainer.replaceChildren();
  resultsHeading.hidden = true;
  resultCount.textContent = '';
  clearFeedback();
  state.type = type;
  document.querySelectorAll('.mode-button').forEach((button) => {
    const active = button.dataset.type === type;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  queryInput.placeholder = modeCopy[type].placeholder;
  hintText.textContent = modeCopy[type].hint;
  queryInput.value = preserveQuery ? currentQuery : '';
  clearButton.hidden = queryInput.value.length === 0;
  if (!preserveQuery) queryInput.focus();
}

document.querySelectorAll('.mode-button').forEach((button) => {
  button.addEventListener('click', () => updateMode(button.dataset.type));
});
queryInput.addEventListener('input', () => {
  clearButton.hidden = queryInput.value.length === 0;
  const detectedType = detectSearchType(queryInput.value);
  if (queryInput.value.trim() && detectedType !== state.type) updateMode(detectedType, { preserveQuery: true });
  queueAutomaticSearch();
});
clearButton.addEventListener('click', () => {
  queryInput.value = '';
  clearButton.hidden = true;
  queueAutomaticSearch();
  queryInput.focus();
});
datasetInput.addEventListener('change', queueAutomaticSearch);
function syncRememberedAccessKey(event) {
  if (!rememberAccessKeyInput.checked && event?.type === 'input') return;
  try {
    if (rememberAccessKeyInput.checked && accessKeyInput.value.trim()) {
      window.localStorage.setItem(ACCESS_KEY_STORAGE_KEY, accessKeyInput.value.trim());
    } else {
      window.localStorage.removeItem(ACCESS_KEY_STORAGE_KEY);
    }
  } catch {
    showFeedback('This browser blocked local storage; the access key will not be remembered.', 'error');
  }
}
accessKeyInput.addEventListener('input', syncRememberedAccessKey);
rememberAccessKeyInput.addEventListener('change', syncRememberedAccessKey);

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const q = queryInput.value.trim();
  const datasetId = Number(datasetInput.value);
  if (!Number.isInteger(datasetId) || datasetId < 1) {
    showFeedback('Enter a valid positive dataset number.', 'error');
    datasetInput.focus();
    return;
  }
  if ((state.type === 'name' && q.length < 2) || (state.type === 'epic' && q.length < 3) || !q) {
    showFeedback(state.type === 'name' ? 'Enter at least 2 characters to search by name.' : state.type === 'epic' ? 'Enter at least 3 characters for an EPIC search.' : 'Enter a house number to search.', 'error');
    return;
  }

  activeSearchController?.abort();
  const controller = new AbortController();
  activeSearchController = controller;
  const currentSequence = ++searchSequence;
  state.results = [];
  resultsContainer.replaceChildren();
  resultsHeading.hidden = false;
  resultsTitle.textContent = modeCopy[state.type].title;
  resultCount.textContent = 'Searching…';
  resultsSection.setAttribute('aria-busy', 'true');
  searchButton.disabled = true;
  showFeedback('Searching voter records…');
  try {
    const params = new URLSearchParams({ type: state.type, q, datasetId: String(datasetId) });
    if (accessKeyInput.value.trim() && !deviceStorageAvailable) {
      throw new Error('Enable browser storage so this access key can stay bound to this device.');
    }
    const headers = { 'X-Device-Id': browserDeviceId };
    if (accessKeyInput.value.trim()) headers['X-Access-Key'] = accessKeyInput.value.trim();
    const payload = await requestJson(`/api/search?${params}`, { headers }, { signal: controller.signal });
    if (currentSequence !== searchSequence) return;
    if (!Array.isArray(payload.results) || !Number.isInteger(payload.count) || !Number.isInteger(payload.limit)) {
      throw new Error('The server returned incomplete search results. Please retry.');
    }
    state.results = payload.results;
    resultCount.textContent = `${payload.count}${payload.count === payload.limit ? '+' : ''} ${payload.count === 1 ? 'record' : 'records'}`;
    if (!payload.count) showFeedback('No voter records matched. Check the spelling and try again.');
    else {
      clearFeedback();
      renderResults();
    }
  } catch (error) {
    if (currentSequence !== searchSequence || error.name === 'AbortError') return;
    resultCount.textContent = '';
    showFeedback(error.message || 'Search failed. Please try again.', 'error');
  } finally {
    if (currentSequence === searchSequence) {
      activeSearchController = null;
      resultsSection.setAttribute('aria-busy', 'false');
      searchButton.disabled = false;
    }
  }
});
