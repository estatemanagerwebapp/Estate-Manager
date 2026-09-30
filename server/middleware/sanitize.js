/**
 * Recursive sanitization middleware to prevent NoSQL injection attacks
 */
function cleanNoSqlInjection(obj) {
  if (obj !== null && typeof obj === 'object') {
    for (const key of Object.keys(obj)) {
      if (key.startsWith('$') || key.includes('.')) {
        delete obj[key];
      } else {
        cleanNoSqlInjection(obj[key]);
      }
    }
  }
}

module.exports = function sanitize(req, res, next) {
  if (req.body) cleanNoSqlInjection(req.body);
  if (req.query) cleanNoSqlInjection(req.query);
  if (req.params) cleanNoSqlInjection(req.params);
  next();
};
