package main

import (
	"database/sql"
	_ "embed"
	"encoding/json"
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

	// Migración: instalaciones antiguas no tienen la columna tipo
	// (ignora el error "duplicate column name" si ya existe)
	_, _ = db.Exec(`ALTER TABLE mensaje ADD COLUMN tipo VARCHAR(10) NOT NULL DEFAULT 'text'`)

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

// Miembro es una entrada del directorio persistente del canal
type Miembro struct {
	Codigo string `json:"codigo"`
	Nombre string `json:"nombre"`
	Avatar string `json:"avatar"` // base64 del WebP, puede ser ""
}

// upsertMiembro registra/actualiza un miembro del canal (avatar solo si viene)
func (a *App) upsertMiembro(codigo, nombre, avatarB64 string) {
	if a.db == nil || codigo == "" || nombre == "" {
		return
	}
	if avatarB64 != "" {
		_, _ = a.db.Exec(`
			INSERT INTO miembro (codigo, nombre, avatar) VALUES (?, ?, ?)
			ON CONFLICT(codigo) DO UPDATE SET
				nombre = excluded.nombre,
				avatar = excluded.avatar,
				ultima_vez = CURRENT_TIMESTAMP
		`, codigo, nombre, avatarB64)
	} else {
		_, _ = a.db.Exec(`
			INSERT INTO miembro (codigo, nombre) VALUES (?, ?)
			ON CONFLICT(codigo) DO UPDATE SET
				nombre = excluded.nombre,
				ultima_vez = CURRENT_TIMESTAMP
		`, codigo, nombre)
	}
}

// getMiembros devuelve el directorio completo, más recientemente vistos primero
func (a *App) getMiembros() []Miembro {
	if a.db == nil {
		return nil
	}
	rows, err := a.db.Query(`
		SELECT codigo, nombre, COALESCE(avatar, '')
		FROM miembro
		ORDER BY ultima_vez DESC
	`)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var miembros []Miembro
	for rows.Next() {
		var m Miembro
		if rows.Scan(&m.Codigo, &m.Nombre, &m.Avatar) == nil {
			miembros = append(miembros, m)
		}
	}
	return miembros
}

func (a *App) saveMessage(sender, text string) {
	a.saveMessageKind(sender, text, "text", "")
}

// saveMessageKind guarda un mensaje; si creadoEn viene con valor (sync de
// historial) conserva la fecha original
func (a *App) saveMessageKind(sender, contenido, kind, creadoEn string) {
	if a.db == nil {
		return
	}

	_, _ = a.db.Exec(`INSERT OR IGNORE INTO usuario (id, nombre) VALUES (?, ?)`, sender, sender)
	if creadoEn != "" {
		_, _ = a.db.Exec(
			`INSERT INTO mensaje (contenido, tipo, id_canal, id_usuario, creado_en) VALUES (?, ?, 1, ?, ?)`,
			contenido, kind, sender, creadoEn,
		)
	} else {
		_, _ = a.db.Exec(
			`INSERT INTO mensaje (contenido, tipo, id_canal, id_usuario) VALUES (?, ?, 1, ?)`,
			contenido, kind, sender,
		)
	}
}

// messageExists: dedupe para la fusión de historiales
func (a *App) messageExists(sender, contenido, creadoEn string) bool {
	if a.db == nil {
		return false
	}
	var n int
	_ = a.db.QueryRow(
		`SELECT COUNT(*) FROM mensaje WHERE id_usuario = ? AND contenido = ? AND strftime('%Y-%m-%d %H:%M:%S', creado_en) = ?`,
		sender, contenido, creadoEn,
	).Scan(&n)
	return n > 0
}

func (a *App) GetChatHistory() []Message {
	if a.db == nil {
		return []Message{}
	}

	rows, err := a.db.Query(`
		SELECT id_usuario, contenido, tipo, strftime('%Y-%m-%d %H:%M:%S', creado_en)
		FROM mensaje
		ORDER BY creado_en ASC, id ASC
	`)
	if err != nil {
		return []Message{}
	}
	defer rows.Close()

	var history []Message
	for rows.Next() {
		var msg Message
		var contenido string
		if err := rows.Scan(&msg.Sender, &contenido, &msg.Kind, &msg.Time); err == nil {
			if msg.Kind == "image" {
				msg.Image = "data:image/webp;base64," + contenido
			} else {
				msg.Text = contenido
			}
			history = append(history, msg)
		}
	}

	return history
}

// historyBudget limita el tamaño del historial compartido (~1.5 MB de JSON,
// bajo el tope SCTP de 4 MB negociado)
const historyBudget = 1500 * 1024

// exportHistory devuelve los mensajes más recientes que caben en el presupuesto,
// en formato JSON listo para enviar en un Packet
func (a *App) exportHistory() string {
	if a.db == nil {
		return "[]"
	}

	rows, err := a.db.Query(`
		SELECT id_usuario, contenido, tipo, strftime('%Y-%m-%d %H:%M:%S', creado_en)
		FROM mensaje
		ORDER BY id DESC
		LIMIT 500
	`)
	if err != nil {
		return "[]"
	}
	defer rows.Close()

	type syncMsg struct {
		Sender string `json:"sender"`
		Body   string `json:"body"`
		Kind   string `json:"kind"`
		Time   string `json:"time"`
	}

	var msgs []syncMsg
	size := 2 // corchetes del array
	for rows.Next() {
		var m syncMsg
		if err := rows.Scan(&m.Sender, &m.Body, &m.Kind, &m.Time); err != nil {
			continue
		}
		entry := len(m.Sender) + len(m.Body) + len(m.Kind) + len(m.Time) + 60
		if size+entry > historyBudget && len(msgs) > 0 {
			break
		}
		size += entry
		msgs = append(msgs, m)
	}

	// Invertir: quedaron DESC y los queremos cronológicos
	for i, j := 0, len(msgs)-1; i < j; i, j = i+1, j-1 {
		msgs[i], msgs[j] = msgs[j], msgs[i]
	}

	raw, err := json.Marshal(msgs)
	if err != nil {
		return "[]"
	}
	return string(raw)
}

// mergeHistory inserta los mensajes recibidos que no existan localmente.
// Devuelve cuántos mensajes nuevos se incorporaron.
func (a *App) mergeHistory(historyJSON string) int {
	if a.db == nil || historyJSON == "" {
		return 0
	}

	var msgs []struct {
		Sender string `json:"sender"`
		Body   string `json:"body"`
		Kind   string `json:"kind"`
		Time   string `json:"time"`
	}
	if err := json.Unmarshal([]byte(historyJSON), &msgs); err != nil {
		return 0
	}

	added := 0
	for _, m := range msgs {
		if m.Sender == "" || m.Time == "" {
			continue
		}
		if m.Kind != "image" {
			m.Kind = "text"
		}
		if a.messageExists(m.Sender, m.Body, m.Time) {
			continue
		}
		a.saveMessageKind(m.Sender, m.Body, m.Kind, m.Time)
		added++
	}
	return added
}
