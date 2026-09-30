/**
 * Global Audit Hook Plugin for Mongoose
 * Intercepts mutations and logs audit events to AuditLog model if available.
 */
module.exports = function auditPlugin(schema, options = {}) {
  const modelName = options.modelName || 'UnknownModel';

  schema.post('save', function (doc) {
    if (doc.__skipAudit) return;
    try {
      const AuditLog = doc.model('AuditLog');
      if (AuditLog) {
        AuditLog.create({
          action: doc.isNew ? 'CREATE' : 'UPDATE',
          targetModel: modelName,
          targetId: doc._id.toString(),
          estateId: doc.estateId ? doc.estateId.toString() : null,
          details: { changes: doc.modifiedPaths() },
          performedBy: doc.__actorId || 'SYSTEM',
          timestamp: new Date()
        }).catch(err => {
          // Non-blocking catch to prevent failing the primary transaction
          console.warn(`[AuditPlugin] Failed to log audit event: ${err.message}`);
        });
      }
    } catch {
      // Model not loaded yet or in detached mode
    }
  });
};
