require('dotenv').config();

const { selfCallMcp } = require('./self-call-mcp');

selfCallMcp()
  .then((results) => {
    console.log(JSON.stringify({ ok: true, calls: results.map((item) => ({ tool: item.tool, responseTime: item.responseTime })) }, null, 2));
    process.exit(0);
  })
  .catch((error) => {
    console.error(error?.message || error);
    process.exit(1);
  });
