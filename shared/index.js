const roles = require('./constants/roles');
const status = require('./constants/status');
const permissions = require('./permissions');
const schemas = require('./schemas');

module.exports = {
  ...roles,
  ...status,
  ...permissions,
  schemas
};
