package media

import (
	"bytes"
	"errors"
	"image"
	"image/jpeg"
	_ "image/png"
	"io"
	"net/http"
)

var ErrInvalid = errors.New("invalid image")
var ErrLimit = errors.New("image limit")

type Dimensions struct{ Width, Height int }

func Inspect(r io.ReadSeeker, mime string, pixels int64) (Dimensions, error) {
	var header [512]byte
	n, _ := r.Read(header[:])
	if _, err := r.Seek(0, 0); err != nil {
		return Dimensions{}, err
	}
	detected := http.DetectContentType(header[:n])
	if (mime != "image/png" && mime != "image/jpeg") || detected != mime {
		return Dimensions{}, ErrInvalid
	}
	c, format, err := image.DecodeConfig(r)
	if err != nil || (format == "png" && mime != "image/png") || (format == "jpeg" && mime != "image/jpeg") {
		return Dimensions{}, ErrInvalid
	}
	if c.Width <= 0 || c.Height <= 0 || int64(c.Width) > pixels/int64(c.Height) {
		return Dimensions{}, ErrLimit
	}
	if _, err = r.Seek(0, 0); err != nil {
		return Dimensions{}, err
	}
	return Dimensions{c.Width, c.Height}, nil
}
func Thumbnail(r io.ReadSeeker, maxSide int, pixels int64) ([]byte, error) {
	var header [512]byte
	n, _ := r.Read(header[:])
	r.Seek(0, 0)
	if _, err := Inspect(r, http.DetectContentType(header[:n]), pixels); err != nil {
		return nil, err
	}
	source, _, err := image.Decode(r)
	if err != nil {
		return nil, ErrInvalid
	}
	b := source.Bounds()
	w, h := b.Dx(), b.Dy()
	if w > maxSide || h > maxSide {
		if w >= h {
			h = max(1, h*maxSide/w)
			w = maxSide
		} else {
			w = max(1, w*maxSide/h)
			h = maxSide
		}
	}
	result := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := range h {
		for x := range w {
			result.Set(x, y, source.At(b.Min.X+x*b.Dx()/w, b.Min.Y+y*b.Dy()/h))
		}
	}
	var output bytes.Buffer
	err = jpeg.Encode(&output, result, &jpeg.Options{Quality: 80})
	return output.Bytes(), err
}
