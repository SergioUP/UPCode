# Ideas para UPCode: continuidad y trabajo de integración

## Objetivo y límites

Convertir el fork de T3 Code en una superficie de trabajo que ayude a **retomar, ejecutar, verificar y cerrar** tareas de desarrollo. El caso principal es una integración ERP/PIM → Shopify en UPANGO, pero las capacidades generales deben servir para otros proyectos.

El producto actual ya dispone de proyectos, conversaciones, diffs y checkpoints, enlaces de PR, control de código con Azure DevOps, clientes web/escritorio/móvil y permisos por entorno. Estas ideas proponen **componer y ampliar** esas capacidades; la integración existente de repositorios y PR de Azure DevOps no equivale a gestionar work items. Antes de implementar cada fase, comprobar el contrato y el comportamiento vigente del fork.

**Principio de diseño:** el usuario suele trabajar con un máximo de **tres agentes simultáneos**. Una lista clara de estado, propietario y siguiente acción basta para el MVP. Evitar planificadores de agentes, jerarquías, asignación automática de trabajo y paneles pensados para decenas de sesiones.

## 1. Dev Mission Control

### Problema y experiencia

Al abrir UPCode, mostrar una vista de continuidad en lugar de obligar a reconstruir el contexto conversación por conversación. Cada tarjeta debe responder: **qué se hizo, en qué estado quedó, qué bloquea el avance y cuál es la siguiente acción**.

### MVP

- Sección **Continuar** con los últimos tres trabajos relevantes: proyecto, conversación, rama/worktree, último cambio confirmado, fecha de actualización y acción de reanudación.
- Sección **En curso** con hasta tres agentes: activo, esperando permiso, bloqueado o finalizado; el estado debe proceder del servidor, no de una inferencia del navegador.
- Secciones compactas de **work items vinculados de Azure DevOps** y **PR pendientes**, con acceso a la interfaz dedicada. Si la conexión no está configurada, mostrarlo sin inventar estado.
- Bloqueo y siguiente acción editables, con enlace a la evidencia que los justifica; indicar cuándo se verificó por última vez cada dato externo.
- Filtros por proyecto/cliente y «solo lo mío». Vista web/escritorio primero; móvil con las mismas acciones esenciales.

### Criterios de aceptación

- Desde la pantalla inicial se puede reabrir una conversación y su worktree correcto en un paso.
- Un work item, PR o agente desconectado conserva su último estado conocido **marcado como desactualizado**; nunca aparece como actualizado en vivo.
- Un trabajo sin work item o PR sigue siendo visible y no queda bloqueado por la ausencia de integraciones.
- La vista carga primero un resumen acotado y obtiene detalles bajo demanda; no descarga historiales ni diffs completos para pintar el tablero.

## 2. Espacio de trabajo dedicado a Azure DevOps

### Modelo de trabajo

Azure DevOps debe tener una **interfaz propia dentro de UPCode**, no solo aparecer como un enlace en Mission Control. Su objeto principal es el **work item**: tarea, historia, bug u otro tipo definido por el proceso del proyecto. La interfaz reúne work items, repositorios, ramas, conversaciones y PR sin convertir UPCode en una copia completa de Azure Boards.

**Decisión de autenticación del fork:** una configuración de organización y un Personal Access Token (PAT) constituyen la única identidad de Azure DevOps para todo UPCode: work items, repositorios, ramas, PR, revisiones y operaciones que ya ofrecía T3. El servidor llama directamente a las API HTTPS de Azure DevOps; no depende de `az`, `az login` ni de Azure DevOps CLI para autenticar o consultar. Las operaciones Git locales siguen siendo Git. El PAT se guarda exclusivamente en el almacén de secretos del servidor, se redacta en respuestas al cliente y se puede sustituir o revocar. Nunca se añade a URL, logs, repositorio, Obsidian o memoria personal. Una configuración con PAT caducado o sin permisos muestra un error concreto; no cambia silenciosamente a credenciales de Azure CLI.

En T3 Code, un **thread es la conversación de trabajo**. Recomiendo un work item **principal** por thread para que el contexto y el cierre no sean ambiguos; un work item puede agrupar varios threads, ramas y PR. Se pueden mostrar work items relacionados sin tratarlos como principales. El vínculo debe ser explícito, persistente y reversible, e incluir organización, proyecto e ID del work item. La cadena visible será **work item ↔ thread ↔ repositorio/worktree/rama ↔ diff/checkpoint ↔ PR**.

### Interfaz propuesta

| Vista             | Qué muestra                                                                                                                | Acción principal                                              |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| **Mi trabajo**    | Work items asignados al usuario, en curso y de la iteración seleccionada; filtros por proyecto, tipo, estado y responsable | Abrir o continuar el trabajo                                  |
| **Work items**    | Búsqueda por ID o texto, detalle, descripción, criterios de aceptación, relaciones y actividad disponible según permisos   | Vincular a un thread existente o crear uno desde el work item |
| **Repositorios**  | Repositorios accesibles, ramas y cambios recientes, con sus threads y work items vinculados                                | Abrir el proyecto o elegir rama/worktree para trabajar        |
| **Pull requests** | PR propios y pendientes de revisión, políticas/checks, comentarios y vínculos con work items y threads                     | Revisar diff, continuar trabajo o preparar PR                 |

La ficha del work item será el punto de encuentro: **estado real de ADO, conversación principal, conversaciones relacionadas, repositorio, rama, cambios, PR, bloqueos y siguiente acción**. El selector de organización y proyecto debe ser visible; los campos y estados se adaptan al proceso configurado en ADO, sin asumir que todos usan el mismo workflow. La interfaz muestra origen y hora de la última sincronización.

### MVP

- Conectar una organización de ADO con **lectura** y elegir los proyectos visibles. Buscar work items por ID/texto y filtrar «asignados a mí», estado e iteración; abrir el detalle sin salir de UPCode.
- Desde el work item, **crear un thread o vincular uno existente**; desde la cabecera del thread, buscar y asignar/cambiar/desvincular su work item principal. Mostrar ambos sentidos del vínculo y el historial de cambios de asociación.
- Mostrar repositorio, rama/worktree, diff y PR relacionados reutilizando la integración de control de código existente. **No crear ramas ni PR automáticamente** al vincular un work item.
- Flujo guiado **Seleccionar work item → Preparar implementación → Elegir rama/worktree → Trabajar → Verificar → Preparar PR**. Cada paso indica qué está hecho, qué falta y qué requiere permiso.
- **Quality gate** por proyecto: criterios de aceptación del work item revisados, diff inspeccionado, pruebas registradas, políticas/checks reales del PR, conflictos y vínculo work item–PR cuando la organización lo exija. Estados: «aprobado», «falló» o «sin evidencia»; excepción explícita con motivo.
- Borrador breve para actualizar el work item con hechos verificados y enlaces a thread/PR. **Publicar comentario, cambiar estado o asignar responsable son acciones distintas** y requieren autorización de escritura con vista previa.

### Criterios de aceptación

- Una tarea de ADO se puede localizar por ID, abrir en la interfaz dedicada y asignar a un thread; al volver al work item se ve ese thread y su estado. El vínculo sobrevive al reinicio.
- Un mismo work item admite varios threads y PR; cada thread muestra un único work item principal y puede cambiarlo o desvincularlo sin modificar ADO.
- Cambiar de rama, repositorio o entorno no reasocia silenciosamente el thread a otro work item; la interfaz avisa si la rama y el repositorio ya no coinciden con el trabajo vinculado.
- El panel de repositorios y PR distingue datos obtenidos de ADO de cambios Git locales, con fecha de actualización y errores visibles.
- No se puede presentar un quality gate como superado si faltan resultados de pruebas o checks exigidos.
- Un fallo de ADO no impide revisar el diff local ni preparar el trabajo; se muestra el error y se puede reintentar.
- Toda escritura externa indica destino, contenido y resultado; nunca se hace por el mero hecho de abrir una conversación.

### Recomendaciones de alcance

- Empezar por **lectura, navegación y vínculos locales**. Después añadir escritura de work items con permisos y auditoría; no intentar replicar todos los tableros, consultas y configuraciones de Azure Boards.
- Reutilizar los modelos y la interfaz de repositorios/PR ya presentes, **migrando su transporte de Azure DevOps de CLI a REST con el mismo PAT** antes de considerar completa la integración. Los enlaces deben funcionar incluso si un PR se creó fuera de UPCode.
- Mantener **Jira fuera del MVP**. Si más adelante se necesita, añadirlo como otro proveedor de work items sobre el mismo modelo de vínculos, sin condicionar la interfaz de ADO ni duplicar la lógica de conversaciones.

## 3. Shopify Integration Developer

### Caso de uso

Dar apoyo específico a integraciones **ERP/PIM → extracción → decisión → transformación → carga en Shopify**, conservando contratos entre capas y la lógica funcional válida en migraciones.

### MVP

- Perfil de proyecto con versión de Admin GraphQL, tienda/entorno de prueba, fuentes de contratos y reglas de mapeo **configuradas por el equipo**, sin secretos en el perfil.
- Comparador de esquemas JSON de entrada/salida que identifique campos añadidos, eliminados, cambios de tipo, nulabilidad y valores obligatorios; mostrar ejemplos redactados o sintéticos.
- Asistente de mapping que produzca una tabla origen → transformación → destino Shopify, con supuestos, campos sin resolver y trazabilidad hacia código/contratos.
- Simulación **sin escrituras externas** con fixtures anonimizados: validar transformación, payload y errores previsibles antes de cargar. Las mutaciones reales requieren una acción separada y permisos del entorno.
- Guías verificables para paginación, límites/coste de GraphQL, reintentos, idempotencia y lotes grandes. Proponer pruebas xUnit y Testcontainers cuando el proyecto .NET lo use; no ejecutarlas automáticamente.

### Criterios de aceptación

- Un cambio de esquema genera un informe con ubicación, impacto probable y campos que requieren decisión humana.
- La simulación muestra entrada redactada, salida, validaciones y diferencias, y demuestra que no llamó a Shopify ni al ERP.
- El mapping no oculta campos sin origen, conversiones con pérdida ni supuestos de inventario, variantes o ubicaciones.
- Las pruebas propuestas separan transformación pura, contratos y componentes externos; su resultado solo se marca como verificado cuando hay una ejecución real autorizada.

## 4. Debugging Assistant

### Caso de uso

Partir de un stack trace, un log o un incidente vinculado; identificar el servicio y el flujo afectado, proponer hipótesis **con evidencia y nivel de confianza**, y preparar una reproducción mínima.

### MVP

- Entrada por texto/archivo o selección de error, con redacción previa de tokens, datos personales y payloads sensibles.
- Línea temporal acotada por identificadores estables (por ejemplo, correlación, entidad o instancia de workflow) y enlaces a archivos, cambios y ejecuciones pertinentes.
- Lista corta de hipótesis con evidencia a favor, evidencia en contra y siguiente comprobación que las discrimina. Separar hechos observados de inferencias.
- Plan de reproducción aislada y prueba de regresión propuesta; usar fixtures sintéticos o anonimizados. La ejecución de servicios, contenedores o pruebas requiere autorización según el proyecto.
- Cierre de incidente con causa confirmada, cambio realizado y prueba que evita la regresión; si no se confirmó, dejarlo explícito.

### Criterios de aceptación

- El asistente no afirma una causa raíz solo por similitud textual con un error anterior.
- Cada hipótesis señala la evidencia concreta y una comprobación capaz de refutarla.
- La reproducción no usa datos de producción por defecto ni lanza procesos sin autorización.
- El cierre permite a otra persona localizar el fallo, el cambio y la verificación sin leer toda la conversación.

## 5. Dev Shutdown

### Caso de uso

Al terminar la jornada, generar un cierre útil para el propio desarrollador y, por separado, un resumen profesional que pueda compartir. Dejar un punto de partida preciso para mañana.

### MVP

- Recopilar trabajos activos y terminados, cambios realmente presentes en Git, checks conocidos, work items/PR vinculados y bloqueos. Marcar lo que no se ha podido verificar.
- **Resumen personal:** decisiones, razonamiento breve, pendientes, dependencias, comandos o contexto necesarios para retomar.
- **Resumen profesional:** avance verificable, impacto y próximos pasos en lenguaje apto para el equipo, sin secretos ni detalles internos innecesarios. Es un borrador editable; publicar o enviar es otra acción.
- **Archivo de reanudación** local al entorno/proyecto con enlaces a conversación, work item, worktree/rama, PR, última evidencia y siguiente acción. Debe poder regenerarse sin duplicar entradas.
- Al iniciar la siguiente jornada, Mission Control ofrece «Continuar desde el cierre» y señala si rama, PR o work item cambiaron entretanto.

### Criterios de aceptación

- El resumen diferencia **completado**, **en curso**, **pendiente de verificar** y **bloqueado**.
- El archivo de reanudación abre los recursos correctos y no depende de una transcripción completa ni de memoria personal.
- Nada se publica en Teams, Azure DevOps o redes sociales sin revisión y autorización explícita.
- Si no hay actividad suficiente, se produce un cierre breve en vez de rellenar huecos con suposiciones.

## Arquitectura sugerida

| Pieza                                            | Responsabilidad propuesta                                                                                        | Encaje con T3 Code                                                                                          |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Servicio de contexto de trabajo en `apps/server` | Componer hechos de proyecto, thread, Git, PR y work items; devolver resúmenes acotados y estado de actualización | El servidor posee filesystem, Git, credenciales y estado del entorno                                        |
| Servicio de work items de Azure DevOps           | Búsqueda, lectura, vínculos y actualizaciones autorizadas                                                        | Reutilizar los proveedores de control de código para repositorios y PR; el work item tiene identidad propia |
| Contratos en `packages/contracts`                | Identidades, estados, permisos, comandos y respuestas tipadas                                                    | Compatibilidad entre versiones de servidor y clientes                                                       |
| Estado compartido en `packages/client-runtime`   | Caché de lectura, reconexión, invalidación y selección de entorno/proyecto                                       | Evitar lógica divergente entre web y móvil                                                                  |
| UI web/escritorio/móvil                          | Mission Control, espacio de Azure DevOps, ficha de trabajo, quality gate, simulación y cierre                    | Priorizar web/escritorio en el MVP y cubrir luego las acciones esenciales en móvil                          |
| Persistencia del entorno                         | Vínculos, decisiones, resúmenes y artefactos de reanudación                                                      | La fuente de verdad queda junto al entorno que posee el proyecto                                            |

Las consultas externas deben ser acotadas, con caché y sello temporal. El **servidor** comprueba permisos en cada operación; los clientes solo muestran disponibilidad. Para cambios duraderos, usar servicios con efectos y comandos idempotentes siguiendo el patrón de orquestación existente. Los resúmenes generados son vistas derivadas: conservar enlaces a Git, checks y work items como evidencia. No introducir una base vectorial ni una plataforma de orquestación para el MVP.

## Seguridad y permisos empresariales

- **Aislamiento por entorno y cliente:** credenciales y datos empresariales permanecen en el servidor/tenant autorizado; una sesión remota no usa por accidente el filesystem o las credenciales del dispositivo cliente.
- **Mínimo privilegio:** lectura separada de escritura; pedir autorización explícita para crear ramas, ejecutar comandos, mutar Shopify, actualizar work items, publicar PR o enviar resúmenes. Respetar políticas específicas de la organización y registrar quién aprobó cada acción.
- **Secretos y datos sensibles:** guardar tokens en el almacén de secretos del entorno, redactar logs/payloads antes de mostrarlos o enviarlos al modelo, limitar retención y evitar incluir datos sensibles en resúmenes, fixtures y telemetría.
- **Memoria:** no copiar información confidencial de UPANGO o de clientes a una memoria personal, global o sincronizada con cuentas ajenas. El contexto persistente de empresa debe vivir en sistemas empresariales autorizados, con alcance por cliente/proyecto, control de acceso, borrado y trazabilidad.
- **Datos desactualizados y auditoría:** mostrar origen y fecha de cada estado externo; registrar lecturas/escrituras relevantes, resultado y referencia remota sin duplicar secretos. Los fallos parciales deben quedar visibles.
- **Simulación segura:** modo de lectura y datos sintéticos por defecto. Toda operación de carga real exige destino visible y confirmación de permisos del entorno.

## Fases de implementación

1. **Base de continuidad:** inventariar contratos y vistas existentes; entregar Mission Control con últimos trabajos, agentes, PR y siguiente acción manual. Medir tiempo para retomar una tarea y coste de carga.
2. **Espacio de Azure DevOps:** entregar las vistas Mi trabajo, Work items, Repositorios y Pull requests; asociar work items a threads y reunir en su ficha rama, diff y PR. Integrar quality gate y preparar actualizaciones editables. Empezar con lectura y vínculos locales; habilitar escritura tras validar permisos y auditoría.
3. **Especialización Shopify y diagnóstico:** incorporar perfiles de integración, schema diff, mapping y simulación segura; después, hipótesis guiadas por logs y pruebas de regresión.
4. **Cierre y reanudación:** generar los dos resúmenes y el archivo local; enlazarlo con Mission Control y probar continuidad entre jornadas y dispositivos.

Cada fase debe incluir un caso real anonimizado, criterios de aceptación observables, revisión de seguridad y comprobación en web/escritorio/móvil cuando la funcionalidad esté disponible allí. No ampliar la siguiente fase hasta que el flujo anterior funcione con un proyecto y un work item reales.

## Capacidades transversales opcionales

- **Collaborative Mode:** vista compartida de una tarea y sus decisiones para dos o tres personas, con propietario claro y cambios trazables. Posponer edición simultánea compleja.
- **Memoria contextual:** recuperar decisiones relevantes del proyecto con fuente, fecha y permisos; permitir corregir o borrar recuerdos. Nunca usar memoria personal como almacén de información empresarial.
- **Project Profiles:** configuración ligera por repositorio/cliente (stack, fuentes documentales, convenciones, entorno de prueba y quality gate) para evitar repetir contexto. Herencia explícita y revisión humana de cambios.

## Primer corte recomendado

Construir primero **Mission Control + lectura de work items de ADO + vínculo manual con threads + archivo de reanudación básico**. Ese recorrido prueba continuidad de extremo a extremo con poco riesgo y establece la base del espacio dedicado. Las actualizaciones de work items, el asistente Shopify y el diagnóstico se apoyarán después en identidades, permisos y evidencia ya validados.
