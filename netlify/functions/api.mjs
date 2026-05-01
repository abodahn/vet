
import { getDatabase } from "@netlify/database";
import crypto from "node:crypto";

const db = getDatabase();

const TABLES = {
  owners: {
    label: "Owners",
    columns: ["customer_sn", "owner_name", "phone", "email", "address", "preferred_contact", "notes"],
    required: ["owner_name", "phone"]
  },
  pets: {
    label: "Pets",
    columns: ["pet_name", "species", "breed", "sex", "dob", "age_years", "weight_kg", "color", "microchip_id", "spayed_neutered", "allergies", "chronic_conditions", "vaccinations_summary", "owner_id", "notes"],
    required: ["pet_name", "owner_id"]
  },
  bookings: {
    label: "Bookings",
    columns: [
      "appointment_start", "duration_min", "appointment_end", "owner_id", "pet_id",
      "visit_weight_kg", "visit_temp_c", "appointment_type", "priority", "status", "channel",
      "reason", "symptoms", "vet_name", "room", "services_json",
      "service_name", "service_fee", "discount_type", "discount_value", "discount", "paid_amount", "due_amount",
      "fee_amount", "payment_status", "payment_method", "payment_channel", "invoice_no",
      "diagnosis", "treatment_plan", "prescription", "lab_tests", "vaccines_given",
      "followup_datetime", "reminder_channel", "reminder_sent", "reminder_last_opened",
      "portal_token", "owner_confirmed", "owner_update_message", "owner_update_datetime",
      "ai_last_applied_at", "notes"
    ],
    required: ["appointment_start", "owner_id", "pet_id"]
  },
  reminders: {
    label: "Reminders",
    columns: ["booking_id", "owner_id", "pet_id", "reminder_type", "service_name", "channel", "status", "scheduled_for", "opened_at", "sent_at", "message"],
    required: ["scheduled_for", "message"]
  },
  services: {
    label: "Services",
    columns: ["name", "cost", "fee", "margin", "margin_type", "margin_value", "active"],
    required: ["name"]
  },
  users: {
    label: "Users",
    columns: ["username", "password", "role", "active"],
    required: ["username", "password", "role"]
  },
  vets: { label: "Vets", columns: ["name", "active"], required: ["name"] },
  rooms: { label: "Rooms", columns: ["name", "active"], required: ["name"] },
  roles_permissions: { label: "Roles & Permissions", columns: ["role", "permissions"], required: ["role"] },
  whatsapp_templates: {
    label: "WhatsApp Templates",
    columns: ["name", "scenario", "booking_type", "template_text", "active", "is_default"],
    required: ["name", "template_text"]
  },
  audit_log: {
    label: "Audit Log",
    columns: ["timestamp", "username", "role", "action", "entity_type", "entity_id", "details", "ip", "user_agent"],
    required: []
  }
};

const APPOINTMENT_TYPES = ["Consultation", "Vaccination", "Surgery", "Grooming", "Follow-up", "Lab Test", "Other"];
const PRIORITIES = ["Normal", "Urgent", "Emergency"];
const STATUS_FLOW = ["Scheduled", "Checked-in", "In Treatment", "Completed", "Cancelled", "No-Show"];
const CHANNELS = ["Walk-in", "Phone", "App", "WhatsApp", "Email", "Other"];
const PAYMENT_CHANNELS = ["Cash", "Visa", "Instapay"];
const PAYMENT_STATUSES = ["Unpaid", "Paid", "Partial", "Insurance"];
const REMINDER_CHANNELS = ["WhatsApp", "SMS", "Email", "Call", "None"];
const VAT_RATE = 0;

const DEFAULT_SERVICES = [
  { name: "General Exam", cost: "0", fee: "150", margin: "150", margin_type: "value", margin_value: "150", active: "1" },
  { name: "Vaccination", cost: "0", fee: "120", margin: "120", margin_type: "value", margin_value: "120", active: "1" },
  { name: "Deworming", cost: "0", fee: "80", margin: "80", margin_type: "value", margin_value: "80", active: "1" },
  { name: "Grooming Basic", cost: "0", fee: "200", margin: "200", margin_type: "value", margin_value: "200", active: "1" },
  { name: "Grooming Full", cost: "0", fee: "350", margin: "350", margin_type: "value", margin_value: "350", active: "1" },
  { name: "Dental Cleaning", cost: "0", fee: "600", margin: "600", margin_type: "value", margin_value: "600", active: "1" },
  { name: "X-Ray", cost: "0", fee: "450", margin: "450", margin_type: "value", margin_value: "450", active: "1" },
  { name: "Ultrasound", cost: "0", fee: "500", margin: "500", margin_type: "value", margin_value: "500", active: "1" },
  { name: "Blood Test Panel", cost: "0", fee: "400", margin: "400", margin_type: "value", margin_value: "400", active: "1" },
  { name: "Wound Dressing", cost: "0", fee: "180", margin: "180", margin_type: "value", margin_value: "180", active: "1" }
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
function b64(input) { return Buffer.from(input).toString("base64url"); }
function sign(payload) {
  const secret = env("APP_SECRET", "change-this-secret");
  const body = b64(JSON.stringify(payload));
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}
function verify(token) {
  try {
    if (!token || !token.includes(".")) return null;
    const secret = env("APP_SECRET", "change-this-secret");
    const [body, sig] = token.split(".");
    const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
    if (sig.length !== expected.length) return null;
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
  await db.sql`
    CREATE TABLE IF NOT EXISTS clinic_records (
      table_name TEXT NOT NULL,
      id TEXT NOT NULL,
      data JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (table_name, id)
    )
  `;
  await db.sql`CREATE INDEX IF NOT EXISTS idx_clinic_records_table_updated ON clinic_records (table_name, updated_at DESC)`;
  await seedDefaults();
  schemaReady = true;
}
async function count(tableName) {
  const rows = await db.sql`SELECT COUNT(*)::int AS count FROM clinic_records WHERE table_name = ${tableName}`;
  return rows?.[0]?.count || 0;
}
async function insertRecord(tableName, data, id = crypto.randomUUID()) {
  const now = new Date().toISOString();
  const row = { ...data, id, created_at: data.created_at || now, updated_at: now };
  await db.sql`
    INSERT INTO clinic_records (table_name, id, data, created_at, updated_at)
    VALUES (${tableName}, ${id}, ${JSON.stringify(row)}::jsonb, NOW(), NOW())
    ON CONFLICT (table_name, id)
    DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
  `;
  return row;
}
async function seedDefaults() {
  if (await count("services") === 0) for (const x of DEFAULT_SERVICES) await insertRecord("services", x);
  if (await count("vets") === 0) for (const name of DEFAULT_VETS) await insertRecord("vets", { name, active: "1" });
  if (await count("rooms") === 0) for (const name of DEFAULT_ROOMS) await insertRecord("rooms", { name, active: "1" });
  if (await count("roles_permissions") === 0) for (const x of DEFAULT_ROLES) await insertRecord("roles_permissions", x);
  if (await count("users") === 0) await insertRecord("users", { username: env("ADMIN_USER","Admin"), password: env("ADMIN_PASS","1234"), role: "admin", active: "1" });
  if (await count("whatsapp_templates") === 0) {
    await insertRecord("whatsapp_templates", {
      name: "Default Appointment Reminder",
      scenario: "Appointment",
      booking_type: "Any",
      template_text: "Hello {owner_name}, this is a reminder for {pet_name}'s appointment on {appointment_start}.",
      active: "1", is_default: "1"
    });
  }
}
async function all(tableName, limit = 2000) {
  const rows = await db.sql`
    SELECT id, data, created_at, updated_at
    FROM clinic_records
    WHERE table_name = ${tableName}
    ORDER BY updated_at DESC
    LIMIT ${limit}
  `;
  return rows.map(r => ({ id: r.id, ...r.data, _created_at: r.created_at, _updated_at: r.updated_at }));
}
async function one(tableName, id) {
  const rows = await db.sql`SELECT id, data, created_at, updated_at FROM clinic_records WHERE table_name = ${tableName} AND id = ${id} LIMIT 1`;
  if (!rows.length) return null;
  const r = rows[0];
  return { id: r.id, ...r.data, _created_at: r.created_at, _updated_at: r.updated_at };
}
function clean(tableName, input) {
  const meta = TABLES[tableName];
  const out = {};
  for (const col of meta.columns) out[col] = input?.[col] == null ? "" : String(input[col]);
  for (const req of meta.required) if (!String(out[req] || "").trim()) throw new Error(`Missing required field: ${req}`);
  return out;
}
async function audit(req, user, action, entityType="", entityId="", details="") {
  try {
    await insertRecord("audit_log", {
      timestamp: new Date().toISOString(),
      username: user?.username || "system",
      role: user?.role || "",
      action, entity_type: entityType, entity_id: entityId,
      details: String(details || "").slice(0, 1500),
      ip: req.headers.get("x-forwarded-for") || "",
      user_agent: (req.headers.get("user-agent") || "").slice(0, 220)
    });
  } catch {}
}
function n(v) { const x = Number(v); return Number.isFinite(x) ? x : 0; }
function normalizeDateTime(s) {
  if (!s) return "";
  return String(s).trim().replace("T", " ").slice(0,16);
}
function addMinutes(start, mins) {
  const d = new Date(String(start).replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return "";
  d.setMinutes(d.getMinutes() + Number(mins || 30));
  return d.toISOString().slice(0,16).replace("T", " ");
}
function calcBooking(body, services) {
  const subtotal = services.reduce((sum, s) => sum + n(s.fee) * Math.max(1, Math.floor(n(s.qty || 1))), 0);
  const dtype = String(body.discount_type || "value").toLowerCase() === "percent" ? "percent" : "value";
  let discount = dtype === "percent" ? subtotal * Math.min(100, Math.max(0, n(body.discount_value))) / 100 : n(body.discount_value);
  discount = Math.min(subtotal, Math.max(0, discount));
  const net = subtotal - discount;
  const vat = net * VAT_RATE;
  const total = net + vat;
  const paid = Math.max(0, n(body.paid_amount));
  const due = Math.max(0, total - paid);
  const paymentStatus = paid <= 0 ? "Unpaid" : due <= 0 ? "Paid" : "Partial";
  return { subtotal, discount, net, total, paid, due, paymentStatus };
}
function customerSN(existingOwners) {
  let max = 0;
  for (const o of existingOwners) {
    const m = String(o.customer_sn || "").match(/TZ-(\d+)/i);
    if (m) max = Math.max(max, Number(m[1] || 0));
  }
  return `TZ-${String(max + 1).padStart(5, "0")}`;
}
function phoneKey(s) { return String(s||"").replace(/\D+/g,""); }
function matchesText(row, q) {
  const x = q.toLowerCase();
  return JSON.stringify(row).toLowerCase().includes(x);
}
function decorateBooking(b, owners, pets) {
  const owner = owners.find(o => o.id === b.owner_id) || {};
  const pet = pets.find(p => p.id === b.pet_id) || {};
  let services = [];
  try { services = JSON.parse(b.services_json || "[]"); } catch {}
  return {
    ...b,
    owner_name: owner.owner_name || "",
    owner_phone: owner.phone || "",
    pet_name: pet.pet_name || "",
    pet_species: pet.species || "",
    services
  };
}
function bookingMessage(owner, pet, b) {
  return `Hello ${owner.owner_name || ""}, this is a reminder for ${pet.pet_name || "your pet"} appointment on ${b.appointment_start || ""}. Service: ${b.service_name || ""}. Thank you.`;
}
function csvEscape(v) {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
async function dashboard() {
  const [owners,pets,bookings,reminders,services] = await Promise.all([all("owners"), all("pets"), all("bookings"), all("reminders"), all("services")]);
  const decorated = bookings.map(b => decorateBooking(b, owners, pets));
  const today = new Date().toISOString().slice(0,10);
  return {
    counts: { owners: owners.length, pets: pets.length, bookings: bookings.length, reminders: reminders.length, services: services.length },
    revenue: bookings.reduce((s,b)=>s+n(b.paid_amount),0),
    due: bookings.reduce((s,b)=>s+n(b.due_amount),0),
    todayBookings: bookings.filter(b => String(b.appointment_start||"").startsWith(today)).length,
    recentBookings: decorated.slice(0,10)
  };
}

async function createBookingComplete(req, user, body) {
  const owners = await all("owners");
  let ownerId = body.owner_id || "";
  let owner = ownerId ? await one("owners", ownerId) : null;
  if (!owner) {
    const ownerData = clean("owners", {
      customer_sn: body.customer_sn || customerSN(owners),
      owner_name: body.owner_name,
      phone: body.phone,
      email: body.email,
      address: body.address,
      preferred_contact: body.preferred_contact || "WhatsApp",
      notes: body.owner_notes || ""
    });
    owner = await insertRecord("owners", ownerData);
    ownerId = owner.id;
    await audit(req, user, "create", "owners", owner.id, "Created from Booking Center");
  }

  let petId = body.pet_id || "";
  let pet = petId ? await one("pets", petId) : null;
  if (!pet) {
    const petData = clean("pets", {
      pet_name: body.pet_name,
      species: body.species,
      breed: body.breed,
      sex: body.sex,
      dob: body.dob,
      age_years: body.age_years,
      weight_kg: body.weight_kg,
      color: body.color,
      microchip_id: body.microchip_id,
      spayed_neutered: body.spayed_neutered,
      allergies: body.allergies,
      chronic_conditions: body.chronic_conditions,
      vaccinations_summary: body.vaccinations_summary,
      owner_id: ownerId,
      notes: body.pet_notes || ""
    });
    pet = await insertRecord("pets", petData);
    petId = pet.id;
    await audit(req, user, "create", "pets", pet.id, "Created from Booking Center");
  }

  const services = Array.isArray(body.services) ? body.services.filter(s => String(s.name||"").trim()) : [];
  const calc = calcBooking(body, services);
  const start = normalizeDateTime(body.appointment_start) || new Date().toISOString().slice(0,16).replace("T"," ");
  const dur = String(body.duration_min || "30");
  const end = addMinutes(start, dur);
  const invoiceNo = body.invoice_no || `INV-${Date.now().toString().slice(-8)}`;
  const serviceName = services.length ? (services[0].name + (services.length > 1 ? ` +${services.length-1}` : "")) : String(body.service_name || body.appointment_type || "Service");
  const bookingData = clean("bookings", {
    appointment_start: start,
    duration_min: dur,
    appointment_end: end,
    owner_id: ownerId,
    pet_id: petId,
    visit_weight_kg: body.visit_weight_kg || body.weight_kg || "",
    visit_temp_c: body.visit_temp_c || "",
    appointment_type: body.appointment_type || "Consultation",
    priority: body.priority || "Normal",
    status: body.status || "Scheduled",
    channel: body.channel || "Walk-in",
    reason: body.reason || body.diagnosis || "",
    symptoms: body.symptoms || "",
    vet_name: body.vet_name || "",
    room: body.room || "",
    services_json: JSON.stringify(services),
    service_name: serviceName,
    service_fee: calc.subtotal.toFixed(2),
    discount_type: body.discount_type || "value",
    discount_value: body.discount_value || "0",
    discount: calc.discount.toFixed(2),
    paid_amount: calc.paid.toFixed(2),
    due_amount: calc.due.toFixed(2),
    fee_amount: calc.net.toFixed(2),
    payment_status: body.payment_status || calc.paymentStatus,
    payment_method: body.payment_method || body.payment_channel || "",
    payment_channel: body.payment_channel || "",
    invoice_no: invoiceNo,
    diagnosis: body.diagnosis || body.reason || "",
    treatment_plan: body.treatment_plan || "",
    prescription: body.prescription || "",
    lab_tests: body.lab_tests || "",
    vaccines_given: body.vaccines_given || "",
    followup_datetime: normalizeDateTime(body.followup_datetime || ""),
    reminder_channel: body.reminder_channel || "WhatsApp",
    reminder_sent: "",
    reminder_last_opened: "",
    portal_token: crypto.randomBytes(16).toString("hex"),
    owner_confirmed: "",
    owner_update_message: "",
    owner_update_datetime: "",
    ai_last_applied_at: "",
    notes: body.notes || ""
  });
  const booking = await insertRecord("bookings", bookingData);
  await audit(req, user, "create", "bookings", booking.id, "Created from Booking Center");

  // appointment reminder
  if (booking.reminder_channel && booking.reminder_channel !== "None") {
    await insertRecord("reminders", {
      booking_id: booking.id,
      owner_id: ownerId,
      pet_id: petId,
      reminder_type: "Appointment",
      service_name: serviceName,
      channel: booking.reminder_channel,
      status: "Scheduled",
      scheduled_for: start,
      opened_at: "",
      sent_at: "",
      message: bookingMessage(owner, pet, booking)
    });
  }

  // per-service reminders
  for (const s of services) {
    if (s.reminder_at) {
      await insertRecord("reminders", {
        booking_id: booking.id, owner_id: ownerId, pet_id: petId,
        reminder_type: "Service", service_name: s.name,
        channel: booking.reminder_channel || "WhatsApp", status: "Scheduled",
        scheduled_for: normalizeDateTime(s.reminder_at), opened_at: "", sent_at: "",
        message: `Hello ${owner.owner_name || ""}, service reminder: ${s.name} for ${pet.pet_name || "your pet"} on ${normalizeDateTime(s.reminder_at)}.`
      });
    }
  }

  return { owner, pet, booking };
}

export default async (req) => {
  try {
    await ensureSchema();
    const url = new URL(req.url);
    const path = url.pathname.replace("/.netlify/functions/api","").replace(/^\/api/,"");
    const seg = path.split("/").filter(Boolean);
    if (req.method === "OPTIONS") return text("");

    if (!seg.length) return json({ ok: true, app: "Premium Pet Clinic Netlify DB V2" });

    if (seg[0] === "login" && req.method === "POST") {
      const body = await req.json().catch(()=>({}));
      const username = String(body.username||"").trim();
      const password = String(body.password||"").trim();
      const users = await all("users");
      const found = users.find(u => String(u.username||"").toLowerCase() === username.toLowerCase() && String(u.password||"") === password && String(u.active||"1") !== "0");
      const envAdmin = username.toLowerCase() === env("ADMIN_USER","Admin").toLowerCase() && password === env("ADMIN_PASS","1234");
      if (!found && !envAdmin) return json({ error: "Invalid username or password" }, 401);
      const user = found || { username, role: "admin" };
      const token = sign({ username: user.username, role: user.role || "admin", exp: Date.now() + 1000*60*60*12 });
      await audit(req, user, "login", "auth", username, "Successful login");
      return json({ token, user: { username: user.username, role: user.role || "admin" } });
    }

    const user = userFrom(req);
    if (!user) return json({ error: "Unauthorized" }, 401);

    if (seg[0] === "me") return json({ user });
    if (seg[0] === "tables") return json({ tables: Object.entries(TABLES).map(([key,m]) => ({ key, ...m })) });
    if (seg[0] === "lookups") return json({
      appointmentTypes: APPOINTMENT_TYPES, priorities: PRIORITIES, statuses: STATUS_FLOW, channels: CHANNELS,
      paymentChannels: PAYMENT_CHANNELS, paymentStatuses: PAYMENT_STATUSES, reminderChannels: REMINDER_CHANNELS
    });
    if (seg[0] === "dashboard") return json(await dashboard());

    if (seg[0] === "booking") {
      if (seg[1] === "options") {
        const [owners,pets,services,vets,rooms] = await Promise.all([all("owners"), all("pets"), all("services"), all("vets"), all("rooms")]);
        return json({ owners, pets, services, vets, rooms });
      }
      if (seg[1] === "search") {
        const q = String(url.searchParams.get("q") || "").trim();
        const [owners,pets] = await Promise.all([all("owners"), all("pets")]);
        if (!q) return json({ owners: [], pets: [] });
        const pq = phoneKey(q);
        const ownerMatches = owners.filter(o => matchesText(o, q) || (pq && phoneKey(o.phone).endsWith(pq.slice(-10))));
        const ownerIds = new Set(ownerMatches.map(o=>o.id));
        const petMatches = pets.filter(p => matchesText(p, q) || ownerIds.has(p.owner_id));
        return json({ owners: ownerMatches.slice(0,25), pets: petMatches.slice(0,50) });
      }
      if (seg[1] === "create-complete" && req.method === "POST") {
        const body = await req.json().catch(()=>({}));
        return json(await createBookingComplete(req, user, body), 201);
      }
      if (seg[1] === "list") {
        const [owners,pets,bookings] = await Promise.all([all("owners"), all("pets"), all("bookings")]);
        const rows = bookings.map(b => decorateBooking(b, owners, pets));
        return json({ rows });
      }
    }

    if (seg[0] === "export" && req.method === "GET") {
      const tableName = seg[1];
      if (!TABLES[tableName]) return json({ error: "Invalid table" }, 400);
      const rows = await all(tableName);
      const headers = ["id", ...TABLES[tableName].columns, "created_at", "updated_at"];
      const lines = [headers.map(csvEscape).join(",")];
      for (const row of rows) lines.push(headers.map(h => csvEscape(row[h] ?? row[`_${h}`] ?? "")).join(","));
      return text(lines.join("\n"), 200, "text/csv; charset=utf-8");
    }

    if (seg[0] === "records") {
      const tableName = seg[1];
      const id = seg[2];
      if (!TABLES[tableName]) return json({ error: "Invalid table" }, 400);
      if (req.method === "GET" && !id) return json({ rows: await all(tableName) });
      if (req.method === "GET" && id) {
        const row = await one(tableName, id);
        if (!row) return json({ error: "Not found" }, 404);
        return json({ row });
      }
      if (req.method === "POST" && !id) {
        const body = await req.json().catch(()=>({}));
        const row = await insertRecord(tableName, clean(tableName, body));
        await audit(req, user, "create", tableName, row.id, JSON.stringify(body));
        return json({ row }, 201);
      }
      if (req.method === "PUT" && id) {
        const current = await one(tableName, id);
        if (!current) return json({ error: "Not found" }, 404);
        const body = await req.json().catch(()=>({}));
        const row = await insertRecord(tableName, clean(tableName, { ...current, ...body }), id);
        await audit(req, user, "update", tableName, id, JSON.stringify(body));
        return json({ row });
      }
      if (req.method === "DELETE" && id) {
        await db.sql`DELETE FROM clinic_records WHERE table_name = ${tableName} AND id = ${id}`;
        await audit(req, user, "delete", tableName, id, "");
        return json({ ok: true });
      }
    }

    return json({ error: "Not found" }, 404);
  } catch (error) {
    console.error(error);
    return json({ error: error.message || "Server error" }, 500);
  }
};
