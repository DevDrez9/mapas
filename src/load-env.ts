// Carga el archivo .env cuando la API corre fuera de Docker (npm run start:dev).
// Dentro de Docker no hay .env en la imagen: las variables llegan desde docker-compose.yml.
// Las variables que ya existen en el entorno no se sobrescriben.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const envPath = resolve(process.cwd(), '.env');

if (existsSync(envPath)) {
  try {
    process.loadEnvFile(envPath);
  } catch {
    // Si el archivo no se puede leer, se sigue con las variables del entorno.
  }
}
