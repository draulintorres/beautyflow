#!/usr/bin/env bash
#
# Solo lectura: verifica que Docker quedó instalado y configurado
# correctamente después de correr instalar-docker.sh. No instala ni
# modifica nada. Corré como el usuario "deploy" (usa "sudo" internamente
# solo para los comandos que lo requieren).
#
# Uso:
#   chmod +x verificar-docker.sh
#   ./verificar-docker.sh
#
set -uo pipefail   # sin -e a propósito: un chequeo que falla no debe
                   # cortar los que siguen — queremos ver el reporte completo.

echo "==================================================================="
echo "1) Version de Docker"
echo "==================================================================="
docker --version || echo "FALLO: 'docker --version' (¿Docker instalado?)"

echo
echo "==================================================================="
echo "2) Version de Docker Compose (plugin)"
echo "==================================================================="
docker compose version || echo "FALLO: 'docker compose version' (¿falta docker-compose-plugin?)"

echo
echo "==================================================================="
echo "3) Prueba real: sudo docker run --rm hello-world"
echo "==================================================================="
sudo docker run --rm hello-world || echo "FALLO: no se pudo correr el contenedor de prueba."

echo
echo "==================================================================="
echo "4) Estado del servicio systemd 'docker'"
echo "==================================================================="
printf '   habilitado al arrancar (is-enabled): '
systemctl is-enabled docker 2>&1 || true
printf '   activo ahora            (is-active):  '
systemctl is-active docker 2>&1 || true

echo
echo "==================================================================="
echo "5) Puertos en escucha (sudo ss -tlnp)"
echo "==================================================================="
echo "Cómo leer esta lista:"
echo "  - Local Address 0.0.0.0:PUERTO o :::PUERTO  → accesible desde"
echo "    fuera del servidor. Solo deberían aparecer así los puertos"
echo "    22 (SSH), 80 y 443 (Caddy)."
echo "  - Local Address 127.0.0.1:PUERTO             → solo accesible"
echo "    desde dentro del propio servidor (esperado para cualquier cosa"
echo "    que NO deba ser pública)."
echo "  - Los contenedores de la red interna de docker-compose (backend,"
echo "    postgres) no deberían aparecer aquí en absoluto si no tienen"
echo "    'ports:' publicados — solo son visibles entre contenedores por"
echo "    la red interna de Docker, no por el host."
echo
sudo ss -tlnp || echo "FALLO: 'ss -tlnp' (¿falta el paquete iproute2?)"
