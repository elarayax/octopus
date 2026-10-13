package main

import (
	"database/sql"
	_ "embed"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
)

//go:embed schema.sql
var schemaSQL string

func (a *App) initDB() error {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return err
	}

	configDir := filepath.Join(homeDir, ".chat_p2p")
	_ = os.MkdirAll(configDir, 0700)

	dbPath := filepath.Join(configDir, "app_data.db")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return err
	}

	if _, err := db.Exec("PRAGMA foreign_keys = ON;"); err != nil {
		return err
	}

	if _, err := db.Exec(schemaSQL); err != nil {
		return err
	}

	a.db = db
	return nil
}

func (a *App) saveSetting(clave, valor string) {
	if a.db == nil {
		return
	}
	_, _ = a.db.Exec(`
		INSERT INTO configuracion (clave, valor) VALUES (?, ?)
		ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor
	`, clave, valor)
}

func (a *App) getSetting(clave string) string {
	if a.db == nil {
		return ""
	}
	var valor string
	err := a.db.QueryRow(`SELECT valor FROM configuracion WHERE clave = ?`, clave).Scan(&valor)
	if err != nil {
		return ""
	}
	return valor
}

func (a *App) saveMessage(sender, text string) {
	if a.db == nil {
		return
	}

	_, _ = a.db.Exec(`INSERT OR IGNORE INTO usuario (id, nombre) VALUES (?, ?)`, sender, sender)
	query := `INSERT INTO mensaje (contenido, id_canal, id_usuario) VALUES (?, 1, ?)`
	_, _ = a.db.Exec(query, text, sender)
}

func (a *App) GetChatHistory() []Message {
	if a.db == nil {
		return []Message{}
	}

	rows, err := a.db.Query(`
		SELECT id_usuario, contenido
		FROM mensaje
		ORDER BY id ASC
	`)
	if err != nil {
		return []Message{}
	}
	defer rows.Close()

	var history []Message
	for rows.Next() {
		var msg Message
		if err := rows.Scan(&msg.Sender, &msg.Text); err == nil {
			history = append(history, msg)
		}
	}

	return history
}
