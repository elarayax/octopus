-- 1. Usuarios
CREATE TABLE IF NOT EXISTS usuario (
    id VARCHAR(255) PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL
);

-- 2. Servidores
CREATE TABLE IF NOT EXISTS servidor (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre VARCHAR(255) NOT NULL
);

-- 3. Tipos de Canal
CREATE TABLE IF NOT EXISTS tipo_canal (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre VARCHAR(255) NOT NULL,
    descripcion TEXT
);

-- 4. Canales dentro de un servidor
CREATE TABLE IF NOT EXISTS canal (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre VARCHAR(255) NOT NULL,
    tipo_canal INTEGER NOT NULL,
    id_servidor INTEGER NOT NULL,
    FOREIGN KEY (tipo_canal) REFERENCES tipo_canal(id),
    FOREIGN KEY (id_servidor) REFERENCES servidor(id) ON DELETE CASCADE
);

-- 5. Relación Usuarios <-> Servidores
CREATE TABLE IF NOT EXISTS usuarios_servidor (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_usuario VARCHAR(255) NOT NULL,
    id_servidor INTEGER NOT NULL,
    FOREIGN KEY (id_usuario) REFERENCES usuario(id) ON DELETE CASCADE,
    FOREIGN KEY (id_servidor) REFERENCES servidor(id) ON DELETE CASCADE
);

-- 6. Mensajes (Canales de Texto)
CREATE TABLE IF NOT EXISTS mensaje (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contenido TEXT NOT NULL,
    id_canal INTEGER NOT NULL,
    id_usuario VARCHAR(255) NOT NULL,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_canal) REFERENCES canal(id) ON DELETE CASCADE,
    FOREIGN KEY (id_usuario) REFERENCES usuario(id)
);

-- 7. Publicaciones de Foro (Posts)
CREATE TABLE IF NOT EXISTS foro_post (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titulo VARCHAR(255) NOT NULL,
    archivo_md_path TEXT NOT NULL,
    id_canal INTEGER NOT NULL,
    id_usuario VARCHAR(255) NOT NULL,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_canal) REFERENCES canal(id) ON DELETE CASCADE,
    FOREIGN KEY (id_usuario) REFERENCES usuario(id)
);

-- 8. Comentarios de Foro
CREATE TABLE IF NOT EXISTS foro_comentario (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contenido TEXT NOT NULL,
    id_post INTEGER NOT NULL,
    id_usuario VARCHAR(255) NOT NULL,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_post) REFERENCES foro_post(id) ON DELETE CASCADE,
    FOREIGN KEY (id_usuario) REFERENCES usuario(id)
);

-- ==========================================
--  DATOS INICIALES POR DEFECTO
-- ==========================================
INSERT OR IGNORE INTO tipo_canal (id, nombre, descripcion) VALUES
(1, 'Texto', 'Canal de chat en tiempo real'),
(2, 'Voz', 'Canal para transmisión de audio'),
(3, 'Foro', 'Canal para publicaciones organizadas en Markdown');
