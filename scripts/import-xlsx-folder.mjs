import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";
import crypto from "node:crypto";
import { getDatabase } from "@netlify/database";
const db=getDatabase();
const map={"owners.xlsx":"owners","pets.xlsx":"pets","bookings.xlsx":"bookings","reminders.xlsx":"reminders","services.xlsx":"services","users.xlsx":"users","vets.xlsx":"vets","rooms.xlsx":"rooms","roles_permissions.xlsx":"roles_permissions","whatsapp_templates.xlsx":"whatsapp_templates","audit_log.xlsx":"audit_log"};
async function schema(){await db.sql`CREATE TABLE IF NOT EXISTS clinic_records (table_name TEXT NOT NULL,id TEXT NOT NULL,data JSONB NOT NULL DEFAULT '{}'::jsonb,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY (table_name,id))`;}
async function upsert(t,row){const id=String(row.id||crypto.randomUUID());const data={...row,id};await db.sql`INSERT INTO clinic_records (table_name,id,data,created_at,updated_at) VALUES (${t},${id},${JSON.stringify(data)}::jsonb,NOW(),NOW()) ON CONFLICT (table_name,id) DO UPDATE SET data=EXCLUDED.data,updated_at=NOW()`;}
await schema();
const folder=process.argv[2]||"./data";let total=0;
for(const [file,t] of Object.entries(map)){const full=path.join(folder,file);if(!fs.existsSync(full))continue;const wb=XLSX.readFile(full);const ws=wb.Sheets[wb.SheetNames[0]];const rows=XLSX.utils.sheet_to_json(ws,{defval:""});for(const r of rows){await upsert(t,r);total++;}console.log(`${file} -> ${t}: ${rows.length}`);}
console.log(`Done. Imported/upserted ${total} rows.`);
