package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image"
	"image/draw"
	"image/gif"
	_ "image/jpeg"
	_ "image/png"
	"os"
	"path/filepath"

	webp "github.com/HugoSmits86/nativewebp"
	"github.com/pion/webrtc/v4"
	"github.com/wailsapp/wails/v2/pkg/runtime"
	xdraw "golang.org/x/image/draw"
)

const (
	avatarMaxDim   = 128             // px, lado máximo del avatar
	avatarMaxBytes = 300 * 1024      // tope del archivo optimizado (~300 KB)
	avatarFileName = "avatar.webp"   // estático o animado, siempre WebP
)

// avatarPath devuelve la ruta del avatar del usuario (~/.chat_p2p/avatar.webp)
func (a *App) avatarPath() (string, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	configDir := filepath.Join(homeDir, ".chat_p2p")
	_ = os.MkdirAll(configDir, 0700)
	return filepath.Join(configDir, avatarFileName), nil
}

// resizeToMax escala una imagen para que su lado mayor no supere maxDim
func resizeToMax(src image.Image, maxDim int) *image.NRGBA {
	b := src.Bounds()
	w, h := b.Dx(), b.Dy()
	if w > maxDim || h > maxDim {
		ratio := float64(maxDim) / float64(w)
		if h > w {
			ratio = float64(maxDim) / float64(h)
		}
		w = int(float64(w)*ratio + 0.5)
		h = int(float64(h)*ratio + 0.5)
		if w < 1 {
			w = 1
		}
		if h < 1 {
			h = 1
		}
	}
	dst := image.NewNRGBA(image.Rect(0, 0, w, h))
	xdraw.CatmullRom.Scale(dst, dst.Bounds(), src, b, xdraw.Over, nil)
	return dst
}

// processStaticAvatar: redimensiona y codifica como WebP
func processStaticAvatar(img image.Image) ([]byte, error) {
	resized := resizeToMax(img, avatarMaxDim)
	var buf bytes.Buffer
	if err := webp.Encode(&buf, resized, &webp.Options{CompressionLevel: webp.DefaultCompression}); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// gifToFrames compone los frames de un GIF sobre un lienzo completo
// (los frames GIF pueden ser sub-rectángulos con transparencia)
func gifToFrames(g *gif.GIF) ([]image.Image, []uint) {
	w, h := g.Config.Width, g.Config.Height
	canvas := image.NewNRGBA(image.Rect(0, 0, w, h))
	frames := make([]image.Image, 0, len(g.Image))
	durations := make([]uint, 0, len(g.Image))

	for i, frame := range g.Image {
		draw.Draw(canvas, frame.Bounds(), frame, frame.Bounds().Min, draw.Over)

		// Snapshot del lienzo como frame compuesto
		snap := image.NewNRGBA(canvas.Bounds())
		copy(snap.Pix, canvas.Pix)
		frames = append(frames, snap)

		delayMs := uint(g.Delay[i] * 10) // GIF: centésimas de segundo -> ms
		if delayMs == 0 {
			delayMs = 100
		}
		durations = append(durations, delayMs)

		// Disposal "restaurar a fondo": limpiar el área del frame
		if i < len(g.Disposal) && g.Disposal[i] == gif.DisposalBackground {
			draw.Draw(canvas, frame.Bounds(), image.Transparent, image.Point{}, draw.Src)
		}
	}
	return frames, durations
}

// encodeAnimatedWebP intenta codificar cumpliendo el tope de tamaño,
// degradando progresivamente: menos frames -> 96px -> 64px
func encodeAnimatedWebP(frames []image.Image, durations []uint, loopCount uint16, maxDim int) ([]byte, error) {
	encode := func(fr []image.Image, du []uint) ([]byte, error) {
		resized := make([]image.Image, len(fr))
		for i, f := range fr {
			resized[i] = resizeToMax(f, maxDim)
		}
		var buf bytes.Buffer
		err := webp.EncodeAll(&buf, &webp.Animation{
			Images:    resized,
			Durations: du,
			Disposals: make([]uint, len(fr)),
			LoopCount: loopCount,
		}, &webp.Options{CompressionLevel: webp.DefaultCompression})
		return buf.Bytes(), err
	}

	out, err := encode(frames, durations)
	if err != nil {
		return nil, err
	}
	if len(out) <= avatarMaxBytes {
		return out, nil
	}

	// Reducir a la mitad de frames (duplicando su duración)
	if len(frames) > 2 {
		fr := make([]image.Image, 0, (len(frames)+1)/2)
		du := make([]uint, 0, (len(durations)+1)/2)
		for i := 0; i < len(frames); i += 2 {
			fr = append(fr, frames[i])
			d := durations[i]
			if i+1 < len(durations) {
				d += durations[i+1]
			}
			du = append(du, d)
		}
		if out, err = encode(fr, du); err != nil {
			return nil, err
		}
		if len(out) <= avatarMaxBytes {
			return out, nil
		}
		frames, durations = fr, du
	}

	// Último recurso: achicar el lienzo
	if maxDim > 64 {
		return encodeAnimatedWebP(frames, durations, loopCount, 64)
	}
	return out, nil
}

// processAvatar detecta el formato y produce un WebP (estático o animado) optimizado
func processAvatar(data []byte) ([]byte, error) {
	if bytes.HasPrefix(data, []byte("GIF8")) {
		g, err := gif.DecodeAll(bytes.NewReader(data))
		if err != nil {
			return nil, fmt.Errorf("GIF inválido: %w", err)
		}
		if len(g.Image) == 1 {
			return processStaticAvatar(g.Image[0])
		}
		frames, durations := gifToFrames(g)
		loop := uint16(0)
		if g.LoopCount > 0 {
			loop = uint16(g.LoopCount)
		} else if g.LoopCount < 0 {
			loop = 1
		}
		return encodeAnimatedWebP(frames, durations, loop, avatarMaxDim)
	}

	img, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		// Intentar como WebP de entrada
		if img2, err2 := webp.Decode(bytes.NewReader(data)); err2 == nil {
			img = img2
		} else {
			return nil, fmt.Errorf("formato de imagen no soportado: %w", err)
		}
	}
	return processStaticAvatar(img)
}

// avatarDataURL lee el avatar guardado y lo devuelve como data URL (o "" si no hay)
func (a *App) avatarDataURL() string {
	path, err := a.avatarPath()
	if err != nil {
		return ""
	}
	data, err := os.ReadFile(path)
	if err != nil || len(data) == 0 {
		return ""
	}
	return "data:image/webp;base64," + base64.StdEncoding.EncodeToString(data)
}

// GetAvatar devuelve el avatar propio como data URL para mostrarlo en la UI
func (a *App) GetAvatar() string {
	return a.avatarDataURL()
}

// SetAvatarFromDialog abre el selector de archivos, optimiza la imagen a WebP
// (animado si es GIF) y la guarda. Devuelve el data URL para previsualizar,
// "" si se canceló, o "Error: ..." si falló.
func (a *App) SetAvatarFromDialog() string {
	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Elige tu foto de perfil",
		Filters: []runtime.FileFilter{
			{DisplayName: "Imágenes (PNG, JPG, GIF, WebP)", Pattern: "*.png;*.jpg;*.jpeg;*.gif;*.webp"},
		},
	})
	if err != nil || path == "" {
		return ""
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return "Error: no se pudo leer el archivo"
	}

	optimized, err := processAvatar(data)
	if err != nil {
		return "Error: " + err.Error()
	}

	dst, err := a.avatarPath()
	if err != nil {
		return "Error: no se pudo ubicar la carpeta de configuración"
	}
	if err := os.WriteFile(dst, optimized, 0600); err != nil {
		return "Error: no se pudo guardar el avatar"
	}

	// Avisar a los peers conectados del nuevo avatar
	a.broadcastAvatar()

	return a.avatarDataURL()
}

// broadcastAvatar envía el avatar propio a todos los peers por el canal de chat
func (a *App) broadcastAvatar() {
	a.mu.Lock()
	sessions := make([]*PeerSession, 0, len(a.peers))
	for _, s := range a.peers {
		sessions = append(sessions, s)
	}
	a.mu.Unlock()

	for _, s := range sessions {
		if s.dc != nil && s.dc.ReadyState() == webrtc.DataChannelStateOpen {
			a.sendAvatarTo(s.dc)
		}
	}
}

// sendAvatarTo envía el avatar propio por un canal concreto (si existe)
func (a *App) sendAvatarTo(dc *webrtc.DataChannel) {
	path, err := a.avatarPath()
	if err != nil {
		return
	}
	data, err := os.ReadFile(path)
	if err != nil || len(data) == 0 {
		return
	}

	a.mu.Lock()
	pkt := Packet{Type: "avatar", Sender: a.username, Code: a.myCode, Avatar: base64.StdEncoding.EncodeToString(data)}
	a.mu.Unlock()

	raw, err := json.Marshal(pkt)
	if err == nil {
		_ = dc.SendText(string(raw))
	}
}
