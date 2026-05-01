
import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";
import { getDatabase } from "@netlify/database";
import crypto from "node:crypto";

const db = getDatabase();
const FILE_TABLES = {
  "owners.xlsx":"owners","pets.xlsx":"pets","bookings.xlsx":"bookings","reminders.xlsx":"reminders",
  "services.xlsx":"services","users.xlsx":"users","vets.xlsx":"vets","rooms.xlsx":"rooms",
  "roles_permissions.xlsx":"roles_permissions","whatsapp_templates.xlsx":"whatsapp_templates","audit_log.xlsx":"audit_log"
};
async function ensureSchema(){
  await db.sql`CREATE TABLE IF NOT EXISTS clinic_records (
    table_name TEXT NOT NULL, id TEXT NOT NULL, data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (table_name, id)
  )`;
}
async function upsert(tableName,row){
  const id=String(row.id||row.ID||crypto.randomUUID());
  const now=new Date().toISOString();
  const data={...row,id,updated_at:now,created_at:row.created_at||now};
  await db.sql`INSERT INTO clinic_records (table_name,id,data,created_at,updated_at)
  VALUES (${tableName},${id},${JSON.stringify(data)}::jsonb,NOW(),NOW())
  ON CONFLICT (table_name,id) DO UPDATE SET data=EXCLUDED.data, updated_at=NOW()`;
}
async function main(){
  await ensureSchema();
  const folder=process.argv[2]||"./data";
  if(!fs.existsSync(folder)){ console.error(`Folder not found: ${folder}`); process.exit(1); }
  let total=0;
  for(const [file,table] of Object.entries(FILE_TABLES)){
    const full=path.join(folder,file);
    if(!fs.existsSync(full)) continue;
    const wb=XLSX.readFile(full);
    const ws=wb.Sheets[wb.SheetNames[0]];
    const rows=XLSX.utils.sheet_to_json(ws,{defval:""});
    for(const row of rows){ await upsert(table,row); total++; }
    console.log(`${file} -> ${table}: ${rows.length} rows`);
  }
  console.log(`Import complete. Rows imported/upserted: ${total}`);
}
main().catch(err=>{ console.error(err); process.exit(1); });
