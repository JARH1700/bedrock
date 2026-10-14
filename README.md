# Panel Bedrock · producción en Dokploy

Carpeta independiente para subir como raíz de un repositorio Git. Incluye el panel, sus recursos, el motor de biomas precompilado, pruebas y fuentes del motor con su licencia. Usa Node.js 24 y pnpm; no requiere compilar WebAssembly durante el despliegue.

## Publicar en Git

Crea un repositorio vacío en tu proveedor y ejecuta desde esta carpeta, con Git instalado:

```sh
git init -b main
git add .
git commit -m "Prepare Bedrock panel for Dokploy"
git remote add origin URL_DE_TU_REPOSITORIO
git push -u origin main
```

No subas `.env`, mundos, copias ni `node_modules`. `.env.example` contiene únicamente nombres y una contraseña vacía. La carpeta no importa tus mundos locales: una instalación nueva empieza sin servidor configurado.

## Desplegar

1. En un servidor Linux con Docker, crea un proyecto y un servicio **Docker Compose** en Dokploy. No selecciones Stack: este despliegue utiliza `build`.
2. Conecta el repositorio y la rama `main`. Si publicaste esta carpeta como raíz, configura **Compose Path: `./compose.yml`**. Si publicaste el proyecto completo, usa **`./production/compose.yml`**.
3. En **Environment**, pega el contenido de `.env.example` y establece `ADMIN_PASSWORD` con una contraseña única de al menos 12 caracteres. Para varias instalaciones, asigna nombres distintos a los cuatro recursos Docker; una vez instalado, conserva esos nombres para seguir usando los mismos datos.
4. En **Domains**, agrega tu dominio al servicio **`panel`**, puerto interno **`3000`**, con HTTPS y certificado. Apunta el DNS al servidor. Dokploy configura el enrutamiento; el panel no publica un puerto HTTP directamente en el host. Las cookies requieren HTTPS.
5. Despliega, abre el dominio e inicia sesión. Desde la instalación del panel acepta la EULA de Minecraft e instala `itzg/minecraft-bedrock-server`.
6. Permite el puerto de juego elegido en el firewall del servidor/proveedor y, si aplica, en el router: normalmente **19132/UDP**. El dominio web no sustituye esta conexión UDP.

Referencia: [Docker Compose en Dokploy](https://docs.dokploy.com/docs/core/docker-compose), [configurar dominios](https://docs.dokploy.com/docs/core/docker-compose/domains).

## Persistencia y mantenimiento

| Variable | Contenido |
| --- | --- |
| `BEDROCK_VOLUME` | Mundos, paquetes y archivos del servidor |
| `PANEL_VOLUME` | Configuración del panel y programación de copias |
| `BACKUP_VOLUME` | Copias del mundo |

El panel crea el contenedor Bedrock directamente en el mismo Docker del host. Ese contenedor no pertenece al Compose del panel: al detener o eliminar el panel, Bedrock puede seguir encendido. Detén el juego desde el panel antes de un mantenimiento que lo requiera. No elimines volúmenes para actualizar.

El acceso a `/var/run/docker.sock` es necesario para administrar Bedrock y otorga control sobre Docker del host. Protege el acceso al panel. Las copias en este servidor no cubren la pérdida del host: conserva también una copia externa de los volúmenes. La programación solo se ejecuta mientras el panel está activo.

## Comprobación después de desplegar

- Comprueba el estado saludable del servicio y el acceso HTTPS. `/api/health` verifica el panel, no la disponibilidad de Bedrock.
- Instala e inicia Bedrock, revisa la consola y entra desde Minecraft Bedrock por el puerto UDP configurado.
- Crea un mundo de prueba, genera una copia y comprueba su restauración antes de usar mundos importantes.
- Redepliega el panel y verifica que conserva configuración, mundos y copias.

El Seed Finder es experimental: incluye perfiles hasta Bedrock 1.21.60 y estructuras previstas, no garantiza coincidencia con versiones posteriores ni con todas las estructuras del mundo real.

## Desarrollo y actualización del paquete

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test
```

Desde el proyecto original, `node scripts/prepare-production.mjs` vuelve a copiar las fuentes permitidas a esta carpeta y conserva su configuración de despliegue. Si borras o renombras archivos en el proyecto original, elimina también sus versiones antiguas aquí antes de publicar. Revisa siempre el diff antes del commit.

El Dockerfile instala las dependencias de producción con el lockfile. Las pruebas locales no sustituyen comprobar la construcción de la imagen y la conexión real a Bedrock en Dokploy.
