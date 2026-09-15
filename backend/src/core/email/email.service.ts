import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

/**
 * Envío de correo real vía Resend — hoy usado SOLO por el flujo de
 * "olvidé mi contraseña" (auth.service.ts). Deliberadamente separado del
 * módulo de notificaciones (NotificacionesModule/EmailStubProvider), que
 * sigue siendo un simulacro para el resto del sistema — no se tocó nada
 * de eso para no arriesgar ese flujo, que no era parte de este pedido.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger('Email');
  private readonly resend: Resend | null;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    // El SDK de Resend revienta en su propio constructor si la key viene
    // vacía — eso tumbaba el backend ENTERO al bootear (no solo el envío
    // de correo) mientras no hubiera una key real todavía. En vez de
    // exigirla con getOrThrow, queda null y enviar() lo resuelve como un
    // fallo silencioso (mismo criterio que el resto de esta clase: nunca
    // debe romper la respuesta genérica de forgotPassword()).
    this.resend = apiKey ? new Resend(apiKey) : null;
    this.from = this.config.getOrThrow('EMAIL_FROM');
    if (!this.resend) {
      this.logger.warn(
        'RESEND_API_KEY no configurada — los correos no se enviarán (solo se registrarán en el log).',
      );
    }
  }

  async enviar(to: string, subject: string, html: string): Promise<void> {
    if (!this.resend) {
      this.logger.log(`[SIN API KEY] Email -> ${to} | ${subject}`);
      return;
    }
    const { data, error } = await this.resend.emails.send({
      from: this.from,
      to,
      subject,
      html,
    });
    if (error) {
      // No se relanza: mismo criterio que forgotPassword() ya tenía con el
      // stub — un fallo de envío nunca debe filtrar si la cuenta existe ni
      // romper la respuesta genérica que ve el usuario.
      this.logger.error(`Fallo al enviar correo a ${to}: ${error.message}`);
    } else {
      this.logger.log(`Correo enviado a ${to} (Resend id: ${data?.id})`);
    }
  }
}
