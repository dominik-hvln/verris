/**
 * Nest bundles the API with webpack. Native addons (bcrypt) must stay outside
 * the bundle — otherwise prebuild resolves .node files from /app/apps/api/dist
 * and fails with "No native build was found … webpack=true".
 */
module.exports = function (options) {
  const prev = options.externals;
  const bcryptExternal = ({ request }, callback) => {
    if (request === 'bcrypt') {
      return callback(undefined, `commonjs ${request}`);
    }
    callback();
  };

  if (Array.isArray(prev)) {
    options.externals = [...prev, bcryptExternal];
  } else if (typeof prev === 'function') {
    options.externals = [prev, bcryptExternal];
  } else if (prev != null) {
    options.externals = [prev, bcryptExternal];
  } else {
    options.externals = [bcryptExternal];
  }

  return options;
};
