package media

import (
	"bytes"
	"encoding/binary"
	"errors"
	"hash/crc32"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"testing"
)

func testPNG() []byte {
	var b bytes.Buffer
	img := image.NewNRGBA(image.Rect(0, 0, 8, 5))
	img.Set(1, 2, color.NRGBA{200, 40, 5, 255})
	png.Encode(&b, img)
	return b.Bytes()
}

// Catches MIME spoofing, expensive decode before limits, and lossy originals.
func TestValidationAndSeparateThumbnail(t *testing.T) {
	raw := testPNG()
	v, err := Inspect(bytes.NewReader(raw), "image/png", 80_000_000)
	if err != nil || v.Width != 8 || v.Height != 5 {
		t.Fatal(v, err)
	}
	if _, err = Inspect(bytes.NewReader(raw), "image/jpeg", 80_000_000); !errors.Is(err, ErrInvalid) {
		t.Fatal("MIME agreement", err)
	}
	if _, err = Inspect(bytes.NewReader(raw), "image/png", 39); !errors.Is(err, ErrLimit) {
		t.Fatal("pixel bound", err)
	}
	if _, err = Inspect(bytes.NewReader([]byte("not an image")), "image/png", 80_000_000); !errors.Is(err, ErrInvalid) {
		t.Fatal(err)
	}
	thumb, err := Thumbnail(bytes.NewReader(raw), 320, 80_000_000)
	if err != nil {
		t.Fatal(err)
	}
	c, format, err := image.DecodeConfig(bytes.NewReader(thumb))
	if err != nil || format != "jpeg" || c.Width != 8 || c.Height != 5 {
		t.Fatal(c, format, err)
	}
	if !bytes.Equal(raw, testPNG()) {
		t.Fatal("original modified")
	}
	var jpg bytes.Buffer
	jpeg.Encode(&jpg, image.NewRGBA(image.Rect(0, 0, 8, 5)), nil)
	if d, err := Inspect(bytes.NewReader(jpg.Bytes()), "image/jpeg", 80_000_000); err != nil || d.Width != 8 || d.Height != 5 {
		t.Fatal("JPEG", d, err)
	}
	huge := append([]byte(nil), raw...)
	binary.BigEndian.PutUint32(huge[16:20], 100000)
	binary.BigEndian.PutUint32(huge[20:24], 100000)
	binary.BigEndian.PutUint32(huge[29:33], crc32.ChecksumIEEE(huge[12:29]))
	if _, err := Inspect(bytes.NewReader(huge), "image/png", 80_000_000); !errors.Is(err, ErrLimit) {
		t.Fatal("huge header decoded before bound", err)
	}
}
