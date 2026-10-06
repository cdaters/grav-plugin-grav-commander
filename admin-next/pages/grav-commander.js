const TAG = window.__GRAV_PAGE_TAG || 'grav-commander-page';

class GravCommanderPage extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._themeObserver = null;
    this._themeMedia = null;
    this.state = {
      roots: [],
      root: 'pages',
      path: '',
      parent: '',
      items: [],
      selected: null,
      file: null,
      backups: [],
      message: '',
      error: '',
      backupError: '',
      status: null,
      activeTab: 'files',
      busyLabel: '',
      backupProfile: 'full_site',
      backupNote: '',
      showProfileEditor: false,
      profileExpert: false,
      profileRows: [],
      profileDraft: '',
      profileDraftError: '',
      scheduleRows: [],
      scheduleDraftError: '',
      profileExpanded: this.loadStoredExpansion('gravCommander.profileExpanded'),
      scheduleExpanded: this.loadStoredExpansion('gravCommander.scheduleExpanded'),
      busy: false,
      theme: 'dark',
      modal: null,
      noticeTimer: null,
      jarvisStatus: null,
      jarvisProvider: '',
      jarvisModels: [],
      jarvisModel: '',
      jarvisAction: 'explain',
      jarvisCustomInstruction: '',
      jarvisProposal: null,
      jarvisBusy: false,
      jarvisMessage: '',
      jarvisError: '',
    };
  }

  connectedCallback() {
    this.setupThemeSync();
    this.render();
    this.loadRoots();
  }

  disconnectedCallback() {
    this._themeObserver?.disconnect();
    if (this._themeMedia && this._themeListener) {
      this._themeMedia.removeEventListener?.('change', this._themeListener);
    }
    if (this._noticeTimer) {
      clearTimeout(this._noticeTimer);
    }
  }

  setupThemeSync() {
    const sync = () => {
      const theme = this.detectTheme();
      if (theme !== this.state.theme) this.setState({ theme });
    };

    this._themeMedia = window.matchMedia?.('(prefers-color-scheme: dark)') || null;
    this._themeListener = sync;
    this._themeMedia?.addEventListener?.('change', sync);

    this._themeObserver = new MutationObserver(sync);
    this._themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'data-mode', 'style'] });
    if (document.body) {
      this._themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class', 'data-theme', 'data-mode', 'style'] });
    }

    this.state.theme = this.detectTheme();
  }

  detectTheme() {
    const explicit = [
      document.documentElement?.dataset?.theme,
      document.documentElement?.dataset?.mode,
      document.body?.dataset?.theme,
      document.body?.dataset?.mode,
    ].join(' ').toLowerCase();

    if (/\bdark\b/.test(explicit)) return 'dark';
    if (/\blight\b/.test(explicit)) return 'light';

    const classTokens = [
      ...(document.documentElement?.classList || []),
      ...(document.body?.classList || []),
    ].map(v => String(v).toLowerCase());
    if (classTokens.includes('dark')) return 'dark';
    if (classTokens.includes('light')) return 'light';

    const fromColor = this.detectThemeFromComputedColor();
    if (fromColor) return fromColor;

    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  detectThemeFromComputedColor() {
    const candidates = [document.body, document.documentElement, this.parentElement].filter(Boolean);
    for (const node of candidates) {
      const style = window.getComputedStyle(node);
      const bg = style.backgroundColor || style.getPropertyValue('--admin-bg') || style.getPropertyValue('--background');
      const parsed = this.parseRgb(bg);
      if (!parsed) continue;
      const [r, g, b] = parsed;
      const brightness = (r * 299 + g * 587 + b * 114) / 1000;
      return brightness < 150 ? 'dark' : 'light';
    }
    return null;
  }

  parseRgb(value) {
    if (!value || value === 'transparent') return null;
    const match = String(value).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/i);
    if (!match) return null;
    if (match[4] !== undefined && Number(match[4]) === 0) return null;
    return [Number(match[1]), Number(match[2]), Number(match[3])];
  }

  loadStoredExpansion(key) {
    try {
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  saveStoredExpansion(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value || {}));
    } catch (_) {}
  }

  saveProfileExpanded(value) {
    this.saveStoredExpansion('gravCommander.profileExpanded', value);
  }

  saveScheduleExpanded(value) {
    this.saveStoredExpansion('gravCommander.scheduleExpanded', value);
  }

  getAuthHeaders(json = true) {
    let token = window.__GRAV_API_TOKEN || '';
    let env = '';
    try {
      const auth = JSON.parse(localStorage.getItem('grav_admin_auth') || '{}');
      token = token || auth.accessToken || '';
      env = auth.environment || '';
    } catch (_) {}

    const headers = {};
    if (json) headers['Content-Type'] = 'application/json';
    if (token) {
      headers['X-API-Token'] = token;
      headers.Authorization = `Bearer ${token}`;
    }
    if (env) headers['X-Grav-Environment'] = env;
    return headers;
  }

  apiUrl(path) {
    const server = window.__GRAV_API_SERVER_URL || '';
    const prefix = window.__GRAV_API_PREFIX || '/api/v1';
    return `${server}${prefix}${path}`;
  }

  async api(path, options = {}) {
    const opts = {
      credentials: 'omit',
      cache: 'no-store',
      ...options,
      headers: { ...(options.headers || {}) },
    };

    if (opts.body instanceof FormData) {
      opts.headers = { ...this.getAuthHeaders(false), ...opts.headers };
    } else {
      opts.headers = { ...this.getAuthHeaders(true), ...opts.headers };
    }

    let response;
    try {
      response = await fetch(this.apiUrl(path), opts);
    } catch (err) {
      throw new Error(`Network/API request failed for ${path}: ${err.message || err}`);
    }

    const text = await response.text();
    let payload = null;
    try { payload = text ? JSON.parse(text) : {}; } catch (_) { payload = { raw: text }; }

    if (!response.ok) {
      const raw = payload?.raw ? String(payload.raw).replace(/\s+/g, ' ').slice(0, 500) : '';
      const detail = payload?.detail || payload?.message || payload?.title || raw || response.statusText || 'Unknown API error';
      throw new Error(`${response.status} ${detail} [${path}]`);
    }
    return payload?.data ?? payload;
  }

  setState(patch) {
    const shouldAutoClearNotice = (
      (Object.prototype.hasOwnProperty.call(patch, 'message') && patch.message)
      || (Object.prototype.hasOwnProperty.call(patch, 'error') && patch.error)
      || (Object.prototype.hasOwnProperty.call(patch, 'backupError') && patch.backupError)
    );

    this.state = { ...this.state, ...patch };
    this.render();

    if (shouldAutoClearNotice) {
      this.scheduleNoticeClear(Object.prototype.hasOwnProperty.call(patch, 'message') && patch.message ? 7000 : 12000);
    }
  }

  scheduleNoticeClear(delay = 7000) {
    if (this._noticeTimer) {
      clearTimeout(this._noticeTimer);
    }
    this._noticeTimer = setTimeout(() => {
      this._noticeTimer = null;
      if (this.state.busy) {
        this.scheduleNoticeClear(3000);
        return;
      }
      this.setState({ message: '', error: '', backupError: '' });
    }, delay);
  }

  async guard(action, label = 'Working…') {
    this.setState({ busy: true, busyLabel: label, error: '', message: '' });
    try {
      await action();
    } catch (err) {
      this.setState({ error: err.message || String(err) });
    } finally {
      this.setState({ busy: false, busyLabel: '' });
      if (this.state.message || this.state.error || this.state.backupError) {
        this.scheduleNoticeClear(this.state.message ? 7000 : 12000);
      }
    }
  }

  confirmModal({ title = 'Confirm action', message = '', okText = 'OK', cancelText = 'Cancel', danger = false } = {}) {
    return new Promise(resolve => {
      this.setState({
        modal: {
          title,
          message,
          okText,
          cancelText,
          danger,
          resolve,
        }
      });
    });
  }

  closeModal(value) {
    const resolver = this.state.modal?.resolve;
    this.setState({ modal: null });
    if (typeof resolver === 'function') resolver(value);
  }

  async loadRoots() {
    this.setState({ busy: true, error: '', message: '' });
    try {
      const [roots, status, jarvisStatus] = await Promise.all([
        this.api('/grav-commander/roots'),
        this.api('/grav-commander/status').catch(err => ({ error: err.message || String(err), profiles: {} })),
        this.api('/grav-commander/jarvis/status').catch(() => ({ available: false, providers: [], actions: [] })),
      ]);
      const rootList = Array.isArray(roots) ? roots : [];
      const profiles = status?.profiles || {};
      const schedules = status?.schedules || {};
      const profileKeys = Object.keys(profiles);
      const first = rootList.find(r => r.key === this.state.root) || rootList[0];
      const jarvisProviders = Array.isArray(jarvisStatus?.providers) ? jarvisStatus.providers : [];
      const jarvisProvider = jarvisProviders.some(provider => provider.id === this.state.jarvisProvider)
        ? this.state.jarvisProvider
        : (jarvisProviders[0]?.id || '');
      this.state = {
        ...this.state,
        roots: rootList,
        status,
        backupProfile: profileKeys.includes(this.state.backupProfile) ? this.state.backupProfile : (profileKeys[0] || 'full_site'),
        profileRows: this.profilesToRows(profiles),
        scheduleRows: this.schedulesToRows(schedules),
        profileDraft: JSON.stringify(profiles, null, 2),
        root: first?.key || 'pages',
        jarvisStatus,
        jarvisProvider,
      };
      await this.loadList(false);
    } catch (err) {
      this.setState({ error: err.message || String(err), items: [] });
    } finally {
      this.setState({ busy: false });
    }

    await this.tryLoadBackups(false);
  }

  async loadList(render = true) {
    const { root, path } = this.state;
    const data = await this.api(`/grav-commander/list?root=${encodeURIComponent(root)}&path=${encodeURIComponent(path)}`);
    const patch = { items: data.items || [], path: data.path || '', parent: data.parent || '', selected: null, file: null, jarvisProposal: null, jarvisError: '', jarvisMessage: '' };
    if (render) this.setState(patch);
    else this.state = { ...this.state, ...patch };
  }

  async openDir(path) {
    this.setState({ path });
    await this.guard(() => this.loadList());
  }

  async openFile(item) {
    await this.guard(async () => {
      const file = await this.api(`/grav-commander/read?root=${encodeURIComponent(this.state.root)}&path=${encodeURIComponent(item.path)}`);
      this.setState({ selected: item, file, message: `Opened ${item.name}`, jarvisAction: 'explain', jarvisProposal: null, jarvisError: '', jarvisMessage: '' });
    });
  }

  editorContent() {
    const textarea = this.shadowRoot.querySelector('#gc-editor');
    return textarea ? textarea.value : (this.state.file?.content || '');
  }

  jarvisEligibleFile(file) {
    if (!file || !file.viewable) return false;
    const path = String(file.path || '').toLowerCase();
    const name = path.split('/').pop() || '';
    if (/(^|\/)(\.env(?:\.|$)|\.ssh(?:\/|$)|accounts?(?:\/|$)|credentials?(?:\/|$)|secrets?(?:\/|$)|private[-_]?keys?(?:\/|$))/.test(path)) return false;
    if (/(^|[._-])(credential|password|private[-_]?key|secret|token)([._-]|$)/.test(name)) return false;
    return [
      'css', 'csv', 'html', 'htm', 'ini', 'inc', 'js', 'json', 'jsx', 'less', 'markdown', 'md',
      'mjs', 'php', 'scss', 'source', 'sql', 'svg', 'text', 'toml', 'ts', 'tsx', 'twig', 'txt',
      'xml', 'yaml', 'yml'
    ].includes(String(file.extension || '').toLowerCase()) || ['makefile', 'readme'].includes(name);
  }

  async loadJarvisModels() {
    const provider = this.state.jarvisProvider;
    if (!provider) return;
    this.setState({ jarvisBusy: true, jarvisError: '', jarvisMessage: 'Loading models…' });
    try {
      const data = await this.api(`/grav-commander/jarvis/providers/${encodeURIComponent(provider)}/models`);
      const models = Array.isArray(data.models) ? data.models.filter(model => model.available !== false) : [];
      this.setState({
        jarvisModels: models,
        jarvisModel: models.some(model => model.id === this.state.jarvisModel) ? this.state.jarvisModel : '',
        jarvisMessage: data.message || (models.length ? `${models.length} model${models.length === 1 ? '' : 's'} loaded.` : 'Provider default model will be used.'),
      });
    } catch (err) {
      this.setState({ jarvisModels: [], jarvisModel: '', jarvisError: err.message || String(err), jarvisMessage: '' });
    } finally {
      this.setState({ jarvisBusy: false });
    }
  }

  async validateJarvisProvider() {
    const provider = this.state.jarvisProvider;
    if (!provider) return;
    this.setState({ jarvisBusy: true, jarvisError: '', jarvisMessage: 'Validating provider without generating content…' });
    try {
      const data = await this.api(`/grav-commander/jarvis/providers/${encodeURIComponent(provider)}/validate`, { method: 'POST', body: '{}' });
      this.setState({
        jarvisMessage: data.usable ? 'Provider configuration is usable.' : 'Provider configuration is not currently usable.',
        jarvisError: data.usable ? '' : (data.issues?.[0]?.message || 'Provider validation failed.'),
      });
    } catch (err) {
      this.setState({ jarvisError: err.message || String(err), jarvisMessage: '' });
    } finally {
      this.setState({ jarvisBusy: false });
    }
  }

  async runJarvisAction() {
    const file = this.state.file;
    const provider = this.state.jarvisProvider;
    if (!file || !provider || !this.jarvisEligibleFile(file)) return;
    const content = this.editorContent();
    const custom = this.shadowRoot.querySelector('#gc-jarvis-custom')?.value || this.state.jarvisCustomInstruction;
    this.state.file = { ...file, content };
    this.state.jarvisCustomInstruction = custom;
    this.setState({ jarvisBusy: true, jarvisError: '', jarvisMessage: 'Jarvis is preparing a bounded proposal…', jarvisProposal: null });
    try {
      const data = await this.api('/grav-commander/jarvis/proposals', {
        method: 'POST',
        body: JSON.stringify({
          root: this.state.root,
          path: file.path,
          content,
          action: this.state.jarvisAction,
          provider_id: provider,
          model: this.state.jarvisModel || null,
          custom_instruction: this.state.jarvisAction === 'custom' ? custom : null,
        }),
      });
      this.setState({
        jarvisProposal: data,
        jarvisMessage: data.context?.truncated
          ? 'Result ready from explicitly truncated context. Review the limitation below.'
          : data.context?.chunked
            ? 'Result ready through Jarvis bounded Markdown chunking.'
            : 'Jarvis result ready. No file was changed.',
      });
    } catch (err) {
      this.setState({ jarvisError: err.message || String(err), jarvisMessage: '', jarvisProposal: null });
    } finally {
      this.setState({ jarvisBusy: false });
    }
  }

  async acceptJarvisProposal() {
    const proposal = this.state.jarvisProposal;
    const file = this.state.file;
    if (!proposal?.proposal_id || !file) return;
    const currentContent = this.editorContent();
    this.state.file = { ...file, content: currentContent };
    this.setState({ jarvisBusy: true, jarvisError: '', jarvisMessage: 'Checking the one-time proposal receipt…' });
    try {
      const data = await this.api(`/grav-commander/jarvis/proposals/${encodeURIComponent(proposal.proposal_id)}/accept`, {
        method: 'POST',
        body: JSON.stringify({
          root: this.state.root,
          path: file.path,
          current_content: currentContent,
          proposed_content: proposal.output,
        }),
      });
      this.setState({
        file: { ...file, content: data.content },
        jarvisProposal: null,
        jarvisMessage: 'Applied to the unsaved editor buffer. Review it, then use Save file when ready.',
      });
    } catch (err) {
      this.setState({ jarvisError: err.message || String(err), jarvisMessage: '' });
    } finally {
      this.setState({ jarvisBusy: false });
    }
  }

  async discardJarvisProposal() {
    const proposal = this.state.jarvisProposal;
    const file = this.state.file;
    if (proposal?.proposal_id && file) {
      try {
        await this.api(`/grav-commander/jarvis/proposals/${encodeURIComponent(proposal.proposal_id)}/discard`, {
          method: 'POST',
          body: JSON.stringify({ root: this.state.root, path: file.path }),
        });
      } catch (_) {}
    }
    this.setState({ jarvisProposal: null, jarvisMessage: 'Jarvis result dismissed. The editor buffer was not changed.', jarvisError: '' });
  }

  async copyJarvisResult() {
    const output = this.state.jarvisProposal?.output;
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      this.setState({ jarvisMessage: 'Jarvis result copied.', jarvisError: '' });
    } catch (_) {
      this.setState({ jarvisError: 'The browser could not copy this result.', jarvisMessage: '' });
    }
  }

  jarvisUsageText(proposal) {
    if (!proposal) return '';
    const usage = proposal.usage || {};
    const cost = proposal.cost || {};
    const reliability = proposal.reliability || {};
    const units = usage.total === null || usage.total === undefined ? 'usage unknown' : `${usage.total} ${usage.unit || 'units'}`;
    const amount = cost.estimated_amount === null || cost.estimated_amount === undefined
      ? 'cost unknown'
      : `${cost.currency || 'USD'} ${cost.estimated_amount}`;
    const requests = `${usage.request_count ?? reliability.attempts ?? 1} request${(usage.request_count ?? reliability.attempts ?? 1) === 1 ? '' : 's'}`;
    const retries = Number(usage.retry_count ?? reliability.retry_count ?? 0);
    return `${units} · ${amount} · ${requests} · ${retries} ${retries === 1 ? 'retry' : 'retries'}${usage.cache_hit || reliability.cache_hit ? ' · cache hit' : ''}`;
  }

  async saveFile() {
    const file = this.state.file;
    if (!file) return;
    const textarea = this.shadowRoot.querySelector('#gc-editor');
    const content = textarea ? textarea.value : file.content;
    await this.guard(async () => {
      const res = await this.api('/grav-commander/write', {
        method: 'PATCH',
        body: JSON.stringify({ root: this.state.root, path: file.path, content }),
      });
      this.setState({ file: { ...file, content }, message: res.message || 'Saved.' });
      await this.loadList();
      await this.tryLoadBackups(false);
    });
  }

  async makeFolder() {
    const name = prompt('New folder name:');
    if (!name) return;
    await this.guard(async () => {
      const res = await this.api('/grav-commander/mkdir', {
        method: 'POST',
        body: JSON.stringify({ root: this.state.root, path: this.state.path, name }),
      });
      this.setState({ message: res.message || 'Folder created.' });
      await this.loadList();
    });
  }

  async uploadFile(file) {
    if (!file) return;
    await this.guard(async () => {
      const form = new FormData();
      form.append('file', file);
      const res = await this.api(`/grav-commander/upload?root=${encodeURIComponent(this.state.root)}&path=${encodeURIComponent(this.state.path)}`, {
        method: 'POST',
        body: form,
      });
      this.setState({ message: res.message || 'Uploaded.' });
      await this.loadList();
      await this.tryLoadBackups(false);
    });
  }

  async renameSelected() {
    const item = this.state.selected || this.state.file;
    if (!item) return;
    const currentName = item.name || item.path.split('/').pop();
    const name = prompt('Rename to:', currentName);
    if (!name || name === currentName) return;
    await this.guard(async () => {
      const res = await this.api('/grav-commander/rename', {
        method: 'POST',
        body: JSON.stringify({ root: this.state.root, path: item.path, name }),
      });
      this.setState({ message: res.message || 'Renamed.', file: null, selected: null });
      await this.loadList();
      await this.tryLoadBackups(false);
    });
  }

  async copyOrMoveSelected(mode) {
    const item = this.state.selected || this.state.file;
    if (!item) return;
    const destRoot = prompt('Destination root:', this.state.root);
    if (!destRoot) return;
    const defaultPath = `${this.state.path ? `${this.state.path}/` : ''}${item.name || item.path.split('/').pop()}`;
    const destPath = prompt('Destination path:', defaultPath);
    if (!destPath) return;

    await this.guard(async () => {
      const res = await this.api(`/grav-commander/${mode}`, {
        method: 'POST',
        body: JSON.stringify({ root: this.state.root, path: item.path, dest_root: destRoot, dest_path: destPath }),
      });
      this.setState({ message: res.message || `${mode} complete.`, file: null, selected: null });
      await this.loadList();
      await this.tryLoadBackups(false);
    });
  }

  async deleteSelected() {
    const item = this.state.selected || this.state.file;
    if (!item) return;
    const label = item.path || item.name;
    const ok = await this.confirmModal({
      title: 'Delete selected item?',
      message: `Delete ${label}? A safety backup will be created first if auto-backup is enabled.`,
      okText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    await this.guard(async () => {
      const res = await this.api('/grav-commander/delete', {
        method: 'DELETE',
        body: JSON.stringify({ root: this.state.root, path: item.path }),
      });
      this.setState({ message: res.message || 'Deleted.', file: null, selected: null });
      await this.loadList();
      await this.tryLoadBackups(false);
    });
  }

  async backupSelected() {
    const item = this.state.selected || this.state.file;
    if (!item) return;
    await this.guard(async () => {
      const res = await this.api('/grav-commander/backup/file', {
        method: 'POST',
        body: JSON.stringify({ root: this.state.root, path: item.path, reason: 'manual' }),
      });
      this.setState({ message: `Backup created: ${res.name}` });
      await this.tryLoadBackups(false);
    });
  }

  async backupSite() {
    const ok = await this.confirmModal({
      title: 'Create backup?',
      message: `Create a backup using profile ${this.state.backupProfile}? This can be large on a production site.`,
      okText: 'Create backup',
    });
    if (!ok) return;
    await this.guard(async () => {
      const res = await this.api('/grav-commander/backup/site', {
        method: 'POST',
        body: JSON.stringify({ reason: 'manual-site', profile: this.state.backupProfile, note: this.state.backupNote }),
      });
      this.setState({ message: `Site backup created: ${res.name}` });
      await this.tryLoadBackups(false);
    }, 'Creating backup archive… This can take a minute on a full site. Keep this tab open.');
  }

  toggleProfileEditor() {
    const profiles = this.state.status?.profiles || {};
    this.setState({
      showProfileEditor: !this.state.showProfileEditor,
      profileRows: this.state.showProfileEditor ? this.state.profileRows : this.profilesToRows(profiles),
      profileDraft: this.state.showProfileEditor ? this.state.profileDraft : JSON.stringify(profiles, null, 2),
      profileDraftError: '',
    });
  }

  toggleProfileExpert() {
    const profiles = this.rowsToProfiles(false) || (this.state.status?.profiles || {});
    this.setState({
      profileExpert: !this.state.profileExpert,
      profileDraft: JSON.stringify(profiles, null, 2),
      profileDraftError: '',
    });
  }

  profilesToRows(profiles) {
    return Object.entries(profiles || {}).map(([key, profile]) => ({
      key,
      label: profile?.label || key,
      description: profile?.description || '',
      include_paths: Array.isArray(profile?.include_paths) ? profile.include_paths.join('\n') : '',
      exclude_prefixes: Array.isArray(profile?.exclude_prefixes) ? profile.exclude_prefixes.join('\n') : '',
    }));
  }

  rowsToProfiles(showError = true) {
    const rows = [...this.shadowRoot.querySelectorAll('[data-profile-row]')].map(row => ({
      key: row.querySelector('[data-profile-key]')?.value.trim() || '',
      label: row.querySelector('[data-profile-label]')?.value.trim() || '',
      description: row.querySelector('[data-profile-description]')?.value.trim() || '',
      include_paths: this.lines(row.querySelector('[data-profile-includes]')?.value || ''),
      exclude_prefixes: this.lines(row.querySelector('[data-profile-excludes]')?.value || ''),
    }));

    const profiles = {};
    for (const row of rows) {
      if (!row.key) {
        if (showError) this.setState({ profileDraftError: 'Every profile needs a key.' });
        return null;
      }
      if (!/^[A-Za-z0-9_-]+$/.test(row.key)) {
        if (showError) this.setState({ profileDraftError: `Profile key ${row.key} can only use letters, numbers, underscores, and hyphens.` });
        return null;
      }
      if (!row.include_paths.length) {
        if (showError) this.setState({ profileDraftError: `Profile ${row.key} needs at least one include path.` });
        return null;
      }
      profiles[row.key] = {
        label: row.label || row.key,
        description: row.description,
        include_paths: row.include_paths,
        exclude_prefixes: row.exclude_prefixes,
      };
    }
    return profiles;
  }

  addProfileRow() {
    const currentProfiles = this.rowsToProfiles(false);
    const currentRows = currentProfiles ? this.profilesToRows(currentProfiles) : this.state.profileRows;
    const base = 'custom_profile';
    const used = new Set(currentRows.map(r => r.key));
    let key = base;
    let i = 2;
    while (used.has(key)) key = `${base}_${i++}`;
    const profileExpanded = { ...this.state.profileExpanded, [currentRows.length]: true };
    this.setState({
      profileRows: [...currentRows, { key, label: 'Custom profile', description: '', include_paths: 'user/pages', exclude_prefixes: '' }],
      profileExpanded,
      profileDraftError: '',
    });
    this.saveProfileExpanded(profileExpanded);
  }

  async deleteProfileRow(index) {
    const ok = await this.confirmModal({
      title: 'Delete backup profile?',
      message: 'Delete this backup profile from Grav Commander?',
      okText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    const currentProfiles = this.rowsToProfiles(false);
    const currentRows = currentProfiles ? this.profilesToRows(currentProfiles) : this.state.profileRows;
    const next = currentRows.filter((_, i) => i !== index);
    this.setState({ profileRows: next, profileDraftError: '' });
  }

  async saveProfiles() {
    let profiles;
    if (this.state.profileExpert) {
      const textarea = this.shadowRoot.querySelector('#gc-profile-draft');
      const raw = textarea ? textarea.value : this.state.profileDraft;
      try {
        profiles = JSON.parse(raw);
      } catch (err) {
        this.setState({ profileDraftError: `Profile JSON is not valid: ${err.message || err}` });
        return;
      }
    } else {
      profiles = this.rowsToProfiles(true);
      if (!profiles) return;
    }

    await this.guard(async () => {
      const res = await this.api('/grav-commander/backup/site', {
        method: 'POST',
        body: JSON.stringify({ __action: 'save_profiles', profiles }),
      });
      const status = await this.api('/grav-commander/status');
      const nextProfiles = status?.profiles || res.profiles || profiles;
      const profileKeys = Object.keys(nextProfiles);
      this.setState({
        status,
        showProfileEditor: false,
        profileRows: this.profilesToRows(nextProfiles),
        profileDraft: JSON.stringify(nextProfiles, null, 2),
        profileDraftError: '',
        backupProfile: profileKeys.includes(this.state.backupProfile) ? this.state.backupProfile : (profileKeys[0] || 'full_site'),
        message: res.message || 'Backup profiles saved.',
      });
    });
  }

  schedulesToRows(schedules) {
    return Object.entries(schedules || {}).map(([key, schedule]) => ({
      key,
      label: schedule?.label || key,
      profile: schedule?.profile || 'full_site',
      enabled: schedule?.enabled !== false,
      at: schedule?.at || '0 3 * * *',
      note: schedule?.note || '',
      output: schedule?.output || `logs/grav-commander-backup-${key}.out`,
    }));
  }

  schedulePreset(value) {
    switch (value) {
      case 'hourly': return '0 * * * *';
      case 'daily': return '0 3 * * *';
      case 'weekdays': return '0 3 * * 1-5';
      case 'weekly': return '0 3 * * 1';
      case 'monthly': return '0 3 1 * *';
      default: return '';
    }
  }


  profileIsExpanded(index) {
    return this.state.profileExpanded[index] === true;
  }

  scheduleIsExpanded(index) {
    return this.state.scheduleExpanded[index] === true;
  }

  toggleProfileRow(index) {
    const profiles = this.rowsToProfiles(false);
    const profileRows = profiles ? this.profilesToRows(profiles) : this.state.profileRows;
    const profileExpanded = { ...this.state.profileExpanded, [index]: !this.profileIsExpanded(index) };
    this.setState({ profileRows, profileExpanded });
    this.saveProfileExpanded(profileExpanded);
  }

  toggleScheduleRow(index) {
    const schedules = this.rowsToSchedules(false);
    const scheduleRows = schedules ? this.schedulesToRows(schedules) : this.state.scheduleRows;
    const scheduleExpanded = { ...this.state.scheduleExpanded, [index]: !this.scheduleIsExpanded(index) };
    this.setState({ scheduleRows, scheduleExpanded });
    this.saveScheduleExpanded(scheduleExpanded);
  }

  setAllProfileRows(expanded) {
    const profiles = this.rowsToProfiles(false);
    const profileRows = profiles ? this.profilesToRows(profiles) : this.state.profileRows;
    const next = {};
    profileRows.forEach((_, idx) => { next[idx] = !!expanded; });
    this.setState({ profileRows, profileExpanded: next });
    this.saveProfileExpanded(next);
  }

  setAllScheduleRows(expanded) {
    const schedules = this.rowsToSchedules(false);
    const scheduleRows = schedules ? this.schedulesToRows(schedules) : this.state.scheduleRows;
    const next = {};
    scheduleRows.forEach((_, idx) => { next[idx] = !!expanded; });
    this.setState({ scheduleRows, scheduleExpanded: next });
    this.saveScheduleExpanded(next);
  }

  scheduleOutputForKey(key) {
    const safe = String(key || 'backup').trim() || 'backup';
    return `logs/grav-commander-backup-${safe}.out`;
  }

  scheduleManagedJobPreview(row) {
    const key = row?.key || 'schedule_key';
    const profile = row?.profile || 'full_site';
    const note = row?.note || '';
    const output = row?.output || this.scheduleOutputForKey(key);
    return [
      `Job ID: grav-commander-backup-${key}`,
      `Command: bin/plugin grav-commander backup --profile='${profile}' --reason='scheduled-${key}'${note ? ` --note='${note.replaceAll("'", "'\\''")}'` : ''}`,
      `Cron: ${row?.at || '0 3 * * *'}`,
      `Output: ${output}`,
      `Status: ${row?.enabled === false ? 'disabled' : 'enabled'}`,
    ].join('\n');
  }

  isGravPageMarkdownPath(path) {
    const lower = String(path || '').toLowerCase();
    return this.state.root === 'pages' && /\.(md|markdown)$/.test(lower) && this.parentPath(path) !== '';
  }

  gravPageRouteFromFilePath(path) {
    const pagePath = this.parentPath(path);
    return pagePath
      .split('/')
      .filter(Boolean)
      .map(part => part.replace(/^\d+\./, ''))
      .filter(Boolean)
      .join('/');
  }

  gravPageEditorUrl(path) {
    const route = this.gravPageRouteFromFilePath(path);
    const encoded = route.split('/').filter(Boolean).map(part => encodeURIComponent(part)).join('/');
    return `${this.adminBasePath()}/pages/edit/${encoded}`;
  }

  openGravPageEditor(path) {
    if (!path) return;
    const url = this.gravPageEditorUrl(path);
    window.location.assign(url);
  }

  addScheduleRow() {
    const currentSchedules = this.rowsToSchedules(false);
    const currentRows = currentSchedules ? this.schedulesToRows(currentSchedules) : this.state.scheduleRows;
    const base = 'daily_backup';
    const used = new Set(currentRows.map(r => r.key));
    let key = base;
    let i = 2;
    while (used.has(key)) key = `${base}_${i++}`;
    const scheduleExpanded = { ...this.state.scheduleExpanded, [currentRows.length]: true };
    this.setState({
      scheduleRows: [...currentRows, {
        key,
        label: 'Daily backup',
        profile: this.state.backupProfile || 'full_site',
        enabled: true,
        at: '0 3 * * *',
        note: '',
        output: this.scheduleOutputForKey(key),
      }],
      scheduleExpanded,
      scheduleDraftError: '',
    });
    this.saveScheduleExpanded(scheduleExpanded);
  }

  async deleteScheduleRow(index) {
    const ok = await this.confirmModal({
      title: 'Delete scheduled backup?',
      message: 'Delete this scheduled backup? This removes the managed Grav scheduler job too.',
      okText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    const currentSchedules = this.rowsToSchedules(false);
    const currentRows = currentSchedules ? this.schedulesToRows(currentSchedules) : this.state.scheduleRows;
    const next = currentRows.filter((_, i) => i !== index);
    this.setState({ scheduleRows: next, scheduleDraftError: '' });
  }

  rowsToSchedules(showError = true) {
    const rows = [...this.shadowRoot.querySelectorAll('[data-schedule-row]')].map(row => ({
      key: row.querySelector('[data-schedule-key]')?.value.trim() || '',
      label: row.querySelector('[data-schedule-label]')?.value.trim() || '',
      profile: row.querySelector('[data-schedule-profile]')?.value || 'full_site',
      enabled: !!row.querySelector('[data-schedule-enabled]')?.checked,
      at: row.querySelector('[data-schedule-at]')?.value.trim() || '',
      note: row.querySelector('[data-schedule-note]')?.value.trim() || '',
      output: row.querySelector('[data-schedule-output]')?.value.trim() || '',
    })).map(row => {
      if (!row.output || /^logs\/grav-commander-backup-[A-Za-z0-9_-]+\.out$/.test(row.output)) {
        row.output = this.scheduleOutputForKey(row.key);
      }
      return row;
    });

    const schedules = {};
    for (const row of rows) {
      if (!row.key) {
        if (showError) this.setState({ scheduleDraftError: 'Every schedule needs a key.' });
        return null;
      }
      if (!/^[A-Za-z0-9_-]+$/.test(row.key)) {
        if (showError) this.setState({ scheduleDraftError: `Schedule key ${row.key} can only use letters, numbers, underscores, and hyphens.` });
        return null;
      }
      if (!this.validCron(row.at)) {
        if (showError) this.setState({ scheduleDraftError: `Schedule ${row.key} needs a 5-field cron expression, such as 0 3 * * *.` });
        return null;
      }
      schedules[row.key] = row;
    }
    return schedules;
  }

  validCron(value) {
    const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length !== 5 && parts.length !== 6) return false;
    return parts.every(part => /^[A-Za-z0-9*,\/?#LW\-]+$/.test(part));
  }

  lines(value) {
    return String(value || '').split(/\r?\n/).map(v => v.trim()).filter(Boolean);
  }

  async saveSchedules() {
    const schedules = this.rowsToSchedules();
    if (!schedules) return;
    await this.guard(async () => {
      const res = await this.api('/grav-commander/backup/site', {
        method: 'POST',
        body: JSON.stringify({ __action: 'save_schedules', schedules }),
      });
      const status = await this.api('/grav-commander/status');
      this.setState({
        status,
        scheduleRows: this.schedulesToRows(status?.schedules || res.schedules || schedules),
        scheduleDraftError: '',
        message: res.message || 'Backup schedules saved.',
      });
    });
  }

  async runScheduleNow(key) {
    const ok = await this.confirmModal({
      title: 'Run scheduled backup now?',
      message: `Run scheduled backup ${key} now?`,
      okText: 'Run now',
    });
    if (!ok) return;
    await this.guard(async () => {
      const res = await this.api(`/grav-commander/backup/schedules/${encodeURIComponent(key)}/run`, { method: 'POST' });
      this.setState({ message: res.message || 'Scheduled backup run completed.' });
      await this.tryLoadBackups(false);
    });
  }

  async loadBackups(showMessage = true) {
    const backups = await this.api('/grav-commander/backups');
    this.setState({ backups: Array.isArray(backups) ? backups : [], backupError: '', message: showMessage ? 'Backups refreshed.' : this.state.message });
  }

  async tryLoadBackups(showMessage = false) {
    try {
      await this.loadBackups(showMessage);
    } catch (err) {
      this.setState({ backupError: err.message || String(err) });
    }
  }

  async restoreBackup(name, scope) {
    const warning = scope === 'site'
      ? 'Restore this FULL SITE backup? Full-site restore must also be enabled in plugin config.'
      : 'Restore this file backup to its original location? Current file/folder will be safety-backed-up first.';
    const ok = await this.confirmModal({
      title: scope === 'site' ? 'Restore full-site backup?' : 'Restore file backup?',
      message: warning,
      okText: 'Restore',
      danger: scope === 'site',
    });
    if (!ok) return;
    await this.guard(async () => {
      const res = await this.api('/grav-commander/restore', {
        method: 'POST',
        body: JSON.stringify({ name, confirm: true }),
      });
      this.setState({ message: res.message || 'Restored.', file: null, selected: null });
      await this.loadList();
      await this.tryLoadBackups(false);
    });
  }

  async deleteBackup(name) {
    const ok = await this.confirmModal({
      title: 'Delete backup?',
      message: `Delete backup ${name}?`,
      okText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    await this.guard(async () => {
      const res = await this.api(`/grav-commander/backups/${encodeURIComponent(name)}`, { method: 'DELETE' });
      this.setState({ message: res.message || 'Backup deleted.' });
      await this.tryLoadBackups(false);
    });
  }

  showBackupInfo(name) {
    const backup = this.state.backups.find(item => item.name === name);
    if (!backup) return;

    this.setState({
      modal: {
        title: 'Backup details',
        message: this.backupDetailsText(backup),
        okText: 'Close',
        cancelText: '',
        danger: false,
        resolve: null,
      }
    });
  }

  async downloadBackup(name) {
    const label = `Preparing backup download for ${name}… Large archives may take a moment before your browser shows the save dialog.`;
    this.setState({ busy: true, busyLabel: label, error: '', message: label });
    try {
      const res = await this.api('/grav-commander/backup/download-token', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      if (!res.token) {
        throw new Error('Download token was not returned by the server.');
      }
      const server = (window.__GRAV_API_SERVER_URL || '').replace(/\/$/, '');
      const downloadUrl = `${server}/grav-commander/download?token=${encodeURIComponent(res.token)}`;
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = res.name || name;
      a.rel = 'noopener';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
      const size = res.size ? ` (${this.formatSize(res.size)})` : '';
      this.setState({ busy: false, busyLabel: '', message: `Download prepared for ${res.name || name}${size}. If your browser asks where to save it, choose a location to continue.` });
    } catch (err) {
      this.setState({ busy: false, busyLabel: '', error: err.message || String(err) });
    }
  }

  async useSuggestedBackupPath() {
    const suggested = this.state.status?.backup?.suggested_outside_path || '';
    if (!suggested) return;
    const ok = await this.confirmModal({
      title: 'Use suggested backup path?',
      message: `Set backup storage to ${suggested}? Existing backups will stay wherever they are now; new backups will be written to the new folder.`,
      okText: 'Use this path',
    });
    if (!ok) return;
    await this.guard(async () => {
      const res = await this.api('/grav-commander/backup/site', {
        method: 'POST',
        body: JSON.stringify({ __action: 'set_backup_path', path: suggested }),
      });
      const status = res.status || await this.api('/grav-commander/status');
      this.setState({ status, message: res.message || 'Backup path saved.' });
      await this.tryLoadBackups(false);
    }, 'Saving backup storage path…');
  }

  async openSelected() {
    const item = this.state.selected || this.state.file;
    if (!item || item.type === 'dir') return;
    const path = item.path || this.state.file?.path || '';
    if (!path) return;
    await this.openFile({ ...item, path, name: item.name || path.split('/').pop() || path });
  }

  async downloadSelected() {
    const item = this.state.selected || this.state.file;
    if (!item || item.type === 'dir') return;
    const path = item.path || '';
    const name = item.name || path.split('/').pop() || 'download';
    await this.guard(async () => {
      const response = await fetch(this.apiUrl(`/grav-commander/download?root=${encodeURIComponent(this.state.root)}&path=${encodeURIComponent(path)}`), {
        headers: this.getAuthHeaders(false),
      });
      if (!response.ok) {
        let detail = response.statusText;
        try {
          const json = await response.json();
          detail = json.detail || json.message || json.title || detail;
        } catch (_) {}
        throw new Error(`${response.status} ${detail}`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      this.setState({ message: `Downloaded ${name}` });
    });
  }

  async zipSelected() {
    const item = this.state.selected || this.state.file;
    if (!item) return;
    const currentName = item.name || item.path?.split('/').pop() || 'archive';
    const suggested = `${currentName.replace(/\.zip$/i, '')}-${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '').slice(0, 14)}.zip`;
    const name = prompt('ZIP filename to create next to the selected item. Leave blank for an automatic name:', suggested);
    if (name === null) return;

    await this.guard(async () => {
      const res = await this.api('/grav-commander/archive/zip', {
        method: 'POST',
        body: JSON.stringify({ root: this.state.root, path: item.path, name }),
      });
      this.setState({ message: `${res.message || 'ZIP created.'} ${res.name || ''}`.trim(), file: null, selected: null });
      await this.loadList();
    });
  }

  async extractSelected() {
    const item = this.state.selected || this.state.file;
    if (!item) return;
    const name = item.name || item.path?.split('/').pop() || '';
    if (!/\.zip$/i.test(name)) {
      this.setState({ error: 'Select a .zip archive first.' });
      return;
    }

    const defaultDest = this.parentPath(item.path || '') || this.state.path || '';
    const destPath = prompt('Extract to this folder/path under the current root. Blank means the ZIP\'s current folder:', defaultDest);
    if (destPath === null) return;
    const overwriteAnswer = prompt('Overwrite existing files? Type YES to overwrite. Anything else uses safe no-overwrite extraction:', 'no');
    if (overwriteAnswer === null) return;
    const overwrite = String(overwriteAnswer).trim().toUpperCase() === 'YES';

    const ok = await this.confirmModal({
      title: 'Extract ZIP archive?',
      message: `Extract ${name}${overwrite ? ' and overwrite existing files if needed' : ' without overwriting existing files'}?`,
      okText: 'Extract ZIP',
      danger: overwrite,
    });
    if (!ok) return;

    await this.guard(async () => {
      const res = await this.api('/grav-commander/archive/extract', {
        method: 'POST',
        body: JSON.stringify({ root: this.state.root, path: item.path, dest_path: destPath, overwrite }),
      });
      this.setState({ message: `${res.message || 'ZIP extracted.'} ${res.files || 0} files, ${res.dirs || 0} folders.`, file: null, selected: null });
      this.state.path = res.path || this.state.path;
      await this.loadList();
      await this.tryLoadBackups(false);
    });
  }

  parentPath(path) {
    const parts = String(path || '').split('/').filter(Boolean);
    parts.pop();
    return parts.join('/');
  }

  adminBasePath() {
    const path = window.location.pathname || '/admin';
    const markers = ['/plugin/grav-commander', '/plugins/grav-commander'];
    for (const marker of markers) {
      const idx = path.indexOf(marker);
      if (idx >= 0) return path.slice(0, idx) || '/admin';
    }
    const adminIdx = path.indexOf('/admin');
    return adminIdx >= 0 ? path.slice(0, adminIdx + '/admin'.length) : '/admin';
  }

  openPluginSettings() {
    window.location.href = `${this.adminBasePath()}/plugins/grav-commander`;
  }

  formatSize(size) {
    if (size === null || size === undefined) return '—';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = Number(size);
    let i = 0;
    while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; }
    return `${value.toFixed(i ? 1 : 0)} ${units[i]}`;
  }

  formatDate(ts) {
    if (!ts) return '—';
    return new Date(ts * 1000).toLocaleString();
  }

  backupDetailsText(backup) {
    const meta = backup?.meta || {};
    const lines = [
      `Name: ${backup?.name || 'Unknown'}`,
      `Note: ${meta.note || 'No note stored.'}`,
    ];

    const entries = [
      ['Scope', meta.scope],
      ['Reason', meta.reason],
      ['Profile', meta.profile],
      ['Profile label', meta.profile_label],
      ['Original root', meta.root],
      ['Original path', meta.path],
      ['Payload base', meta.payload_base],
      ['Is folder backup', meta.is_dir === undefined ? undefined : (meta.is_dir ? 'yes' : 'no')],
      ['Created', meta.created],
      ['Plugin', meta.plugin],
      ['Version', meta.version],
      ['Include paths', Array.isArray(meta.include_paths) ? meta.include_paths.join(', ') : undefined],
      ['Exclude prefixes', Array.isArray(meta.exclude_prefixes) ? meta.exclude_prefixes.join(', ') : undefined],
    ];

    if (meta.stats && typeof meta.stats === 'object') {
      entries.push(['Files', meta.stats.files]);
      entries.push(['Folders', meta.stats.dirs]);
      entries.push(['Bytes', meta.stats.bytes]);
      entries.push(['Skipped', meta.stats.skipped]);
    }

    entries.forEach(([label, value]) => {
      if (value !== undefined && value !== null && String(value) !== '') {
        lines.push(`${label}: ${value}`);
      }
    });

    return lines.join('\n');
  }

  iconFor(item) {
    if (item.type === 'dir') return '📁';
    if (item.archive || /\.zip$/i.test(item.name || '')) return '🗜️';
    if (item.editable) return '📝';
    if (item.viewable) return '👁️';
    return '📄';
  }

  backupStorageClass(status) {
    const backup = status?.backup;
    if (!backup) return '';
    if (!backup.backup_dir_writable) return 'gc-storage-bad';
    return backup.inside_site_root ? 'gc-storage-warning' : 'gc-storage-ok';
  }

  backupStorageHtml(status) {
    const backup = status?.backup;
    if (!backup) {
      return '<span class="gc-note">Storage status not loaded yet.</span>';
    }
    const path = this.escape(backup.path || 'Not configured');
    const absolute = this.escape(backup.absolute_path || 'Unknown absolute path');
    const suggested = this.escape(backup.suggested_outside_path || '');
    const writable = !!backup.backup_dir_writable;
    const inside = !!backup.inside_site_root;
    const state = !writable
      ? '<span class="gc-storage-state bad">⚠ Not writable</span>'
      : inside
        ? '<span class="gc-storage-state warn">⚠ Inside site root</span>'
        : '<span class="gc-storage-state ok">✓ Outside site root</span>';
    const warning = inside
      ? '<span class="gc-note warn">Move backups outside the public tree when possible.</span>'
      : '<span class="gc-note ok">This is the preferred setup.</span>';
    const suggestion = inside && suggested
      ? `<span class="gc-note good">Recommended: <code>${suggested}</code></span><button id="gc-use-suggested-path" class="gc-mini-action">Use suggested path</button>`
      : suggested
        ? `<span class="gc-note">Recommended pattern: <code>${suggested}</code></span>`
        : '';
    return `<div class="gc-storage-lines"><code>${path}</code>${state}${warning}<span class="gc-note">Resolved: <code>${absolute}</code></span>${suggestion}</div>`;
  }

  render() {
    const { roots, root, path, parent, items, selected, file, backups, busy, busyLabel, message, error, backupError, status, activeTab, backupProfile, backupNote, showProfileEditor, profileExpert, profileRows, profileDraft, profileDraftError, scheduleRows, scheduleDraftError, profileExpanded, scheduleExpanded, theme, modal, jarvisStatus, jarvisProvider, jarvisModels, jarvisModel, jarvisAction, jarvisCustomInstruction, jarvisProposal, jarvisBusy, jarvisMessage, jarvisError } = this.state;
    const currentRoot = roots.find(r => r.key === root);
    const profiles = status?.profiles || {};
    const profileKeys = Object.keys(profiles);
    const currentProfile = profiles[backupProfile] || profiles[profileKeys[0]] || null;
    const checks = status?.checks || [];
    const schedulerStatus = status?.scheduler || {};
    const schedulerJobs = schedulerStatus.managed_jobs || {};
    const schedulerJobCount = Object.keys(schedulerJobs).length;
    const actionItem = selected || file;
    const actionItemName = actionItem?.name || actionItem?.path?.split('/').pop() || '';
    const canZip = !!actionItem;
    const canExtract = !!(actionItem && actionItem.type !== 'dir' && (actionItem.extractable || actionItem.archive || /\.zip$/i.test(actionItemName)));
    const hasNotice = !!(message || error);
    const jarvisProviders = Array.isArray(jarvisStatus?.providers) ? jarvisStatus.providers : [];
    const jarvisActions = (Array.isArray(jarvisStatus?.actions) ? jarvisStatus.actions : [])
      .filter(action => file?.editable || action.mode !== 'proposal');
    const jarvisEligible = !!(jarvisStatus?.available && jarvisProvider && this.jarvisEligibleFile(file));

    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; font-family: inherit; color: var(--gc-text); }
        .gc-shell {
          --gc-card: #ffffff;
          --gc-card-soft: #f7f9fc;
          --gc-card-softer: #eef3fa;
          --gc-text: #172033;
          --gc-muted: #607089;
          --gc-border: #dfe6ef;
          --gc-border-soft: #edf1f6;
          --gc-button: #ffffff;
          --gc-button-hover: #f5f8fc;
          --gc-primary: #172033;
          --gc-primary-text: #ffffff;
          --gc-danger: #a21d2b;
          --gc-danger-border: #e7b8bf;
          --gc-success: #167044;
          --gc-shadow: 0 8px 24px rgba(15, 23, 42, .06);
          display:grid;
          gap:16px;
          padding:8px 16px 32px;
          color:var(--gc-text);
          color-scheme: light;
        }
        .gc-shell[data-theme="dark"] {
          --gc-card: #1f2128;
          --gc-card-soft: #242733;
          --gc-card-softer: #2b3040;
          --gc-text: #eef2f8;
          --gc-muted: #a3adbd;
          --gc-border: #383d4d;
          --gc-border-soft: #303545;
          --gc-button: #262a36;
          --gc-button-hover: #303647;
          --gc-primary: #a855f7;
          --gc-primary-text: #ffffff;
          --gc-danger: #ff8f9c;
          --gc-danger-border: #7f3341;
          --gc-success: #55d08d;
          --gc-shadow: none;
          color-scheme: dark;
        }
        .gc-card { background:var(--gc-card); border:1px solid var(--gc-border); border-radius:16px; box-shadow:var(--gc-shadow); overflow:hidden; }
        .gc-head { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:12px; padding:16px; border-bottom:1px solid var(--gc-border-soft); background:var(--gc-card-soft); }
        .gc-title { display:flex; flex-direction:column; gap:2px; }
        .gc-title h2 { margin:0; font-size:22px; line-height:1.15; color:var(--gc-text); }
        .gc-title p { margin:0; color:var(--gc-muted); font-size:13px; }
        .gc-tools { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
        .gc-tabs { display:flex; gap:22px; padding:0 16px; border-top:1px solid var(--gc-border-soft); border-bottom:1px solid var(--gc-border-soft); background:var(--gc-card); }
        .gc-tab { border:0; border-bottom:3px solid transparent; border-radius:0; padding:13px 0 11px; background:transparent; color:var(--gc-muted); }
        .gc-tab:hover { background:transparent; color:var(--gc-text); }
        .gc-tab.active { background:transparent; color:var(--gc-primary); border-color:var(--gc-primary); }
        .gc-busy-panel { display:none; }
        .gc-spinner { width:18px; height:18px; border:3px solid var(--gc-border); border-top-color:var(--gc-primary); border-radius:999px; animation:gc-spin .8s linear infinite; }
        @keyframes gc-spin { to { transform:rotate(360deg); } }
        select, input[type="text"] { border:1px solid var(--gc-border); border-radius:10px; padding:8px 10px; font:inherit; background:var(--gc-button); color:var(--gc-text); }
        input[type="text"] { min-width:280px; }
        .gc-note-input { min-width:340px; }
        .gc-section-body { padding:16px; display:grid; gap:14px; }
        .gc-mini-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:12px; }
        .gc-mini { background:var(--gc-card-soft); border:1px solid var(--gc-border-soft); border-radius:12px; padding:12px; }
        .gc-mini strong { display:block; color:var(--gc-text); margin-bottom:4px; }
        .gc-mini span { color:var(--gc-muted); font-size:13px; line-height:1.4; }
        .gc-storage { border-width:1px; }
        .gc-storage-ok { border-color:rgba(85, 208, 141, .45); background:rgba(85, 208, 141, .08); }
        .gc-storage-warning { border-color:rgba(245, 158, 11, .55); background:rgba(245, 158, 11, .08); }
        .gc-storage-bad { border-color:rgba(255, 143, 156, .55); background:rgba(255, 143, 156, .08); }
        .gc-storage-lines { display:grid; gap:5px; }
        .gc-storage-state { font-weight:700; font-size:13px; }
        .gc-storage-state.ok { color:var(--gc-success); }
        .gc-storage-state.warn { color:#f59e0b; }
        .gc-storage-state.bad { color:var(--gc-danger); }
        .gc-note { display:block; color:var(--gc-muted); font-size:12px; line-height:1.35; font-style:italic; }
        .gc-note.ok, .gc-note.good { color:var(--gc-success); }
        .gc-note.warn { color:#f59e0b; }
        .gc-mini-action { margin-top:4px; width:max-content; padding:6px 9px; font-size:12px; }
        .gc-checks { display:flex; gap:8px; flex-wrap:wrap; }
        .gc-check { border:1px solid var(--gc-border); background:var(--gc-button); border-radius:999px; padding:4px 9px; font-size:12px; color:var(--gc-muted); }
        .gc-check.ok { color:var(--gc-success); }
        .gc-check.bad { color:var(--gc-danger); }
        button, .gc-upload-label { border:1px solid var(--gc-border); border-radius:10px; padding:8px 11px; background:var(--gc-button); color:var(--gc-text); font:inherit; cursor:pointer; display:inline-flex; align-items:center; gap:6px; }
        button:hover, .gc-upload-label:hover { background:var(--gc-button-hover); }
        button.primary { background:var(--gc-primary); color:var(--gc-primary-text); border-color:var(--gc-primary); }
        button.danger { color:var(--gc-danger); border-color:var(--gc-danger-border); }
        button:disabled { opacity:.55; cursor:not-allowed; }
        .gc-status { padding:22px 16px 16px; display:flex; gap:10px; align-items:center; flex-wrap:wrap; border-top:1px solid var(--gc-border-soft); }
        .gc-msg { color:var(--gc-success); }
        .gc-err { color:var(--gc-danger); font-weight:600; }
        .gc-main { display:grid; grid-template-columns:minmax(420px, 1fr) minmax(420px, 1fr); gap:16px; }
        .gc-table-wrap { overflow:auto; max-height:520px; }
        table { width:100%; border-collapse:collapse; font-size:14px; color:var(--gc-text); }
        th { text-align:left; color:var(--gc-muted); font-weight:700; background:var(--gc-card-soft); position:sticky; top:0; z-index:1; }
        th, td { padding:10px 12px; border-bottom:1px solid var(--gc-border-soft); white-space:nowrap; }
        tr { cursor:pointer; }
        tr:hover { background:var(--gc-card-soft); }
        tr.selected { background:var(--gc-card-softer); }
        .gc-name { display:flex; gap:8px; align-items:center; font-weight:600; }
        .gc-panel { padding:16px; display:grid; gap:12px; }
        textarea { width:100%; min-height:420px; resize:vertical; border:1px solid var(--gc-border); border-radius:12px; padding:12px; font:13px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; box-sizing:border-box; background:var(--gc-button); color:var(--gc-text); }
        .gc-profile-editor { display:grid; gap:12px; background:var(--gc-card-soft); border:1px solid var(--gc-border-soft); border-radius:12px; padding:14px; }
        .gc-profile-editor h3 { margin:0; font-size:16px; color:var(--gc-text); }
        .gc-profile-editor p { margin:0; color:var(--gc-muted); font-size:13px; line-height:1.45; }
        .gc-profile-text { min-height:240px; }
        .gc-form-grid { display:grid; gap:12px; }
        .gc-repeat-toolbar { display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
        .gc-repeat-row { border:1px solid var(--gc-border); border-radius:14px; background:var(--gc-card); overflow:hidden; }
        .gc-repeat-head { width:100%; display:flex; align-items:center; justify-content:space-between; gap:12px; padding:12px 14px; border:0; border-radius:0; border-bottom:1px solid var(--gc-border-soft); background:var(--gc-card-soft); color:var(--gc-text); text-align:left; cursor:pointer; }
        .gc-repeat-head:hover { background:var(--gc-card-softer); }
        .gc-repeat-summary { display:flex; flex-wrap:wrap; gap:8px; align-items:center; min-width:0; }
        .gc-repeat-title { font-weight:700; }
        .gc-repeat-sub { color:var(--gc-muted); font-size:12px; }
        .gc-repeat-badges { display:flex; flex-wrap:wrap; gap:6px; align-items:center; justify-content:flex-end; }
        .gc-repeat-body { display:grid; gap:10px; padding:12px; }
        .gc-repeat-row.collapsed .gc-repeat-body { display:none; }
        .gc-profile-row, .gc-schedule-row { display:grid; gap:10px; }
        .gc-profile-row { grid-template-columns:160px 220px minmax(240px, 1fr) 160px; align-items:start; }
        .gc-schedule-row { grid-template-columns:135px 170px 150px 110px 170px minmax(200px, 1fr) 130px 92px; align-items:center; }
        .gc-code { display:block; font:12px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color:var(--gc-muted); background:var(--gc-card-soft); border:1px solid var(--gc-border-soft); border-radius:10px; padding:9px; white-space:pre-wrap; overflow:auto; }
        .gc-field { display:grid; gap:5px; }
        .gc-field label { color:var(--gc-muted); font-size:12px; font-weight:700; }
        .gc-field input, .gc-field select, .gc-field textarea { min-width:0; width:100%; box-sizing:border-box; }
        .gc-field textarea { min-height:70px; font-size:12px; }
        .gc-expert-note { color:var(--gc-muted); font-size:12px; line-height:1.4; }
        .gc-empty { color:var(--gc-muted); border:1px dashed var(--gc-border); border-radius:12px; padding:18px; background:var(--gc-card-soft); }
        .gc-backups { max-height:360px; overflow:auto; border:1px solid var(--gc-border-soft); border-radius:12px; }
        .gc-badge { display:inline-flex; align-items:center; border-radius:999px; background:var(--gc-card-softer); padding:2px 8px; font-size:12px; color:var(--gc-muted); }
        .gc-hidden { display:none; }
        .gc-footer-note { color:var(--gc-muted); font-size:13px; line-height:1.45; padding:0 16px 16px; }
        .gc-section-body .gc-footer-note { padding:0; }
        .gc-backup-warning { color:var(--gc-danger); font-size:13px; }
        .gc-muted-small { color:var(--gc-muted); font-size:12px; }
        .gc-modal-backdrop { position:fixed; inset:0; z-index:9999; display:grid; place-items:center; background:rgba(0,0,0,.52); backdrop-filter:blur(2px); }
        .gc-modal { width:min(520px, calc(100vw - 40px)); background:var(--gc-card); color:var(--gc-text); border:1px solid var(--gc-border); border-radius:16px; box-shadow:0 18px 60px rgba(0,0,0,.35); overflow:hidden; }
        .gc-modal-head { padding:16px 18px; background:var(--gc-card-soft); border-bottom:1px solid var(--gc-border-soft); }
        .gc-modal-head h3 { margin:0; font-size:18px; }
        .gc-modal-body { padding:18px; color:var(--gc-muted); line-height:1.45; white-space:pre-wrap; }
        .gc-modal-actions { display:flex; justify-content:flex-end; gap:10px; padding:14px 18px; border-top:1px solid var(--gc-border-soft); background:var(--gc-card-soft); }
        .gc-busy-overlay { position:fixed; inset:0; z-index:9998; display:grid; place-items:center; background:rgba(0,0,0,.36); backdrop-filter:blur(1px); }
        .gc-busy-box { display:flex; align-items:center; gap:12px; max-width:min(560px, calc(100vw - 40px)); padding:18px 20px; border:1px solid var(--gc-border); border-radius:16px; background:var(--gc-card); color:var(--gc-text); box-shadow:0 18px 60px rgba(0,0,0,.35); }
        .gc-jarvis { display:grid; gap:12px; padding:14px; border:1px solid var(--gc-border); border-radius:14px; background:var(--gc-card-soft); }
        .gc-jarvis-head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; flex-wrap:wrap; }
        .gc-jarvis-head h3 { margin:0; font-size:16px; }
        .gc-jarvis-head p { margin:3px 0 0; color:var(--gc-muted); font-size:12px; line-height:1.4; }
        .gc-jarvis-controls { display:grid; grid-template-columns:minmax(150px, 1fr) minmax(150px, 1fr) minmax(150px, 1fr) auto; gap:8px; align-items:end; }
        .gc-jarvis-controls label { display:grid; gap:4px; color:var(--gc-muted); font-size:12px; font-weight:700; }
        .gc-jarvis-controls select { width:100%; min-width:0; }
        .gc-jarvis-custom { min-height:76px; }
        .gc-jarvis-result { display:grid; gap:10px; border-top:1px solid var(--gc-border); padding-top:12px; }
        .gc-jarvis-result pre { margin:0; max-height:420px; overflow:auto; white-space:pre-wrap; overflow-wrap:anywhere; padding:12px; border:1px solid var(--gc-border); border-radius:10px; background:var(--gc-button); color:var(--gc-text); font:13px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
        .gc-jarvis-meta { display:flex; flex-wrap:wrap; gap:6px; color:var(--gc-muted); font-size:12px; }
        .gc-jarvis-status { min-height:20px; color:var(--gc-muted); font-size:12px; line-height:1.4; }
        .gc-jarvis-status.error { color:var(--gc-danger); font-weight:600; }
        .gc-jarvis-diff { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
        .gc-jarvis-diff section { display:grid; gap:5px; min-width:0; }
        .gc-jarvis-diff strong { font-size:12px; color:var(--gc-muted); }
        .gc-jarvis-diff pre { max-height:260px; }
        .gc-file-entry { border:0; background:transparent; box-shadow:none; padding:0; font:inherit; color:inherit; text-align:left; }
        button:focus-visible, select:focus-visible, input:focus-visible, textarea:focus-visible { outline:3px solid color-mix(in srgb, var(--gc-primary) 55%, transparent); outline-offset:2px; }
        @media (max-width: 1100px) { .gc-shell { padding-left:8px; padding-right:8px; } .gc-main { grid-template-columns:1fr; } input[type="text"] { min-width:180px; } .gc-profile-row, .gc-schedule-row, .gc-jarvis-controls, .gc-jarvis-diff { grid-template-columns:1fr; } .gc-repeat-head { align-items:flex-start; flex-direction:column; } }
      </style>

      <div class="gc-shell" data-theme="${this.escape(theme)}">
        <section class="gc-card">
          <div class="gc-head">
            <div class="gc-title">
              <h2>🗂️ Grav Commander</h2>
              <p>Norton Commander-ish file wrangling for Admin2, with backup parachutes.</p>
            </div>
            <div class="gc-tools">
              <button id="gc-settings" title="Open Grav Commander plugin settings">Settings</button>
            </div>
          </div>
          <div class="gc-tabs" role="tablist" aria-label="Grav Commander sections">
            <button id="gc-tab-files" class="gc-tab ${activeTab === 'files' ? 'active' : ''}" type="button">Files</button>
            <button id="gc-tab-backups" class="gc-tab ${activeTab === 'backups' ? 'active' : ''}" type="button">Backups</button>
          </div>
          ${hasNotice ? `<div class="gc-status">
            ${message ? `<span class="gc-msg">${this.escape(message)}</span>` : ''}
            ${error ? `<span class="gc-err">${this.escape(error)}</span>` : ''}
          </div>` : ''}
        </section>

        ${activeTab === 'files' ? `
        <section class="gc-card">
          <div class="gc-head">
            <div class="gc-title"><h2>File Browser</h2><p>Root: <strong>${this.escape(currentRoot?.label || root)}</strong> / ${this.escape(path || '')}</p></div>
            <div class="gc-tools">
              <select aria-label="File root" id="gc-root" ${roots.length ? '' : 'disabled'}>
                ${roots.length ? roots.map(r => `<option value="${this.escape(r.key)}" ${r.key === root ? 'selected' : ''}>${this.escape(r.label)}${r.writable ? '' : ' (read-only)'}</option>`).join('') : '<option>No roots loaded</option>'}
              </select>
              <input aria-label="Folder path" id="gc-path" type="text" value="${this.escape(path)}" placeholder="folder/path" />
              <button id="gc-go">Go</button>
              <button id="gc-up" ${path ? '' : 'disabled'}>Up</button>
              <button id="gc-refresh">Refresh</button>
            </div>
          </div>
        </section>

        <div class="gc-main">
          <section class="gc-card">
            <div class="gc-head">
              <div class="gc-title"><h2>Files</h2><p>${items.length} item${items.length === 1 ? '' : 's'}</p></div>
              <div class="gc-tools">
                <button id="gc-new-folder">New folder</button>
                <label class="gc-upload-label">Upload<input id="gc-upload" class="gc-hidden" type="file" /></label>
              </div>
            </div>
            <div class="gc-table-wrap">
              <table>
                <thead><tr><th>Name</th><th>Size</th><th>Modified</th><th>Mode</th></tr></thead>
                <tbody>
                  ${items.map((item, idx) => `
                    <tr data-idx="${idx}" class="${selected?.path === item.path ? 'selected' : ''}">
                      <td><button type="button" class="gc-file-entry gc-name" title="Space to select; Enter to open" aria-label="Select ${this.escape(item.name)}"><span aria-hidden="true">${this.iconFor(item)}</span>${this.escape(item.name)}</button></td>
                      <td>${this.escape(this.formatSize(item.size))}</td>
                      <td>${this.escape(this.formatDate(item.modified))}</td>
                      <td>${item.type === 'dir' ? 'folder' : (item.editable ? 'editable' : (item.viewable ? 'view/read-only' : 'binary/read-only'))}</td>
                    </tr>`).join('')}
                </tbody>
              </table>
            </div>
          </section>

          <section class="gc-card">
            <div class="gc-head">
              <div class="gc-title"><h2>Editor / Actions</h2><p>${file ? this.escape(file.path) : selected ? this.escape(selected.path) : 'Select a file or folder'}</p></div>
              <div class="gc-tools">
                ${this.isGravPageMarkdownPath((selected || file)?.path || '') ? '<button type="button" id="gc-open-grav-editor">Open in Grav Editor</button>' : ''}
                <button type="button" id="gc-open" ${((selected && selected.type !== 'dir') || file) ? '' : 'disabled'}>${(selected?.editable || file?.editable) ? 'Open/Edit Raw' : 'View'}</button>
                <button id="gc-download" ${((selected && selected.type !== 'dir') || file) ? '' : 'disabled'}>Download</button>
                <button id="gc-zip" ${canZip ? '' : 'disabled'}>Zip</button>
                <button id="gc-extract" ${canExtract ? '' : 'disabled'}>Extract ZIP</button>
                <button id="gc-rename" ${selected || file ? '' : 'disabled'}>Rename</button>
                <button id="gc-copy" ${selected || file ? '' : 'disabled'}>Copy</button>
                <button id="gc-move" ${selected || file ? '' : 'disabled'}>Move</button>
                <button id="gc-delete" class="danger" ${selected || file ? '' : 'disabled'}>Delete</button>
              </div>
            </div>
            <div class="gc-panel">
              ${file ? `
                ${this.isGravPageMarkdownPath(file.path) ? `<div class="gc-empty">This looks like a Grav page Markdown file. Use <button type="button" id="gc-open-grav-editor-inline">Open in Grav Editor</button> for the full page workflow, or continue here for raw Markdown editing.</div>` : ''}
                <textarea id="gc-editor" spellcheck="false" ${file.editable ? '' : 'readonly'}>${this.escape(file.content || '')}</textarea>
                <div class="gc-tools">
                  <button id="gc-save" class="primary" ${file.editable ? '' : 'disabled'}>${file.editable ? 'Save file' : 'Read-only preview'}</button>
                  <button id="gc-download">Download</button>
                  <button id="gc-zip">Zip</button>
                  ${/\.zip$/i.test(file.name || file.path || '') ? '<button id="gc-extract">Extract ZIP</button>' : ''}
                  <button id="gc-backup-file">Backup this file</button>
                </div>
                ${jarvisEligible ? `
                <section class="gc-jarvis" aria-label="Jarvis file assistant">
                  <div class="gc-jarvis-head">
                    <div><h3>✨ Jarvis</h3><p>Optional, provider-neutral help for this bounded file buffer. Jarvis never saves the file.</p></div>
                    <span class="gc-badge">${this.escape(jarvisStatus.state || 'available')}</span>
                  </div>
                  <div class="gc-jarvis-controls">
                    <label>Provider
                      <select id="gc-jarvis-provider" aria-label="Jarvis provider">
                        ${jarvisProviders.map(provider => `<option value="${this.escape(provider.id)}" ${provider.id === jarvisProvider ? 'selected' : ''}>${this.escape(provider.id)}</option>`).join('')}
                      </select>
                    </label>
                    <label>Model
                      <select id="gc-jarvis-model" aria-label="Jarvis model">
                        <option value="">Provider default</option>
                        ${jarvisModels.map(model => `<option value="${this.escape(model.id)}" ${model.id === jarvisModel ? 'selected' : ''}>${this.escape(model.label || model.id)}</option>`).join('')}
                      </select>
                    </label>
                    <label>Action
                      <select id="gc-jarvis-action" aria-label="Jarvis action">
                        ${jarvisActions.map(action => `<option value="${this.escape(action.id)}" ${action.id === jarvisAction ? 'selected' : ''}>${this.escape(action.label)}</option>`).join('')}
                      </select>
                    </label>
                    <div class="gc-tools"><button id="gc-jarvis-load-models" type="button">Load models</button><button id="gc-jarvis-validate" type="button">Check provider</button></div>
                  </div>
                  ${jarvisAction === 'custom' ? `<label class="gc-field"><span>Custom instruction</span><textarea id="gc-jarvis-custom" class="gc-jarvis-custom" maxlength="4000" aria-label="Custom Jarvis instruction" placeholder="Describe what Jarvis should do with this file…">${this.escape(jarvisCustomInstruction)}</textarea></label>` : ''}
                  <div class="gc-tools"><button id="gc-jarvis-run" class="primary" type="button" ${jarvisBusy ? 'disabled' : ''}>${jarvisBusy ? 'Working…' : 'Run Jarvis action'}</button></div>
                  ${jarvisMessage ? `<div class="gc-jarvis-status" role="status">${this.escape(jarvisMessage)}</div>` : ''}
                  ${jarvisError ? `<div class="gc-jarvis-status error" role="alert">${this.escape(jarvisError)}</div>` : ''}
                  ${jarvisProposal ? `
                    <div class="gc-jarvis-result">
                      <div class="gc-jarvis-meta">
                        <span class="gc-badge">${this.escape(jarvisProposal.provider_id || jarvisProvider)}</span>
                        <span class="gc-badge">${this.escape(jarvisProposal.model || 'provider default')}</span>
                        ${jarvisProposal.context?.truncated ? '<span class="gc-badge">truncated context</span>' : ''}
                        ${jarvisProposal.context?.chunked ? '<span class="gc-badge">bounded chunks</span>' : ''}
                        ${jarvisProposal.context?.redacted ? `<span class="gc-badge">${this.escape(jarvisProposal.context.redaction_count)} redaction(s)</span>` : ''}
                      </div>
                      ${jarvisProposal.mode === 'proposal' ? `<div class="gc-jarvis-diff"><section><strong>Current unsaved buffer</strong><pre>${this.escape(file.content || '')}</pre></section><section><strong>Proposed buffer</strong><pre>${this.escape(jarvisProposal.output || '')}</pre></section></div>` : `<pre>${this.escape(jarvisProposal.output || '')}</pre>`}
                      <div class="gc-jarvis-meta">${this.escape(this.jarvisUsageText(jarvisProposal))}</div>
                      <div class="gc-tools">
                        ${jarvisProposal.context?.accept_allowed && jarvisProposal.proposal_id ? '<button id="gc-jarvis-accept" class="primary" type="button">Apply to unsaved editor</button>' : ''}
                        <button id="gc-jarvis-copy" type="button">Copy result</button>
                        <button id="gc-jarvis-discard" type="button">Reject / dismiss</button>
                      </div>
                      ${jarvisProposal.mode === 'proposal' && !jarvisProposal.context?.accept_allowed ? '<div class="gc-footer-note">Apply is unavailable for read-only, truncated, redacted, or oversized proposals. Copy remains available.</div>' : ''}
                    </div>` : ''}
                </section>` : ''}
                ${file.editable ? '' : '<div class="gc-footer-note">This file is viewable but not editable. Add its extension to editable_extensions, confirm the root is writable, and make sure the file itself is writable if you really want to edit it.</div>'}` : selected ? `
                <div class="gc-empty">
                  <strong>${this.escape(selected.name)}</strong><br>
                  ${selected.type === 'dir' ? 'Folder selected. Double-click it or press Enter in the file list to open it.' : (selected.editable ? 'This file is editable. Double-click it or use Open/Edit above.' : (selected.viewable ? 'This file can be viewed read-only. Use View above.' : 'This file is treated as binary/read-only. Use Download if you need a local copy.'))}
                </div>
                <div class="gc-tools">
                  ${selected.type !== 'dir' ? `<button type="button" id="gc-open">${selected.editable ? 'Open/Edit' : 'View'}</button><button id="gc-download">Download</button>` : ''}
                  <button id="gc-zip">Zip selected item</button>
                  ${selected.type !== 'dir' && (selected.extractable || selected.archive || /\.zip$/i.test(selected.name || '')) ? '<button id="gc-extract">Extract ZIP</button>' : ''}
                  <button id="gc-backup-file">Backup selected item</button>
                </div>` : `
                <div class="gc-empty">Pick an editable text-ish file to open it here. PHP and executable-style files are blocked by default, because dragons live there.</div>`}
            </div>
          </section>
        </div>
        ` : ''}

        ${activeTab === 'backups' ? `
        <section class="gc-card">
          <div class="gc-head">
            <div class="gc-title"><h2>Backup Center</h2><p>Grav-native backup tools: profiles, manifests, safety backups, and restore guardrails.</p></div>
            <div class="gc-tools">
              <select id="gc-profile" title="Backup profile">
                ${profileKeys.length ? profileKeys.map(key => `<option value="${this.escape(key)}" ${key === backupProfile ? 'selected' : ''}>${this.escape(profiles[key].label || key)}</option>`).join('') : '<option value="full_site">Full site</option>'}
              </select>
              <input id="gc-backup-note" class="gc-note-input" type="text" value="${this.escape(backupNote)}" placeholder="optional backup note" />
              <button id="gc-edit-profiles">${showProfileEditor ? 'Hide profiles' : 'Edit profiles'}</button>
              <button id="gc-add-schedule">Add schedule</button>
              <button id="gc-site-backup" class="primary">Create backup</button>
              <button id="gc-refresh-backups">Refresh</button>
            </div>
          </div>
          <div class="gc-section-body">
            <div class="gc-mini-grid">
              <div class="gc-mini"><strong>${this.escape(currentProfile?.label || 'Backup profile')}</strong><span>${this.escape(currentProfile?.description || 'Select a profile to control what gets included.')}</span></div>
              <div class="gc-mini"><strong>Includes</strong><span>${this.escape((currentProfile?.include_paths || status?.backup?.default_include_paths || []).join(', ') || 'Not available')}</span></div>
              <div class="gc-mini"><strong>Excludes</strong><span>${this.escape((status?.backup?.default_exclude_prefixes || []).slice(0, 8).join(', ') || 'Backup folder, cache, logs, tmp')}</span></div>
              <div class="gc-mini gc-storage ${this.backupStorageClass(status)}"><strong>Backup storage</strong>${this.backupStorageHtml(status)}</div>
            </div>
            ${checks.length ? `<div class="gc-checks">${checks.map(c => `<span class="gc-check ${c.ok ? 'ok' : 'bad'}" title="${this.escape(c.message || '')}">${c.ok ? '✓' : '⚠'} ${this.escape(c.label)}</span>`).join('')}</div>` : ''}
            ${backupError ? `<div class="gc-backup-warning">Backup tools reported: ${this.escape(backupError)}</div>` : ''}
            ${showProfileEditor ? `
              <div class="gc-profile-editor">
                <h3>Backup profiles</h3>
                <p>Profiles are saved into <code>user/config/plugins/grav-commander.yaml</code>. Use relative paths from the Grav root. Use <code>.</code> only when you mean the whole site.</p>
                ${profileDraftError ? `<div class="gc-err">${this.escape(profileDraftError)}</div>` : ''}
                <div class="gc-tools">
                  <button id="gc-add-profile">Add profile</button>
                  <button id="gc-toggle-profile-expert">${profileExpert ? 'Use friendly editor' : 'Expert JSON'}</button>
                  <button id="gc-save-profiles" class="primary">Save profiles</button>
                  <button id="gc-cancel-profiles">Cancel</button>
                </div>
                ${profileExpert ? `
                  <p class="gc-expert-note">Expert mode is documented for people who prefer raw config. Everyone else gets fields and buttons, because life is already full of YAML goblins.</p>
                  <textarea id="gc-profile-draft" class="gc-profile-text" spellcheck="false">${this.escape(profileDraft)}</textarea>` : `
                  <div class="gc-repeat-toolbar"><button id="gc-expand-profiles">Expand all</button><button id="gc-collapse-profiles">Collapse all</button></div>
                  <div class="gc-form-grid">
                    ${profileRows.map((row, idx) => {
                      const expanded = this.profileIsExpanded(idx);
                      const includesSummary = this.lines(row.include_paths).join(', ') || 'No include paths yet';
                      return `
                      <div class="gc-repeat-row ${expanded ? '' : 'collapsed'}" data-profile-row data-profile-index="${idx}">
                        <button type="button" class="gc-repeat-head" data-profile-toggle="${idx}">
                          <span class="gc-repeat-summary"><span>${expanded ? '▾' : '▸'}</span><span class="gc-repeat-title">${this.escape(row.label || row.key || 'Untitled profile')}</span><span class="gc-repeat-sub">${this.escape(row.key || 'new_profile')}</span></span>
                          <span class="gc-repeat-badges"><span class="gc-badge">${this.escape(includesSummary)}</span></span>
                        </button>
                        <div class="gc-repeat-body">
                          <div class="gc-profile-row">
                            <div class="gc-field"><label>Key</label><input type="text" data-profile-key value="${this.escape(row.key)}" placeholder="pages_only" /></div>
                            <div class="gc-field"><label>Label</label><input type="text" data-profile-label value="${this.escape(row.label)}" placeholder="Pages only" /></div>
                            <div class="gc-field"><label>Description</label><input type="text" data-profile-description value="${this.escape(row.description)}" placeholder="What this profile backs up" /></div>
                            <div class="gc-field"><label>Actions</label><button class="danger" data-profile-delete="${idx}">Delete</button></div>
                            <div class="gc-field" style="grid-column:1 / span 2"><label>Include paths, one per line</label><textarea data-profile-includes spellcheck="false">${this.escape(row.include_paths)}</textarea></div>
                            <div class="gc-field" style="grid-column:3 / span 2"><label>Exclude prefixes, one per line</label><textarea data-profile-excludes spellcheck="false">${this.escape(row.exclude_prefixes)}</textarea></div>
                          </div>
                        </div>
                      </div>`;
                    }).join('') || `<div class="gc-empty">No profiles yet. Add one to get started.</div>`}
                  </div>`}
              </div>` : ''}
            <div class="gc-profile-editor">
              <h3>Scheduled backups</h3>
              <p>Schedules are profile-driven. Saving here writes Grav Commander config and mirrors managed jobs into <code>user/config/scheduler.yaml</code>. The server still needs cron to run <code>bin/grav scheduler</code>.</p>
              <div class="gc-mini-grid">
                <div class="gc-mini"><strong>Scheduler file</strong><span>${this.escape(schedulerStatus.file || 'user/config/scheduler.yaml')} ${schedulerStatus.exists ? 'exists' : 'will be created when schedules are saved'}</span></div>
                <div class="gc-mini"><strong>Managed jobs</strong><span>${schedulerJobCount} Grav Commander job${schedulerJobCount === 1 ? '' : 's'} mirrored.</span></div>
                <div class="gc-mini"><strong>System cron</strong><span>${this.escape(schedulerStatus.cron_hint || 'Server cron must run bin/grav scheduler for schedules to fire.')}</span></div>
              </div>
              ${scheduleDraftError ? `<div class="gc-err">${this.escape(scheduleDraftError)}</div>` : ''}
              <div class="gc-tools">
                <button id="gc-add-schedule-2">Add schedule</button>
                <button id="gc-save-schedules" class="primary">Save schedules</button>
              </div>
              <div class="gc-repeat-toolbar"><button id="gc-expand-schedules">Expand all</button><button id="gc-collapse-schedules">Collapse all</button></div>
              <div class="gc-form-grid">
                ${scheduleRows.map((row, idx) => {
                  const expanded = this.scheduleIsExpanded(idx);
                  const profileLabel = profiles[row.profile]?.label || row.profile || 'Full site';
                  const jobPreview = this.scheduleManagedJobPreview(row);
                  return `
                  <div class="gc-repeat-row ${expanded ? '' : 'collapsed'}" data-schedule-row data-schedule-index="${idx}">
                    <button type="button" class="gc-repeat-head" data-schedule-toggle="${idx}">
                      <span class="gc-repeat-summary"><span>${expanded ? '▾' : '▸'}</span><span class="gc-repeat-title">${this.escape(row.label || row.key || 'Scheduled backup')}</span><span class="gc-repeat-sub">${this.escape(row.key || 'new_schedule')}</span></span>
                      <span class="gc-repeat-badges"><span class="gc-badge">${this.escape(profileLabel)}</span><span class="gc-badge">${this.escape(row.at || '0 3 * * *')}</span><span class="gc-badge">${row.enabled ? 'Enabled' : 'Disabled'}</span></span>
                    </button>
                    <div class="gc-repeat-body">
                      <div class="gc-schedule-row">
                        <div class="gc-field"><label>Key</label><input type="text" data-schedule-key value="${this.escape(row.key)}" placeholder="daily_site" /></div>
                        <div class="gc-field"><label>Label</label><input type="text" data-schedule-label value="${this.escape(row.label)}" placeholder="Daily site backup" /></div>
                        <div class="gc-field"><label>Profile</label><select data-schedule-profile>${profileKeys.map(key => `<option value="${this.escape(key)}" ${key === row.profile ? 'selected' : ''}>${this.escape(profiles[key].label || key)}</option>`).join('')}</select></div>
                        <div class="gc-field"><label>Enabled</label><input type="checkbox" data-schedule-enabled ${row.enabled ? 'checked' : ''} /></div>
                        <div class="gc-field"><label>Cron</label><input type="text" data-schedule-at value="${this.escape(row.at)}" placeholder="0 3 * * *" /></div>
                        <div class="gc-field"><label>Note</label><input type="text" data-schedule-note value="${this.escape(row.note)}" placeholder="Nightly content backup" /></div>
                        <div class="gc-field"><label>Preset</label><select data-schedule-preset><option value="">Custom</option><option value="hourly">Hourly</option><option value="daily">Daily 3 AM</option><option value="weekdays">Weekdays 3 AM</option><option value="weekly">Weekly Monday</option><option value="monthly">Monthly 1st</option></select></div>
                        <div class="gc-field"><label>Actions</label><div class="gc-tools"><button data-schedule-run="${this.escape(row.key)}">Run now</button><button class="danger" data-schedule-delete="${idx}">Delete</button></div></div>
                        <div class="gc-field" style="grid-column:1 / -1"><label>Output log</label><input type="text" data-schedule-output value="${this.escape(row.output || this.scheduleOutputForKey(row.key))}" placeholder="logs/grav-commander-backup-daily_site.out" /></div>
                        <div class="gc-field" style="grid-column:1 / -1"><label>Generated Grav scheduler job preview</label><code class="gc-code">${this.escape(jobPreview)}</code></div>
                      </div>
                    </div>
                  </div>`;
                }).join('') || `<div class="gc-empty">No schedules yet. Add one, choose a profile, then save schedules.</div>`}
              </div>
              <div class="gc-footer-note">Cron examples: hourly <code>0 * * * *</code>, daily at 3:00 AM <code>0 3 * * *</code>, weekly Monday at 3:00 AM <code>0 3 * * 1</code>.</div>
            </div>
            <div class="gc-backups">
              <table>
                <thead><tr><th>Backup</th><th>Scope</th><th>Profile / Original</th><th>Stats</th><th>Size</th><th>Created</th><th>Actions</th></tr></thead>
                <tbody>
                  ${backups.map(b => {
                    const meta = b.meta || {};
                    const scope = meta.scope || 'unknown';
                    const stats = meta.stats || {};
                    const original = scope === 'site' ? (meta.profile_label || meta.profile || 'Full site') : `${meta.root || ''}:${meta.path || ''}`;
                    const statLabel = scope === 'site' ? `${stats.files || 0} files / ${this.formatSize(stats.bytes || 0)}` : (meta.is_dir ? 'folder' : 'file');
                    return `<tr>
                      <td>${this.escape(b.name)}${meta.note ? `<br><span class="gc-badge">${this.escape(meta.note)}</span>` : ''}</td>
                      <td><span class="gc-badge">${this.escape(scope)}</span></td>
                      <td>${this.escape(original)}</td>
                      <td>${this.escape(statLabel)}</td>
                      <td>${this.escape(this.formatSize(b.size))}</td>
                      <td>${this.escape(meta.created || this.formatDate(b.modified))}</td>
                      <td>
                        <button data-backup-info="${this.escape(b.name)}" title="Show backup notes and metadata">Info</button>
                        <button data-backup-download="${this.escape(b.name)}">Download</button>
                        <button data-backup-restore="${this.escape(b.name)}" data-scope="${this.escape(scope)}">Restore</button>
                        <button class="danger" data-backup-delete="${this.escape(b.name)}">Delete</button>
                      </td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table>
            </div>
            <div class="gc-footer-note">Full-site restore is disabled by default in plugin configuration. That is intentional: restore buttons should not be trebuchets.</div>
          </div>
        </section>
        ` : ''}
        ${busy ? `<div class="gc-busy-overlay"><div class="gc-busy-box"><span class="gc-spinner"></span><strong>${this.escape(busyLabel || 'Working…')}</strong></div></div>` : ''}
        ${modal ? `<div class="gc-modal-backdrop" role="dialog" aria-modal="true">
          <div class="gc-modal">
            <div class="gc-modal-head"><h3>${this.escape(modal.title)}</h3></div>
            <div class="gc-modal-body">${this.escape(modal.message)}</div>
            <div class="gc-modal-actions">
              ${modal.cancelText === '' ? '' : `<button id="gc-modal-cancel">${this.escape(modal.cancelText || 'Cancel')}</button>`}
              <button id="gc-modal-ok" class="${modal.danger ? 'danger' : 'primary'}">${this.escape(modal.okText || 'OK')}</button>
            </div>
          </div>
        </div>` : ''}
      </div>
    `;

    this.bindEvents(parent);
  }

  bindEvents(parent) {
    this.shadowRoot.querySelector('#gc-modal-cancel')?.addEventListener('click', () => this.closeModal(false));
    this.shadowRoot.querySelector('#gc-modal-ok')?.addEventListener('click', () => this.closeModal(true));

    const rootSelect = this.shadowRoot.querySelector('#gc-root');
    rootSelect?.addEventListener('change', e => {
      this.setState({ root: e.target.value, path: '' });
      this.guard(() => this.loadList());
    });
    this.shadowRoot.querySelector('#gc-go')?.addEventListener('click', () => {
      const nextPath = this.shadowRoot.querySelector('#gc-path')?.value || '';
      this.setState({ path: nextPath });
      this.guard(() => this.loadList());
    });
    this.shadowRoot.querySelector('#gc-path')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') this.shadowRoot.querySelector('#gc-go')?.click();
    });
    this.shadowRoot.querySelector('#gc-up')?.addEventListener('click', () => this.openDir(parent || ''));
    this.shadowRoot.querySelector('#gc-refresh')?.addEventListener('click', () => this.guard(() => this.loadList()));
    this.shadowRoot.querySelector('#gc-settings')?.addEventListener('click', () => this.openPluginSettings());
    this.shadowRoot.querySelector('#gc-use-suggested-path')?.addEventListener('click', () => this.useSuggestedBackupPath());
    this.shadowRoot.querySelector('#gc-tab-files')?.addEventListener('click', () => this.setState({ activeTab: 'files' }));
    this.shadowRoot.querySelector('#gc-tab-backups')?.addEventListener('click', () => this.setState({ activeTab: 'backups' }));
    this.shadowRoot.querySelector('#gc-new-folder')?.addEventListener('click', () => this.makeFolder());
    this.shadowRoot.querySelector('#gc-upload')?.addEventListener('change', e => this.uploadFile(e.target.files?.[0]));

    this.shadowRoot.querySelectorAll('tr[data-idx]').forEach(row => {
      row.addEventListener('click', () => {
        const item = this.state.items[Number(row.dataset.idx)];
        this.setState({ selected: item, file: null });
        this.shadowRoot.querySelector(`tr[data-idx="${Number(row.dataset.idx)}"] .gc-file-entry`)?.focus();
      });
      row.addEventListener('keydown', event => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        const item = this.state.items[Number(row.dataset.idx)];
        if (item.type === 'dir') this.openDir(item.path);
        else this.openFile(item);
      });
      row.addEventListener('dblclick', () => {
        const item = this.state.items[Number(row.dataset.idx)];
        if (item.type === 'dir') this.openDir(item.path);
        else this.openFile(item);
      });
    });

    this.shadowRoot.querySelectorAll('#gc-open-grav-editor, #gc-open-grav-editor-inline').forEach(btn => btn.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      this.openGravPageEditor((this.state.selected || this.state.file)?.path || '');
    }));
    this.shadowRoot.querySelectorAll('#gc-open').forEach(btn => btn.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      this.openSelected();
    }));
    this.shadowRoot.querySelectorAll('#gc-download').forEach(btn => btn.addEventListener('click', () => this.downloadSelected()));
    this.shadowRoot.querySelectorAll('#gc-zip').forEach(btn => btn.addEventListener('click', () => this.zipSelected()));
    this.shadowRoot.querySelectorAll('#gc-extract').forEach(btn => btn.addEventListener('click', () => this.extractSelected()));
    this.shadowRoot.querySelector('#gc-save')?.addEventListener('click', () => this.saveFile());
    this.shadowRoot.querySelector('#gc-editor')?.addEventListener('input', event => {
      // Theme/notice rerenders must retain the unsaved buffer, never save it.
      if (this.state.file) this.state.file = { ...this.state.file, content: event.target.value };
    });
    this.shadowRoot.querySelector('#gc-jarvis-provider')?.addEventListener('change', event => {
      if (this.state.file) this.state.file = { ...this.state.file, content: this.editorContent() };
      this.setState({ jarvisProvider: event.target.value, jarvisModels: [], jarvisModel: '', jarvisProposal: null, jarvisMessage: '', jarvisError: '' });
    });
    this.shadowRoot.querySelector('#gc-jarvis-model')?.addEventListener('change', event => {
      if (this.state.file) this.state.file = { ...this.state.file, content: this.editorContent() };
      this.setState({ jarvisModel: event.target.value, jarvisProposal: null, jarvisMessage: '', jarvisError: '' });
    });
    this.shadowRoot.querySelector('#gc-jarvis-action')?.addEventListener('change', event => {
      if (this.state.file) this.state.file = { ...this.state.file, content: this.editorContent() };
      this.setState({ jarvisAction: event.target.value, jarvisProposal: null, jarvisMessage: '', jarvisError: '' });
    });
    this.shadowRoot.querySelector('#gc-jarvis-custom')?.addEventListener('input', event => { this.state.jarvisCustomInstruction = event.target.value; });
    this.shadowRoot.querySelector('#gc-jarvis-load-models')?.addEventListener('click', () => this.loadJarvisModels());
    this.shadowRoot.querySelector('#gc-jarvis-validate')?.addEventListener('click', () => this.validateJarvisProvider());
    this.shadowRoot.querySelector('#gc-jarvis-run')?.addEventListener('click', () => this.runJarvisAction());
    this.shadowRoot.querySelector('#gc-jarvis-accept')?.addEventListener('click', () => this.acceptJarvisProposal());
    this.shadowRoot.querySelector('#gc-jarvis-copy')?.addEventListener('click', () => this.copyJarvisResult());
    this.shadowRoot.querySelector('#gc-jarvis-discard')?.addEventListener('click', () => this.discardJarvisProposal());
    this.shadowRoot.querySelector('#gc-rename')?.addEventListener('click', () => this.renameSelected());
    this.shadowRoot.querySelector('#gc-copy')?.addEventListener('click', () => this.copyOrMoveSelected('copy'));
    this.shadowRoot.querySelector('#gc-move')?.addEventListener('click', () => this.copyOrMoveSelected('move'));
    this.shadowRoot.querySelector('#gc-delete')?.addEventListener('click', () => this.deleteSelected());
    this.shadowRoot.querySelector('#gc-backup-file')?.addEventListener('click', () => this.backupSelected());
    this.shadowRoot.querySelector('#gc-profile')?.addEventListener('change', e => this.setState({ backupProfile: e.target.value }));
    this.shadowRoot.querySelector('#gc-backup-note')?.addEventListener('input', e => { this.state.backupNote = e.target.value; });
    this.shadowRoot.querySelector('#gc-edit-profiles')?.addEventListener('click', () => this.toggleProfileEditor());
    this.shadowRoot.querySelector('#gc-add-profile')?.addEventListener('click', () => this.addProfileRow());
    this.shadowRoot.querySelector('#gc-expand-profiles')?.addEventListener('click', () => this.setAllProfileRows(true));
    this.shadowRoot.querySelector('#gc-collapse-profiles')?.addEventListener('click', () => this.setAllProfileRows(false));
    this.shadowRoot.querySelectorAll('[data-profile-toggle]').forEach(btn => {
      btn.addEventListener('click', () => this.toggleProfileRow(Number(btn.dataset.profileToggle)));
    });
    this.shadowRoot.querySelector('#gc-toggle-profile-expert')?.addEventListener('click', () => this.toggleProfileExpert());
    this.shadowRoot.querySelector('#gc-save-profiles')?.addEventListener('click', () => this.saveProfiles());
    this.shadowRoot.querySelector('#gc-cancel-profiles')?.addEventListener('click', () => this.setState({ showProfileEditor: false, profileDraftError: '' }));
    this.shadowRoot.querySelector('#gc-profile-draft')?.addEventListener('input', e => { this.state.profileDraft = e.target.value; });
    this.shadowRoot.querySelectorAll('[data-profile-delete]').forEach(btn => {
      btn.addEventListener('click', () => this.deleteProfileRow(Number(btn.dataset.profileDelete)));
    });
    this.shadowRoot.querySelector('#gc-add-schedule')?.addEventListener('click', () => this.addScheduleRow());
    this.shadowRoot.querySelector('#gc-expand-schedules')?.addEventListener('click', () => this.setAllScheduleRows(true));
    this.shadowRoot.querySelector('#gc-collapse-schedules')?.addEventListener('click', () => this.setAllScheduleRows(false));
    this.shadowRoot.querySelectorAll('[data-schedule-toggle]').forEach(btn => {
      btn.addEventListener('click', () => this.toggleScheduleRow(Number(btn.dataset.scheduleToggle)));
    });
    this.shadowRoot.querySelector('#gc-add-schedule-2')?.addEventListener('click', () => this.addScheduleRow());
    this.shadowRoot.querySelector('#gc-save-schedules')?.addEventListener('click', () => this.saveSchedules());
    this.shadowRoot.querySelectorAll('[data-schedule-delete]').forEach(btn => {
      btn.addEventListener('click', () => this.deleteScheduleRow(Number(btn.dataset.scheduleDelete)));
    });
    this.shadowRoot.querySelectorAll('[data-schedule-run]').forEach(btn => {
      btn.addEventListener('click', () => {
        const row = btn.closest('[data-schedule-row]');
        const key = row?.querySelector('[data-schedule-key]')?.value.trim() || btn.dataset.scheduleRun;
        this.runScheduleNow(key);
      });
    });
    this.shadowRoot.querySelectorAll('[data-schedule-preset]').forEach(select => {
      select.addEventListener('change', () => {
        const value = this.schedulePreset(select.value);
        if (value) select.closest('[data-schedule-row]')?.querySelector('[data-schedule-at]')?.setAttribute('value', value);
        const input = select.closest('[data-schedule-row]')?.querySelector('[data-schedule-at]');
        if (input && value) input.value = value;
      });
    });
    this.shadowRoot.querySelector('#gc-site-backup')?.addEventListener('click', () => this.backupSite());
    this.shadowRoot.querySelector('#gc-refresh-backups')?.addEventListener('click', () => this.guard(() => this.loadBackups(true)));

    this.shadowRoot.querySelectorAll('[data-backup-info]').forEach(btn => {
      btn.addEventListener('click', () => this.showBackupInfo(btn.dataset.backupInfo));
    });
    this.shadowRoot.querySelectorAll('[data-backup-download]').forEach(btn => {
      btn.addEventListener('click', () => this.downloadBackup(btn.dataset.backupDownload));
    });
    this.shadowRoot.querySelectorAll('[data-backup-restore]').forEach(btn => {
      btn.addEventListener('click', () => this.restoreBackup(btn.dataset.backupRestore, btn.dataset.scope));
    });
    this.shadowRoot.querySelectorAll('[data-backup-delete]').forEach(btn => {
      btn.addEventListener('click', () => this.deleteBackup(btn.dataset.backupDelete));
    });
  }

  escape(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }
}

if (!customElements.get(TAG)) {
  customElements.define(TAG, GravCommanderPage);
}
