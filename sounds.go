package main

import (
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

const (
	channelSoundConfigVersion = 1
	maxChannelSoundConfigSize = 64 * 1024
	maxSoundFileSize          = 5 * 1024 * 1024
)

var (
	channelCodePattern = regexp.MustCompile(`^[A-HJ-NP-Z2-9]{6}$`)
	soundFilePattern   = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._ -]{0,123}\.mp3$`)
)

// SoundSelections contiene nombres locales de archivo. nil hereda el fallback
// (en sounds) o el valor general (en users).
type SoundSelections struct {
	UserJoined          *string `json:"userJoined"`
	UserLeft            *string `json:"userLeft"`
	PeerConnected       *string `json:"peerConnected"`
	LocalVoiceActivated *string `json:"localVoiceActivated"`
}

// ChannelSoundConfig se sincronizará en una fase posterior. Los nombres son
// lógicos y no contienen rutas ni audio.
type ChannelSoundConfig struct {
	Version int                        `json:"version"`
	Sounds  SoundSelections            `json:"sounds"`
	Users   map[string]SoundSelections `json:"users"`
}

type ModSoundAsset struct {
	Filename string `json:"filename"`
	MIMEType string `json:"mimeType"`
	Data     string `json:"data"`
}

func defaultChannelSoundConfig() ChannelSoundConfig {
	return ChannelSoundConfig{
		Version: channelSoundConfigVersion,
		Sounds:  SoundSelections{},
		Users:   map[string]SoundSelections{},
	}
}

func validateSoundFilename(filename string) error {
	if filename == "" || strings.Contains(filename, "..") ||
		strings.ContainsAny(filename, `/\\:`) || filepath.IsAbs(filename) ||
		filepath.Base(filename) != filename || !soundFilePattern.MatchString(filename) {
		return fmt.Errorf("nombre de sonido inválido: %q", filename)
	}
	return nil
}

func validateSoundSelections(selections SoundSelections) error {
	for _, filename := range []*string{
		selections.UserJoined,
		selections.UserLeft,
		selections.PeerConnected,
		selections.LocalVoiceActivated,
	} {
		if filename != nil {
			if err := validateSoundFilename(*filename); err != nil {
				return err
			}
		}
	}
	return nil
}

// resolveSoundSelection aplica una excepción no nula del usuario; null o
// campo ausente hereda la selección general del canal.
func resolveSoundSelection(config ChannelSoundConfig, userCode, event string) *string {
	general := selectionForEvent(config.Sounds, event)
	if user, ok := config.Users[userCode]; ok {
		if selected := selectionForEvent(user, event); selected != nil {
			return selected
		}
	}
	return general
}

func selectionForEvent(selections SoundSelections, event string) *string {
	switch event {
	case "userJoined":
		return selections.UserJoined
	case "userLeft":
		return selections.UserLeft
	case "peerConnected":
		return selections.PeerConnected
	case "localVoiceActivated":
		return selections.LocalVoiceActivated
	default:
		return nil
	}
}

func decodeChannelSoundConfig(raw string) (ChannelSoundConfig, error) {
	if len(raw) == 0 || len(raw) > maxChannelSoundConfigSize {
		return ChannelSoundConfig{}, errors.New("tamaño de configuración de sonidos inválido")
	}
	decoder := json.NewDecoder(strings.NewReader(raw))
	decoder.DisallowUnknownFields()
	var config ChannelSoundConfig
	if err := decoder.Decode(&config); err != nil {
		return ChannelSoundConfig{}, fmt.Errorf("configuración de sonidos inválida: %w", err)
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return ChannelSoundConfig{}, errors.New("la configuración contiene datos JSON adicionales")
	}
	if config.Version != channelSoundConfigVersion {
		return ChannelSoundConfig{}, fmt.Errorf("versión de configuración no soportada: %d", config.Version)
	}
	if config.Users == nil {
		config.Users = map[string]SoundSelections{}
	}
	if len(config.Users) > 512 {
		return ChannelSoundConfig{}, errors.New("demasiadas asignaciones de sonidos por usuario")
	}
	if err := validateSoundSelections(config.Sounds); err != nil {
		return ChannelSoundConfig{}, err
	}
	for code, selections := range config.Users {
		if !channelCodePattern.MatchString(code) {
			return ChannelSoundConfig{}, fmt.Errorf("código de usuario inválido: %q", code)
		}
		if err := validateSoundSelections(selections); err != nil {
			return ChannelSoundConfig{}, fmt.Errorf("sonidos para usuario %s: %w", code, err)
		}
	}
	return config, nil
}

// GetChannelSoundConfig devuelve la última configuración local conocida de un
// canal. La sincronización con el host se añadirá en la fase siguiente.
func (a *App) GetChannelSoundConfig(channelCode string) (ChannelSoundConfig, error) {
	if !channelCodePattern.MatchString(channelCode) {
		return ChannelSoundConfig{}, errors.New("código de canal inválido")
	}
	config := defaultChannelSoundConfig()
	if a.db == nil {
		return config, nil
	}
	var raw string
	err := a.db.QueryRow(`SELECT config_json FROM channel_sound_config WHERE channel_code = ?`, channelCode).Scan(&raw)
	if errors.Is(err, sql.ErrNoRows) {
		return config, nil
	}
	if err != nil {
		return ChannelSoundConfig{}, err
	}
	return decodeChannelSoundConfig(raw)
}

// SaveChannelSoundConfig guarda únicamente la configuración del canal propio
// cuando esta instancia está actuando como host. isHost es una barrera local,
// no autenticación criptográfica del propietario.
func (a *App) SaveChannelSoundConfig(channelCode, raw string) error {
	a.mu.Lock()
	isHost, myCode, currentChannelID := a.isHost, a.myCode, a.currentChannelID
	a.mu.Unlock()
	if !isHost || channelCode == "" || channelCode != myCode || a.db == nil {
		return errors.New("solo el host del canal puede modificar sus sonidos")
	}
	var currentChannelCode string
	if err := a.db.QueryRow(`SELECT codigo FROM canal WHERE id = ?`, currentChannelID).Scan(&currentChannelCode); err != nil || currentChannelCode != channelCode {
		return errors.New("solo el host del canal activo puede modificar sus sonidos")
	}
	if !channelCodePattern.MatchString(channelCode) {
		return errors.New("código de canal inválido")
	}
	config, err := decodeChannelSoundConfig(raw)
	if err != nil {
		return err
	}
	encoded, err := json.Marshal(config)
	if err != nil {
		return err
	}
	_, err = a.db.Exec(`
		INSERT INTO channel_sound_config (channel_code, config_json, version)
		VALUES (?, ?, ?)
		ON CONFLICT(channel_code) DO UPDATE SET
			config_json = excluded.config_json,
			version = excluded.version,
			updated_at = CURRENT_TIMESTAMP
	`, channelCode, string(encoded), config.Version)
	return err
}

// LoadModSound expone un MP3 dentro de la carpeta de sonidos de mods. Solo
// devuelve contenido validado; nunca acepta rutas del sistema.
func (a *App) LoadModSound(filename string) (ModSoundAsset, error) {
	if err := validateSoundFilename(filename); err != nil {
		return ModSoundAsset{}, err
	}
	modsDir, err := a.getModsDir()
	if err != nil {
		return ModSoundAsset{}, err
	}
	soundDir := filepath.Join(modsDir, "sounds")
	if err := os.MkdirAll(soundDir, 0700); err != nil {
		return ModSoundAsset{}, err
	}
	soundDirInfo, err := os.Lstat(soundDir)
	if err != nil {
		return ModSoundAsset{}, err
	}
	if soundDirInfo.Mode()&os.ModeSymlink != 0 || !soundDirInfo.IsDir() {
		return ModSoundAsset{}, errors.New("la carpeta de sonidos debe ser un directorio local válido")
	}
	path := filepath.Join(soundDir, filename)
	resolvedModsDir, err := filepath.EvalSymlinks(modsDir)
	if err != nil {
		return ModSoundAsset{}, err
	}
	resolvedDir, err := filepath.EvalSymlinks(soundDir)
	if err != nil {
		return ModSoundAsset{}, err
	}
	soundDirRel, err := filepath.Rel(resolvedModsDir, resolvedDir)
	if err != nil || soundDirRel == ".." || strings.HasPrefix(soundDirRel, ".."+string(filepath.Separator)) || filepath.IsAbs(soundDirRel) {
		return ModSoundAsset{}, errors.New("carpeta de sonidos fuera de la carpeta de mods")
	}
	resolvedPath, err := filepath.EvalSymlinks(path)
	if err != nil {
		return ModSoundAsset{}, err
	}
	rel, err := filepath.Rel(resolvedDir, resolvedPath)
	if err != nil || rel == "." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) || filepath.IsAbs(rel) {
		return ModSoundAsset{}, errors.New("ruta de sonido fuera de la carpeta permitida")
	}
	pathInfo, err := os.Lstat(path)
	if err != nil {
		return ModSoundAsset{}, err
	}
	if pathInfo.Mode()&os.ModeSymlink != 0 || !pathInfo.Mode().IsRegular() || pathInfo.Size() <= 0 || pathInfo.Size() > maxSoundFileSize {
		return ModSoundAsset{}, errors.New("el sonido debe ser un archivo MP3 regular de hasta 5 MB")
	}
	file, err := os.Open(resolvedPath)
	if err != nil {
		return ModSoundAsset{}, err
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil || !info.Mode().IsRegular() || info.Size() <= 0 || info.Size() > maxSoundFileSize {
		return ModSoundAsset{}, errors.New("el sonido debe ser un archivo MP3 regular de hasta 5 MB")
	}
	data, err := io.ReadAll(io.LimitReader(file, maxSoundFileSize+1))
	if err != nil {
		return ModSoundAsset{}, err
	}
	if len(data) == 0 || len(data) > maxSoundFileSize || !looksLikeMP3(data) {
		return ModSoundAsset{}, errors.New("el archivo no contiene datos MP3 utilizables")
	}
	return ModSoundAsset{
		Filename: filename,
		MIMEType: "audio/mpeg",
		Data:     base64.StdEncoding.EncodeToString(data),
	}, nil
}

func looksLikeMP3(data []byte) bool {
	start := 0
	if len(data) >= 10 && string(data[:3]) == "ID3" {
		size := int(data[6]&0x7f)<<21 | int(data[7]&0x7f)<<14 | int(data[8]&0x7f)<<7 | int(data[9]&0x7f)
		start = 10 + size
		if data[5]&0x10 != 0 {
			start += 10
		}
	}
	if start >= len(data) {
		return false
	}
	for i := start; i+1 < len(data); i++ {
		if data[i] != 0xff || data[i+1]&0xe0 != 0xe0 {
			continue
		}
		if i+3 >= len(data) {
			return false
		}
		layer := (data[i+1] >> 1) & 0x03
		bitrate := (data[i+2] >> 4) & 0x0f
		sampleRate := (data[i+2] >> 2) & 0x03
		if layer != 0 && bitrate != 0 && bitrate != 0x0f && sampleRate != 0x03 {
			return true
		}
	}
	// Algunos MP3 válidos comienzan directamente con una etiqueta ID3 y el
	// encabezado del primer frame queda fuera del pequeño buffer del archivo.
	return false
}
