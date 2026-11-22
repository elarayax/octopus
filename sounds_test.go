package main

import (
	"database/sql"
	"encoding/base64"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestDecodeChannelSoundConfig(t *testing.T) {
	config, err := decodeChannelSoundConfig(`{"version":1,"sounds":{"userJoined":"welcome.mp3"},"users":{"ABC234":{"userLeft":null}}}`)
	if err != nil {
		t.Fatalf("valid config rejected: %v", err)
	}
	if config.Sounds.UserJoined == nil || *config.Sounds.UserJoined != "welcome.mp3" {
		t.Fatalf("general sound not decoded: %#v", config.Sounds.UserJoined)
	}
	if _, ok := config.Users["ABC234"]; !ok || config.Users["ABC234"].UserLeft != nil {
		t.Fatalf("null user override should inherit: %#v", config.Users)
	}
	if resolved := resolveSoundSelection(config, "ABC234", "userJoined"); resolved == nil || *resolved != "welcome.mp3" {
		t.Fatalf("missing user override did not inherit general selection: %#v", resolved)
	}
	if resolved := resolveSoundSelection(config, "ABC234", "userLeft"); resolved != nil {
		t.Fatalf("null user override should inherit the unset general value: %#v", resolved)
	}
	userSound := "special.mp3"
	config.Users["ABC234"] = SoundSelections{UserJoined: &userSound}
	if resolved := resolveSoundSelection(config, "ABC234", "userJoined"); resolved == nil || *resolved != userSound {
		t.Fatalf("user-specific selection did not override general value: %#v", resolved)
	}

	invalid := []string{
		`{"version":2,"sounds":{},"users":{}}`,
		`{"version":1,"sounds":{"userJoined":"../escape.mp3"},"users":{}}`,
		`{"version":1,"sounds":{"peerConnected":"folder\\sound.mp3"},"users":{}}`,
		`{"version":1,"sounds":{},"users":{"bad":{"userLeft":"x.mp3"}}}`,
		`{"version":1,"sounds":{},"users":{},"unexpected":true}`,
		`{"version":1,"sounds":{},"users":{}} {}`,
	}
	for _, raw := range invalid {
		t.Run(raw, func(t *testing.T) {
			if _, err := decodeChannelSoundConfig(raw); err == nil {
				t.Fatal("invalid config was accepted")
			}
		})
	}
}

func TestChannelSoundConfigSQLitePersistenceAndHostAuthorization(t *testing.T) {
	home := t.TempDir()
	t.Setenv("USERPROFILE", home)
	t.Setenv("HOME", home)
	app := NewApp()
	if err := app.initDB(); err != nil {
		t.Fatalf("initialize database: %v", err)
	}
	t.Cleanup(func() { _ = app.db.Close() })

	app.mu.Lock()
	app.isHost = true
	app.myCode = "ABC234"
	app.currentChannelID = app.upsertCanal(app.myCode, "Test", "", "")
	app.mu.Unlock()

	raw := `{"version":1,"sounds":{"userJoined":"join.mp3"},"users":{"DEF345":{"userLeft":null}}}`
	if err := app.SaveChannelSoundConfig("ABC234", raw); err != nil {
		t.Fatalf("save config: %v", err)
	}
	got, err := app.GetChannelSoundConfig("ABC234")
	if err != nil {
		t.Fatalf("get config: %v", err)
	}
	if got.Sounds.UserJoined == nil || *got.Sounds.UserJoined != "join.mp3" || got.Users["DEF345"].UserLeft != nil {
		t.Fatalf("unexpected persisted config: %#v", got)
	}

	app.mu.Lock()
	app.isHost = false
	app.mu.Unlock()
	if err := app.SaveChannelSoundConfig("ABC234", raw); err == nil {
		t.Fatal("non-host was allowed to save config")
	}
	if err := app.SaveChannelSoundConfig("DEF345", raw); err == nil {
		t.Fatal("host was allowed to modify a different channel")
	}
}

func TestLoadModSoundValidatesNameSizeAndContent(t *testing.T) {
	home := t.TempDir()
	t.Setenv("USERPROFILE", home)
	t.Setenv("HOME", home)
	app := NewApp()
	modsDir, err := app.getModsDir()
	if err != nil {
		t.Fatalf("get mods dir: %v", err)
	}
	soundDir := filepath.Join(modsDir, "sounds")
	if err := os.MkdirAll(soundDir, 0700); err != nil {
		t.Fatal(err)
	}
	validMP3 := append([]byte("ID3\x04\x00\x00\x00\x00\x00\x00"), 0xff, 0xfb, 0x90, 0x64, 0x00, 0x00)
	if err := os.WriteFile(filepath.Join(soundDir, "ok.mp3"), validMP3, 0600); err != nil {
		t.Fatal(err)
	}
	asset, err := app.LoadModSound("ok.mp3")
	if err != nil {
		t.Fatalf("load valid sound: %v", err)
	}
	decoded, err := base64.StdEncoding.DecodeString(asset.Data)
	if err != nil || string(decoded) != string(validMP3) || asset.MIMEType != "audio/mpeg" {
		t.Fatal("loaded sound did not return its MP3 data and MIME type")
	}
	bundledMP3, err := os.ReadFile(filepath.Join("frontend", "src", "assets", "sounds", "voice-join.mp3"))
	if err != nil {
		t.Fatalf("read bundled MP3 fixture: %v", err)
	}
	if err := os.WriteFile(filepath.Join(soundDir, "bundled.mp3"), bundledMP3, 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := app.LoadModSound("bundled.mp3"); err != nil {
		t.Fatalf("bundled MP3 was not recognized as usable: %v", err)
	}

	for _, invalidName := range []string{"", "..\\secret.mp3", "../secret.mp3", "C:\\secret.mp3", "folder/sound.mp3", "sound.wav", "two..dots.mp3"} {
		if _, err := app.LoadModSound(invalidName); err == nil {
			t.Errorf("invalid filename accepted: %q", invalidName)
		}
	}

	large := make([]byte, maxSoundFileSize+1)
	copy(large, validMP3)
	if err := os.WriteFile(filepath.Join(soundDir, "large.mp3"), large, 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := app.LoadModSound("large.mp3"); err == nil {
		t.Fatal("oversized sound was accepted")
	}
	if err := os.WriteFile(filepath.Join(soundDir, "invalid.mp3"), []byte("not audio"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := app.LoadModSound("invalid.mp3"); err == nil {
		t.Fatal("non-MP3 content was accepted")
	}
}

func TestChannelSoundConfigMigrationCreatesTableForExistingDatabase(t *testing.T) {
	home := t.TempDir()
	t.Setenv("USERPROFILE", home)
	t.Setenv("HOME", home)
	configDir := filepath.Join(home, ".chat_p2p")
	if err := os.MkdirAll(configDir, 0700); err != nil {
		t.Fatal(err)
	}
	legacyDB, err := sql.Open("sqlite", filepath.Join(configDir, "app_data.db"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := legacyDB.Exec(`CREATE TABLE canal (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		nombre VARCHAR(255) NOT NULL DEFAULT 'Chat P2P'
	);
	INSERT INTO canal (id, nombre) VALUES (1, 'Canal anterior');`); err != nil {
		t.Fatal(err)
	}
	if err := legacyDB.Close(); err != nil {
		t.Fatal(err)
	}
	// initDB upgrades a legacy channel table without the shared codigo column.
	app := NewApp()
	if err := app.initDB(); err != nil {
		t.Fatalf("initialize/migrate database: %v", err)
	}
	defer app.db.Close()
	var tableName string
	if err := app.db.QueryRow(`SELECT name FROM sqlite_master WHERE type='table' AND name='channel_sound_config'`).Scan(&tableName); err != nil {
		t.Fatalf("sound config table missing after migration: %v", err)
	}
	if strings.TrimSpace(tableName) == "" {
		t.Fatal("migration created an empty table name")
	}
	var channelCode, channelName string
	if err := app.db.QueryRow(`SELECT codigo, nombre FROM canal WHERE id = 1`).Scan(&channelCode, &channelName); err != nil {
		t.Fatalf("legacy channel was not preserved: %v", err)
	}
	if channelCode != "LOCAL" || channelName != "Canal anterior" {
		t.Fatalf("unexpected migrated channel: code=%q name=%q", channelCode, channelName)
	}
}
