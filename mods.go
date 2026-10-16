package main

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
)

type ModLayout struct {
	ThemeName       string          `json:"themeName"`
	SidebarPosition string          `json:"sidebarPosition"` // "left" or "right"
	Panels          map[string]bool `json:"panels"`          // ej: {"voice": true, "connection": true}
}

// Devuelve el directorio base de mods (~/.chat_p2p/mods)
func (a *App) getModsDir() (string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	modsDir := filepath.Join(homeDir, ".chat_p2p", "mods", "default")
	_ = os.MkdirAll(modsDir, 0700)
	return modsDir, nil
}

// Lee el archivo theme.css de ~/.chat_p2p/mods/default/theme.css
func (a *App) LoadCustomCSS() string {
	modsDir, err := a.getModsDir()
	if err != nil {
		return ""
	}

	cssPath := filepath.Join(modsDir, "theme.css")
	data, err := os.ReadFile(cssPath)
	if err != nil {
		// Si no existe, creamos un archivo de ejemplo básico
		defaultCSS := `/* Mod CSS por defecto */
body {
    background-color: #12141d !important;
}
`
		_ = os.WriteFile(cssPath, []byte(defaultCSS), 0644)
		return defaultCSS
	}

	return string(data)
}

// Lee el archivo layout.json de ~/.chat_p2p/mods/default/layout.json
func (a *App) LoadCustomLayout() ModLayout {
	defaultLayout := ModLayout{
		ThemeName:       "Default Dark",
		SidebarPosition: "left",
		Panels: map[string]bool{
			"voice":      true,
			"connection": true,
			"nodeInfo":   true,
		},
	}

	modsDir, err := a.getModsDir()
	if err != nil {
		return defaultLayout
	}

	jsonPath := filepath.Join(modsDir, "layout.json")
	data, err := os.ReadFile(jsonPath)
	if err != nil {
		// Si no existe, creamos el JSON por defecto
		bytes, _ := json.MarshalIndent(defaultLayout, "", "  ")
		_ = os.WriteFile(jsonPath, bytes, 0644)
		return defaultLayout
	}

	var layout ModLayout
	if err := json.Unmarshal(data, &layout); err != nil {
		return defaultLayout
	}

	return layout
}

// OpenModsFolder abre la carpeta ~/.chat_p2p/mods/default en el explorador de archivos del sistema
func (a *App) OpenModsFolder() string {
	modsDir, err := a.getModsDir()
	if err != nil {
		return fmt.Sprintf("Error obteniendo directorio: %s", err.Error())
	}

	// Asegurar que la carpeta existe antes de abrirla
	_ = os.MkdirAll(modsDir, 0700)

	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("explorer", modsDir)
	case "darwin": // macOS
		cmd = exec.Command("open", modsDir)
	default: // Linux y otros sistemas Unix
		cmd = exec.Command("xdg-open", modsDir)
	}

	if err := cmd.Start(); err != nil {
		return fmt.Sprintf("Error al abrir la carpeta: %s", err.Error())
	}

	return "Carpeta de mods abierta"
}
