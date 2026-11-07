# Instalar Docker en el servidor (Contabo, Ubuntu 26.04 "resolute")

Los scripts están en `scripts/servidor/`. Se copian y se corren a mano en
el servidor como el usuario `deploy`. Los scripts en sí no contienen ni
usan ninguna clave SSH ni secreto propio (la clave de abajo es solo para
llegar al servidor por SCP/SSH desde esta máquina, no algo que el script
necesite). No tocan nada del proyecto (`backend/src` ni
`beautyflow-web/src`).

**1. Copiar los scripts al servidor** (desde PowerShell, en esta
máquina, usando la clave dedicada):

```powershell
scp -i "$env:USERPROFILE\.ssh\estixa_contabo" scripts\servidor\instalar-docker.sh deploy@<IP_O_DOMINIO_DEL_SERVIDOR>:/home/deploy/
scp -i "$env:USERPROFILE\.ssh\estixa_contabo" scripts\servidor\verificar-docker.sh deploy@<IP_O_DOMINIO_DEL_SERVIDOR>:/home/deploy/
```

**2. Conectarse y ejecutar** (por SSH, ya en el servidor):

```bash
ssh -i "$env:USERPROFILE\.ssh\estixa_contabo" deploy@<IP_O_DOMINIO_DEL_SERVIDOR>
# Los .sh pueden traer saltos de línea CRLF si se editaron en Windows en
# algún punto — eso rompe el shebang y comandos con heredoc. Normalizar
# a LF antes de darles permiso de ejecución:
sed -i 's/\r$//' instalar-docker.sh verificar-docker.sh
chmod +x instalar-docker.sh verificar-docker.sh
./instalar-docker.sh
./verificar-docker.sh
```

**3. Si algo falla**:
- Si `instalar-docker.sh` se detiene en el chequeo del codename: no
  continuar — revisar a mano
  [https://docs.docker.com/engine/install/ubuntu/](https://docs.docker.com/engine/install/ubuntu/)
  antes de reintentar.
- Si falla un paso de `apt`: el script es idempotente — corregir lo que
  marcó el error y volver a correrlo completo, no hace falta deshacer
  nada a mano primero.
- Si `verificar-docker.sh` muestra el contenedor `hello-world` fallando:
  revisar `sudo systemctl status docker` y `sudo journalctl -u docker
  --no-pager -n 50` antes de seguir con cualquier despliegue.
- Si `ss -tlnp` muestra algo escuchando en `0.0.0.0` o `:::` que no sea
  22/80/443: detenerse y revisar qué servicio es antes de abrir el
  servidor a tráfico real — no debería haber nada más expuesto
  directamente al host.
