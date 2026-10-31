const fs = require('node:fs');
const path = require('node:path');

// Safe environment loader for .env / .env.local
function loadEnv() {
  const envFiles = ['.env.local', '.env'];
  for (const file of envFiles) {
    const fullPath = path.join(process.cwd(), file);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      content.split(/\r?\n/).forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const idx = trimmed.indexOf('=');
          if (idx !== -1) {
            const key = trimmed.slice(0, idx).trim();
            const val = trimmed.slice(idx + 1).trim();
            if (!process.env[key]) {
              process.env[key] = val;
            }
          }
        }
      });
    }
  }
}

loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

class SimpleSupabaseClient {
  constructor(baseUrl, apiKey) {
    this.baseUrl = baseUrl ? baseUrl.replace(/\/$/, '') : '';
    this.apiKey = apiKey;
  }

  async query(table, options = {}) {
    if (!this.baseUrl || !this.apiKey) {
      throw new Error("Supabase credentials not configured.");
    }

    let url = `${this.baseUrl}/rest/v1/${table}?select=*`;
    if (options.limit) url += `&limit=${options.limit}`;

    const headers = {
      'apikey': this.apiKey,
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json'
    };

    const res = await fetch(url, { headers });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Supabase REST Error (${res.status}): ${text}`);
    }
    return res.json();
  }

  async healthCheck() {
    if (!this.baseUrl || !this.apiKey) return { connected: false, error: "Missing URL or API Key" };
    try {
      const res = await fetch(`${this.baseUrl}/auth/v1/health`, {
        headers: { 'apikey': this.apiKey }
      });
      return {
        connected: res.ok,
        status: res.status,
        url: this.baseUrl
      };
    } catch (err) {
      return { connected: false, error: err.message };
    }
  }
}

const supabase = new SimpleSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const supabaseAdmin = new SimpleSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

module.exports = {
  loadEnv,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
  supabase,
  supabaseAdmin
};

