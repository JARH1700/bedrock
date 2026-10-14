# Panel Bedrock · Docker Compose

Panel independiente para administrar Minecraft Bedrock. URL configurada: **https://minecraft.pr4do.cloud**. Incluye un proxy Caddy para HTTPS, el panel y volúmenes persistentes. El panel instala el contenedor de juego desde su interfaz.

## Requisitos

- Servidor Linux con Docker Engine y Docker Compose v2, Git y acceso a Internet.
- Registro DNS A de `minecraft.pr4do.cloud` apuntando a la IP pública del servidor. Si tienes AAAA, debe apuntar también a este servidor con IPv6 operativo. Para conexión directa, configura el registro en modo solo DNS si usas un proveedor con proxy.
- Puertos **80/TCP y 443/TCP** disponibles en el host y abiertos en firewall/router. **443/UDP** es opcional para HTTP/3. El juego usa **19132/UDP** por defecto: ábrelo también.
- Si hay otro proxy ocupando 80/443, libera esos puertos antes de iniciar este Compose. No detengas servicios ajenos sin revisar qué alojan.

## Instalar

```sh
git clone https://github.com/JARH1700/bedrock.git
cd bedrock
cp .env.example .env
chmod 600 .env
nano .env
```

Establece `ADMIN_PASSWORD` con una contraseña única de al menos 12 caracteres. Mantén `PANEL_DOMAIN=minecraft.pr4do.cloud`. No subas `.env` a Git. Si tu contraseña contiene `$` o `#`, escribe el valor entre comillas simples en `.env`.

```sh
docker compose config --quiet
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 panel proxy
```

Abre **https://minecraft.pr4do.cloud**, inicia sesión y usa la instalación del panel para aceptar la EULA e instalar `itzg/minecraft-bedrock-server`. Para jugar, usa `minecraft.pr4do.cloud` y el puerto UDP configurado, normalmente 19132; no escribas `https://` en Minecraft.

Caddy obtiene y renueva el certificado y redirige HTTP a HTTPS cuando el DNS y los puertos son accesibles. Las cookies del panel requieren HTTPS. [Documentación de HTTPS automático](https://caddyserver.com/docs/automatic-https).

El panel escucha en 3000 dentro de Docker; solo el proxy publica los puertos web. La consola transmitida se reenvía sin esperar a llenar un búfer.

## Datos y actualización

| Variable | Contenido |
| --- | --- |
| `BEDROCK_VOLUME` | Mundos, paquetes y archivos del servidor |
| `PANEL_VOLUME` | Configuración del panel y programación de copias |
| `BACKUP_VOLUME` | Copias del mundo |

Conserva los nombres de volúmenes y de `BEDROCK_CONTAINER` si ya tienes una instalación en este mismo host. Solo debe haber un panel administrando ese contenedor. Una instalación en otro host requiere trasladar los datos; Git no incluye mundos ni copias. Los volúmenes de Caddy guardan sus certificados y configuración.

```sh
git pull --ff-only
docker compose up -d --build
```

No uses `docker compose down -v` para actualizar: elimina volúmenes del despliegue. El contenedor Bedrock se crea fuera de Compose; detener el panel no detiene automáticamente el juego. Usa el panel para detenerlo antes del mantenimiento que lo requiera.

El socket Docker permite al panel administrar el host. Protege la contraseña y el acceso al servidor. Conserva copias externas: los backups locales no cubren la pérdida del host. La programación de copias solo funciona mientras el panel está activo.

## Verificar la instalación

```sh
curl --fail https://minecraft.pr4do.cloud/api/health
docker compose ps
```

El healthcheck comprueba el panel, no Bedrock. Verifica además que puedes entrar al juego, crear y restaurar una copia de un mundo de prueba y redeplegar sin perder los datos.

Si falla HTTPS, revisa DNS, puertos y `docker compose logs proxy`. Si el panel funciona pero el juego no conecta, revisa el estado de Bedrock y el puerto UDP en el firewall.

## Desarrollo

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test
```

El motor WebAssembly viene compilado; su fuente y licencia están incluidas. El Seed Finder es experimental, con perfiles hasta Bedrock 1.21.60 y estructuras previstas. No garantiza coincidencia con todas las estructuras ni con versiones posteriores.
