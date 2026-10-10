(muy notorio que está echo con IA (al menos para comenzar))

# 🚀 Manual de Desarrollo y Supervivencia — Chat P2P (Wails + Go + React)
Guía rápida de comandos, flujo de trabajo y resolución de errores para el desarrollo del chat P2P en macOS (Apple Silicon M1/M2/M3).

---

## 💻 1. Comandos de Trabajo Diario

En macOS Sequoia / Apple Silicon es necesario especificar el compilador nativo (`/usr/bin/clang`) y los *frameworks* del sistema para evitar fallos de enlace con CGO (`_OBJC_CLASS_$_UTType`).

### A. Modo Desarrollo (Una sola instancia con Hot-Reload)
Ideal para modificar la interfaz React o probar cambios rápidos.

```zsh
CC=/usr/bin/clang wails dev

B. Probar Múltiples Instancias (2 o más ventanas locales)
Cuando modifiques código en Go o React y quieras probar la comunicación entre dos procesos independientes:

Sincronizar Bindings de JS (solo si agregaste métodos nuevos en app.go):
Ejecuta CC=/usr/bin/clang wails dev, espera a que abra la ventana o compile y ciérralo con Ctrl + C. Esto actualizará la carpeta frontend/wailsjs/.

Compilar la interfaz web con Vite:

Bash

cd frontend && npm run build && cd ..
Lanzar las ventanas (Ejecutar en terminales separadas):

Bash

CC=/usr/bin/clang CGO_LDFLAGS="-framework UniformTypeIdentifiers" go run -tags desktop,production main.go app.go
🛠️ 2. Solución a Errores Frecuentes
❌ Error: SetUsername is not exported by wailsjs...
Causa: Se agregó un nuevo método público en Go (app.go), pero los archivos JS dentro de frontend/wailsjs aún no han sido regenerados por Wails.

Solución:

Corre CC=/usr/bin/clang wails dev unos segundos y ciérralo con Ctrl + C.

Recompila la web: cd frontend && npm run build && cd ...

❌ Error: Undefined symbols for architecture arm64: _OBJC_CLASS_$_UTType
Causa: Go está usando el compilador Clang de Homebrew (/opt/homebrew/opt/llvm/bin/clang) en lugar del compilador nativo de Apple.

Solución: Antepone siempre CC=/usr/bin/clang a los comandos go run o wails.

❌ Error: codesign / zsh: killed o executable is missing
Causa: Archivos ocultos de metadatos o firma de código corrupta en macOS.

Solución: Limpia los atributos de la carpeta del proyecto ejecutando:

Bash


xattr -cr .
📦 3. Compilado Final para Producción (.app)
Para empaquetar la aplicación en un binario ejecutable de macOS:

Bash


xattr -cr . && CC=/usr/bin/clang wails build
El ejecutable quedará disponible en:

📁 build/bin/chat.app

🌐 4. Clonar y Ejecutar en OTRO Equipo
Si clonas este repositorio en otra máquina, sigue este procedimiento de preparación inicial:

Requisitos Previos:
Go (brew install go)

Node.js (brew install node)

Wails CLI:

Bash

go install [github.com/wailsapp/wails/v2/cmd/wails@latest](https://github.com/wailsapp/wails/v2/cmd/wails@latest)
Inicialización del Proyecto:
Bash

# 1. Clonar el repositorio
git clone <URL_DE_TU_REPOSITORIO>
cd chat

# 2. Descargar dependencias de Go
go mod tidy

# 3. Descargar dependencias y compilar el Frontend
cd frontend
npm install
npm run build
cd ..

# 4. Iniciar en modo desarrollo
CC=/usr/bin/clang wails dev

## 🪟 Guía de Desarrollo en Windows (10 / 11)

### 📋 Requisitos Previos en Windows
1. **Go:** Descargar e instalar desde [golang.org](https://golang.org/dl/).
2. **Node.js:** Descargar e instalar desde [nodejs.org](https://nodejs.org/).
3. **C++ Build Tools (si usas CGO):** Instalar el ejecutable de **MinGW-w64** o tener instalado **Visual Studio Community** con el paquete "Desarrollo para el escritorio con C++".
4. **Wails CLI:**
   ```powershell
   go install [github.com/wailsapp/wails/v2/cmd/wails@latest](https://github.com/wailsapp/wails/v2/cmd/wails@latest)
💻 1. Comandos de Trabajo Diario (PowerShell o CMD)
En Windows no necesitas definir CC=/usr/bin/clang ni banderas de CGO_LDFLAGS. Los comandos son más limpios:

A. Modo Desarrollo (Hot-Reload)
PowerShell


wails dev
B. Probar Múltiples Instancias (2 o más ventanas locales)
Compilar el frontend con Vite:

PowerShell


cd frontend
npm run build
cd ..
Ejecutar en terminales / pestañas separadas de PowerShell:

PowerShell


go run -tags desktop,production main.go app.go
📦 2. Compilado Final para Producción (.exe)
Para empaquetar la aplicación en un archivo .exe ejecutable listo para compartir:

PowerShell


wails build
El ejecutable quedará disponible en:

📁 build\bin\chat.exe

Nota: El archivo chat.exe generado es 100% portable. Puedes copiarlo y ejecutarlo directamente en cualquier otra PC con Windows 10 o 11 sin necesidad de instalar Go ni Node.js.

🛠️ 3. Solución a Errores Frecuentes en Windows
❌ Error: gcc: execution phase failed o cgo: C compiler "gcc" not found
Causa: Go no encuentra un compilador de C en las variables de entorno de Windows.

Solución:

Desactiva CGO si no usas librerías C nativas ejecutando en PowerShell:

PowerShell


$env:CGO_ENABLED="0"
O instala MinGW-w64 (vía Chocolatey: choco install mingw) y asegúrate de que esté agregado al PATH del sistema.

❌ Error: WebView2 Runtime non-existent
Causa: Ocurre únicamente en versiones antiguas de Windows 10 que no tienen el runtime de Microsoft Edge actualizado.

Solución: Descargar e instalar "Evergreen Standalone Installer" de Webview2 desde la web oficial de Microsoft (en Windows 11 viene instalado de fábrica).

## 🐧 Guía de Desarrollo en Linux (Ubuntu / Debian / Arch / Fedora)

En Linux el entorno es nativo y muy estable, pero debes asegurarte de instalar previamente las dependencias de **GTK3** y **WebKit2GTK** que usa Wails para renderizar la ventana.

---

### 📋 1. Instalación de Dependencias del Sistema

Antes de compilar, instala los paquetes de desarrollo según tu distribución:

* **Ubuntu / Debian / Mint:**
  ```bash
  sudo apt update
  sudo apt install build-essential libgtk-3-dev libwebkit2gtk-4.0-dev pkg-config
Arch Linux / Manjaro:

Bash


sudo pacman -S --needed base-devel gtk3 webkit2gtk
Fedora / RHEL:

Bash


sudo dnf groupinstall "Development Tools"
sudo dnf install gtk3-devel webkit2gtk3-devel pkgconf-pkg-config
💻 2. Comandos de Trabajo Diario (Bash / Zsh)
En Linux los comandos no requieren flags especiales de compilador ni librerías del sistema adicional:

A. Modo Desarrollo (Hot-Reload)
Bash


wails dev
B. Probar Múltiples Instancias (2 o más ventanas locales)
Compilar el frontend con Vite:

Bash


cd frontend && npm run build && cd ..
Ejecutar en terminales / pestañas separadas:

Bash


go run -tags desktop,production main.go app.go
📦 3. Compilado Final para Producción
Para generar el ejecutable binario nativo de Linux:

Bash


wails build
El archivo binario quedará disponible en:

📁 build/bin/chat

Para darle permisos de ejecución si los pierde:

chmod +x build/bin/chat

🛠️ 4. Solución a Errores Frecuentes en Linux
❌ Error: pkg-config: exit status 1 / gtk+-3.0 not found
Causa: Faltan las librerías de desarrollo de GTK3 o WebKit en el sistema.

Solución: Revisa el paso 1 e instala libgtk-3-dev y libwebkit2gtk-4.0-dev (o sus equivalentes en tu distro).


<ElicitationsGroup message="¿Te gustaría realizar alguna prueba adicional o pasar directamente al siguiente paso del desarrollo?">
  <Elicitation label="Probar nombres de usuario" query="Ya guardé la documentación. Probemos el cambio de nombres de usuario en las dos ventanas."/>
  <Elicitation label="Integrar go-libp2p" query="Pasemos a integrar go-libp2p para el descubrimiento y conexión P2P sin IP manual."/>
</ElicitationsGroup>
