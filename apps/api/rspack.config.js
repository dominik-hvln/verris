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
const path = require('path');
const nodeExternals = require('webpack-node-externals');

const NATYWNE = ['bcrypt', 'ssh2'];
module.exports = function (options) {
  // Obraz Dockera instaluje zależności z nodeLinker: hoisted — wszystko leży w /workspace/node_modules,
  // a apps/api/node_modules jest puste. Domyślne externals Nesta patrzą tylko tam, więc bez tego
  // do paczki trafiało całe node_modules (z NestJS 12: „Can't resolve '@nestjs/websockets/…'”).
  const zKorzenia = nodeExternals({ additionalModuleDirs: [path.resolve(__dirname, '../../node_modules')] });
  const prev = options.externals;
  const bcryptExternal = ({ request }, callback) => {
    if (NATYWNE.includes(request)) {
      return callback(undefined, `commonjs ${request}`);
    }
    callback();
  };

  options.externals = [bcryptExternal, zKorzenia].concat(prev ?? []);

  return options;
};
module.exports.NATYWNE = NATYWNE;
