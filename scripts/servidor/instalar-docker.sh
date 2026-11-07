#!/usr/bin/env bash
#
# Instala Docker Engine en Ubuntu usando el repositorio APT OFICIAL de
# Docker (NO el script de conveniencia get.docker.com). Pensado para
# Ubuntu 26.04 "resolute" (x86_64), usuario "deploy" con sudo (sin
# acceso root por SSH).
#
# Fuente consultada: https://docs.docker.com/engine/install/ubuntu/
# Fecha de consulta: 2026-11-06. La página no muestra una fecha propia
# de "última actualización" — la anterior es la fecha en que SE LEYÓ,
# no una versión publicada por Docker. En esa fecha, Ubuntu "Resolute
# 26.04 (LTS)" aparecía listado explícitamente como soportado, junto a
# Stonking 26.10, Noble 24.04 y Jammy 22.04.
#
# Idempotente: se puede volver a correr sin romper nada si ya se
# ejecutó antes (apt install no reinstala de cero, daemon.json no se
# sobrescribe si ya existe, el repositorio se reescribe con el mismo
# contenido derivado del sistema actual).
#
# Uso (como el usuario deploy, NO como root):
#   chmod +x instalar-docker.sh
#   ./instalar-docker.sh
#
set -euo pipefail

if [ "$(id -u)" -eq 0 ]; then
  echo "ERROR: no corras este script como root. Corré como 'deploy'; el" >&2
  echo "script usa 'sudo' internamente solo donde hace falta." >&2
  exit 1
fi

echo "==> Leyendo /etc/os-release..."
# shellcheck disable=SC1091
. /etc/os-release
CODENAME="${UBUNTU_CODENAME:-${VERSION_CODENAME:-}}"
if [ -z "$CODENAME" ]; then
  echo "ERROR: no se pudo determinar el codename de Ubuntu desde /etc/os-release." >&2
  exit 1
fi
echo "    Codename detectado: $CODENAME"

echo "==> Comprobando que '$CODENAME' está soportado en el repositorio de Docker..."
# El repo oficial de Docker publica un directorio por codename soportado
# en dists/<codename>/. Si no existe, apt fallaría más adelante con un
# error menos claro — lo comprobamos primero y nos detenemos con un
# mensaje explícito.
REPO_CHECK_URL="https://download.docker.com/linux/ubuntu/dists/${CODENAME}/Release"
HTTP_STATUS="$(curl -fsSL -o /dev/null -w '%{http_code}' "$REPO_CHECK_URL" || echo "000")"
if [ "$HTTP_STATUS" != "200" ]; then
  echo "ERROR: el codename '$CODENAME' no parece estar soportado todavía en" >&2
  echo "el repositorio oficial de Docker para Ubuntu (HTTP $HTTP_STATUS en" >&2
  echo "$REPO_CHECK_URL)." >&2
  echo "Verificá manualmente en https://docs.docker.com/engine/install/ubuntu/" >&2
  echo "antes de continuar. No se instaló nada." >&2
  exit 1
fi
echo "    OK: '$CODENAME' está disponible en el repositorio de Docker."

echo "==> Eliminando paquetes en conflicto (si existen)..."
CONFLICTIVOS="docker.io docker-compose docker-compose-v2 docker-doc docker-buildx podman-docker containerd runc"
INSTALADOS="$(dpkg --get-selections $CONFLICTIVOS 2>/dev/null | awk '$2 == "install" {print $1}' || true)"
if [ -n "$INSTALADOS" ]; then
  echo "    Encontrados: $INSTALADOS"
  # shellcheck disable=SC2086
  sudo apt-get remove -y $INSTALADOS
else
  echo "    Ninguno instalado — nada que quitar."
fi

echo "==> Instalando dependencias previas..."
sudo apt-get update
sudo apt-get install -y ca-certificates curl

echo "==> Agregando la clave GPG oficial de Docker..."
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

echo "==> Configurando el repositorio APT de Docker (formato deb822)..."
# Formato deb822 (.sources), que es el que la documentación oficial usa
# hoy en día en vez del .list de una sola línea.
ARCH="$(dpkg --print-architecture)"
sudo tee /etc/apt/sources.list.d/docker.sources > /dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: ${CODENAME}
Components: stable
Architectures: ${ARCH}
Signed-By: /etc/apt/keyrings/docker.asc
EOF

echo "==> Actualizando índices de paquetes..."
sudo apt-get update

echo "==> Instalando Docker Engine, CLI, containerd, buildx y compose plugin..."
sudo apt-get install -y \
  docker-ce \
  docker-ce-cli \
  containerd.io \
  docker-buildx-plugin \
  docker-compose-plugin

echo "==> Habilitando e iniciando el servicio docker..."
sudo systemctl enable --now docker

echo "==> Configurando /etc/docker/daemon.json (solo si no existe)..."
DAEMON_JSON=/etc/docker/daemon.json
if [ -f "$DAEMON_JSON" ]; then
  echo "    Ya existe $DAEMON_JSON — NO se sobrescribe. Revisalo a mano si"
  echo "    querés agregar log-driver/live-restore manualmente."
else
  sudo install -m 0755 -d /etc/docker
  # log-driver "json-file" + log-opts: rotación de logs de contenedores
  #   (max-size "10m", max-file "3") para que los logs de los contenedores
  #   no llenen el disco con el tiempo — mismo criterio que docker-compose.yml.
  # live-restore: true: si el DAEMON de Docker se reinicia (por una
  #   actualización, por ejemplo), los contenedores que ya estaban
  #   corriendo SIGUEN corriendo durante el reinicio del daemon, en vez de
  #   detenerse — reduce downtime en producción.
  sudo tee "$DAEMON_JSON" > /dev/null <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "live-restore": true
}
EOF
  echo "    Creado $DAEMON_JSON — reiniciando el servicio para aplicarlo..."
  sudo systemctl restart docker
fi

echo "==> NOTA IMPORTANTE sobre permisos:"
echo "    Este script NO agrega 'deploy' al grupo 'docker'. Pertenecer a"
echo "    ese grupo equivale a tener acceso root sin contraseña (cualquier"
echo "    miembro puede montar el filesystem del host dentro de un"
echo "    contenedor). Usá 'sudo docker ...' para cada comando."

echo "==> Listo. Verificá con verificar-docker.sh (sudo docker run --rm hello-world, etc.)."
