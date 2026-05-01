
import { getDatabase } from "@netlify/database";
import crypto from "node:crypto";

const db = getDatabase();

const TABLES = {
  owners: { label: "Owners", columns: ["owner_name", "phone", "email", "address", "preferred_contact", "notes"], required: ["owner_name", "phone"] },
  pets: { label: "Pets", columns: ["pet_name", "species", "breed", "sex", "dob", "age_years", "weight_kg", "color", "microchip_id", "spayed_neutered", "allergies", "chronic_conditions", "vaccinations_summary", "owner_id", "notes"], required: ["pet_name"] },
  bookings: { label: "Bookings", columns: ["appointment_start", "duration_min", "appointment_end", "owner_id", "pet_id", "visit_weight_kg", "visit_temp_c", "appointment_type", "priority", "status", "channel", "reason", "symptoms", "vet_name", "room", "service_name", "service_fee", "discount_type", "discount_value", "discount", "paid_amount", "due_amount", "fee_amount", "payment_status", "payment_method", "payment_channel", "invoice_no", "diagnosis", "treatment_plan", "prescription", "lab_tests", "vaccines_given", "followup_datetime", "reminder_channel", "notes"], required: ["appointment_start", "owner_id", "pet_id"] },
  reminders: { label: "Reminders", columns: ["booking_id", "owner_id", "pet_id", "reminder_type", "service_name", "channel", "status", "scheduled_for", "opened_at", "sent_at", "message"], required: ["scheduled_for", "message"] },
  services: { label: "Services", columns: ["name", "cost", "fee", "margin", "margin_type", "margin_value", "active"], required: ["name"] },
  users: { label: "Users", columns: ["username", "password", "role", "active"], required: ["username", "role"] },
  vets: { label: "Vets", columns: ["name", "active"], required: ["name"] },
  rooms: { label: "Rooms", columns: ["name", "active"], required: ["name"] },
  roles_permissions: { label: "Roles & Permissions", columns: ["role", "permissions"], required: ["role"] },
  whatsapp_templates: { label: "WhatsApp Templates", columns: ["name", "scenario", "booking_type", "template_text", "active", "is_default"], required: ["name", "template_text"] },
  audit_log: { label: "Audit Log", columns: ["timestamp", "username", "role", "action", "entity_type", "entity_id", "details", "ip", "user_agent"], required: [] }
};

const DEFAULT_SERVICES = [
  { name: "General Exam", cost: 0, fee: 150, margin_type: "value", active: "1" },
  { name: "Vaccination", cost: 0, fee: 120, margin_type: "value", active: "1" },
  { name: "Deworming", cost: 0, fee: 80, margin_type: "value", active: "1" },
  { name: "Grooming Basic", cost: 0, fee: 200, margin_type: "value", active: "1" },
  { name: "Grooming Full", cost: 0, fee: 350, margin_type: "value", active: "1" },
  { name: "Dental Cleaning", cost: 0, fee: 600, margin_type: "value", active: "1" },
  { name: "X-Ray", cost: 0, fee: 450, margin_type: "value", active: "1" },
  { name: "Ultrasound", cost: 0, fee: 500, margin_type: "value", active: "1" },
  { name: "Blood Test Panel", cost: 0, fee: 400, margin_type: "value", active: "1" },
  { name: "Wound Dressing", cost: 0, fee: 180, margin_type: "value", active: "1" }
];
const DEFAULT_VETS = ["Ahmed", "Zaineb", "Hatem", "Hayaa"];
const DEFAULT_ROOMS = ["Room 1", "Room 2", "Room 3", "Room 4"];
const DEFAULT_ROLES = [
  { role: "admin", permissions: "all" },
  { role: "reception", permissions: "dashboard_view,owners_manage,pets_manage,bookings_view,bookings_manage,reminders_manage,invoices_view,payments_manage,medical_records_view" },
  { role: "vet", permissions: "dashboard_view,bookings_view,bookings_manage,reminders_manage,medical_records_view,medical_records_print,invoices_view" },
  { role: "staff", permissions: "dashboard_view,bookings_view,bookings_manage,reminders_manage" },
  { role: "user", permissions: "dashboard_view" }
];

let schemaReady = false;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
function text(data, status = 200, contentType = "text/plain; charset=utf-8") {
  return new Response(data, { status, headers: { "content-type": contentType, "cache-control": "no-store" } });
}
function env(name, fallback = "") {
  if (globalThis.Netlify?.env?.get) return Netlify.env.get(name) || fallback;
  return process.env[name] || fallback;
}
function sign(payload) {
  const secret = env("APP_SECRET", "change-this-secret");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}
function verify(token) {
  try {
    if (!token || !token.includes(".")) return null;
    const [body, sig] = token.split(".");
    const expected = crypto.createHmac("sha256", env("APP_SECRET", "change-this-secret")).update(body).digest("base64url");
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch { return null; }
}
function userFrom(req) {
  const h = req.headers.get("authorization") || "";
  return verify(h.startsWith("Bearer ") ? h.slice(7) : "");
}

async function ensureSchema() {
  if (schemaReady) return;
  await db.sql`CREATE TABLE IF NOT EXISTS clinic_records (
    table_name TEXT NOT NULL,
    id TEXT NOT NULL,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (table_name, id)
  )`;
  await db.sql`CREATE INDEX IF NOT EXISTS idx_clinic_records_table_updated ON clinic_records (table_name, updated_at DESC)`;
  await seedDefaults();
  schemaReady = true;
}
async function countTable(tableName) {
  const rows = await db.sql`SELECT COUNT(*)::int AS count FROM clinic_records WHERE table_name = ${tableName}`;
  return rows?.[0]?.count || 0;
}
async function upsert(tableName, data, id = crypto.randomUUID()) {
  const now = new Date().toISOString();
  const row = { ...data, id, created_at: data.created_at || now, updated_at: now };
  await db.sql`INSERT INTO clinic_records (table_name, id, data, created_at, updated_at)
    VALUES (${tableName}, ${id}, ${JSON.stringify(row)}::jsonb, NOW(), NOW())
    ON CONFLICT (table_name, id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`;
  return row;
}
async function seedDefaults() {
  if (await countTable("services") === 0) for (const item of DEFAULT_SERVICES) await upsert("services", item);
  if (await countTable("vets") === 0) for (const name of DEFAULT_VETS) await upsert("vets", { name, active: "1" });
  if (await countTable("rooms") === 0) for (const name of DEFAULT_ROOMS) await upsert("rooms", { name, active: "1" });
  if (await countTable("roles_permissions") === 0) for (const row of DEFAULT_ROLES) await upsert("roles_permissions", row);
  if (await countTable("users") === 0) await upsert("users", { username: env("ADMIN_USER", "Admin"), password: env("ADMIN_PASS", "1234"), role: "admin", active: "1" });
  if (await countTable("whatsapp_templates") === 0) await upsert("whatsapp_templates", { name: "Default Appointment Reminder", scenario: "Appointment", booking_type: "Any", template_text: "Hello {owner_name}, this is a reminder for {pet_name}'s appointment on {appointment_start}.", active: "1", is_default: "1" });
}
function clean(tableName, input) {
  const meta = TABLES[tableName], out = {};
  for (const col of meta.columns) out[col] = input?.[col] == null ? "" : String(input[col]);
  for (const req of meta.required) if (!String(out[req] || "").trim()) throw new Error(`Missing required field: ${req}`);
  return out;
}
async function audit(req, user, action, entityType = "", entityId = "", details = "") {
  try {
    await upsert("audit_log", {
      timestamp: new Date().toISOString(),
      username: user?.username || "system",
      role: user?.role || "",
      action,
      entity_type: entityType,
      entity_id: entityId,
      details: String(details || "").slice(0, 1500),
      ip: req.headers.get("x-forwarded-for") || "",
      user_agent: (req.headers.get("user-agent") || "").slice(0, 220)
    });
  } catch {}
}
async function records(tableName) {
  const rows = await db.sql`SELECT id, data, created_at, updated_at FROM clinic_records WHERE table_name = ${tableName} ORDER BY updated_at DESC LIMIT 1000`;
  return rows.map(r => ({ id: r.id, ...r.data, _created_at: r.created_at, _updated_at: r.updated_at }));
}
async function record(tableName, id) {
  const rows = await db.sql`SELECT id, data, created_at, updated_at FROM clinic_records WHERE table_name = ${tableName} AND id = ${id} LIMIT 1`;
  if (!rows.length) return null;
  const r = rows[0];
  return { id: r.id, ...r.data, _created_at: r.created_at, _updated_at: r.updated_at };
}
function csv(v) {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
async function dashboard() {
  const [owners, pets, bookings, reminders, services] = await Promise.all([records("owners"), records("pets"), records("bookings"), records("reminders"), records("services")]);
  const revenue = bookings.reduce((sum, b) => sum + Number(b.paid_amount || b.fee_amount || 0), 0);
  const today = new Date().toISOString().slice(0,10);
  return { counts: { owners: owners.length, pets: pets.length, bookings: bookings.length, reminders: reminders.length, services: services.length }, revenue, todayBookings: bookings.filter(b => String(b.appointment_start || "").startsWith(today)).length, recentBookings: bookings.slice(0,10) };
}

export default async (req) => {
  try {
    await ensureSchema();
    const url = new URL(req.url);
    const seg = url.pathname.replace("/.netlify/functions/api", "").replace(/^\/api/, "").split("/").filter(Boolean);
    if (req.method === "OPTIONS") return text("");
    if (!seg.length) return json({ ok: true });

    if (seg[0] === "login" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const username = String(body.username || "").trim();
      const password = String(body.password || "").trim();
      const users = await records("users");
      const found = users.find(u => String(u.username || "").toLowerCase() === username.toLowerCase() && String(u.password || "") === password && String(u.active || "1") !== "0");
      const isEnvAdmin = username.toLowerCase() === env("ADMIN_USER", "Admin").toLowerCase() && password === env("ADMIN_PASS", "1234");
      if (!found && !isEnvAdmin) return json({ error: "Invalid username or password" }, 401);
      const user = found || { username, role: "admin" };
      const token = sign({ username: user.username, role: user.role || "admin", exp: Date.now() + 1000 * 60 * 60 * 12 });
      await audit(req, user, "login", "auth", username, "Successful login");
      return json({ token, user: { username: user.username, role: user.role || "admin" } });
    }

    const user = userFrom(req);
    if (!user) return json({ error: "Unauthorized" }, 401);

    if (seg[0] === "me") return json({ user });
    if (seg[0] === "tables") return json({ tables: Object.entries(TABLES).map(([key, m]) => ({ key, label: m.label, columns: m.columns, required: m.required })) });
    if (seg[0] === "dashboard") return json(await dashboard());
    if (seg[0] === "export") {
      const table = seg[1];
      if (!TABLES[table]) return json({ error: "Invalid table" }, 400);
      const rows = await records(table);
      const headers = ["id", ...TABLES[table].columns, "created_at", "updated_at"];
      const lines = [headers.map(csv).join(",")];
      for (const row of rows) lines.push(headers.map(h => csv(row[h] ?? row[`_${h}`] ?? "")).join(","));
      return text(lines.join("\n"), 200, "text/csv; charset=utf-8");
    }
    if (seg[0] === "records") {
      const table = seg[1], id = seg[2];
      if (!TABLES[table]) return json({ error: "Invalid table" }, 400);
      if (req.method === "GET" && !id) return json({ rows: await records(table) });
      if (req.method === "GET" && id) {
        const row = await record(table, id);
        return row ? json({ row }) : json({ error: "Not found" }, 404);
      }
      if (req.method === "POST" && !id) {
        const data = clean(table, await req.json().catch(() => ({})));
        const row = await upsert(table, data);
        await audit(req, user, "create", table, row.id, JSON.stringify(data));
        return json({ row }, 201);
      }
      if (req.method === "PUT" && id) {
        const current = await record(table, id);
        if (!current) return json({ error: "Not found" }, 404);
        const data = clean(table, { ...current, ...(await req.json().catch(() => ({}))) });
        const row = await upsert(table, data, id);
        await audit(req, user, "update", table, id, JSON.stringify(data));
        return json({ row });
      }
      if (req.method === "DELETE" && id) {
        await db.sql`DELETE FROM clinic_records WHERE table_name = ${table} AND id = ${id}`;
        await audit(req, user, "delete", table, id, "");
        return json({ ok: true });
      }
    }
    return json({ error: "Not found" }, 404);
  } catch (error) {
    console.error(error);
    return json({ error: error.message || "Server error" }, 500);
  }
};
