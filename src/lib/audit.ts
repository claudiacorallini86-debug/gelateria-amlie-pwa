import { blink } from '../blink/client';

/**
 * Log an action in the audit_log table.
 */
export async function logAudit(
  azione: 'create' | 'update' | 'delete' | 'apply_template' | 'auto_fill' | 'cancel',
  tabella: string,
  recordId: string,
  dettagli?: any
) {
  try {
    const user = await blink.auth.me();
    if (!user) return;

    await blink.db.auditLog.create({
      userId: user.id,
      azione,
      tabella,
      recordId,
      dettagli: dettagli ? JSON.stringify(dettagli) : null,
      dataOra: new Date().toISOString()
    });
  } catch (error) {
    console.error('Failed to log audit:', error);
  }
}
