// ═══════════════════════════════════════════════════════════════
// WeGo — supabase.js v1.0
// Client Supabase — lettura config da localStorage
// ═══════════════════════════════════════════════════════════════

const SupabaseClient = (() => {
  let _url    = null;
  let _key    = null;
  let _client = null;

  /**
   * Carica le credenziali dalla configurazione
   */
  function loadConfig() {
    _url = Utils.getConfig('supabase_url');
    _key = Utils.getConfig('supabase_anon_key');
  }

  /**
   * Verifica se Supabase è configurato
   */
  function isConfigured() {
    loadConfig();
    return !!(
      _url &&
      _key &&
      _url.startsWith('https://') &&
      _url.includes('.supabase.co')
    );
  }

  /**
   * Esegue una richiesta REST Supabase
   */
  async function request(method, path, body = null, params = null) {
    if (!isConfigured()) {
      throw new Error('Supabase non configurato. Vai nelle impostazioni admin.');
    }

    let url = `${_url}/rest/v1/${path}`;
    if (params) {
      const qs = new URLSearchParams(params);
      url += `?${qs}`;
    }

    const headers = {
      'Content-Type':  'application/json',
      'apikey':        _key,
      'Authorization': `Bearer ${_key}`,
      'Prefer':        'return=representation'
    };

    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);

    const res = await fetch(url, options);

    // 204 No Content
    if (res.status === 204) return null;

    const data = await res.json();

    if (!res.ok) {
      const msg = data?.message || data?.hint || `Errore HTTP ${res.status}`;
      throw new Error(`[Supabase] ${msg}`);
    }

    return data;
  }

  // ─── EVENTS TABLE ─────────────────────────────────────────
  const events = {
    async create(event) {
      return request('POST', 'sp_events', {
        id:          event.id,
        code:        event.code,
        title:       event.title,
        description: event.description || '',
        currency:    event.currency || 'EUR',
        created_by:  event.created_by || null,
        created_at:  event.created_at,
        updated_at:  event.updated_at
      });
    },

    async update(event) {
      return request('PATCH', `sp_events?id=eq.${event.id}`, {
        title:       event.title,
        description: event.description,
        updated_at:  Utils.now()
      });
    },

    async findByCode(code) {
      const results = await request('GET', 'sp_events', null, {
        code:   `eq.${code}`,
        select: '*'
      });
      return Array.isArray(results) ? results[0] || null : null;
    },

    async getById(id) {
      const results = await request('GET', 'sp_events', null, {
        id:     `eq.${id}`,
        select: '*'
      });
      return Array.isArray(results) ? results[0] || null : null;
    }
  };

  // ─── USERS TABLE ──────────────────────────────────────────
  const users = {
    async create(user) {
      return request('POST', 'sp_users', {
        id:         user.id,
        event_id:   user.event_id,
        name:       user.name,
        color_idx:  user.color_idx || 0,
        created_at: user.created_at,
        updated_at: user.updated_at,
        active:     user.active !== false
      });
    },

    async getByEvent(eventId) {
      return request('GET', 'sp_users', null, {
        event_id: `eq.${eventId}`,
        select:   '*',
        order:    'created_at.asc'
      });
    },

    async update(user) {
      return request('PATCH', `sp_users?id=eq.${user.id}`, {
        name:      user.name,
        active:    user.active,
        updated_at: Utils.now()
      });
    }
  };

  // ─── EXPENSES TABLE ───────────────────────────────────────
  const expenses = {
    async create(expense) {
      return request('POST', 'sp_expenses', {
        id:             expense.id,
        event_id:       expense.event_id,
        type:           expense.type || 'expense',
        title:          expense.title,
        description:    expense.description || '',
        amount:         expense.amount,
        currency:       expense.currency || 'EUR',
        paid_by:        expense.paid_by,
        paid_for:       expense.paid_for || null,
        participants:   expense.participants || [],
        payment_method: expense.payment_method || 'contanti',
        date:           expense.date,
        location_lat:   expense.location?.lat || null,
        location_lng:   expense.location?.lng || null,
        location_address: expense.location?.address || null,
        has_photo:      expense.has_photo || false,
        notes:          expense.notes || '',
        settled:        expense.settled || false,
        created_by:     expense.created_by || null,
        created_at:     expense.created_at,
        updated_at:     expense.updated_at,
        deleted:        expense.deleted || false
      });
    },

    async update(expense) {
      return request('PATCH', `sp_expenses?id=eq.${expense.id}`, {
        title:          expense.title,
        description:    expense.description,
        amount:         expense.amount,
        paid_by:        expense.paid_by,
        participants:   expense.participants,
        payment_method: expense.payment_method,
        date:           expense.date,
        location_lat:   expense.location?.lat || null,
        location_lng:   expense.location?.lng || null,
        location_address: expense.location?.address || null,
        has_photo:      expense.has_photo,
        notes:          expense.notes,
        settled:        expense.settled,
        deleted:        expense.deleted,
        updated_at:     Utils.now()
      });
    },

    async getByEvent(eventId, since = null) {
      const params = {
        event_id: `eq.${eventId}`,
        select:   '*',
        order:    'date.desc,created_at.desc'
      };
      if (since) params.updated_at = `gt.${since}`;
      return request('GET', 'sp_expenses', null, params);
    },

    async delete(id) {
      return request('PATCH', `sp_expenses?id=eq.${id}`, {
        deleted:    true,
        updated_at: Utils.now()
      });
    }
  };

  // ─── PAYMENTS TABLE ───────────────────────────────────────
  const payments = {
    async create(payment) {
      return request('POST', 'sp_payments', {
        id:         payment.id,
        event_id:   payment.event_id,
        from_user:  payment.from_user,
        to_user:    payment.to_user,
        amount:     payment.amount,
        method:     payment.method || 'contanti',
        note:       payment.note || '',
        date:       payment.date,
        created_at: payment.created_at,
        updated_at: payment.updated_at
      });
    },

    async getByEvent(eventId) {
      return request('GET', 'sp_payments', null, {
        event_id: `eq.${eventId}`,
        select:   '*',
        order:    'created_at.desc'
      });
    }
  };

  // ─── SCHEMA SQL ───────────────────────────────────────────
  /**
   * Script SQL da eseguire nel Supabase SQL Editor
   * Disponibile da admin.html
   */
  const SQL_SCHEMA = `
-- WeGo Database Schema v1.0
-- Esegui questo script nel Supabase SQL Editor

-- Abilita UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- TABELLA EVENTI
CREATE TABLE IF NOT EXISTS sp_events (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code        VARCHAR(12) UNIQUE NOT NULL,
  title       VARCHAR(100) NOT NULL,
  description TEXT DEFAULT '',
  currency    VARCHAR(5) DEFAULT 'EUR',
  created_by  VARCHAR(50),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  archived    BOOLEAN DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_sp_events_code ON sp_events(code);

-- TABELLA UTENTI (partecipanti)
CREATE TABLE IF NOT EXISTS sp_users (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id    UUID NOT NULL REFERENCES sp_events(id) ON DELETE CASCADE,
  name        VARCHAR(50) NOT NULL,
  color_idx   INTEGER DEFAULT 0,
  active      BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sp_users_event ON sp_users(event_id);

-- TABELLA SPESE
CREATE TABLE IF NOT EXISTS sp_expenses (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id         UUID NOT NULL REFERENCES sp_events(id) ON DELETE CASCADE,
  type             VARCHAR(20) DEFAULT 'expense',
  title            VARCHAR(100) NOT NULL,
  description      TEXT DEFAULT '',
  amount           DECIMAL(10,2) NOT NULL,
  currency         VARCHAR(5) DEFAULT 'EUR',
  paid_by          UUID REFERENCES sp_users(id),
  paid_for         UUID REFERENCES sp_users(id),
  participants     UUID[] DEFAULT '{}',
  payment_method   VARCHAR(30) DEFAULT 'contanti',
  date             DATE NOT NULL,
  location_lat     DECIMAL(10,7),
  location_lng     DECIMAL(10,7),
  location_address TEXT,
  has_photo        BOOLEAN DEFAULT FALSE,
  notes            TEXT DEFAULT '',
  settled          BOOLEAN DEFAULT FALSE,
  deleted          BOOLEAN DEFAULT FALSE,
  created_by       UUID REFERENCES sp_users(id),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sp_expenses_event ON sp_expenses(event_id);
CREATE INDEX IF NOT EXISTS idx_sp_expenses_date  ON sp_expenses(date DESC);

-- TABELLA PAGAMENTI SALDATI
CREATE TABLE IF NOT EXISTS sp_payments (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id    UUID NOT NULL REFERENCES sp_events(id) ON DELETE CASCADE,
  from_user   UUID NOT NULL REFERENCES sp_users(id),
  to_user     UUID NOT NULL REFERENCES sp_users(id),
  amount      DECIMAL(10,2) NOT NULL,
  method      VARCHAR(30) DEFAULT 'contanti',
  note        TEXT DEFAULT '',
  date        DATE NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sp_payments_event ON sp_payments(event_id);

-- ROW LEVEL SECURITY (opzionale, abilita se vuoi sicurezza extra)
-- ALTER TABLE sp_events   ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE sp_users    ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE sp_expenses ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE sp_payments ENABLE ROW LEVEL SECURITY;

-- Policy: accesso pubblico per anon key (senza RLS)
GRANT SELECT, INSERT, UPDATE ON sp_events   TO anon;
GRANT SELECT, INSERT, UPDATE ON sp_users    TO anon;
GRANT SELECT, INSERT, UPDATE ON sp_expenses TO anon;
GRANT SELECT, INSERT, UPDATE ON sp_payments TO anon;

SELECT 'Schema WeGo installato correttamente!' AS status;
`;

  return {
    isConfigured,
    loadConfig,
    events,
    users,
    expenses,
    payments,
    SQL_SCHEMA
  };
})();

window.SupabaseClient = SupabaseClient;
