<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/readme/up-mark-white.png">
    <img src="docs/readme/up-mark-black.png" alt="UPCode" width="240">
  </picture>
</p>

<h3 align="center">Mesa de control para agentes de IA en trabajo de integración</h3>

<p align="center">
  <a href="https://github.com/SergioUP/UPCode/releases/latest"><img alt="Última versión" src="https://img.shields.io/github/v/release/SergioUP/UPCode?label=release&color=4c9aff"></a>
  <img alt="Windows" src="https://img.shields.io/badge/instalador-Windows%20x64-0078D6">
  <a href="LICENSE"><img alt="Licencia" src="https://img.shields.io/badge/licencia-MIT-green"></a>
  <img alt="Fork de T3 Code" src="https://img.shields.io/badge/fork%20de-T3%20Code-6e7681">
  <img alt="Azure DevOps" src="https://img.shields.io/badge/Azure%20DevOps-work%20items%20%7C%20PRs-0078D7">
</p>

---

**UPCode** es un fork de [T3 Code](https://github.com/pingdotgg/t3code) con una capa de trabajo encima pensada para un equipo que hace integraciones: **ERP/PIM → Shopify**, migraciones y apaños de catálogo. La idea es sencilla: que cada conversación con un agente esté pegada a la tarea real de Azure DevOps y no a la memoria de nadie.

No es un orquestador de flotas de agentes ni un tablero para cincuenta sesiones. Es una mesa de control: pocos agentes a la vez, el trabajo a la vista y el contexto donde tiene que estar.

## Índice

- [Para qué sirve](#para-qué-sirve)
- [🔷 Compatibilidad con Azure DevOps](#compatibilidad-con-azure-devops)
- [🔀 Pull requests](#pull-requests)
- [🤖 Agentes de IA](#agentes-de-ia)
- [📸 Capturas](#capturas)
- [📦 Instalación](#instalación)
- [🚀 Primeros pasos](#primeros-pasos)
- [⚙️ Configuración](#configuración)
- [🧯 Solución de problemas](#solución-de-problemas)
- [🛠 Desarrollo](#desarrollo)
- [🔒 Datos y privacidad](#datos-y-privacidad)
- [🧭 Límites conocidos y lo que viene](#límites-conocidos-y-lo-que-viene)
- [🙏 Créditos y licencia](#créditos-y-licencia)

## Para qué sirve

Un integrador pasa el día saltando entre el ticket, el ERP, una consola de SQL y el navegador. El agente de IA ayuda, pero se le olvida de qué iba la tarea en cuanto cambias de pestaña. UPCode resuelve eso:

- 🧵 **Un hilo = un agente trabajando.** Cada conversación tiene su proyecto, su rama y su worktree.
- 🎫 **Un hilo, un work item principal.** La tarea de Azure DevOps se vincula a mano y se puede soltar; quitarla del hilo **no** toca Azure.
- 👀 **El estado siempre a la vista.** El número de tarea en la tarjeta lleva el color que Azure da al estado del work item.
- 🗂️ **El trabajo del equipo, sin inventos.** Tablero, lista y calendario sobre los work items reales, con los estados y colores del proceso de Azure.
- 🚀 **Pull requests desde la app**, incluidas las políticas del repositorio y el merge cuando de verdad están en verde.

## Compatibilidad con Azure DevOps

Esta es la razón de ser del fork. Todo lo de Azure se lee de **tu organización y tu proceso**; no hay una lista de estados inventada ni un espejo local que se desincronice.

### Qué se puede hacer hoy

| Función              | Cómo                                                                                     |
| -------------------- | ---------------------------------------------------------------------------------------- |
| 🔎 Ver work items    | Sección **DevOps**: tablero, lista y calendario, un proyecto a la vez                    |
| 👤 Mi trabajo        | Filtro «asignado a mí» dentro del proyecto elegido                                       |
| 🎨 Estados y colores | Se leen del proceso de Azure en tiempo real; el color de la columna es el del estado     |
| ↔️ Mover una tarea   | Arrastrar y soltar escribe el estado en Azure (sin confirmación, sin deshacer)           |
| 🗓️ Sprints           | El calendario va por iteraciones; las fechas viajan con el work item                     |
| 🏷️ Etiquetas         | Locales de la app, guardadas en ajustes; **nunca** se escriben en Azure                  |
| 🧵 Vincular un hilo  | Fila **Work item** del panel del hilo → buscar por `#id` o por título                    |
| 📝 Editar la tarea   | Título, estado, descripción, comentario, campos y relaciones; «Guardar» publica en Azure |
| 🔗 Quitar el vínculo | Botón **Quitar** de la ficha: solo desvincula el hilo, la tarea sigue en Azure           |
| 🔀 Pull requests     | Checks y políticas del repositorio, comentarios y merge desde la app                     |

### Cómo se conecta

1. **Ajustes → Source control**: la organización es el _slug_ de `dev.azure.com/{organización}`.
2. Pega un **PAT** con permisos de:
   - **Work Items**: lectura y escritura (ver y editar tareas).
   - **Code**: lectura (repos, ramas y pull requests); escritura si vas a mergear desde la app.
3. Se guarda solo. Si falta la organización o el token, la app lo dice y **no llama** a Azure.

> [!NOTE]
> Lo que ya usaba `az` (clonar repos, checkout de PRs) sigue usando Azure CLI y las credenciales de Git. El PAT es solo para las pantallas nuevas: no se mete en la URL del remoto, ni en argumentos, ni en variables de entorno del proceso.

### Lo que garantiza (y lo que no hace)

- ✅ **Nada se escribe sin que lo pidas.** Ver una tarea no manda nada; editar sí, y avisa del resultado real de Azure.
- ✅ **Los estados salen de Azure.** Si tu proceso cambia, la app lo enseña cambiado.
- ❌ **No crea ramas ni PR** al vincular una tarea. Vincular es un acto local y reversible.
- ❌ **No toca Jira.** Fuera de alcance por decisión, no por pereza.

## Pull requests

Lista y detalle de PRs de los hosts que ya soporta la base: **Azure DevOps, GitHub, GitLab, Bitbucket, Forgejo y Gitcafe**.

- Checks y **políticas del repositorio** con su estado real.
- Comentarios y diff con el mismo visor que el resto de la app.
- Merge, rebase o actualización de la rama desde la app, y auto-merge cuando el host lo permite.
- Un hilo puede llevar su PR y verlo en el panel lateral, al lado del work item.

## Agentes de IA

UPCode no trae modelos: **usa las suscripciones que ya tienes**. Hereda de T3 Code el soporte de Codex, Claude Code, Cursor, Grok Build, OpenCode y Antigravity, y los agentes que hablen **ACP**.

- Cada proyecto tiene su carpeta y sus worktrees: un hilo por rama, sin pisarse.
- Modos de permisos (lectura, edición, acceso total) por hilo.
- Uso y consumo por proveedor en la sección **Usage**.
- Acceso remoto al servidor desde otro dispositivo (heredado de T3 Code; ver [`docs/`](./docs)).

## Capturas

> Hueco reservado para las capturas reales: sección **DevOps**, panel de **Work item** de un hilo y detalle de **Pull request**.
> Si las añades, cuidado con los datos: **este repositorio es público**. Nada de nombres de clientes, títulos de tareas reales ni organización visible sin difuminar.

## Instalación

**Windows x64** (la vía normal): descarga el instalador de la [última release](https://github.com/SergioUP/UPCode/releases/latest) y ejecútalo. Es un NSIS normal: instala en el perfil del usuario y **no** pide administrador.

- 🪄 **Se actualiza sola** a partir de la **0.1.2**: comprueba las releases de este repositorio al arrancar y cada pocos minutos. El aviso sale en el pie de la barra lateral y en **Ajustes → About**.
- ⚠️ Las versiones **anteriores a la 0.1.2** no se actualizan solas (el actualizador estaba desactivado). Hay que instalar la 0.1.2 a mano una vez.
- 🍎🐧 **macOS y Linux**: no hay instalador publicado. Se compila desde el código (ver [Desarrollo](#desarrollo)).

## Primeros pasos

1. **Un agente de IA.** Instala y autentica al menos uno (por ejemplo `codex login` o `opencode auth login`) en la misma máquina. La app lo detecta; si no aparece, **Ajustes → Providers**.
2. **Un proyecto.** Añade la carpeta del repositorio. Cada proyecto tiene su rama de trabajo y sus worktrees.
3. **Azure DevOps.** Organización + PAT en **Ajustes → Source control**.
4. **Un hilo.** Nueva conversación → escribe la tarea. Si tienes el número, pásalo: `#8516`.
5. **Vincúlalo.** Panel del hilo → **Work item** → busca y asigna. A partir de ahí, la tarjeta del hilo lleva el número con el color del estado.
6. **Trabaja y cierra.** El diff del hilo, el PR y los checks están en el mismo sitio; no hay que abrir el navegador para saber si algo está en verde.

## Configuración

| Ajuste                    | Para qué                                                                 |
| ------------------------- | ------------------------------------------------------------------------ |
| **Source control**        | Organización de Azure DevOps + PAT. También credenciales de otros hosts  |
| **Providers**             | Agentes de IA, cuentas y modelos por defecto                             |
| **Projects**              | Carpetas de trabajo, ramas, scripts del proyecto                         |
| **Integrations**          | Navegador embebido y dispositivos                                        |
| **About**                 | Versión, canal de actualizaciones (Latest/Nightly) y comprobación manual |
| **Storage / Diagnostics** | Dónde vive el estado y qué está pasando por debajo                       |

## Solución de problemas

| Síntoma                                      | Qué mirar                                                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Azure responde 401/403                       | PAT caducado o sin permisos de Work Items/Code. Regenera y vuelve a pegarlo en **Source control**             |
| Los avatares de Azure salen como iniciales   | Es a propósito: la imagen necesita el PAT y no se expone al navegador                                         |
| No aparece el aviso de actualización         | Estás en una versión anterior a la 0.1.2. Instala esa a mano una vez                                          |
| La app no arranca tras actualizar            | Borra la caché del actualizador (`%LOCALAPPDATA%\t3code-updater`) y vuelve a abrir                            |
| La sesión del navegador caduca en desarrollo | El token de emparejamiento es de un solo uso: vuelve a abrir la URL de emparejamiento que imprime el servidor |
| Se instala en una carpeta llamada `t3code`   | Sí, es herencia del fork. Los datos van aparte, en `.upcode`                                                  |

## Desarrollo

Requisitos: **Node 24**, **pnpm 11** y Rust estable (para el monitor de recursos del escritorio).

```bash
pnpm install
pnpm dev            # web + servidor de desarrollo
pnpm typecheck      # tipos de todos los paquetes
pnpm test           # tests
pnpm lint           # reglas del repo
```

En desarrollo, el servidor escucha en `http://localhost:13773` y la web en `http://localhost:5733`; los puertos reales salen en la línea `[dev-runner]` del arranque, porque si están ocupados se desplazan. El estado de desarrollo vive en el `.upcode` del worktree; el runner acepta `--home-dir` para aislarlo en otro sitio.

Estructura, en corto:

| Ruta                        | Qué hay                                                                         |
| --------------------------- | ------------------------------------------------------------------------------- |
| `apps/server`               | Servidor WebSocket, orquestación de turnos, agentes y checkpoints               |
| `apps/web`                  | Interfaz (React + Vite). Es la que usa el escritorio                            |
| `apps/desktop`              | Electron: ventana, actualizador, integración con el sistema                     |
| `packages/contracts`        | Esquemas que cruzan el cable (RPC, ajustes, Azure DevOps)                       |
| `packages/source-control-*` | Adaptadores por host: Azure DevOps, GitHub, GitLab, Bitbucket, Forgejo, Gitcafe |
| `packages/provider-*`       | Adaptadores de agentes                                                          |

### Cortar una release

El workflow **UPCode Windows release** (`.github/workflows/upcode-windows-release.yml`) se lanza a mano con una versión `X.Y.Z`:

1. Actions → _UPCode Windows release_ → **Run workflow**, o un `workflow_dispatch` por API con `{"ref":"main","inputs":{"version":"0.1.3"}}`.
2. Compila el NSIS x64 en `windows-2025` (unos 5-10 minutos).
3. Publica el tag `upcode-vX.Y.Z` como **latest** con `UPCode-X.Y.Z-x64.exe`, `latest.yml` y el `.blockmap`. Los tres son necesarios para que el actualizador funcione.

## Datos y privacidad

- Todo vive en tu máquina: `%USERPROFILE%\.upcode\userdata` (Windows). Ahí están `statev2.sqlite`, los ajustes, los secretos y los logs.
- El PAT y las credenciales se guardan en `secrets/`, en ficheros del usuario fuera del repositorio. No van cifrados con la clave del sistema: trata esa carpeta como tratarías un `.env`.
- Los agentes corren como subprocesos con tus credenciales de proveedor, igual que si los lanzaras a mano.
- La app solo sale a la red para hablar con tu proveedor de IA, con Azure DevOps (cuando se lo pides) y con las releases de este repositorio para actualizarse.

## Límites conocidos y lo que viene

- 🛍️ **Herramientas de Shopify** (perfil del proyecto, diff de esquemas, tabla de mapping, simulación sin llamar a Shopify): diseñadas, **no implementadas**. Hoy el trabajo de integración se hace con el agente y el repositorio.
- 📱 **La app móvil** sigue con la marca de T3 y no tiene las vistas de Azure DevOps.
- 🧹 **Caché del actualizador compartida** con T3 Code (`t3code-updater`): inofensivo, pero conviene separarla.
- 🗣️ Parte del texto de la interfaz sigue en inglés: es un fork y se traduce a medida que se toca.

## Créditos y licencia

UPCode es un **fork de [T3 Code](https://github.com/pingdotgg/t3code)**, de T3 Tools Inc., publicado bajo licencia **MIT** (ver [LICENSE](LICENSE)). Este fork no está afiliado a T3 Tools ni cuenta con su respaldo: los aciertos de la base son suyos, y los inventos de encima, nuestros.

Se mantiene la licencia MIT y la atribución original. Si vienes de T3 Code y echas algo en falta, está casi todo: la diferencia es la capa de Azure DevOps y la marca.
