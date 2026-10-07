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
      selection: [], anchor: null, showHidden: false, filter: '', sort: 'name', reverse: false, history: [], historyIndex: -1,
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
      jarvisModelsLoading: false,
      jarvisDefaults: null,
      jarvisModel: '',
      jarvisAction: 'explain',
      jarvisCustomInstruction: '',
      jarvisProposal: null,
      jarvisBusy: false,
      jarvisMessage: '',
      jarvisError: '',
    };
    this.activePane = 'left';
    this.panes = { right: Object.fromEntries(this.paneKeys().map(key => [key, this.state[key]])) };
  }

  connectedCallback() {
    this._providerMessage = event => this.providerMessage(event);
    window.addEventListener('message', this._providerMessage);
    this._beforeUnload = event => { if (this.isDirty() || this.state.busy) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', this._beforeUnload);
    this._routeGuard = async event => {
      const link = event.target.closest?.('a[href]');
      if (this.isDirty() && link && link.href !== window.location.href) {
        event.preventDefault(); event.stopImmediatePropagation();
        if (await this.discardEditor()) link.click();
      }
    };
    document.addEventListener('click', this._routeGuard, true);
    this._modalFocusGuard = () => {
      if (this.state.modal && !this.shadowRoot.querySelector('.gc-modal')?.contains(this.shadowRoot.activeElement)) this.shadowRoot.querySelector('#gc-modal-cancel, #gc-modal-ok')?.focus({ preventScroll: true });
    };
    document.addEventListener('focusin', this._modalFocusGuard);
    this.setupThemeSync();
    this.render();
    this.loadRoots();
  }

  disconnectedCallback() {
    this.destroyProvider();
    window.removeEventListener('message', this._providerMessage);
    window.removeEventListener('beforeunload', this._beforeUnload);
    document.removeEventListener('focusin', this._modalFocusGuard);
    document.removeEventListener('click', this._routeGuard, true);
    if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
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
    const focused = this.shadowRoot.activeElement;
    const focusId = focused?.id;
    const selection = typeof focused?.selectionStart === 'number' ? [focused.selectionStart, focused.selectionEnd, focused.scrollTop] : null;
    const shouldAutoClearNotice = (
      (Object.prototype.hasOwnProperty.call(patch, 'message') && patch.message)
      || (Object.prototype.hasOwnProperty.call(patch, 'error') && patch.error)
      || (Object.prototype.hasOwnProperty.call(patch, 'backupError') && patch.backupError)
    );

    this.state = { ...this.state, ...patch };
    this.render();
    if (focusId && !this.state.modal) {
      const next = this.shadowRoot.querySelector('#' + focusId); next?.focus({ preventScroll: true });
      if (selection && next?.setSelectionRange) { next.setSelectionRange(selection[0], selection[1]); next.scrollTop = selection[2]; }
    }

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
    if (this.state.busy) return;
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

  confirmModal({ title = 'Confirm action', message = '', okText = 'OK', cancelText = 'Cancel', danger = false, fields = null } = {}) {
    if (this.state.modal) return Promise.resolve(false);
    const active = this.shadowRoot.activeElement;
    this.modalOutsideFocus = document.activeElement !== this ? document.activeElement : null;
    this.modalFocus = active?.id ? '#' + CSS.escape(active.id) : active?.closest('[data-entry]') ? `[data-pane="${this.activePane}"] [data-entry="${CSS.escape(active.closest('[data-entry]').dataset.entry)}"] button` : `[data-pane="${this.activePane}"] .gc-table-wrap`;
    return new Promise(resolve => this.setState({ modal: { title, message, okText, cancelText, danger, fields, resolve } }));
  }

  async promptModal(title, value = '') {
    const result = await this.confirmModal({ title, okText: 'Continue', fields: [{ name: 'value', label: title, value, required: true }] });
    return result ? result.value : null;
  }

  closeModal(value) {
    const modal = this.state.modal;
    if (value && modal?.fields) {
      const form = this.shadowRoot.querySelector('#gc-modal-form');
      if (!form.reportValidity()) return;
      value = Object.fromEntries(modal.fields.map(field => {
        const input = form.elements.namedItem(field.name);
        return [field.name, field.type === 'checkbox' ? input.checked : input.value];
      }));
    }
    this.setState({ modal: null });
    const focus = this.modalOutsideFocus?.isConnected ? this.modalOutsideFocus : this.shadowRoot.querySelector(this.modalFocus || '#gc-tab-files');
    focus?.focus({ preventScroll: true });
    if (typeof modal?.resolve === 'function') modal.resolve(value);
  }

  modalFieldsHtml(fields) {
    return (fields || []).map(field => {
      const e = value => this.escape(value);
      const attrs = `id="gc-modal-${e(field.name)}" name="${e(field.name)}" ${field.required ? 'required' : ''}`;
      const control = field.type === 'select' ? `<select ${attrs}>${field.options.map(([value, label]) => `<option value="${e(value)}" ${field.value === value ? 'selected' : ''}>${e(label)}</option>`).join('')}</select>` : field.type === 'checkbox' ? `<input type="checkbox" ${attrs} ${field.value ? 'checked' : ''}>` : `<input type="text" ${attrs} value="${e(field.value || '')}">`;
      return `<label class="gc-modal-field" for="gc-modal-${e(field.name)}"><span>${e(field.label)}</span>${control}</label>`;
    }).join('');
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
      const safeguard = status?.integrations?.site_safeguard;
      if (safeguard?.installed && safeguard.enabled) {
        safeguard.available = await this.api('/site-safeguard/status').then(() => true).catch(() => false);
        this.safeguardAvailable = safeguard.available;
      }
      const vault = status?.integrations?.file_vault;
      this.fileVaultStatus = vault?.installed && vault.enabled ? await this.api('/file-vault/status').catch(() => null) : null;
      this.preferenceKey = `gravCommander.hidden.${status?.preference_key || 'session'}`;
      let hidden = {};
      try { hidden = JSON.parse(localStorage.getItem(this.preferenceKey) || '{}'); } catch {}
      this.state.showHidden = hidden.left === true; this.panes.right.showHidden = hidden.right === true;
      const profiles = status?.profiles || {};
      const schedules = status?.schedules || {};
      const profileKeys = Object.keys(profiles);
      const first = rootList.find(r => r.key === this.state.root) || rootList[0];
      const jarvisDefaults = jarvisStatus?.available ? await this.api('/grav-jarvis/bootstrap').catch(() => null) : null;
      const jarvisProviders = Array.isArray(jarvisStatus?.providers) ? jarvisStatus.providers : [];
      const preferred = jarvisDefaults?.default_provider || jarvisDefaults?.providers?.find(provider => provider.preferred)?.id;
      const jarvisProvider = jarvisProviders.some(provider => provider.id === this.state.jarvisProvider)
        ? this.state.jarvisProvider
        : (jarvisProviders.find(provider => provider.id === preferred)?.id || jarvisProviders[0]?.id || '');
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
        jarvisDefaults,
        jarvisProvider,
      };
      await this.loadList(false);
      this.state.history = [{ root: this.state.root, path: this.state.path }]; this.state.historyIndex = 0;
      this.panes.right = { ...this.panes.right, root: first?.key || 'pages', items: [...this.state.items], selection: [], history: [{ root: first?.key || 'pages', path: '' }], historyIndex: 0 };
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
    Object.assign(this.state, { items: data.items || [], path: data.path || '', parent: data.parent || '', selected: null, selection: [] });
    if (render) this.render();
  }

  async openDir(path) { return this.navigatePane(this.activePane, this.state.root, path); }

  async openFile(item, root = this.state.root, editorMode = 'auto') {
    if (this.state.jarvisBusy || (this.isDirty() && !await this.confirmModal({ title: 'Discard unsaved changes?', message: `Unsaved changes in ${this.state.file.path} will be discarded.`, okText: 'Discard changes', danger: true }))) return;
    await this.guard(async () => {
      const file = await this.api(`/grav-commander/read?root=${encodeURIComponent(root)}&path=${encodeURIComponent(item.path)}`);
      this.destroyProvider(); this._editorUndo = []; this._editorRedo = [];
      this.setState({ file: { ...file, editorMode, savedContent: file.content }, message: `Opened ${item.name}`, jarvisAction: 'explain', jarvisProposal: null, jarvisError: '', jarvisMessage: '' });
      await this.resolveEditor();
    }, 'Opening file…');
    if (this.state.file?.path === item.path && this.state.file.root === root) {
      if (this.state.jarvisStatus?.available && this.jarvisEligibleFile(this.state.file) && this._modelsProvider !== this.state.jarvisProvider) void this.loadJarvisModels(false);
      requestAnimationFrame(() => {
        const editor = this.shadowRoot.querySelector('#gc-editor');
        if (this._adapter) this.sendProvider({ type: 'focus' }); else editor?.focus({ preventScroll: true });
        this.shadowRoot.querySelector('.gc-editor-card')?.scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
      });
    }
  }

  // Public adapter v1: one isolated Admin2 custom field, canonical string in/change out.
  async resolveEditor(allowNative = true, providers = this.state.file?.editors || []) {
    const file = this.state.file;
    if (!file?.editable) return;
    const generation = this._resolveId = (this._resolveId || 0) + 1;
    const current = () => this._resolveId === generation && this.state.file?.root === file.root && this.state.file?.path === file.path;
    for (const provider of providers) {
      try {
        if (!current()) return;
        const response = await fetch(this.apiUrl(`/gpm/plugins/${encodeURIComponent(provider.plugin)}/field/${encodeURIComponent(provider.field)}`), { headers: this.getAuthHeaders(false), credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(5000) });
        if (!response.ok) throw new Error('Provider module unavailable.');
        const script = await response.text();
        if (!current()) return;
        if (script.length > 4000000) throw new Error('Provider module exceeds adapter limit.');
        await this.mountProvider(provider, script);
        return;
      } catch (error) {
        this._lastProviderFailure = error.message;
        if (!current()) return;
        this.destroyProvider();
        if (this.state.file) this.setState({ file: { ...this.state.file, providerId: null } });
      }
    }
    if (!current()) return;
    if (allowNative && file.identity?.page_route && !this.isDirty()) {
      this.setState({ file: null, busy: false });
      window.location.assign(`${this.adminBasePath()}/pages/edit/${file.identity.page_route.split('/').map(encodeURIComponent).join('/')}`);
    } else this.setState({ message: 'Using Commander’s built-in editor.' });
  }

  mountProvider(provider, script) {
    this.destroyProvider();
    const file = this.state.file;
    const frame = document.createElement('iframe');
    frame.slot = 'commander-editor'; frame.id = 'gc-provider-frame'; frame.title = `${provider.label || provider.id} editor`;
    frame.setAttribute('sandbox', 'allow-scripts'); frame.setAttribute('referrerpolicy', 'no-referrer');
    frame.style.cssText = 'width:100%;height:600px;border:0;display:block;';
    const token = Array.from(crypto.getRandomValues(new Uint32Array(4)), n => n.toString(16)).join('-');
    const payload = { token, script, content: file.content, theme: this.state.theme, options: provider.options || {} };
    const boot = function (config) {
      const send = (type, extra = {}) => parent.postMessage({ commanderEditor: config.token, type, ...extra }, '*');
      let field, ready = false;
      window.addEventListener('error', () => send('failed'));
      window.addEventListener('unhandledrejection', () => send('failed'));
      document.documentElement.dataset.theme = config.theme;
      window.__GRAV_FIELD_TAG = 'commander-provider-field';
      const script = document.createElement('script'); script.type = 'module'; script.textContent = config.script;
      script.onerror = () => send('failed');
      customElements.whenDefined(window.__GRAV_FIELD_TAG).then(() => {
        try {
          if (!customElements.get(window.__GRAV_FIELD_TAG)) throw new Error('Missing field registration.');
          field = document.createElement(window.__GRAV_FIELD_TAG);
          field.field = { ...config.options, readonly: false, disabled: false };
          field.value = config.content;
          field.addEventListener('change', event => {
            if (!ready || typeof event.detail !== 'string') return;
            send('change', { content: event.detail });
          });
          document.body.append(field);
          if (field.value !== config.content) throw new Error('Provider changed source during initialization.');
          ready = true; send('ready');
        } catch { send('failed'); }
      });
      window.addEventListener('message', event => {
        if (event.source !== parent || event.data?.commanderEditor !== config.token || !field || !ready) return;
        const data = event.data;
        try {
          if (data.type === 'value') field.value = data.content;
          if (data.type === 'read') send('value', { request: data.request, content: field.value });
          if (data.type === 'theme') document.documentElement.dataset.theme = data.theme;
          if (data.type === 'focus') (field.querySelector('[contenteditable="true"], textarea, input, button') || field).focus({ preventScroll: true });
        } catch { send('failed'); }
      });
      window.addEventListener('keydown', event => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); send('save'); }
      }, true);
      document.head.append(script);
    };
    const json = JSON.stringify(payload).replace(/</g, '\u003c');
    frame.srcdoc = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'"><style>body{margin:0;font:14px system-ui}html{color-scheme:light}html[data-theme=dark]{color-scheme:dark}</style><script>(${boot.toString()})(${json})</script>`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Provider initialization timed out.')), 5000);
      this._adapter = { frame, token, provider, key: `${file.root}:${file.path}`, content: file.content, ready: false, reads: new Map(), resolve: () => { clearTimeout(timer); resolve(); }, reject: () => { clearTimeout(timer); reject(new Error('Provider initialization failed.')); } };
      this.append(frame);
      this.setState({ file: { ...file, providerId: provider.id, providerLabel: provider.label || provider.id } });
    });
  }

  sendProvider(message) { const adapter = this._adapter; adapter?.frame.contentWindow?.postMessage({ commanderEditor: adapter.token, ...message }, '*'); }

  providerMessage(event) {
    const adapter = this._adapter, data = event.data, file = this.state.file;
    if (!adapter || event.source !== adapter.frame.contentWindow || data?.commanderEditor !== adapter.token || !file || adapter.key !== `${file.root}:${file.path}`) return;
    if (data.type === 'ready') { adapter.ready = true; adapter.resolve(); return; }
    if (data.type === 'failed') {
      if (!adapter.ready) adapter.reject();
      else {
        const remaining = (file.editors || []).slice((file.editors || []).findIndex(p => p.id === adapter.provider.id) + 1);
        this.destroyProvider(); this.setState({ file: { ...file, providerId: null }, message: 'Editor unavailable; preserving your unsaved buffer.' });
        void this.resolveEditor(false, remaining);
      }
      return;
    }
    if (['change','value'].includes(data.type)) {
      if (!file.editable || typeof data.content !== 'string' || new TextEncoder().encode(data.content).length > adapter.provider.max_bytes || data.content.includes('\0')) { this.providerMessage({ source: event.source, data: { commanderEditor: adapter.token, type: 'failed' } }); return; }
      adapter.content = data.content;
      this.state.file = { ...file, content: data.content };
      const dirty = this.shadowRoot.querySelector('#gc-dirty'); if (dirty) dirty.textContent = this.isDirty() ? '● Unsaved changes' : 'Saved / read-only';
      if (data.type === 'value') { adapter.reads.get(data.request)?.(true); adapter.reads.delete(data.request); }
    }
    if (data.type === 'save' && adapter.ready) void this.saveFile();
  }

  async flushProvider() {
    const adapter = this._adapter;
    if (!adapter) return true;
    if (!adapter.ready) return false;
    return new Promise(resolve => {
      const request = (this._adapterReadId = (this._adapterReadId || 0) + 1);
      const timer = setTimeout(() => { adapter.reads.delete(request); this.setState({ error: 'Editor did not return its buffer. Nothing was saved.' }); resolve(false); }, 2000);
      adapter.reads.set(request, ok => { clearTimeout(timer); resolve(ok); });
      this.sendProvider({ type: 'read', request });
    });
  }

  destroyProvider() {
    const adapter = this._adapter; if (!adapter) return;
    this._adapter = null;
    adapter.reject(); for (const resolve of adapter.reads.values()) resolve(false);
    adapter.frame.remove();
  }

  async configureRoots(id) {
    const pane = this.pane(id), root = this.state.roots.find(root => root.key === pane.root);
    const settings = await this.confirmModal({ title: 'Configure filesystem roots', okText: 'Open root settings', message: `This pane is bounded by ${root?.label || pane.root}: ${root?.absolute_path || root?.path || ''}. Up stops at that boundary.

In Commander plugin settings, add an entry under “Additional or overridden filesystem roots”:
• Site root: key “site”, label “Site root”, path “.”
• Server home: key “server-home”, label “Server home”, and the absolute home directory supplied by your hosting account.

Save settings, return here, then choose the new root in either pane. Paths such as /home/account/public_html need the leading slash to be absolute. Enable “Allow writes” only if you want to change files there. PHP must have filesystem permission to access the directory.` });
    if (settings) await this.openPluginSettings();
  }

  markdownToolbarHtml(file) {
    if (file?.providerId || !file?.editable || !/^(md|markdown)$/.test(file.extension)) return '';
    const actions = [['undo','Undo'],['redo','Redo'],['h1','H1'],['h2','H2'],['h3','H3'],['bold','Bold'],['italic','Italic'],['strike','Strikethrough'],['list','Bulleted list'],['numbered','Numbered list'],['quote','Blockquote'],['code','Inline code'],['fence','Fenced code block'],['link','Link'],['image','Image'],['rule','Horizontal rule'],['table','Table'],['preview','Preview']];
    return `<div class="gc-markdown-toolbar" role="group" aria-label="Markdown formatting">${actions.map(([action,label]) => `<button type="button" data-markdown="${action}" title="${label}${action === 'bold' ? ' (Cmd/Ctrl+B)' : action === 'italic' ? ' (Cmd/Ctrl+I)' : ''}">${label}</button>`).join('')}</div>`;
  }

  formatMarkdown(action) {
    const editor = this.shadowRoot.querySelector('#gc-editor'), file = this.state.file;
    if (!editor || !file?.editable || !/^(md|markdown)$/.test(file.extension)) return;
    if (action === 'preview') { void this.previewMarkdown(); return; }
    if (action === 'undo' || action === 'redo') { this.editorHistory(action); return; }
    let start = editor.selectionStart, end = editor.selectionEnd;
    const value = editor.value, selected = value.slice(start, end);
    let replacement, selectStart = 0, selectEnd;
    const inline = { bold: ['**','**','bold text'], italic: ['*','*','italic text'], strike: ['~~','~~','text'], code: ['`','`','code'], link: ['[','](https://example.com)','link text'], image: ['![','](image.jpg)','alt text'] };
    if (inline[action]) {
      const [before, after, placeholder] = inline[action];
      replacement = before + (selected || placeholder) + after;
      selectStart = before.length; selectEnd = selectStart + (selected || placeholder).length;
      if (action === 'code' && selected.includes('\n')) { replacement = '```\n' + selected + '\n```'; selectStart = 4; selectEnd = 4 + selected.length; }
    } else if (['heading','h1','h2','h3','list','numbered','quote'].includes(action)) {
      start = value.lastIndexOf('\n', start - 1) + 1;
      const lineEnd = value.indexOf('\n', Math.max(start, end - (end > start && value[end - 1] === '\n' ? 1 : 0)));
      end = lineEnd < 0 ? value.length : lineEnd;
      replacement = value.slice(start,end).split('\n').map((line,index) => (action === 'heading' ? '## ' : /^h[123]$/.test(action) ? '#'.repeat(Number(action[1])) + ' ' : action === 'list' ? '- ' : action === 'numbered' ? `${index + 1}. ` : '> ') + line).join('\n');
    } else if (action === 'fence') { replacement = '\n```\n' + (selected || 'code') + '\n```\n'; selectStart = 5; selectEnd = 5 + (selected || 'code').length; }
    else if (action === 'table') replacement = '\n| Column | Column |\n| --- | --- |\n| Text | Text |\n';
    else if (action === 'rule') replacement = '\n\n---\n\n';
    else return;
    editor.focus({ preventScroll: true }); editor.setSelectionRange(start, end);
    // Native text insertion retains the browser's textarea undo history when available.
    if (!document.execCommand?.('insertText', false, replacement)) editor.setRangeText(replacement, start, end, 'end');
    editor.setSelectionRange(start + selectStart, start + (selectEnd ?? replacement.length));
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  }

  editorHistory(action) {
    const editor = this.shadowRoot.querySelector('#gc-editor');
    if (!editor || !this.state.file?.editable) return;
    const from = action === 'undo' ? this._editorUndo : this._editorRedo;
    const to = action === 'undo' ? (this._editorRedo ||= []) : (this._editorUndo ||= []);
    if (!from?.length) return;
    to.push(editor.value); editor.value = from.pop();
    this._historyApplying = true; editor.dispatchEvent(new Event('input', { bubbles: true })); this._historyApplying = false;
    editor.focus({ preventScroll: true });
  }

  async previewMarkdown() {
    const file = this.state.file, content = this.editorContent();
    await this.guard(async () => {
      const result = await this.api('/grav-commander/markdown-preview', { method: 'POST', body: JSON.stringify({ root: file.root, path: file.path, content }) });
      if (this.state.file?.root !== file.root || this.state.file?.path !== file.path) return;
      const dark = this.state.theme === 'dark';
      const preview = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; form-action 'none'; base-uri 'none'"><style>body{font:16px/1.6 system-ui;padding:16px;background:${dark ? '#202228' : '#fff'};color:${dark ? '#eee' : '#222'}}pre,code{white-space:pre-wrap}a{color:${dark ? '#c5a1ff' : '#663399'}}img{display:none}</style>${result.html}`;
      this.setState({ file: { ...this.state.file, markdownPreview: preview } });
    }, 'Rendering Markdown preview…');
  }

  async editPermissions() {
    const item = this.state.selected, root = this.state.root;
    if (!item?.permissions) return;
    const info = item.permissions;
    const supported = this.state.status?.chmod_supported && this.state.status?.can_write && this.state.roots.find(r => r.key === root)?.writable;
    const message = `${item.path}\nOwner: ${info.owner} · Group: ${info.group}\n${info.mode} ${info.symbolic}\n${info.warnings.join('\n')}\n\n${supported ? 'Use octal rwx bits: owner / group / others. Special bits are not supported. Changing modes can make content inaccessible.' : 'Informational only. Permission changes are unsupported, disabled, or require Commander write authority.'}`;
    const fields = supported ? [{ name: 'mode', label: 'Octal mode (owner / group / others)', value: info.mode, required: true }, { name: 'preset', label: 'Preset (optional)', type: 'select', value: '', options: [['','Use octal entry'],['0644','0644 · public file'],['0600','0600 · private file'],['0755','0755 · directory / executable'],['0700','0700 · private directory']] }, ...(item.type === 'dir' ? [{ name: 'recursive', label: 'Apply recursively to every file and directory (may break access)', type: 'checkbox' }] : [])] : null;
    const answer = await this.confirmModal({ title: 'Unix permissions', message, fields, okText: supported ? 'Review change' : 'Close' });
    if (!answer || !supported) return;
    const mode = answer.preset || answer.mode;
    if (!/^0?[0-7]{3}$/.test(mode)) { this.setState({ error: 'Use an octal mode such as 0644 or 0755.' }); return; }
    const body = { root, path: item.path, mode, recursive: !!answer.recursive, confirm_recursive: !!answer.recursive };
    await this.guard(async () => {
      const plan = await this.api('/grav-commander/permissions', { method: 'POST', body: JSON.stringify({ ...body, preview: true }) });
      if (!await this.confirmModal({ title: answer.recursive ? 'Confirm recursive chmod' : 'Confirm permission change', message: `${plan.count} item(s) will receive ${mode}. ${answer.recursive ? 'The SAME mode applies to all descendants, including files. Missing directory execute bits can prevent browsing; executable bits on content may be unsafe. There is no automatic undo.' : ''}`, okText: 'Apply permissions', danger: true })) return;
      const result = await this.api('/grav-commander/permissions', { method: 'POST', body: JSON.stringify({ ...body, revision: plan.revision }) });
      await this.loadList(false);
      this.setState({ message: result.message, error: result.failed?.length ? `${result.failed[0].path}: ${result.failed[0].message} · ${result.pending?.length || 0} pending` : '' });
    }, 'Updating permissions…');
  }

  async openFileVault() {
    const item = this.state.selected, vault = this.fileVaultStatus;
    if (!item || !vault) return;
    const base = this.state.roots.find(root => root.key === this.state.root)?.absolute_path;
    const absolute = `${base}/${item.path}`;
    const managed = vault.items?.find(entry => (entry.source_type || 'file') === 'file' && `${vault.storage_path}/${entry.filename}` === absolute);
    const message = managed ? `Managed by File Vault: ${managed.display_name || managed.filename}\nACL: ${managed.access || 'public'} · Password protected: ${managed.password_protected ? 'yes' : 'no'} · Downloads: ${managed.download_count || 0}\nContinue in File Vault to manage distribution.` : 'Open File Vault to upload and manage controlled distribution. File Vault has no public server-file adoption or lookup contract; Commander will not copy or publish this selection automatically.';
    if (await this.confirmModal({ title: 'File Vault distribution', message, okText: 'Open File Vault' }) && await this.discardEditor()) window.location.assign(`${this.adminBasePath()}/plugin/file-vault`);
  }

  editorContent() {
    const textarea = this.shadowRoot.querySelector('#gc-editor');
    return this._adapter ? this.state.file?.content || '' : textarea ? textarea.value : (this.state.file?.content || '');
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

  async loadJarvisModels(refresh = true) {
    const provider = this.state.jarvisProvider;
    if (!provider) return;
    this._modelCache ||= new Map();
    if (!refresh && this._modelCache.has(provider)) {
      this._modelRequest = (this._modelRequest || 0) + 1; this._modelsProvider = provider;
      this.setState({ jarvisModels: this._modelCache.get(provider), jarvisModelsLoading: false, jarvisError: '', jarvisMessage: 'Cached models loaded.' }); return;
    }
    const request = this._modelRequest = (this._modelRequest || 0) + 1;
    this._modelsProvider = provider;
    this.setState({ jarvisModelsLoading: true, jarvisError: '', jarvisMessage: 'Loading models…' });
    try {
      const data = await this.api(`/grav-commander/jarvis/providers/${encodeURIComponent(provider)}/models`);
      if (request !== this._modelRequest || provider !== this.state.jarvisProvider) return;
      const models = Array.isArray(data.models) ? data.models.filter(model => model.available !== false) : [];
      this._modelCache.set(provider, models);
      this.setState({
        jarvisModels: models,
        jarvisModel: models.some(model => model.id === this.state.jarvisModel) ? this.state.jarvisModel : '',
        jarvisMessage: data.message || (models.length ? `${models.length} model${models.length === 1 ? '' : 's'} loaded.` : 'Provider default model will be used.'),
      });
    } catch (err) {
      if (request !== this._modelRequest || provider !== this.state.jarvisProvider) return;
      this.setState({ jarvisModels: [], jarvisModel: '', jarvisError: err.message || String(err), jarvisMessage: 'Configured provider default remains selected. Refresh models to retry.' });
    } finally {
      if (request === this._modelRequest) this.setState({ jarvisModelsLoading: false });
    }
  }

  jarvisDefaultLabel() {
    const model = this.state.jarvisDefaults?.providers?.find(provider => provider.id === this.state.jarvisProvider)?.default_model;
    return model ? `Configured default · ${model}` : 'Provider default';
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
    if (!await this.flushProvider()) return;
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
          root: file.root || this.state.root,
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
    if (!await this.flushProvider()) return;
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
          root: file.root || this.state.root,
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
          body: JSON.stringify({ root: file.root || this.state.root, path: file.path }),
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
    if (!await this.flushProvider()) return;
    const file = this.state.file;
    if (!file?.editable) return;
    const content = this.editorContent();
    await this.guard(async () => {
      const result = await this.api('/grav-commander/write', {
        method: 'PATCH', body: JSON.stringify({ root: file.root, path: file.path, content, revision: file.revision }),
      });
      this.setState({ file: { ...file, content, savedContent: content, revision: result.revision }, message: result.message || 'Saved.' });
      await this.refreshPanes();
      await this.tryLoadBackups(false);
    }, 'Validating and saving file…');
  }

  async makeFolder() {
    const name = await this.promptModal('New folder name:');
    if (!name) return;
    await this.guard(async () => {
      const res = await this.api('/grav-commander/mkdir', {
        method: 'POST',
        body: JSON.stringify({ root: this.state.root, path: this.state.path, name }),
      });
      this.setState({ message: res.message || 'Folder created.' });
      await this.refreshPanes();
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
      await this.refreshPanes();
      await this.tryLoadBackups(false);
    });
  }

  async renameSelected() {
    const item = this.state.selected;
    if (!item) return;
    if (this.state.file?.root === this.state.root && (this.state.file.path === item.path || this.state.file.path.startsWith(item.path + '/')) && !await this.discardEditor()) return;
    const currentName = item.name || item.path.split('/').pop();
    const name = await this.promptModal('Rename to:', currentName);
    if (!name || name === currentName) return;
    await this.guard(async () => {
      const res = await this.api('/grav-commander/rename', {
        method: 'POST',
        body: JSON.stringify({ root: this.state.root, path: item.path, name }),
      });
      this.setState({ message: res.message || 'Renamed.', selected: null });
      await this.refreshPanes();
      await this.tryLoadBackups(false);
    });
  }

  async copyOrMoveSelected(mode) { return this.operate(mode); }

  async deleteSelected() { return this.operate('delete'); }

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

  pageIdentity(path) {
    if (this.state.file?.path === path && this.state.file.identity?.page_route) return this.state.file.identity;
    return this.state.items.find(item => item.path === path)?.identity;
  }

  isGravPageMarkdownPath(path) { return !!this.pageIdentity(path)?.page_route; }
  gravPageRouteFromFilePath(path) { return this.pageIdentity(path)?.page_route || ''; }
  gravPageEditorUrl(path) {
    const route = this.gravPageRouteFromFilePath(path);
    return `${this.adminBasePath()}/pages/edit/${route.split('/').map(encodeURIComponent).join('/')}`;
  }
  async openGravPageEditor(path) {
    const url = this.gravPageEditorUrl(path);
    if (this.isGravPageMarkdownPath(path) && await this.discardEditor()) window.location.assign(url);
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
      await this.refreshPanes();
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

    this.confirmModal({ title: 'Backup details', message: this.backupDetailsText(backup), okText: 'Close', cancelText: '' });
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

  async openSelected() { const item = this.state.selected; if (item?.type === 'dir') return this.openDir(item.path); if (item?.viewable) return this.openFile(item); }

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

  async zipSelected() { return this.operate('zip'); }

  async extractSelected() {
    const item = this.state.selected || this.state.file;
    if (!item) return;
    const name = item.name || item.path?.split('/').pop() || '';
    if (!/\.zip$/i.test(name)) {
      this.setState({ error: 'Select a .zip archive first.' });
      return;
    }

    const defaultDest = this.parentPath(item.path || '') || this.state.path || '';
    const options = await this.confirmModal({ title: 'Extract ZIP', okText: 'Review extraction', fields: [
      { name: 'path', label: "Destination folder within the current root (blank for the ZIP’s folder)", value: defaultDest },
      { name: 'overwrite', label: 'Allow replacement of existing files', type: 'checkbox', value: false }
    ] });
    if (!options) return;
    const destPath = options.path, overwrite = options.overwrite;

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
      this.setState({ message: `${res.message || 'ZIP extracted.'} ${res.files || 0} files, ${res.dirs || 0} folders.`, selected: null });
      await this.refreshPanes();
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

  async openPluginSettings() {
    if (!await this.discardEditor()) return;
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

  paneKeys() { return ['root', 'path', 'parent', 'items', 'selected', 'selection', 'anchor', 'showHidden', 'filter', 'sort', 'reverse', 'history', 'historyIndex']; }

  pane(id) {
    return id === this.activePane ? this.state : this.panes[id];
  }

  activatePane(id, render = true) {
    if (this.state.busy || this.state.modal) return;
    if (id !== this.activePane) {
      this.panes[this.activePane] = Object.fromEntries(this.paneKeys().map(key => [key, this.state[key]]));
      Object.assign(this.state, this.panes[id]);
      this.activePane = id;
    }
    if (render) this.render();
  }

  visibleItems(pane = this.state) {
    const filter = (pane.filter || '').toLocaleLowerCase();
    return pane.items.filter(item => (pane.showHidden || !item.name.startsWith('.')) && item.name.toLocaleLowerCase().includes(filter)).sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      const key = pane.sort || 'name';
      const value = key === 'name' ? a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }) : (a[key] || 0) - (b[key] || 0);
      return pane.reverse ? -value : value;
    });
  }

  selectedItems() { return this.state.items.filter(item => (this.state.selection || []).includes(item.path)); }

  selectItem(id, path, event = {}) {
    this.activatePane(id, false);
    const visible = this.visibleItems();
    let selection = new Set(this.state.selection || []);
    if (event.shiftKey && this.state.anchor && visible.some(item => item.path === this.state.anchor)) {
      const start = visible.findIndex(item => item.path === this.state.anchor);
      const end = visible.findIndex(item => item.path === path);
      if (!event.ctrlKey && !event.metaKey) selection.clear();
      visible.slice(Math.min(start, end), Math.max(start, end) + 1).forEach(item => selection.add(item.path));
    } else {
      if (event.ctrlKey || event.metaKey) selection.has(path) ? selection.delete(path) : selection.add(path);
      else selection = new Set([path]);
      this.state.anchor = path;
    }
    this.state.selection = [...selection];
    this.state.selected = selection.size === 1 ? this.state.items.find(item => selection.has(item.path)) : null;
    this.render();
    this.focusRow(id, path);
  }

  focusRow(id, path) {
    const rows = this.shadowRoot.querySelectorAll(`[data-pane="${id}"] [data-entry]`);
    [...rows].find(row => row.dataset.entry === path)?.querySelector('button')?.focus();
  }

  async navigatePane(id, root, path, historyIndex = null) {
    if (this.state.busy) return;
    await this.guard(async () => {
      const data = await this.api(`/grav-commander/list?root=${encodeURIComponent(root)}&path=${encodeURIComponent(path)}`);
      const pane = this.pane(id);
      if (historyIndex === null) {
        pane.history = (pane.history || []).slice(0, (pane.historyIndex ?? -1) + 1);
        const last = pane.history.at(-1);
        if (!last || last.root !== root || last.path !== data.path) pane.history.push({ root, path: data.path });
        pane.history = pane.history.slice(-50);
        pane.historyIndex = pane.history.length - 1;
      } else pane.historyIndex = historyIndex;
      Object.assign(pane, { root, path: data.path, parent: data.parent, items: data.items || [], selected: null, selection: [], anchor: null, filter: '' });
      this.render();
    }, 'Loading folder…');
  }

  async refreshPanes() {
    const snapshots = ['left', 'right'].map(id => ({ id, root: this.pane(id).root, path: this.pane(id).path }));
    await Promise.all(snapshots.map(async ({ id, root, path }) => {
      const data = await this.api(`/grav-commander/list?root=${encodeURIComponent(root)}&path=${encodeURIComponent(path)}`);
      Object.assign(this.pane(id), { items: data.items || [], selected: null, selection: [] });
    }));
    this.render();
  }

  isDirty() { return !!this.state.file && this.state.file.content !== this.state.file.savedContent; }

  async discardEditor() {
    if (!await this.flushProvider()) return false;
    if (this.state.jarvisBusy) return false;
    if (this.isDirty() && !await this.confirmModal({ title: 'Discard unsaved changes?', message: `Unsaved changes in ${this.state.file.path} will be discarded.`, okText: 'Discard changes', danger: true })) return false;
    if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
    this.previewUrl = null;
    ++this._resolveId;
    if (this.state.file) this.setState({ file: null, jarvisProposal: null });
    return true;
  }

  async operate(operation, source = null, destination = null) {
    if (this.state.busy) return;
    const paths = source?.paths || this.selectedItems().map(item => item.path);
    const root = source?.root || this.state.root;
    const dest = destination || this.pane(this.activePane === 'left' ? 'right' : 'left');
    if (!paths.length) return;
    if (['move', 'delete'].includes(operation) && this.state.file?.root === root && paths.some(path => this.state.file.path === path || this.state.file.path.startsWith(path + '/'))) {
      if (!await this.discardEditor()) return;
    }
    const body = { operation, root, paths, dest_root: dest.root, dest_path: dest.path };
    if (operation === 'zip') {
      const name = await this.promptModal('Archive filename (created in the active folder):', 'selection.zip');
      if (!name) return;
      Object.assign(body, { name, dest_root: root, dest_path: this.state.path });
    }
    const target = operation === 'delete' ? '' : `\nTo ${body.dest_root}:/${body.dest_path || ''}`;
    const message = `${operation.toUpperCase()} ${paths.length} item(s)\nFrom ${root}:/\n${paths.slice(0, 12).join('\n')}${paths.length > 12 ? '\n…' : ''}${target}\n\nFolders include all contents and associated media. Existing destinations require a collision decision before any transfer.`;
    if (!await this.confirmModal({ title: `${operation[0].toUpperCase() + operation.slice(1)} selection?`, message, okText: operation === 'delete' ? 'Delete selection' : 'Continue', danger: ['move', 'delete'].includes(operation) })) return;
    if (['copy', 'move'].includes(operation)) {
      try { if (!await this.reviewTransfer(body)) return; } catch (err) { this.setState({ error: err.message }); return; }
    }
    await this.guard(async () => {
      const result = await this.api('/grav-commander/operations', { method: 'POST', body: JSON.stringify(body) });
      if (result.collisions?.length) throw new Error('Destination changed. Review the transfer again; no files were transferred.');
      this.setState({ message: result.message, error: result.failed?.length ? `Stopped at ${result.failed[0].path}: ${result.failed[0].message}. ${result.pending?.length || 0} items were not attempted.` : '' });
      if (source && !result.failed?.length && operation === 'move') this.clipboard = null;
      await this.refreshPanes();
      await this.tryLoadBackups(false);
    }, `${operation[0].toUpperCase() + operation.slice(1)}: ${paths.length} item(s)… Keep this workspace open until the result appears.`);
  }

  async reviewTransfer(body) {
    body.collision_policy = 'ask'; body.resolutions = {};
    while (true) {
      let plan;
      await this.guard(async () => { plan = await this.api('/grav-commander/operations', { method: 'POST', body: JSON.stringify({ ...body, preview: true }) }); }, 'Checking destination…');
      if (!plan) return false;
      body.snapshot = plan.snapshot;
      if (plan.ready) { body.revision = plan.revision; return true; }
      const conflict = plan.collisions[0];
      const choices = [['skip', 'Skip — leave source and destination unchanged'], ['keep_both', 'Keep both / Rename — create a separate copy']];
      if (conflict.replace_allowed) choices.push(['replace', 'Replace — replace the entire destination']);
      if (conflict.merge_allowed) choices.push(['merge', 'Merge folders — retain destination-only items; review child conflicts']);
      const result = await this.confirmModal({ title: 'Destination already exists', message: `${body.dest_root}:/${conflict.dest_path} (${conflict.dest_type})\nSource: ${conflict.path} (${conflict.source_type})\n\nReplace removes the existing item, including all folder contents. Safety backups run before replacement when configured. Cancel stops the entire transfer before any changes.`, okText: 'Use decision', fields: [
        { name: 'action', label: 'Collision action', type: 'select', value: 'skip', options: choices },
        { name: 'name', label: 'Keep both name (optional; blank creates a unique name)', value: '' },
        { name: 'remaining', label: 'Apply this action to remaining compatible collisions', type: 'checkbox', value: false }
      ] });
      if (!result) return false;
      body.resolutions[conflict.dest_path] = { action: result.action, name: result.action === 'keep_both' ? result.name : '' };
      if (result.remaining) body.collision_policy = result.action;
    }
  }

  async duplicateSelected() {
    const item = this.state.selected;
    if (!item) return;
    const name = await this.promptModal('Name for the duplicate (folders include their media):', item.name + '-copy');
    if (!name || /[/\\]/.test(name)) return;
    await this.guard(async () => {
      const result = await this.api('/grav-commander/copy', { method: 'POST', body: JSON.stringify({ root: this.state.root, path: item.path, dest_root: this.state.root, dest_path: [this.state.path, name].filter(Boolean).join('/') }) });
      await this.refreshPanes();
      this.setState({ message: result.message });
    }, 'Duplicating selection…');
  }

  async createFile() {
    const name = await this.promptModal('New text filename (for example draft.md or settings.yaml):');
    if (!name) return;
    await this.guard(async () => {
      const result = await this.api('/grav-commander/create', { method: 'POST', body: JSON.stringify({ root: this.state.root, path: this.state.path, name }) });
      await this.refreshPanes();
      this.setState({ message: result.message });
    }, 'Creating file…');
  }

  async validateEditor() {
    const file = this.state.file;
    if (!file?.editable) return;
    await this.guard(async () => {
      const result = await this.api('/grav-commander/validate', { method: 'POST', body: JSON.stringify({ path: file.path, content: this.editorContent() }) });
      this.setState({ message: result.message });
    }, 'Validating document…');
  }

  async previewSelected() {
    const item = this.state.selected;
    if (!item || !await this.discardEditor()) return;
    if (item.viewable) return this.openFile(item);
    await this.guard(async () => {
      if (item.archive) {
        const result = await this.api(`/grav-commander/archive/inspect?root=${encodeURIComponent(this.state.root)}&path=${encodeURIComponent(item.path)}`);
        this.setState({ file: { ...item, root: this.state.root, preview: 'archive', entries: result.entries, content: '', savedContent: '' } });
      } else if (/\.(png|jpe?g|gif|webp|avif)$/i.test(item.name)) {
        if (item.size > 10485760) throw new Error('Image exceeds the 10 MB preview limit. Download it instead.');
        const response = await fetch(this.apiUrl(`/grav-commander/download?root=${encodeURIComponent(this.state.root)}&path=${encodeURIComponent(item.path)}`), { headers: this.getAuthHeaders(false), credentials: 'omit', cache: 'no-store' });
        if (!response.ok) throw new Error('Image preview could not be loaded.');
        const blob = await response.blob();
        if (!/^image\/(png|jpeg|gif|webp|avif)$/.test(blob.type)) throw new Error('Unsupported image content.');
        this.previewUrl = URL.createObjectURL(blob);
        this.setState({ file: { ...item, root: this.state.root, preview: 'image', content: '', savedContent: '' } });
      }
    }, item.archive ? 'Inspecting archive…' : 'Loading image…');
  }

  paneHtml(id) {
    const pane = this.pane(id), active = id === this.activePane, items = this.visibleItems(pane);
    const e = value => this.escape(value);
    const suffix = active ? '' : '-other';
    const rootInfo = this.state.roots.find(root => root.key === pane.root);
    const parts = pane.path.split('/').filter(Boolean);
    const breadcrumbs = [{ label: pane.root, path: '' }, ...parts.map((part, index) => ({ label: part, path: parts.slice(0, index + 1).join('/') }))];
    return `<section class="gc-card gc-pane ${active ? 'active' : ''}" data-pane="${id}" aria-label="${id} file pane">
      <div class="gc-head"><button data-activate="${id}" aria-pressed="${active}">${id === 'left' ? 'Left' : 'Right'} · ${active ? 'Source (active)' : 'Destination'}</button><span class="gc-muted-small">${pane.selection?.length || 0} selected / ${pane.items.length}</span></div>
      <div class="gc-pane-nav">
        <select aria-label="${id} root" data-root id="gc-root${suffix}">${this.state.roots.map(root => `<option value="${e(root.key)}" ${root.key === pane.root ? 'selected' : ''} ${root.exists === false ? 'disabled' : ''}>${e(root.label)}${root.writable ? '' : ' (read-only)'}</option>`).join('')}</select>
        <div class="gc-root-boundary"><span>${pane.path ? 'Root' : 'At configured root'}: <code>${e(rootInfo?.absolute_path || rootInfo?.path || pane.root)}</code></span><button data-configure-roots type="button">Configure roots</button></div>
        <div class="gc-tools"><button data-history="-1" aria-label="${id} back" ${pane.historyIndex > 0 ? '' : 'disabled'}>←</button><button data-history="1" aria-label="${id} forward" ${pane.historyIndex < pane.history.length - 1 ? '' : 'disabled'}>→</button><button data-up ${pane.path ? '' : 'disabled'}>Up</button><button data-refresh>Refresh</button></div>
        <label class="gc-hidden-toggle"><input type="checkbox" data-show-hidden aria-label="${id} show hidden files" ${pane.showHidden ? 'checked' : ''}>Show hidden files</label>
        <nav class="gc-crumbs" aria-label="${id} breadcrumbs">${breadcrumbs.map(crumb => `<button data-crumb="${e(crumb.path)}">${e(crumb.label)}</button>`).join('<span>/</span>')}</nav>
        <div class="gc-path-row"><input type="text" data-path id="gc-path${suffix}" aria-label="${id} folder path" title="Path relative to this configured root; use the root selector for another location" value="${e(pane.path)}" placeholder="Folder path"><button data-go id="gc-go${suffix}">Go</button></div>
        <div class="gc-path-row"><input type="text" data-filter aria-label="${id} filename filter" value="${e(pane.filter)}" placeholder="Filter this folder…"><select data-sort aria-label="${id} sort">${['name','size','modified'].map(key => `<option ${pane.sort === key ? 'selected' : ''}>${key}</option>`).join('')}</select><button data-reverse aria-label="${id} reverse sort">${pane.reverse ? '↓' : '↑'}</button></div>
      </div>
      <div class="gc-table-wrap" tabindex="0" role="region" aria-label="${id} directory listing"><table aria-label="${id} files"><thead><tr><th>Name</th><th>Size</th><th>Modified</th></tr></thead><tbody>${items.map(item => `<tr data-entry="${e(item.path)}" class="${pane.selection?.includes(item.path) ? 'selected' : ''}" aria-selected="${!!pane.selection?.includes(item.path)}"><td><input type="checkbox" data-toggle aria-label="Toggle ${e(item.name)}" ${pane.selection?.includes(item.path) ? 'checked' : ''}><button class="gc-file-entry gc-name" aria-label="Select ${e(item.name)}"><span aria-hidden="true">${pane.selection?.includes(item.path) ? '✓' : this.iconFor(item)}</span>${e(item.name)}</button><small>${e(item.identity?.kind || (item.type === 'dir' ? 'Folder' : item.extension))}</small></td><td>${e(this.formatSize(item.size))}</td><td>${e(this.formatDate(item.modified))}</td></tr>`).join('')}</tbody></table>${items.length ? '' : '<div class="gc-empty">No matching items.</div>'}</div>
      <div class="gc-pane-footer"><button data-select-all>Select all visible</button><button data-clear>Clear</button><span class="gc-muted-small">${items.length} visible</span></div>
    </section>`;
  }

  workspaceActionsHtml(contextual = false) {
    const selection = this.selectedItems(), item = selection.length === 1 ? selection[0] : null;
    const writable = this.state.roots.find(root => root.key === this.state.root)?.writable;
    const destination = this.pane(this.activePane === 'left' ? 'right' : 'left');
    const destWritable = this.state.roots.find(root => root.key === destination.root)?.writable;
    const button = (id, label, enabled = true, danger = false) => `<button id="gc-${id}" ${enabled ? '' : 'disabled'} ${danger ? 'class="danger"' : ''}>${label}</button>`;
    if (contextual) return item ? `<section class="gc-card"><div class="gc-pane-footer">${item ? `${button('open', item.type === 'dir' ? 'Open folder' : item.editable ? 'Edit' : 'View', item.type === 'dir' || item.viewable)}${item.archive || /\.(png|jpe?g|gif|webp|avif)$/i.test(item.name) ? button('preview', item.archive ? 'Inspect archive' : 'Preview image') : ''}${item.extractable && writable ? button('extract', 'Extract ZIP') : ''}${button('rename', 'Rename', writable)}${button('duplicate', 'Duplicate', writable)}${item.type !== 'dir' ? button('download', 'Download') : ''}${button('backup-file', 'Backup item')}${item.permissions ? button('permissions', 'Permissions') : ''}${item.type !== 'dir' && this.fileVaultStatus ? button('file-vault', 'Manage distribution in File Vault') : ''}` : ''}</div>${item ? `<div class="gc-footer-note">${this.escape(item.identity?.kind || item.type)} · ${this.escape(item.path)} · ${this.escape(this.formatSize(item.size))} · ${this.escape(this.formatDate(item.modified))}${item.permissions ? ' · ' + this.escape(item.permissions.mode + ' ' + item.permissions.symbolic + ' · ' + item.permissions.owner + ':' + item.permissions.group) : ''}${/package/.test(item.identity?.kind || '') ? ' · Moving package files may affect the installed extension.' : ''}</div>` : ''}</section>` : '';
    return `<section class="gc-card"><div class="gc-head"><div class="gc-title"><strong>${this.escape(this.state.root)}:/${this.escape(this.state.path)} → ${this.escape(destination.root)}:/${this.escape(destination.path)}</strong><p>${selection.length} selected · click, Cmd/Ctrl-click or Shift-click · F6 changes pane</p></div><div class="gc-tools">${button('switch-pane', 'Switch pane')}<button id="gc-swap">Swap locations</button></div></div><div class="gc-pane-footer">
      ${button('new-file', 'New file', writable)}${button('new-folder', 'New folder', writable)}${button('upload-button', 'Upload', writable)}<input id="gc-upload" class="gc-hidden" type="file">
      ${button('copy', 'Copy →', selection.length && destWritable)}${button('move', 'Move →', selection.length && writable && destWritable)}${button('delete', 'Delete', selection.length && writable, true)}${button('zip', 'Archive selection', selection.length && writable)}

    </div></section>`;
  }

  bindWorkspace() {
    const q = selector => this.shadowRoot.querySelector(selector);
    q('#gc-switch-pane')?.addEventListener('click', () => this.activatePane(this.activePane === 'left' ? 'right' : 'left'));
    q('#gc-swap')?.addEventListener('click', () => {
      this.activatePane(this.activePane, false);
      const other = this.activePane === 'left' ? 'right' : 'left';
      const current = Object.fromEntries(this.paneKeys().map(key => [key, this.state[key]]));
      Object.assign(this.state, this.panes[other]); this.panes[other] = current; this.render();
    });
    q('#gc-open-markdown')?.addEventListener('click', () => this.openFile(this.state.selected));
    this.shadowRoot.querySelectorAll('[data-markdown]').forEach(button => button.addEventListener('click', () => this.formatMarkdown(button.dataset.markdown)));
    q('#gc-new-file')?.addEventListener('click', () => this.createFile());
    q('#gc-upload-button')?.addEventListener('click', () => q('#gc-upload')?.click());
    q('#gc-duplicate')?.addEventListener('click', () => this.duplicateSelected());
    q('#gc-permissions')?.addEventListener('click', () => this.editPermissions());
    q('#gc-file-vault')?.addEventListener('click', () => this.openFileVault());
    q('#gc-preview')?.addEventListener('click', () => this.previewSelected());
    q('#gc-editor-close')?.addEventListener('click', () => this.discardEditor());
    q('#gc-editor-reload')?.addEventListener('click', async () => {
      const file = this.state.file;
      if (await this.discardEditor()) await this.openFile(file, file.root, file.editorMode);
    });
    q('#gc-preview-close')?.addEventListener('click', () => this.setState({ file: { ...this.state.file, markdownPreview: null } }));
    q('#gc-validate')?.addEventListener('click', () => this.validateEditor());
    this.shadowRoot.querySelectorAll('[data-pane]').forEach(element => {
      const id = element.dataset.pane;
      element.querySelector('[data-activate]').addEventListener('click', () => this.activatePane(id));
      const navigate = (root, path, index = null) => this.navigatePane(id, root, path, index);
      element.querySelector('[data-configure-roots]').addEventListener('click', () => this.configureRoots(id));
      element.querySelector('[data-root]').addEventListener('change', event => navigate(event.target.value, ''));
      element.querySelector('[data-go]').addEventListener('click', () => navigate(this.pane(id).root, element.querySelector('[data-path]').value));
      element.querySelector('[data-path]').addEventListener('keydown', event => { if (event.key === 'Enter') element.querySelector('[data-go]').click(); });
      element.querySelector('[data-up]').addEventListener('click', () => navigate(this.pane(id).root, this.pane(id).parent));
      element.querySelector('[data-refresh]').addEventListener('click', () => navigate(this.pane(id).root, this.pane(id).path));
      element.querySelectorAll('[data-history]').forEach(button => button.addEventListener('click', () => {
        const pane = this.pane(id), index = pane.historyIndex + Number(button.dataset.history), next = pane.history[index];
        if (next) navigate(next.root, next.path, index);
      }));
      element.querySelectorAll('[data-crumb]').forEach(button => button.addEventListener('click', () => navigate(this.pane(id).root, button.dataset.crumb)));
      element.querySelector('[data-show-hidden]').addEventListener('change', event => {
        const pane = this.pane(id); pane.showHidden = event.target.checked;
        // Keep visible selections; remove only newly hidden entries to avoid invisible destructive selections.
        const authorized = new Set(pane.items.filter(item => pane.showHidden || !item.name.startsWith('.')).map(item => item.path));
        pane.selection = pane.selection.filter(path => authorized.has(path));
        if (pane.selected && !authorized.has(pane.selected.path)) pane.selected = null;
        try { localStorage.setItem(this.preferenceKey, JSON.stringify({ left: this.pane('left').showHidden, right: this.pane('right').showHidden })); } catch {}
        this.render(); this.shadowRoot.querySelector(`[data-pane="${id}"] [data-show-hidden]`)?.focus({ preventScroll: true });
      });
      element.querySelector('[data-filter]').addEventListener('input', event => {
        const pane = this.pane(id); pane.filter = event.target.value;
        pane.selection = []; pane.selected = null; pane.anchor = null;
        this.render(); const input = this.shadowRoot.querySelector(`[data-pane="${id}"] [data-filter]`); input.focus(); input.setSelectionRange(input.value.length, input.value.length);
      });
      element.querySelector('[data-sort]').addEventListener('change', event => { this.pane(id).sort = event.target.value; this.render(); });
      element.querySelector('[data-reverse]').addEventListener('click', () => { this.pane(id).reverse = !this.pane(id).reverse; this.render(); });
      element.querySelector('[data-select-all]').addEventListener('click', () => { this.activatePane(id, false); this.state.selection = this.visibleItems().map(item => item.path); this.state.selected = this.state.selection.length === 1 ? this.visibleItems()[0] : null; this.render(); });
      element.querySelector('[data-clear]').addEventListener('click', () => { this.activatePane(id, false); this.state.selection = []; this.state.selected = null; this.render(); });
      element.querySelectorAll('[data-entry]').forEach(row => {
        row.addEventListener('click', event => this.selectItem(id, row.dataset.entry, event.target.matches('[data-toggle]') ? { ctrlKey: true } : event));
        row.addEventListener('dblclick', () => { this.activatePane(id, false); this.openItem(this.state.items.find(item => item.path === row.dataset.entry)); });
      });
      element.addEventListener('dragover', event => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; } });
      element.addEventListener('drop', event => {
        if (!event.dataTransfer.files.length) return;
        event.preventDefault();
        if (this.state.busy) return;
        this.activatePane(id);
        if (event.dataTransfer.files.length !== 1) return this.setState({ error: 'Drop one file at a time. Each upload reports its own result.' });
        this.uploadFile(event.dataTransfer.files[0]);
      });
      element.addEventListener('keydown', event => this.paneKeydown(event, id));
    });
    this.shadowRoot.removeEventListener?.('keydown', this._workspaceKeydown);
    this._workspaceKeydown = event => {
      if (this.state.modal) {
        if (event.key === 'Escape') { event.preventDefault(); this.closeModal(false); }
        if (event.key === 'Tab') {
          const buttons = [...this.shadowRoot.querySelectorAll('.gc-modal button:not(:disabled), .gc-modal input:not(:disabled), .gc-modal select:not(:disabled)')];
          if (buttons.length) { event.preventDefault(); buttons[(buttons.indexOf(this.shadowRoot.activeElement) + (event.shiftKey ? buttons.length - 1 : 1)) % buttons.length].focus(); }
        }
        return;
      }
      if (this.state.busy) return;
      if ((event.metaKey || event.ctrlKey) && ['z', 'y'].includes(event.key.toLowerCase()) && event.target.id === 'gc-editor') { event.preventDefault(); this.editorHistory(event.key.toLowerCase() === 'y' || event.shiftKey ? 'redo' : 'undo'); return; }
      if ((event.metaKey || event.ctrlKey) && ['b', 'i'].includes(event.key.toLowerCase()) && event.target.id === 'gc-editor' && /^(md|markdown)$/.test(this.state.file?.extension)) { event.preventDefault(); this.formatMarkdown(event.key.toLowerCase() === 'b' ? 'bold' : 'italic'); return; }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's' && this.state.file?.editable) { event.preventDefault(); this.saveFile(); }
      if (event.key === 'F6') { event.preventDefault(); this.activatePane(this.activePane === 'left' ? 'right' : 'left'); this.shadowRoot.querySelector(`[data-pane="${this.activePane}"] .gc-table-wrap`)?.focus(); }
      if (event.key === 'Escape' && this.state.file) { event.preventDefault(); this.discardEditor(); }
    };
    this.shadowRoot.addEventListener?.('keydown', this._workspaceKeydown);
    if (this.state.modal) (q('#gc-modal-form input:not([type=checkbox])') || q('#gc-modal-form select') || q('#gc-modal-cancel') || q('#gc-modal-ok'))?.focus({ preventScroll: true });
    for (const child of q('.gc-shell')?.children || []) { if (!child.classList.contains('gc-modal-backdrop')) child.inert = !!this.state.modal; }
  }

  openItem(item) {
    if (!item) return;
    if (item.type === 'dir') return this.openDir(item.path);
    if (item.viewable) return this.openFile(item);
    if (item.archive || /\.(png|jpe?g|gif|webp|avif)$/i.test(item.name)) return this.previewSelected();
  }

  paneKeydown(event, id) {
    if (this.state.busy || this.state.modal || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
    const key = event.key.toLowerCase(), mod = event.metaKey || event.ctrlKey;
    const handled = ['arrowdown','arrowup','enter','backspace','delete','f2','escape'].includes(key) || (mod && ['a','c','x','v'].includes(key));
    if (!handled) return;
    event.preventDefault(); this.activatePane(id, false);
    const items = this.visibleItems();
    if (mod && key === 'a') { this.state.selection = items.map(item => item.path); this.state.selected = items.length === 1 ? items[0] : null; this.render(); }
    else if (mod && ['c','x'].includes(key)) { this.clipboard = { root: this.state.root, paths: [...this.state.selection], operation: key === 'c' ? 'copy' : 'move' }; this.setState({ message: `${this.clipboard.paths.length} items ready to ${this.clipboard.operation}. Navigate to a destination and paste.` }); }
    else if (mod && key === 'v' && this.clipboard) this.operate(this.clipboard.operation, this.clipboard, this.state);
    else if (key === 'enter') this.openItem(this.state.selected);
    else if (key === 'backspace') this.openDir(this.state.parent);
    else if (key === 'delete') this.operate('delete');
    else if (key === 'f2' && this.state.selected) this.renameSelected();
    else if (key === 'escape') { this.state.selection = []; this.state.selected = null; this.render(); }
    else if (key.startsWith('arrow') && items.length) {
      const path = event.target.closest('[data-entry]')?.dataset.entry;
      const index = items.findIndex(item => item.path === path);
      const next = items[Math.max(0, Math.min(items.length - 1, index + (key === 'arrowdown' ? 1 : -1)))];
      this.selectItem(id, next.path, event);
    }
    if (['a', 'c', 'x', 'escape'].includes(key)) this.shadowRoot.querySelector(`[data-pane="${id}"] .gc-table-wrap`)?.focus();
  }

  render() {
    if (this._adapter && (!this.state.file || this._adapter.key !== `${this.state.file.root}:${this.state.file.path}`)) this.destroyProvider();
    if (this._adapter) {
      const file = this.state.file;
      if (file.content !== this._adapter.content) { this._adapter.content = file.content; this.sendProvider({ type: 'value', content: file.content }); }
      this.sendProvider({ type: 'theme', theme: this.state.theme });
      this._adapter.frame.inert = this.state.busy || !!this.state.modal;
    }
    const focusId = this.shadowRoot.activeElement?.id;
    const scrolls = [...this.shadowRoot.querySelectorAll('[data-pane]')].map(el => [el.dataset.pane, el.querySelector('.gc-table-wrap')?.scrollTop || 0]);
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
        button, select, input[type=text], input[type=number], .gc-upload-label { box-sizing:border-box; min-height:40px; line-height:20px; padding-top:9px; padding-bottom:9px; }
        select { height:40px; }
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
        .gc-modal { width:min(600px, calc(100vw - 40px)); max-height:calc(100dvh - 40px); overflow-y:auto; background:var(--gc-card); color:var(--gc-text); border:1px solid var(--gc-border); border-radius:16px; box-shadow:0 18px 60px rgba(0,0,0,.35); }
        .gc-modal-head { padding:16px 18px; background:var(--gc-card-soft); border-bottom:1px solid var(--gc-border-soft); }
        .gc-modal-head h3 { margin:0; font-size:18px; }
        .gc-modal-body { padding:18px; color:var(--gc-muted); line-height:1.45; white-space:pre-wrap; }
        .gc-modal-field { display:grid; gap:6px; margin-top:16px; white-space:normal; }
        .gc-modal-field input[type=text], .gc-modal-field select { width:100%; min-width:0; }
        .gc-modal-field:has(input[type=checkbox]) { display:flex; align-items:center; flex-direction:row-reverse; justify-content:flex-end; }
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

        .gc-workspace { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:12px; }
        .gc-pane { min-width:0; border-top:3px solid var(--gc-border); }
        .gc-pane.active { border-top-color:var(--gc-primary); }
        .gc-pane .gc-head { padding:10px; }
        .gc-pane-nav { padding:10px; display:grid; gap:8px; }
        .gc-path-row { display:flex; gap:6px; min-width:0; }
        .gc-path-row input[type="text"] { min-width:0; width:100%; }
        .gc-path-row select { max-width:100px; }
        .gc-crumbs { display:flex; gap:4px; align-items:center; overflow:auto; }
        .gc-crumbs button { padding:3px 6px; border:0; border-radius:4px; white-space:nowrap; }
        .gc-pane-footer { display:flex; flex-wrap:wrap; gap:8px; align-items:center; padding:12px; }
        .gc-pane .gc-table-wrap { height:350px; max-height:50vh; border-block:1px solid var(--gc-border); }
        .gc-pane td:first-child { max-width:260px; }
        .gc-pane [data-toggle] { margin-right:8px; accent-color:var(--gc-primary); }
        .gc-pane .gc-name { display:inline-flex; }
        .gc-pane small { display:block; color:var(--gc-muted); padding-top:3px; }
        .gc-pane .gc-file-entry { max-width:100%; overflow:hidden; text-overflow:ellipsis; }
        .gc-pane tr.selected { box-shadow:inset 3px 0 var(--gc-primary); }
        .gc-pane td { padding:9px 10px; }
        .gc-image-preview { max-width:100%; max-height:500px; object-fit:contain; }
        .gc-archive-preview { max-height:420px; overflow:auto; overflow-wrap:anywhere; }
        .gc-title p, .gc-title strong, .gc-footer-note { overflow-wrap:anywhere; }
        .gc-shell { min-width:0; }
        .gc-root-boundary { display:flex; gap:8px; justify-content:space-between; align-items:center; font-size:12px; color:var(--gc-muted); }
        .gc-root-boundary span { min-width:0; overflow-wrap:anywhere; }
        .gc-root-boundary button { flex-shrink:0; font-size:12px; }
        .gc-hidden-toggle { display:flex; align-items:center; gap:8px; min-height:40px; }
        .gc-markdown-preview { width:100%; min-height:380px; border:1px solid var(--gc-border); border-radius:8px; }
        .gc-markdown-toolbar { display:flex; flex-wrap:wrap; gap:6px; padding-bottom:10px; }
        .gc-markdown-toolbar button { font-size:13px; }
        .gc-editor-card { min-width:0; }
        .gc-editor-card textarea { tab-size:2; }
        .gc-table-wrap:focus-visible { outline:3px solid var(--gc-primary); outline-offset:-3px; }
        @media (max-width: 850px) { .gc-workspace { grid-template-columns:minmax(0,1fr); } .gc-pane:not(.active) { display:none; } .gc-shell { padding-inline:0; } .gc-pane .gc-table-wrap { height:320px; } }
        @media (max-width: 600px) { .gc-pane th:nth-child(3), .gc-pane td:nth-child(3) { display:none; } }
        @media (prefers-reduced-motion: reduce) { .gc-spinner { animation:none; } }
      </style>

      <div class="gc-shell" data-theme="${this.escape(theme)}">
        <section class="gc-card">
          <div class="gc-head">
            <div class="gc-title">
              <h2>🗂️ Grav Commander</h2>
              <p>0.4.0 · Grav-native file and site operations</p>
            </div>
            <div class="gc-tools">
              <button id="gc-settings" title="Open Grav Commander plugin settings">Settings</button>
            </div>
          </div>
          <div class="gc-tabs" role="tablist" aria-label="Grav Commander sections">
            <button id="gc-tab-files" class="gc-tab ${activeTab === 'files' ? 'active' : ''}" type="button">Files</button>
            <button id="gc-tab-backups" class="gc-tab ${activeTab === 'backups' ? 'active' : ''}" type="button">Backups</button>
          </div>
          ${hasNotice ? `<div class="gc-status" role="status" aria-live="polite">
            ${message ? `<span class="gc-msg">${this.escape(message)}</span>` : ''}
            ${error ? `<span class="gc-err">${this.escape(error)}</span>` : ''}
          </div>` : ''}
        </section>

        ${activeTab === 'files' ? `
        ${this.workspaceActionsHtml()}
        <div class="gc-workspace">${this.paneHtml('left')}${this.paneHtml('right')}</div>
        ${this.workspaceActionsHtml(true)}
        ${file ? `<section class="gc-card gc-editor-card">
          <div class="gc-head"><div class="gc-title"><h2>${file.providerId ? this.escape(file.providerLabel || 'Editor') : file.preview ? 'Preview' : /^(md|markdown)$/.test(file.extension) ? 'Markdown source editor' : 'Code / text editor'}</h2><p>${this.escape(file.root)}:/${this.escape(file.path)}</p></div><div class="gc-tools"><span id="gc-dirty" role="status">${this.isDirty() ? '● Unsaved changes' : 'Saved / read-only'}</span><button id="gc-editor-reload">Reload from disk</button><button id="gc-editor-close">Close editor</button></div></div>
            <div class="gc-panel">
              ${file.preview === 'image' ? `<img class="gc-image-preview" src="${this.escape(this.previewUrl)}" alt="${this.escape(file.name)}">` : file.preview === 'archive' ? `<div class="gc-archive-preview"><strong>${file.entries.length} archive entries</strong><ul>${file.entries.map(entry => `<li>${this.escape(entry.name)} · ${this.escape(this.formatSize(entry.size))}</li>`).join('')}</ul></div>` : file ? `
                ${this.markdownToolbarHtml(file)}
                ${file.markdownPreview ? `<button id="gc-preview-close">Close preview</button><iframe class="gc-markdown-preview" title="Markdown preview" sandbox="" referrerpolicy="no-referrer" srcdoc="${this.escape(file.markdownPreview)}"></iframe>` : ''}
                ${file.providerId ? '<slot name="commander-editor"></slot>' : ''}
                <textarea ${file.providerId ? 'hidden' : ''} id="gc-editor" aria-label="File contents" spellcheck="false" ${file.editable ? '' : 'readonly'}>${this.escape(file.content || '')}</textarea>
                <div class="gc-tools">
                  <button id="gc-save" class="primary" ${file.editable ? '' : 'disabled'}>${file.editable ? 'Save file' : 'Read-only preview'}</button>
                  ${file.editable ? '<button id="gc-validate">Validate document</button>' : ''}
                  <span class="gc-muted-small">Cmd/Ctrl+S saves · YAML, JSON and Markdown frontmatter checked before save</span>
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
                        <option value="" ${jarvisModel === '' ? 'selected' : ''}>${this.escape(this.jarvisDefaultLabel())}</option>
                        ${jarvisModels.map(model => `<option value="${this.escape(model.id)}" ${model.id === jarvisModel ? 'selected' : ''}>${this.escape(model.label || model.id)}</option>`).join('')}
                      </select>
                    </label>
                    <label>Action
                      <select id="gc-jarvis-action" aria-label="Jarvis action">
                        ${jarvisActions.map(action => `<option value="${this.escape(action.id)}" ${action.id === jarvisAction ? 'selected' : ''}>${this.escape(action.label)}</option>`).join('')}
                      </select>
                    </label>
                    <div class="gc-tools"><button id="gc-jarvis-load-models" type="button" ${this.state.jarvisModelsLoading ? 'disabled' : ''}>${this.state.jarvisModelsLoading ? 'Loading models…' : 'Refresh models'}</button><button id="gc-jarvis-validate" type="button">Check provider</button></div>
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
                ${file.editable ? '' : '<div class="gc-footer-note">Read-only preview. Editing is controlled by root and extension permissions.</div>'}` : ''}
            </div>
          </section>` : ''}
        ` : ''}

        ${activeTab === 'backups' ? `
        <section class="gc-card">
          <div class="gc-head">
            <div class="gc-title"><h2>Backup Center</h2><p>Grav-native backup tools: profiles, manifests, safety backups, and restore guardrails.</p>${status?.integrations?.site_safeguard?.enabled && this.safeguardAvailable ? '<p>Preferred advanced workflow: Site Safeguard backup, staging and restore.</p><button id="gc-safeguard" class="primary">Open Site Safeguard</button>' : ''}</div>
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
        ${busy ? `<div class="gc-busy-overlay"><div class="gc-busy-box" role="status" aria-live="polite"><span class="gc-spinner"></span><strong>${this.escape(busyLabel || 'Working…')}</strong></div></div>` : ''}
        ${modal ? `<div class="gc-modal-backdrop" role="dialog" aria-modal="true" aria-label="${this.escape(modal.title)}">
          <form class="gc-modal" id="gc-modal-form">
            <div class="gc-modal-head"><h3>${this.escape(modal.title)}</h3></div>
            <div class="gc-modal-body">${this.escape(modal.message)}${this.modalFieldsHtml(modal.fields)}</div>
            <div class="gc-modal-actions">
              ${modal.cancelText === '' ? '' : `<button type="button" id="gc-modal-cancel">${this.escape(modal.cancelText || 'Cancel')}</button>`}
              <button type="submit" id="gc-modal-ok" class="${modal.danger ? 'danger' : 'primary'}">${this.escape(modal.okText || 'OK')}</button>
            </div>
          </form>
        </div>` : ''}
      </div>
    `;

    this.bindEvents(parent);
    this.bindWorkspace();
    if (focusId && !modal) this.shadowRoot.querySelector('#' + CSS.escape(focusId))?.focus({ preventScroll: true });
    scrolls.forEach(([id, top]) => { const list = this.shadowRoot.querySelector(`[data-pane="${id}"] .gc-table-wrap`); if (list) list.scrollTop = top; });
  }

  bindEvents(parent) {
    this.shadowRoot.querySelector('#gc-modal-cancel')?.addEventListener('click', () => this.closeModal(false));
    this.shadowRoot.querySelector('#gc-modal-form')?.addEventListener('submit', event => { event.preventDefault(); this.closeModal(true); });
    this.shadowRoot.querySelectorAll('#gc-modal-form [name]').forEach(input => input.addEventListener('input', () => { const field = this.state.modal?.fields?.find(field => field.name === input.name); if (field) field.value = input.type === 'checkbox' ? input.checked : input.value; }));
    this.shadowRoot.querySelector('#gc-safeguard')?.addEventListener('click', async () => { if (await this.discardEditor()) window.location.href = `${this.adminBasePath()}/plugin/site-safeguard`; });

    this.shadowRoot.querySelector('#gc-settings')?.addEventListener('click', () => this.openPluginSettings());
    this.shadowRoot.querySelector('#gc-use-suggested-path')?.addEventListener('click', () => this.useSuggestedBackupPath());
    this.shadowRoot.querySelector('#gc-tab-files')?.addEventListener('click', () => this.setState({ activeTab: 'files' }));
    this.shadowRoot.querySelector('#gc-tab-backups')?.addEventListener('click', () => this.setState({ activeTab: 'backups' }));
    this.shadowRoot.querySelector('#gc-new-folder')?.addEventListener('click', () => this.makeFolder());
    this.shadowRoot.querySelector('#gc-upload')?.addEventListener('change', e => this.uploadFile(e.target.files?.[0]));

    this.shadowRoot.querySelectorAll('#gc-open-grav-editor, #gc-open-grav-editor-inline').forEach(btn => btn.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      this.openGravPageEditor((btn.id.endsWith('-inline') ? this.state.file : this.state.selected)?.path || '');
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
      if (this.state.file) {
        if (!this._historyApplying && this.state.file.content !== event.target.value) {
          (this._editorUndo ||= []).push(this.state.file.content); if (this._editorUndo.length > 100) this._editorUndo.shift(); this._editorRedo = [];
        }
        this.state.file = { ...this.state.file, content: event.target.value };
      }
      const label = this.shadowRoot.querySelector('#gc-dirty');
      if (label) label.textContent = this.isDirty() ? '● Unsaved changes' : 'Saved / read-only';
    });
    this.shadowRoot.querySelector('#gc-jarvis-provider')?.addEventListener('change', event => {
      if (this.state.file) this.state.file = { ...this.state.file, content: this.editorContent() };
      this.setState({ jarvisProvider: event.target.value, jarvisModels: [], jarvisModel: '', jarvisProposal: null, jarvisMessage: '', jarvisError: '' });
      void this.loadJarvisModels(false);
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
