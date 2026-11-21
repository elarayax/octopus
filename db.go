package main

import (
	"crypto/rand"
	"database/sql"
	_ "embed"
	"encoding/hex"
	"encoding/json"
	"fmt"
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

	// SQLite es de un solo escritor. Con el DSN por defecto las conexiones
	// del pool no tienen busy_timeout, así que una escritura que coincide con
	// una lectura abierta falla al instante con "database is locked
	// (SQLITE_BUSY)" en vez de esperar.
	//   - journal_mode=WAL: lectores y escritor conviven
	//   - busy_timeout=5000: si hay dos escritores, se espera hasta 5s
	//   - foreign_keys/synchronous: se aplican en CADA conexión del pool
	//     (antes el PRAGMA foreign_keys solo afectaba a una de ellas)
	dsn := fmt.Sprintf("%s?_busy_timeout=5000&_pragma=journal_mode(WAL)"+
		"&_pragma=synchronous(NORMAL)&_pragma=foreign_keys(1)", dbPath)

	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return err
	}

	// Migración: si la tabla canal ya existía con el esquema anterior (sin columna 'codigo'),
	// la recreamos con el esquema correcto preservando los registros y referencias.
	var hasCodigo bool
	if rows, err := db.Query("PRAGMA table_info(canal)"); err == nil {
		for rows.Next() {
			var cid, notnull, pk int
			var name, ctype string
			var dflt sql.NullString
			if err := rows.Scan(&cid, &name, &ctype, &notnull, &dflt, &pk); err == nil {
				if name == "codigo" {
					hasCodigo = true
				}
			}
		}
		rows.Close()
	}

	var canalExists bool
	_ = db.QueryRow("SELECT count(*) > 0 FROM sqlite_master WHERE type='table' AND name='canal'").Scan(&canalExists)

	if canalExists && !hasCodigo {
		// La migración mueve claves foráneas: se fuerza una única conexión
		// para que los PRAGMA y el DDL afecten a la misma conexión.
		db.SetMaxOpenConns(1)
		_, _ = db.Exec("PRAGMA foreign_keys = OFF;")
		_, _ = db.Exec(`CREATE TABLE IF NOT EXISTS canal_new (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			codigo VARCHAR(6) NOT NULL UNIQUE,
			nombre VARCHAR(255) NOT NULL DEFAULT 'Chat P2P',
			subtitulo VARCHAR(255) DEFAULT 'Texto & Voz en Vivo',
			icono TEXT DEFAULT '🐙',
			ultima_vez DATETIME DEFAULT CURRENT_TIMESTAMP
		);`)
		_, _ = db.Exec(`INSERT OR IGNORE INTO canal_new (id, codigo, nombre)
			SELECT id, CASE WHEN id = 1 THEN 'LOCAL' ELSE printf('C%05d', id) END, COALESCE(nombre, 'Canal local') FROM canal;`)
		_, _ = db.Exec("DROP TABLE canal;")
		_, _ = db.Exec("ALTER TABLE canal_new RENAME TO canal;")
		_, _ = db.Exec("PRAGMA foreign_keys = ON;")
		db.SetMaxOpenConns(0) // restaurar el pool normal
	}

	if _, err := db.Exec(schemaSQL); err != nil {
		return err
	}

	// Migración: instalaciones antiguas no tienen la columna tipo
	// (ignora el error "duplicate column name" si ya existe)
	_, _ = db.Exec(`ALTER TABLE mensaje ADD COLUMN tipo VARCHAR(10) NOT NULL DEFAULT 'text'`)
	// Migración: uid estable por mensaje (respuestas y reacciones) y a quién responde
	_, _ = db.Exec(`ALTER TABLE mensaje ADD COLUMN uid VARCHAR(32)`)
	_, _ = db.Exec(`ALTER TABLE mensaje ADD COLUMN responde_a VARCHAR(32)`)
	_, _ = db.Exec(`CREATE INDEX IF NOT EXISTS idx_mensaje_uid ON mensaje(uid)`)
	// Mensajes anteriores a esta versión: darles un uid local para poder responderlos
	_, _ = db.Exec(`UPDATE mensaje SET uid = lower(hex(randomblob(8))) WHERE uid IS NULL OR uid = ''`)

	// Migración: crear canal por defecto para los mensajes existentes
	_, _ = db.Exec(`INSERT INTO canal (id, codigo, nombre) VALUES (1, 'LOCAL', 'Canal local') ON CONFLICT(id) DO NOTHING`)

	// Restaurar el último canal activo
	var lastCanalID int
	if err := db.QueryRow(`SELECT id FROM canal ORDER BY ultima_vez DESC LIMIT 1`).Scan(&lastCanalID); err == nil && lastCanalID > 0 {
		a.currentChannelID = lastCanalID
	} else {
		a.currentChannelID = 1
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

// upsertCanal crea o actualiza un canal por su código; devuelve el id
func (a *App) upsertCanal(codigo, nombre, subtitulo, icono string) int {
	if a.db == nil || codigo == "" {
		fmt.Printf("upsertCanal early return: db=%v codigo=%q current=%d\n", a.db != nil, codigo, a.currentChannelID)
		return a.currentChannelID
	}
	var id int
	err := a.db.QueryRow(`
		INSERT INTO canal (codigo, nombre, subtitulo, icono) VALUES (?, ?, ?, ?)
		ON CONFLICT(codigo) DO UPDATE SET ultima_vez = CURRENT_TIMESTAMP
		RETURNING id
	`, codigo, nombre, subtitulo, icono).Scan(&id)
	if err != nil {
		fmt.Printf("upsertCanal insert err=%v id=%d\n", err, id)
	}
	if id == 0 {
		_ = a.db.QueryRow(`SELECT id FROM canal WHERE codigo = ?`, codigo).Scan(&id)
		if id == 0 {
			fmt.Printf("upsertCanal fallback failed for codigo=%s\n", codigo)
			return a.currentChannelID
		}
	}
	return id
}

// updateCanalInfo actualiza nombre/subtítulo/icono del canal actual
func (a *App) updateCanalInfo(id int, nombre, subtitulo, icono string) {
	if a.db == nil || id == 0 {
		return
	}
	_, _ = a.db.Exec(`
		UPDATE canal SET nombre = ?, subtitulo = ?, icono = ?, ultima_vez = CURRENT_TIMESTAMP
		WHERE id = ?
	`, nombre, subtitulo, icono, id)
}

// getCanalByCodigo devuelve un canal por su código
func (a *App) getCanalByCodigo(codigo string) (ChannelInfo, int) {
	if a.db == nil || codigo == "" {
		return ChannelInfo{Nombre: "Chat P2P", Subtitulo: "Texto & Voz en Vivo", Icono: "🐙"}, a.currentChannelID
	}
	var id int
	var info ChannelInfo
	err := a.db.QueryRow(`
		SELECT id, nombre, subtitulo, icono FROM canal WHERE codigo = ?
	`, codigo).Scan(&id, &info.Nombre, &info.Subtitulo, &info.Icono)
	if err != nil {
		return ChannelInfo{Nombre: "Chat P2P", Subtitulo: "Texto & Voz en Vivo", Icono: "🐙"}, a.currentChannelID
	}
	return info, id
}

// GetCanales devuelve todos los canales conocidos, más recientes primero
func (a *App) GetCanales() []CanalEntry {
	if a.db == nil {
		return nil
	}
	rows, err := a.db.Query(`
		SELECT codigo, nombre, subtitulo, icono, ultima_vez
		FROM canal
		ORDER BY ultima_vez DESC
	`)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var canales []CanalEntry
	for rows.Next() {
		var c CanalEntry
		var ult string
		if rows.Scan(&c.Codigo, &c.Nombre, &c.Subtitulo, &c.Icono, &ult) == nil {
			c.UltimaVez = ult
			canales = append(canales, c)
		}
	}
	return canales
}

// CanalEntry es una fila del panel de canales recientes
type CanalEntry struct {
	Codigo    string `json:"codigo"`
	Nombre    string `json:"nombre"`
	Subtitulo string `json:"subtitulo"`
	Icono     string `json:"icono"`
	UltimaVez string `json:"ultimaVez"`
}

func (a *App) saveMessage(sender, text string) {
	a.saveMessageKind(sender, text, "text", "")
}

// saveMessageKind guarda un mensaje en el canal activo; si creadoEn viene con
// valor (sync de historial) conserva la fecha original
func (a *App) saveMessageKind(sender, contenido, kind, creadoEn string) {
	a.saveMessageFull(sender, contenido, kind, creadoEn, "", "")
}

// newMsgID genera el uid de un mensaje (16 hex): es el mismo en todos los peers
func newMsgID() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// saveMessageFull guarda un mensaje con su uid y (opcional) el uid al que
// responde. Si uid viene vacío se genera uno local. Devuelve el uid guardado.
func (a *App) saveMessageFull(sender, contenido, kind, creadoEn, uid, replyTo string) string {
	if uid == "" {
		uid = newMsgID()
	}
	if a.db == nil {
		return uid
	}
	if a.currentChannelID == 0 {
		a.currentChannelID = 1
	}

	_, _ = a.db.Exec(`INSERT OR IGNORE INTO usuario (id, nombre) VALUES (?, ?)`, sender, sender)
	if creadoEn != "" {
		_, _ = a.db.Exec(
			`INSERT INTO mensaje (contenido, tipo, uid, responde_a, id_canal, id_usuario, creado_en) VALUES (?, ?, ?, NULLIF(?, ''), ?, ?, ?)`,
			contenido, kind, uid, replyTo, a.currentChannelID, sender, creadoEn,
		)
	} else {
		_, _ = a.db.Exec(
			`INSERT INTO mensaje (contenido, tipo, uid, responde_a, id_canal, id_usuario) VALUES (?, ?, ?, NULLIF(?, ''), ?, ?)`,
			contenido, kind, uid, replyTo, a.currentChannelID, sender,
		)
	}
	return uid
}

// messageUIDExists: ¿ya tenemos un mensaje con este uid?
func (a *App) messageUIDExists(uid string) bool {
	if a.db == nil || uid == "" {
		return false
	}
	var n int
	_ = a.db.QueryRow(`SELECT COUNT(*) FROM mensaje WHERE uid = ?`, uid).Scan(&n)
	return n > 0
}

// ---------- Reacciones ----------

func (a *App) hasReaction(uid, user, emoji string) bool {
	if a.db == nil {
		return false
	}
	var n int
	_ = a.db.QueryRow(
		`SELECT COUNT(*) FROM reaccion WHERE msg_uid = ? AND id_usuario = ? AND emoji = ?`,
		uid, user, emoji,
	).Scan(&n)
	return n > 0
}

func (a *App) setReaction(uid, user, emoji string, add bool) {
	if a.db == nil {
		return
	}
	if add {
		_, _ = a.db.Exec(`INSERT OR IGNORE INTO reaccion (msg_uid, id_usuario, emoji) VALUES (?, ?, ?)`, uid, user, emoji)
	} else {
		_, _ = a.db.Exec(`DELETE FROM reaccion WHERE msg_uid = ? AND id_usuario = ? AND emoji = ?`, uid, user, emoji)
	}
}

// loadReactions devuelve uid -> emoji -> [nombres] de los mensajes del canal
func (a *App) loadReactions(canalID int) map[string]map[string][]string {
	out := map[string]map[string][]string{}
	if a.db == nil {
		return out
	}
	rows, err := a.db.Query(`
		SELECT r.msg_uid, r.emoji, r.id_usuario
		FROM reaccion r
		JOIN mensaje m ON m.uid = r.msg_uid
		WHERE m.id_canal = ?
		ORDER BY r.rowid
	`, canalID)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var uid, emoji, user string
		if rows.Scan(&uid, &emoji, &user) != nil {
			continue
		}
		if out[uid] == nil {
			out[uid] = map[string][]string{}
		}
		out[uid][emoji] = append(out[uid][emoji], user)
	}
	return out
}

// messageExists: dedupe para la fusión de historiales (dentro del canal activo)
func (a *App) messageExists(sender, contenido, creadoEn string) bool {
	if a.db == nil {
		return false
	}
	var n int
	_ = a.db.QueryRow(
		`SELECT COUNT(*) FROM mensaje WHERE id_canal = ? AND id_usuario = ? AND contenido = ? AND strftime('%Y-%m-%d %H:%M:%S', creado_en) = ?`,
		a.currentChannelID, sender, contenido, creadoEn,
	).Scan(&n)
	return n > 0
}

func (a *App) GetChatHistory() []Message {
	if a.db == nil {
		return []Message{}
	}
	if a.currentChannelID == 0 {
		a.currentChannelID = 1
	}

	reactions := a.loadReactions(a.currentChannelID)

	rows, err := a.db.Query(`
		SELECT id_usuario, contenido, tipo, strftime('%Y-%m-%d %H:%M:%S', creado_en),
		       COALESCE(uid, ''), COALESCE(responde_a, '')
		FROM mensaje
		WHERE id_canal = ?
		ORDER BY creado_en ASC, id ASC
	`, a.currentChannelID)
	if err != nil {
		return []Message{}
	}
	defer rows.Close()

	var history []Message
	for rows.Next() {
		var msg Message
		var contenido string
		if err := rows.Scan(&msg.Sender, &contenido, &msg.Kind, &msg.Time, &msg.ID, &msg.ReplyTo); err == nil {
			msg.Reactions = reactions[msg.ID]
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

// exportHistory devuelve los mensajes más recientes del canal activo que caben
// en el presupuesto, en formato JSON listo para enviar en un Packet
func (a *App) exportHistory() string {
	if a.db == nil {
		return "[]"
	}
	if a.currentChannelID == 0 {
		a.currentChannelID = 1
	}

	reactions := a.loadReactions(a.currentChannelID)

	rows, err := a.db.Query(`
		SELECT id_usuario, contenido, tipo, strftime('%Y-%m-%d %H:%M:%S', creado_en),
		       COALESCE(uid, ''), COALESCE(responde_a, '')
		FROM mensaje
		WHERE id_canal = ?
		ORDER BY id DESC
		LIMIT 500
	`, a.currentChannelID)
	if err != nil {
		return "[]"
	}
	defer rows.Close()

	// Los campos nuevos son opcionales: peers antiguos simplemente los ignoran
	type syncMsg struct {
		Sender    string              `json:"sender"`
		Body      string              `json:"body"`
		Kind      string              `json:"kind"`
		Time      string              `json:"time"`
		UID       string              `json:"uid,omitempty"`
		Reply     string              `json:"reply,omitempty"`
		Reactions map[string][]string `json:"reactions,omitempty"`
	}

	var msgs []syncMsg
	size := 2 // corchetes del array
	for rows.Next() {
		var m syncMsg
		if err := rows.Scan(&m.Sender, &m.Body, &m.Kind, &m.Time, &m.UID, &m.Reply); err != nil {
			continue
		}
		m.Reactions = reactions[m.UID]
		entry := len(m.Sender) + len(m.Body) + len(m.Kind) + len(m.Time) + len(m.UID) + len(m.Reply) + 60
		for emoji, who := range m.Reactions {
			entry += len(emoji) + 8
			for _, w := range who {
				entry += len(w) + 3
			}
		}
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

// mergeHistory inserta los mensajes recibidos en el canal activo que no
// existan localmente. Devuelve cuántos mensajes nuevos se incorporaron.
func (a *App) mergeHistory(historyJSON string) int {
	if a.db == nil || historyJSON == "" {
		return 0
	}
	if a.currentChannelID == 0 {
		a.currentChannelID = 1
	}

	var msgs []struct {
		Sender    string              `json:"sender"`
		Body      string              `json:"body"`
		Kind      string              `json:"kind"`
		Time      string              `json:"time"`
		UID       string              `json:"uid"`
		Reply     string              `json:"reply"`
		Reactions map[string][]string `json:"reactions"`
	}
	if err := json.Unmarshal([]byte(historyJSON), &msgs); err != nil {
		return 0
	}

	added := 0 // mensajes nuevos + reacciones nuevas (cualquiera justifica recargar)
	for _, m := range msgs {
		if m.Sender == "" || m.Time == "" {
			continue
		}
		if m.Kind != "image" {
			m.Kind = "text"
		}
		// Dedupe por uid o, para mensajes antiguos (uid local distinto), por contenido+hora
		exists := (m.UID != "" && a.messageUIDExists(m.UID)) || a.messageExists(m.Sender, m.Body, m.Time)
		if !exists {
			a.saveMessageFull(m.Sender, m.Body, m.Kind, m.Time, m.UID, m.Reply)
			added++
		}
		if m.UID != "" {
			for emoji, who := range m.Reactions {
				if len(emoji) > 32 {
					continue
				}
				for _, user := range who {
					if !a.hasReaction(m.UID, user, emoji) {
						a.setReaction(m.UID, user, emoji, true)
						added++
					}
				}
			}
		}
	}
	return added
}
