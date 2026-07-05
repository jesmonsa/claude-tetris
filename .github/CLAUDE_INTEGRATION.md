# Integración GitHub Actions + Claude Code

Guía para replicar esta configuración en cualquier repositorio.

---

## Qué hace

| Workflow | Trigger | Resultado |
|---|---|---|
| **Claude Code** (`claude.yml`) | Issue/PR con `@claude` en el texto | Claude ejecuta la tarea, crea una rama y ofrece un PR |
| **Claude Code Review** (`claude-code-review.yml`) | Cualquier PR abierto/actualizado | Claude revisa el diff y comenta el PR automáticamente |
| **Claude Issue Triage** (`claude-issue-triage.yml`) | Issue abierto o editado (sin `@claude`) | Claude asigna labels y publica un diagnóstico técnico como comentario |

---

## Requisitos previos

### 1. Token OAuth de Claude Code

Necesitas un `CLAUDE_CODE_OAUTH_TOKEN`. Se obtiene al instalar la GitHub App oficial de Claude Code:

1. Ve a [https://github.com/apps/claude](https://github.com/apps/claude) e instálala en tu cuenta/organización.
2. El token se genera automáticamente y se almacena como secret.

### 2. Secret en el repositorio

El token debe existir como secret con el nombre exacto `CLAUDE_CODE_OAUTH_TOKEN`:

- Repositorio → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**
- Nombre: `CLAUDE_CODE_OAUTH_TOKEN`
- Valor: el token de la GitHub App

---

## Cómo replicar en un nuevo proyecto

Copia estos dos archivos en el repositorio destino respetando la ruta:

```
.github/
  workflows/
    claude.yml
    claude-code-review.yml
```

No necesitas modificar nada si el secret ya está configurado. Si el repositorio pertenece a la misma cuenta/organización donde instalaste la GitHub App, el token estará disponible automáticamente.

---

## Cómo usar `@claude` (Claude Code workflow)

### Desde un Issue

1. Crea un issue describiendo la tarea.
2. En cualquier comentario del issue escribe `@claude` seguido de la instrucción:

```
@claude añade un botón de reinicio visible en la pantalla principal
```

Claude leerá el issue, ejecutará la tarea, hará commit en una rama nueva (`claude/issue-N-fecha`) y dejará un comentario con el link para crear el PR.

### Desde un PR

En un comentario de review o inline escribe `@claude`:

```
@claude este bloque tiene un bug de off-by-one, corrígelo
```

---

## Flujo completo (ejemplo de este proyecto)

```
Issue creado: "Falta el titulo del juego"
  └─ Comentario con @claude
       └─ GitHub Actions activa claude.yml
            └─ Claude lee el issue, modifica index.html y style.css
                 └─ Commit en rama: claude/issue-1-20260702-2258
                      └─ Comentario en el issue con link "Create PR ➔"
                           └─ PR creado y mergeado manualmente
```

---

## Permisos que necesitan los workflows

Los workflows ya están configurados con los permisos mínimos necesarios:

```yaml
permissions:
  contents: read
  pull-requests: read
  issues: read
  id-token: write
  actions: read
```

> Si quieres que Claude pueda escribir en PRs o issues (comentar, mergear), necesitas ampliar los permisos a `write` y configurarlo en `claude_args`.

---

## Personalización opcional

En `claude.yml` puedes descomentar y ajustar:

```yaml
# Dar un prompt fijo en lugar de leer el comentario:
# prompt: 'Actualiza la descripción del PR con un resumen de cambios.'

# Restringir las herramientas disponibles para Claude:
# claude_args: '--allowed-tools Bash(gh pr *)'
```

En `claude-code-review.yml` puedes filtrar por autor del PR:

```yaml
# if: |
#   github.event.pull_request.user.login == 'colaborador-externo'
```

---

## Archivos relevantes de este proyecto

| Archivo | Propósito |
|---|---|
| `.github/workflows/claude.yml` | Workflow principal: Claude ejecuta tareas por @mention |
| `.github/workflows/claude-code-review.yml` | Workflow de review automático en PRs |
| `.github/workflows/claude-issue-triage.yml` | Triage automático de issues: labels + diagnóstico |
| `.github/CLAUDE_INTEGRATION.md` | Este documento |
