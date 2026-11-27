// Roda o assembleDebug do Gradle em qualquer sistema.
// Windows usa gradlew.bat; macOS/Linux usam ./gradlew.
// Sem JAVA_HOME, usa o Java que vem com o Android Studio (pasta jbr).
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const isWindows = process.platform === 'win32';
const androidDir = path.resolve('android');
const cmd = isWindows ? 'gradlew.bat' : './gradlew';

const env = { ...process.env };
if (!env.JAVA_HOME) {
  const candidates = isWindows
    ? [
        'C:\\Program Files\\Android\\Android Studio\\jbr',
        path.join(env.LOCALAPPDATA || '', 'Programs', 'Android Studio', 'jbr'),
      ]
    : [
        '/Applications/Android Studio.app/Contents/jbr/Contents/Home',
        '/opt/android-studio/jbr',
      ];
  const found = candidates.find((dir) => dir && fs.existsSync(dir));
  if (found) {
    env.JAVA_HOME = found;
    console.log(`> JAVA_HOME não definido, usando o Java do Android Studio: ${found}`);
  } else {
    console.warn('> Aviso: JAVA_HOME não definido e o Java do Android Studio não foi encontrado.');
  }
}

console.log(`> ${cmd} assembleDebug (em ${androidDir})`);

const result = spawnSync(cmd, ['assembleDebug'], {
  cwd: androidDir,
  stdio: 'inherit',
  shell: isWindows, // .bat precisa de shell no Windows
  env,
});

if (result.error) console.error(result.error);
process.exit(result.status ?? 1);
