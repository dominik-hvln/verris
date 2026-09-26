/**
 * Nest bundles the API with Rspack (PB-38: Nest CLI 12 wycofało webpacka). Native addons (bcrypt) must stay outside
 * the bundle — otherwise prebuild resolves .node files from /app/apps/api/dist
 * and fails with "No native build was found … webpack=true".
 *
 * ssh2 (I-18): opcjonalne dodatki natywne (cpu-features, sshcrypto.node) ładuje
 * w try/catch, ale bundler i tak próbuje je rozwiązać i build obrazu pada
 * („Can't resolve '../build/Release/cpufeatures.node'”). Poza paczką ssh2 działa
 * na czystym JS z node_modules obrazu. Strażnik: src/test/natywne-poza-paczka.spec.ts.
 */
const NATYWNE = ['bcrypt', 'ssh2'];
module.exports = function (options) {
  const prev = options.externals;
  const bcryptExternal = ({ request }, callback) => {
    if (NATYWNE.includes(request)) {
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
module.exports.NATYWNE = NATYWNE;
