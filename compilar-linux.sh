# Compila el .deb y el AppImage de Linux dentro de Ubuntu (WSL) y los deja en dist/.
# Windows no puede generarlos (faltan fpm y mksquashfs). Uso, desde PowerShell:
#   wsl -d Ubuntu -- bash compilar-linux.sh
# Necesita Node 24 en Ubuntu (instalado en ~/.local/node).
set -e
export PATH="$HOME/.local/node/bin:$PATH"
src="$(cd "$(dirname "$0")" && pwd)"
dst=~/opensesame-build
# Compila en el disco de Linux: más rápido, y se conservan los permisos de los archivos.
rsync -a --delete --exclude node_modules --exclude dist --exclude android --exclude .git "$src/" "$dst/"
cd "$dst"
npm ci --no-audit --no-fund --loglevel=error
npm run dist:linux
mkdir -p "$src/dist"
cp dist/*.deb dist/*.AppImage "$src/dist/"
ls -la "$src"/dist/*.deb "$src"/dist/*.AppImage
