# El baúl: credenciales SSH

El **Baúl** guarda las credenciales con las que trabaja la app y, cuando tú lo
permites, el agente. La primera sección es **SSH**: servidores a los que entrar
por nombre. Se abre desde el icono del baúl, en la fila de utilidades de la barra
lateral.

## Añadir un servidor

**Baúl → SSH → Añadir**. Pide:

| Campo                     | Para qué                                                                                                        |
| ------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Nombre**                | Lo que dirás en el hilo: `lotes-prod`, `preproducción`. También es el id que el agente pasa a las herramientas. |
| **Host** y **puerto**     | Un hostname, una IP o un alias de tu `~/.ssh/config`. El puerto vacío usa el 22.                                |
| **Usuario**               | Vacío significa "lo que diga tu `~/.ssh/config`".                                                               |
| **Autenticación**         | `ssh-agent / ssh config`, una clave en fichero, una clave pegada o una contraseña.                              |
| **Directorio de trabajo** | Opcional; dónde empiezan los comandos del agente.                                                               |
| **Acceso del agente**     | Ver abajo. Por defecto, **solo tú**.                                                                            |

Antes de guardar, **Probar** abre la conexión de verdad y te dice el sistema
remoto y lo que ha tardado. Es la forma de comprobar la credencial sin esperar a
que falle en mitad de una tarea.

## Qué puede hacer el agente

El acceso se decide **por servidor**, y el servidor es quien lo aplica: una
herramienta no puede saltárselo.

| Acceso                      | El agente puede                                                         |
| --------------------------- | ----------------------------------------------------------------------- |
| **Solo tú**                 | Nada. El servidor existe para que lo pruebes y lo uses tú desde la app. |
| **Lectura para el agente**  | Listar carpetas, leer ficheros y ver las últimas líneas de un log.      |
| **Comandos para el agente** | Además, ejecutar un comando no interactivo.                             |

Las herramientas que ve el agente son `ssh_list_servers` (qué hay y cuánto puede
hacer), `ssh_list_directory`, `ssh_read_file`, `ssh_tail_file` y
`ssh_run_command`. Con eso, en un hilo basta decirlo en tus palabras:

> Mira los errores de anoche en `lotes-prod`, en `/var/log/app/error.log`.

El agente resuelve `lotes-prod` por su nombre, lee el fichero y te contesta con lo
que hay. Si el nombre no es exacto o hay dos candidatos, la lista manda: te
pregunta cuál, no adivina.

## Lo que garantiza

- **La credencial no sale del servidor.** La contraseña o la clave se guardan
  fuera de `settings.json`, y ningún cliente las recibe: donde iría el valor, la
  app enseña que está guardada.
- **El agente no ejecuta comandos en un servidor en lectura.** Pedirlo devuelve
  un error que lo dice, en vez de fallar a medias.
- **Nada se escribe sin que se pida.** Leer y listar no tocan el servidor; los
  comandos que sí cambian algo se piden uno a uno, y quedan a la vista en el hilo.
- **La huella del servidor se comprueba.** La primera conexión a un host nuevo se
  acepta y se recuerda en tu `known_hosts`; si la huella cambia, la conexión se
  corta con un aviso claro en vez de seguir como si nada.
- **La salida está acotada.** Un log enorme vuelve recortado y marcado como
  `truncated`, para que nadie confunda un fragmento con el fichero entero.

## Lo que no hace (todavía)

- **No hay terminal interactiva.** Los comandos se ejecutan sin terminal: si algo
  pide una contraseña (un `sudo` sin `-n`, un editor, un paginador), se queda
  esperando hasta agotar el tiempo. Añade `-y` o `--no-pager`, o no lo lances.
- **No sustituye a un entorno remoto.** El hilo sigue corriendo en tu máquina; lo
  que viaja por SSH son los comandos que le pides al servidor.
- **No crea ni modifica servidores por sí solo.** El agente puede usar los que
  hay y probarlos, no darlos de alta.
