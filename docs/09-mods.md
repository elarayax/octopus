# `mods.go` — Temas y layout personalizables

111 líneas. Permite al usuario personalizar el aspecto de la app **sin
tocar el código**: un archivo CSS y un archivo JSON en una carpetaKnown.

## `ModLayout`

```go
type ModLayout struct {
    ThemeName       string          `json:"themeName"`
    SidebarPosition string          `json:"sidebarPosition"` // "left" or "right"
    Panels          map[string]bool `json:"panels"`          // ej: {"voice": true, "connection": true}
}
```

**Por qué `map[string]bool` para los paneles**: permite añadir un panel nuevo
en el frontend sin tocar el Go. El backend solo lo transporta.

**Por qué `themeName` además del CSS**: el nombre es lo que se muestra en la
UI (por ejemplo "Default Dark"), mientras que el CSS es lo que se aplica.

## `getModsDir() (string, error)`

```go
modsDir := filepath.Join(homeDir, ".chat_p2p", "mods", "default")
os.MkdirAll(modsDir, 0700)
```

**Por qué `mods/default` y no `mods`**: deja el，准备 parafuturos packs de
mods (un `mods/miTema/` con su CSS y su layout).

**Por qué `0700`**: el directorio está dentro de `~/.chat_p2p`, que contiene
la clave privada.

## `LoadCustomCSS() string`

```go
cssPath := filepath.Join(modsDir, "theme.css")
data, err := os.ReadFile(cssPath)
if err != nil {
    defaultCSS := `/* Mod CSS por defecto */
body {
    background-color: #12141d !important;
}
`
    os.WriteFile(cssPath, []byte(defaultCSS), 0644)
    return defaultCSS
}
return string(data)
```

**Qué hace**: devuelve el CSS personalizado para que el frontend lo inyecte
en la página.

**Por qué devuelve el contenido en vez de solo la ruta**: el frontend lo
inyecta con un `<style>` en runtime. No hay que recargar la app ni
reconstruirla.

**Por qué crea el archivo de ejemplo si no existe**: el usuario abre la
carpeta de mods y encuentra algo para editar en lugar de un archivo vacío.

**Por qué `!important` en el CSS por defecto**: el CSS de los mods se inyecta
después del CSS de la app, pero algunos estilos de la app usan `!important`;
sin él, el tema no se aplicaría.

**Por qué `0644`**: el CSS es público (no tiene secretos). El avatar y la
clave usan `0600`.

## `LoadCustomLayout() ModLayout`

```go
defaultLayout := ModLayout{
    ThemeName:       "Default Dark",
    SidebarPosition: "left",
    Panels: map[string]bool{
        "voice":      true,
        "connection": true,
        "nodeInfo":   true,
    },
}

data, err := os.ReadFile(jsonPath)
if err != nil {
    // crea el archivo con el layout por defecto
    bytes, _ := json.MarshalIndent(defaultLayout, "", "  ")
    os.WriteFile(jsonPath, bytes, 0644)
    return defaultLayout
}

var layout ModLayout
if err := json.Unmarshal(data, &layout); err != nil {
    return defaultLayout
}
return layout
```

**Por qué `MarshalIndent`**: el archivo se edita a mano; con indentación es
legible. En el JSON plano sería una línea gigante.

**Por qué el fallback al default si el JSON está corrupto**: el usuario
puede haber escrito mal el JSON; la app no debe dejar de arrancar por eso.

**Por qué `defaultLayout` es una copia nueva en cada llamada**: se devuelve
por valor, pero el `map` es una referencia. Si el llamante modificara el map,
contaminaría el default de la siguiente llamada. Por eso se crea el map
dentro de la función.

## `OpenModsFolder() string`

```go
var cmd *exec.Cmd
switch runtime.GOOS {
case "windows":
    cmd = exec.Command("explorer", modsDir)
case "darwin":
    cmd = exec.Command("open", modsDir)
default:
    cmd = exec.Command("xdg-open", modsDir)
}
cmd.Start()
```

**Por qué un `switch` por sistema operativo**: cada SO tiene su comando
distinto para abrir el explorador de archivos.

**Por qué `Start()` y no `Run()`**: `Run()` espera a que el explorador cierre
(el usuario nunca lo cierra). `Start()` lo lanza y sigue. **Si se usara
`Run()`, el método bloquearía el hilo de Wails indefinidamente.**

**Por qué `os.MkdirAll` antes de abrir**: por si el usuario borró la carpeta,
`open` fallaría con un error poco claro.

## El flujo completo de un mod

```
1. Usuario pulsa "Abrir carpeta de mods"
   └─ OpenModsFolder()  →  se abre ~/.chat_p2p/mods/default/

2. Usuario edita theme.css y layout.json

3. El frontend recarga (o llama a los getters de nuevo)
   ├─ LoadCustomCSS()    →  "<style>" inyectado en el DOM
   └─ LoadCustomLayout() →  posición del sidebar y paneles visibles
```

El CSS se inyecta con el siguiente estilo (conceptualmente):

```js
const css = await LoadCustomCSS();
const style = document.createElement('style');
style.textContent = css;
document.head.appendChild(style);
```

**Por qué `!important` en varios sitios de los mods**: el CSS de la app usa
variables CSS y algunos componentes fijan colores. Los mods necesitan poder
sobrescribirlos.

## Resumen

| Archivo | Qué controla | Formato |
|---------|--------------|---------|
| `theme.css` | colores, tipografías, espaciados | CSS con `!important` |
| `layout.json` | posición del sidebar, paneles visibles | JSON |

**Por qué el CSS se inyecta en runtime en vez de compilarse**: los mods
dependen solo de la app, no al revés. Añadir un mod no requiere recompilar.
