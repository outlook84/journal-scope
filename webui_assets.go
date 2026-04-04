package journalscope

import (
	"embed"
	"io/fs"
)

//go:embed web/dist web/dist/*
var embeddedDist embed.FS

func EmbeddedDist() (fs.FS, error) {
	return fs.Sub(embeddedDist, "web/dist")
}
