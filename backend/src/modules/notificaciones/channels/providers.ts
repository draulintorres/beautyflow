import { Injectable, Logger } from '@nestjs/common';

export interface MensajeSalida {
  destinatario: string;
  asunto?: string;
  cuerpo: string;
}

export interface ResultadoEnvio {
  exito: boolean;
  error?: string;
  proveedorId?: string;
}

/**
 * Contrato que todo canal de notificación debe cumplir.
 * Implementaciones reales (Twilio, Meta WhatsApp Cloud API, SendGrid, etc.)
 * solo tienen que cumplir esta interfaz.
 */
export interface CanalProvider {
  enviar(msg: MensajeSalida): Promise<ResultadoEnvio>;
}

/**
 * Proveedores STUB: registran en consola en vez de enviar.
 * Permiten que el sistema funcione end-to-end sin credenciales.
 * Sustituir por la integración real conectando las credenciales en .env
 * y reemplazando el cuerpo de `enviar`.
 */
@Injectable()
export class WhatsAppStubProvider implements CanalProvider {
  private readonly logger = new Logger('WhatsApp');
  async enviar(msg: MensajeSalida): Promise<ResultadoEnvio> {
    // TODO: integrar Meta WhatsApp Cloud API o Twilio.
    //   const res = await fetch('https://graph.facebook.com/v19.0/.../messages', {...})
    this.logger.log(`[STUB] WhatsApp -> ${msg.destinatario}: ${msg.cuerpo}`);
    return { exito: true, proveedorId: 'stub-whatsapp' };
  }
}

@Injectable()
export class EmailStubProvider implements CanalProvider {
  private readonly logger = new Logger('Email');
  async enviar(msg: MensajeSalida): Promise<ResultadoEnvio> {
    // TODO: integrar SendGrid / SES / Nodemailer.
    this.logger.log(
      `[STUB] Email -> ${msg.destinatario} | ${msg.asunto ?? ''}: ${msg.cuerpo}`,
    );
    return { exito: true, proveedorId: 'stub-email' };
  }
}

@Injectable()
export class SmsStubProvider implements CanalProvider {
  private readonly logger = new Logger('SMS');
  async enviar(msg: MensajeSalida): Promise<ResultadoEnvio> {
    // TODO: integrar Twilio SMS.
    this.logger.log(`[STUB] SMS -> ${msg.destinatario}: ${msg.cuerpo}`);
    return { exito: true, proveedorId: 'stub-sms' };
  }
}
