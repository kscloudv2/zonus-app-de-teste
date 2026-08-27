// Roda no BUILD (script "build" do package.json): grava o momento e o commit.
// Se a página mostrar esta data, o comando de build da plataforma executou.
const { writeFileSync } = require('node:fs');
writeFileSync(
  'info-do-build.json',
  JSON.stringify({ construidoEm: new Date().toISOString() }, null, 2),
);
console.log('build ok — info-do-build.json gravado');
