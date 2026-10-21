package main

import (
	"bytes"
	"encoding/binary"
	"image"
	"image/color"
	"image/gif"
	"testing"
)

// gifConTransparencia crea un GIF de 2 frames con fondo transparente y
// displacement "background" (como se exportan los avatares animados).
func gifConTransparencia(disposal byte) *gif.GIF {
	const W, H = 16, 16
	pal := color.Palette{
		color.RGBA{0, 0, 0, 0},     // transparente
		color.RGBA{255, 0, 0, 255}, // rojo
	}
	g := &gif.GIF{Config: image.Config{ColorModel: pal, Width: W, Height: H}}
	for i, x := range []int{2, 8} {
		f := image.NewPaletted(image.Rect(0, 0, W, H), pal)
		for y := 0; y < H; y++ {
			for xx := x; xx < x+6; xx++ {
				f.SetColorIndex(xx, y, 1)
			}
		}
		g.Image = append(g.Image, f)
		g.Delay = append(g.Delay, 10)
		g.Disposal = append(g.Disposal, disposal)
		_ = i
	}
	return g
}

// disposeDelWebp devuelve el método de disposal de cada frame ANMF de un
// WebP animado. Bit 0 del byte de flags = 1 (clear to background).
func disposeDelWebp(t *testing.T, datos []byte) []byte {
	t.Helper()
	if !bytes.HasPrefix(datos, []byte("RIFF")) || !bytes.Contains(datos, []byte("WEBP")) {
		t.Fatal("no parece un archivo WebP")
	}
	var disposals []byte
	off := 12
	for off+8 <= len(datos) {
		fourCC := datos[off : off+4]
		size := int(binary.LittleEndian.Uint32(datos[off+4 : off+8]))
		if string(fourCC) == "ANMF" {
			// payload: x(3) y(3) w(3) h(3) dur(3) flags(1)
			disposals = append(disposals, datos[off+8+15])
		}
		off += 8 + size + (size & 1)
	}
	return disposals
}

// Un GIF con fondo transparente no debe dejar residuos: cada frame del WebP
// animado debe(use "clear to background") para que el visor dibuje cada uno
// sobre un lienzo limpio.
func TestWebPAnimadoSinResiduos(t *testing.T) {
	var buf bytes.Buffer
	if err := gif.EncodeAll(&buf, gifConTransparencia(gif.DisposalBackground)); err != nil {
		t.Fatal(err)
	}

	out, err := processImage(buf.Bytes(), 32, 300*1024)
	if err != nil {
		t.Fatalf("processImage falló: %v", err)
	}

	disposals := disposeDelWebp(t, out)
	if len(disposals) != 2 {
		t.Fatalf("se esperaban 2 frames, se hallaron %d", len(disposals))
	}
	for i, d := range disposals {
		if d&0x01 == 0 {
			t.Errorf("el frame %d tiene dispose=none (0x%02x): el visor lo dibujará "+
				"encima del anterior y aparecerán residuos", i, d)
		}
	}
}

// El disposal "previous" (3) debe restaurar el lienzo al estado anterior
// DESPUÉS de mostrar el frame, para que el frame siguiente no herede nada.
func TestGifDisposalPrevious(t *testing.T) {
	g := gifConTransparencia(gif.DisposalPrevious)
	frames, _ := gifToFrames(g)
	if len(frames) != 2 {
		t.Fatalf("se esperaban 2 frames, se hallaron %d", len(frames))
	}

	// frame 0: el cuadro está en x=2..8
	// frame 1: el cuadro está en x=8..14 y NO debe heredar el de x=2..8
	contar := func(f image.Image) (int, int) {
		b := f.Bounds()
		var enX2, enX8 int
		for y := b.Min.Y; y < b.Max.Y; y++ {
			for x := b.Min.X; x < b.Max.X; x++ {
				r, g, _, a := f.At(x, y).RGBA()
				if a > 0x8000 && r > 0x8000 && g < 0x4000 {
					// el frame 0 dibuja en x=2..7, el frame 1 en x=8..13
					if x < 8 {
						enX2++
					}
					if x >= 8 {
						enX8++
					}
				}
			}
		}
		return enX2, enX8
	}

	if izq0, der0 := contar(frames[0]); izq0 == 0 || der0 != 0 {
		t.Errorf("frame 0 inesperado: %d px en x<5, %d px en x>5", izq0, der0)
	}
	if izq1, der1 := contar(frames[1]); izq1 != 0 || der1 == 0 {
		t.Errorf("frame 1 heredó el cuadro anterior (%d px en x<5, %d px en x>5): "+
			"disposal=previous no se aplicó", izq1, der1)
	}
}
