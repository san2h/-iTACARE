import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'builds';
const PUBLIC_NAME = 'itacare.apk';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Falta SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY no .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const apkDir = path.join('android', 'app', 'build', 'outputs', 'apk', 'debug');
if (!fs.existsSync(apkDir)) {
  console.error('Pasta nao encontrada:', apkDir);
  process.exit(1);
}

const apkFile = fs.readdirSync(apkDir).find((f) => f.endsWith('.apk'));
if (!apkFile) {
  console.error('APK nao encontrado em', apkDir);
  process.exit(1);
}

const apkPath = path.join(apkDir, apkFile);
const fileBuffer = fs.readFileSync(apkPath);
const sizeMB = (fileBuffer.length / 1024 / 1024).toFixed(1);

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
let gitHash = 'nogit';
try { gitHash = execSync('git rev-parse --short HEAD').toString().trim(); } catch (err) {}
const historicoName = timestamp + '_' + gitHash + '_' + apkFile;

console.log('');
console.log('=== Upload do APK ===');
console.log('Arquivo:', apkPath);
console.log('Tamanho:', sizeMB, 'MB');
console.log('');

console.log('[1/2] Enviando historico:', historicoName);
const { error: errHist } = await supabase.storage
  .from(BUCKET)
  .upload(historicoName, fileBuffer, {
    contentType: 'application/vnd.android.package-archive',
    cacheControl: '3600',
    upsert: false,
  });

if (errHist) {
  console.error('Falha:', errHist.message);
  process.exit(1);
}
console.log('OK');

console.log('[2/2] Atualizando link publico:', PUBLIC_NAME);
const { error: errPub } = await supabase.storage
  .from(BUCKET)
  .upload(PUBLIC_NAME, fileBuffer, {
    contentType: 'application/vnd.android.package-archive',
    cacheControl: '3600',
    upsert: true,
  });

if (errPub) {
  console.error('Falha:', errPub.message);
  process.exit(1);
}
console.log('OK');

const publicUrl = SUPABASE_URL + '/storage/v1/object/public/' + BUCKET + '/' + PUBLIC_NAME;

console.log('');
console.log('=========================================');
console.log('BUILD PUBLICADA COM SUCESSO!');
console.log('=========================================');
console.log('LINK FIXO PRO CLIENTE:');
console.log(publicUrl);
console.log('=========================================');
console.log('');
